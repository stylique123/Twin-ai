#!/usr/bin/env bash
# Gate-0 migration-ledger reconciliation for staging.
#
# WHY: 0091-0093 are APPLIED to staging but absent from supabase_migrations.schema_migrations
# — CI applies them byte-exactly with `psql -f` rather than through the migration tool. The
# ledger therefore under-reports reality, and any ledger-driven tooling has a false view.
#
# This does NOT trust object existence. Existence cannot prove function bodies, policies,
# grants, triggers, constraints or indexes. Proof works like this:
#
#   1. fingerprint the installed semantic surface (definitions, not names)
#   2. RE-APPLY the committed migration files byte-exactly — they are idempotent
#   3. fingerprint again
#
# If the installed definitions already equal what the committed files produce, step 2 is a
# no-op and the two fingerprints are IDENTICAL. Any drift — a hand-edited function body, a
# dropped policy, a changed grant — makes re-application change something, and the
# fingerprints differ. Staging is its own shadow database, which avoids rebuilding the
# entire Supabase-specific migration chain on bare Postgres just to derive an expectation.
#
# Repair runs ONLY on an exact match, ONLY for the proven versions, and ONLY when
# RECONCILE_APPLY=1. Default is report-only.
#
# Secrets: $STAGING_DB_URL and $SUPABASE_ACCESS_TOKEN are read from the environment and
# NEVER printed. psql reads the URL from PGURL to keep it out of `ps` and out of logs.
set -euo pipefail

# =====================================================================================
# DISABLED — THIS ALGORITHM IS UNSAFE. DO NOT RUN AGAINST ANY LIVE DATABASE.
# =====================================================================================
# Four defects found in review, two of them dangerous:
#
# 1. IT MUTATES BEFORE IT DECIDES. The script re-applies migrations to LIVE staging and
#    only then reports drift. A safety check that performs the risky action first is not
#    a safety check. Expected state must never be derived by writing to the thing being
#    verified.
#
# 2. ADDITIVE DRIFT IS INVISIBLE. Idempotent re-application does not remove an extra
#    column, index, constraint or grant, so BEFORE == AFTER and the comparison passes —
#    the ledger could then be repaired against a schema that does NOT match the
#    migrations. Precisely the failure this guard exists to prevent.
#
# 3. THE HOSTILE TESTS DO NOT TEST THIS ALGORITHM. They mutate a fixture and assert the
#    FINGERPRINT changes. They never execute reapply-and-compare, so they prove nothing
#    about whether run.sh blocks anything. This is the vacuous-fixture failure mode
#    documented in the Gate-0 freeze itself (SS8.1) — reproduced while writing the
#    document that warns about it.
#
# 4. fingerprint.sql DOES NOT COVER THE OWNED SURFACE. Missing: most 0091 functions,
#    function EXECUTE ACLs, media_assets columns and its capture-ready trigger, the
#    Decision-v2 trigger/table surface, trigger ENABLED state, policy permissive vs
#    restrictive, column defaults, and forced-RLS state.
#
# REQUIRED REDESIGN before this may run anywhere:
#   * build the EXPECTED fingerprint in an isolated disposable database from the
#     committed migration inputs — never by writing to staging;
#   * or compare staging against a committed canonical manifest produced by that build;
#   * cover the entire owned surface, including ACLs, trigger enabled state, policy
#     permissiveness, column defaults and forced RLS;
#   * run the REAL guard end-to-end in every hostile case, including ADDITIVE drift;
#   * prove staging is semantically unchanged after every rejected case;
#   * only then repair the ledger, as a separate ledger-only transaction.
#
echo "::error::migration-reconcile is DISABLED: the algorithm mutates staging before" >&2
echo "::error::detecting drift and cannot see additive drift. See this file's header." >&2
exit 1
# =====================================================================================

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
FP="$HERE/fingerprint.sql"

: "${STAGING_DB_URL:?STAGING_DB_URL not set}"
MIGRATIONS=(0090_editor_capture_intent 0091_editor_capture_hardening
            0092_editor_director_decision_v2 0093_editor_capture_retention_cascade)

fingerprint() { psql "$STAGING_DB_URL" -qAtX -f "$FP"; }
hash_of()     { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

echo "== 1. fingerprint installed definitions (BEFORE) =="
BEFORE="$(fingerprint)"
B_HASH="$(hash_of "$BEFORE")"
LINES=$(printf '%s\n' "$BEFORE" | grep -c . || true)
echo "   objects fingerprinted: $LINES   sha256: ${B_HASH:0:16}"
if [ "${LINES:-0}" -lt 20 ]; then
  echo "::error::fingerprint returned only $LINES lines — the expected objects are not installed. Refusing to reconcile a ledger against a schema that does not match the migrations."
  exit 1
fi

echo "== 2. re-apply the committed migration files byte-exactly =="
for m in "${MIGRATIONS[@]}"; do
  f="$REPO/supabase/migrations/$m.sql"
  [ -f "$f" ] || { echo "::error::missing migration file $m.sql"; exit 1; }
  echo "   applying $m ($(sha256sum "$f" | cut -c1-16))"
  psql "$STAGING_DB_URL" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done

echo "== 3. fingerprint again (AFTER) =="
AFTER="$(fingerprint)"
A_HASH="$(hash_of "$AFTER")"
echo "   sha256: ${A_HASH:0:16}"

if [ "$B_HASH" != "$A_HASH" ]; then
  echo "::error::SEMANTIC DRIFT — the installed definitions do not match the committed migrations."
  echo "--- differences (installed vs after re-apply) ---"
  diff <(printf '%s\n' "$BEFORE") <(printf '%s\n' "$AFTER") | head -40 || true
  echo "Refusing to repair the ledger. Produce a corrective migration or recreate staging."
  exit 1
fi
echo "   MATCH — installed definitions equal the committed migration outcomes."

if [ "${RECONCILE_APPLY:-0}" != "1" ]; then
  echo "== report-only (RECONCILE_APPLY != 1); no ledger change =="
  exit 0
fi

echo "== 4. repair the ledger for the PROVEN versions only =="
# Versions are resolved from the ledger's own naming, never invented. A migration already
# recorded is skipped rather than re-marked.
for m in "${MIGRATIONS[@]}"; do
  present=$(psql "$STAGING_DB_URL" -qAtX -c \
    "select count(*) from supabase_migrations.schema_migrations where name = '$m'")
  if [ "$present" != "0" ]; then echo "   $m already recorded — skipping"; continue; fi
  ver=$(printf '%s' "$m" | cut -d_ -f1)
  echo "   repairing $m (version $ver) --status applied"
  supabase migration repair "$ver" --status applied --db-url "$STAGING_DB_URL"
done

echo "== 5. re-query ledger and definitions =="
psql "$STAGING_DB_URL" -qAtX -c \
  "select name from supabase_migrations.schema_migrations where name like '009%' order by name" \
  | sed 's/^/   ledger: /'
POST="$(fingerprint)"
[ "$(hash_of "$POST")" = "$A_HASH" ] \
  && echo "   definitions unchanged by the repair (ledger-only change confirmed)" \
  || { echo "::error::definitions changed during ledger repair — investigate immediately"; exit 1; }
echo "MIGRATION RECONCILE: OK"

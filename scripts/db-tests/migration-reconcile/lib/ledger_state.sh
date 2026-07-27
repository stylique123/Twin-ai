#!/usr/bin/env bash
# ===========================================================================
# LEDGER-ONLY OPERATION — supabase_migrations.schema_migrations rows, nothing else.
# ===========================================================================
# Reached ONLY from run.sh, ONLY after the guard reported an EXACT match, and
# ONLY with the explicit --repair-ledger opt-in.
#
#   report   read the ledger and print the parity verdict. No writes.
#   repair   capture full definitions -> repair rows -> capture again -> prove
#            the schema is byte-identical and ONLY the intended rows changed.
#
# THE REPAIR ITSELF is the official tool, not hand-written SQL:
#   supabase migration repair <version> --status applied --db-url "$STAGING_DB_URL"
#
# $STAGING_DB_URL and $SUPABASE_ACCESS_TOKEN are read from the environment and
# never echoed. psql output is filtered through the same redaction the guard uses.
set -euo pipefail

MR_HERE="${MR_HERE:?must be invoked from run.sh}"
MODE="${1:-report}"

: "${STAGING_DB_URL:?STAGING_DB_URL must be set in the environment}"

# TARGET SAFETY. The staging project ref, matching the check
# .github/workflows/staging-integration.yml already applies. Production
# (jmdecibuytznsonrasxw) must never be reachable from this script — the repair is
# the one mutating step in the whole guard, so it refuses to run against anything
# that is not demonstrably staging. Never echo the URL itself.
case "$STAGING_DB_URL" in
  *jmdecibuytznsonrasxw*)
    echo "refusing: STAGING_DB_URL points at the PRODUCTION project ref." >&2; exit 2 ;;
  *otgzjsagybpgtwweuptj*) : ;;
  *) echo "refusing: STAGING_DB_URL does not point at the staging project ref." >&2; exit 2 ;;
esac

# The four versions this guard makes a claim about.
TARGET_VERSIONS="0090 0091 0092 0093"

# Every read below is a read-only transaction, enforced by the server.
sq() { PGOPTIONS="-c default_transaction_read_only=on" psql -X -q -tA -v ON_ERROR_STOP=1 -c "$1" "$STAGING_DB_URL"; }

read_ledger() {
  sq "select version from supabase_migrations.schema_migrations
       where version in ('0090','0091','0092','0093') order by version"
}

# A digest of the COMPLETE owned surface, used to prove the repair changed no
# schema. It reuses the very same manifest query the guard compares with, so
# there is no second definition of 'the schema' that could disagree.
capture_definitions() {
  PGOPTIONS="-c default_transaction_read_only=on" \
    psql -X -q -tA -v ON_ERROR_STOP=1 -v ledger="$(cat "$MR_LEDGER")" \
      -f "$MR_HERE/sql/30_manifest.sql" "$STAGING_DB_URL"
}

# Full ledger contents, so we can prove ONLY the intended rows changed.
capture_ledger_rows() {
  sq "select version || '|' || coalesce(name,'') from supabase_migrations.schema_migrations order by version"
}

present="$(read_ledger | tr '\n' ' ')"
missing=""
for v in $TARGET_VERSIONS; do
  case " $present " in *" $v "*) ;; *) missing="$missing $v" ;; esac
done
missing="$(echo "$missing" | xargs || true)"

echo "   ledger rows present for 0090-0093:${present:+ $present}"
echo "   ledger rows MISSING for 0090-0093:${missing:+ $missing}"

# --- PARITY CLAIM ------------------------------------------------------------
# Deliberately narrow. This repo has a MIXED migration history: timestamp-style
# versions alongside four-digit names. This guard verified FOUR versions and
# claims parity for those four ONLY. It makes NO claim of complete local/remote
# parity, and the pre-existing mixed-history debt is acknowledged, not papered
# over by a repair that happens to make `supabase migration list` look tidy.
parity_note() {
  local total_local total_remote
  total_local="$(ls "$MR_REPO/supabase/migrations"/*.sql 2>/dev/null | wc -l | tr -d ' ')"
  total_remote="$(sq "select count(*) from supabase_migrations.schema_migrations" || echo '?')"
  cat <<EOF

   PARITY CLAIM (scoped, on purpose)
     VERIFIED, current versions .... 0090 0091 0092 0093 — schema proven to match
                                     the committed migrations exactly, object by
                                     object, including additive drift.
     NOT CLAIMED .................. complete local/remote parity. This repo has a
                                     MIXED migration history (timestamp-style
                                     versions alongside four-digit names):
                                     ${total_local} local migration files vs
                                     ${total_remote} recorded remote rows. That
                                     divergence is pre-existing historical debt,
                                     is OUT OF SCOPE here, and is NOT addressed
                                     by this repair.
EOF
}

if [ "$MODE" = "report" ]; then
  parity_note
  if [ -n "$missing" ]; then
    echo
    echo "   Ledger repair WOULD record:$missing (re-run with --repair-ledger)"
  else
    echo
    echo "   Ledger already records 0090-0093. Nothing to repair."
  fi
  exit 0
fi

# -------------------------------------------------------------------------
# REPAIR
# -------------------------------------------------------------------------
if [ -z "$missing" ]; then
  echo "   Ledger already records 0090-0093. Nothing to repair; exiting without writing."
  parity_note
  exit 0
fi

command -v supabase >/dev/null 2>&1 || {
  echo "refusing: the official 'supabase' CLI is not on PATH. This repair uses" >&2
  echo "  supabase migration repair <version> --status applied" >&2
  echo "and will not fall back to hand-written INSERTs into the ledger table." >&2
  exit 2; }
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN must be set in the environment}"

echo "   capturing full definitions BEFORE repair"
capture_definitions > "$MR_WORK/defs_before.json"
capture_ledger_rows > "$MR_WORK/rows_before.txt"

for v in $missing; do
  echo "   supabase migration repair $v --status applied"
  supabase migration repair "$v" --status applied --db-url "$STAGING_DB_URL" \
    2>&1 | sed -E 's#postgres(ql)?://[^ ]*#postgresql://[REDACTED]#g'
done

echo "   capturing full definitions AFTER repair"
capture_definitions > "$MR_WORK/defs_after.json"
capture_ledger_rows > "$MR_WORK/rows_after.txt"

# (11) Prove the repair changed NO schema.
if ! cmp -s "$MR_WORK/defs_before.json" "$MR_WORK/defs_after.json"; then
  echo "ALARM: the schema changed across a LEDGER-ONLY repair. Definitions differ:" >&2
  diff <(sed 's/[[:space:]]*$//' "$MR_WORK/defs_before.json") \
       <(sed 's/[[:space:]]*$//' "$MR_WORK/defs_after.json") | head -40 >&2
  exit 1
fi
echo "   PROVEN: full owned-surface definitions are byte-identical before and after."

# (12) Prove ONLY the intended ledger rows changed.
added="$(comm -13 <(sort "$MR_WORK/rows_before.txt") <(sort "$MR_WORK/rows_after.txt") | cut -d'|' -f1 | xargs || true)"
removed="$(comm -23 <(sort "$MR_WORK/rows_before.txt") <(sort "$MR_WORK/rows_after.txt") | cut -d'|' -f1 | xargs || true)"

if [ -n "$removed" ]; then
  echo "ALARM: the repair REMOVED ledger rows: $removed" >&2; exit 1
fi
if [ "$added" != "$missing" ]; then
  echo "ALARM: the repair changed rows other than the intended ones." >&2
  echo "  intended: $missing" >&2
  echo "  actual:   $added" >&2
  exit 1
fi
echo "   PROVEN: exactly the intended ledger rows were added ($added); none removed; no other row touched."

parity_note
echo
echo "LEDGER RECONCILED."

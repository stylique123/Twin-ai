#!/usr/bin/env bash
# ===========================================================================
# migration-reconcile — ledger reconciliation guard for migrations 0090-0093.
# ===========================================================================
# THE PROBLEM. Migrations 0090-0093 are APPLIED to staging but only 0090 is
# recorded in supabase_migrations.schema_migrations, because CI applied them with
# `psql -f` instead of the migration tool. The ledger under-reports reality. The
# fix is a LEDGER-ONLY repair — but only after PROVING staging's schema already
# matches the committed migrations exactly.
#
# ORDER OF OPERATIONS (this is the whole point):
#     build expected  ->  read staging  ->  compare  ->  [gate]  ->  repair ledger
# Expected state is built by applying the committed migrations to a DISPOSABLE
# local database. Staging is READ ONLY, via catalog queries, under
# default_transaction_read_only=on. Nothing is applied to staging, ever, and
# certainly not before the decision about whether drift exists.
#
# MODES
#   ./run.sh                 self-test: build expected + run the hostile suite
#                            locally. No staging, no credentials, no network.
#   ./run.sh --verify        + read $STAGING_DB_URL and compare. REPORT ONLY.
#   ./run.sh --verify --repair-ledger
#                            + on an EXACT match, repair ONLY the ledger rows.
#                            Mutation requires this explicit opt-in.
#
#   --skip-hostile           skip the hostile suite. ONLY for a second invocation
#                            in the same CI job that already ran it (see
#                            .github/workflows/migration-reconcile.yml, which runs
#                            the full suite in a prior step). It does not weaken
#                            the staging comparison — the expected-state build and
#                            the harness self-check still run — but it does skip
#                            the proof that the guard itself has teeth, so never
#                            use it for a standalone run.
#
# CREDENTIALS are read from the environment ($STAGING_DB_URL,
# $SUPABASE_ACCESS_TOKEN) and are never printed, logged or written to a file.
#
# Exit: 0 ok | 1 drift or hostile failure | 2 harness/config error.
set -euo pipefail

MR_HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MR_REPO="$(cd "$MR_HERE/../../.." && pwd)"
export MR_HERE MR_REPO

# shellcheck source=lib/disposable_pg.sh
. "$MR_HERE/lib/disposable_pg.sh"
# shellcheck source=lib/build_expected.sh
. "$MR_HERE/lib/build_expected.sh"

DO_VERIFY=0
DO_REPAIR=0
for a in "$@"; do
  case "$a" in
    --verify) DO_VERIFY=1 ;;
    --repair-ledger) DO_REPAIR=1 ;;
    --skip-hostile) SKIP_HOSTILE=1 ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "unknown argument: $a" >&2; exit 2 ;;
  esac
done
SKIP_HOSTILE="${SKIP_HOSTILE:-0}"

# --repair-ledger without --verify would mean "mutate without checking".
if [ "$DO_REPAIR" = "1" ] && [ "$DO_VERIFY" = "0" ]; then
  echo "refusing: --repair-ledger requires --verify (the repair is gated on an exact match)" >&2
  exit 2
fi

trap mr_pg_stop EXIT
mr_pg_start

echo "== building EXPECTED state in an isolated disposable database =="
echo "   (committed migrations 0090-0093, applied byte-exactly; staging is not touched)"
mr_build_expected mr_expected
LEDGER="$MR_WORK/ledger.json"
export MR_LEDGER="$LEDGER"
EXPECTED_DSN="$(mr_dsn mr_expected)"

# The expected manifest must be self-consistent before anything else runs. A
# broken harness that reports "match" is the failure mode this rewrite exists to
# eliminate, so prove the harness first.
echo "== self-check: the expected manifest must be self-consistent =="
node "$MR_HERE/lib/selfcheck.mjs" --expected "$EXPECTED_DSN" --ledger "$LEDGER"

if [ "$SKIP_HOSTILE" != "1" ]; then
  echo
  echo "== hostile suite =="
  node "$MR_HERE/hostile/run.mjs" --expected-db mr_expected --ledger "$LEDGER"
fi

if [ "$DO_VERIFY" = "0" ]; then
  echo
  echo "LOCAL SELF-TEST PASSED. Pass --verify (with \$STAGING_DB_URL in the env) to compare against staging."
  exit 0
fi

# -------------------------------------------------------------------------
# Staging comparison — READ ONLY.
# -------------------------------------------------------------------------
if [ -z "${STAGING_DB_URL:-}" ]; then
  echo "refusing: --verify requires \$STAGING_DB_URL in the environment" >&2
  exit 2
fi

echo
echo "== reading STAGING manifest (catalog queries only, read-only transaction) =="
set +e
node "$MR_HERE/lib/guard.mjs" \
  --expected "$EXPECTED_DSN" \
  --observed "$STAGING_DB_URL" \
  --ledger "$LEDGER" \
  --label staging \
  --json "$MR_WORK/guard_result.json"
GUARD_RC=$?
set -e

if [ "$GUARD_RC" = "2" ]; then
  echo "HARNESS ERROR while comparing. No repair attempted." >&2
  exit 2
fi
if [ "$GUARD_RC" != "0" ]; then
  echo
  echo "FAIL CLOSED: staging does not match the committed migrations 0090-0093."
  echo "The ledger is NOT repaired. Repairing it now would record a version whose"
  echo "schema is not actually what the committed migration produces."
  exit 1
fi

# -------------------------------------------------------------------------
# Ledger-only repair. Reached ONLY on an exact match AND an explicit opt-in.
# -------------------------------------------------------------------------
if [ "$DO_REPAIR" = "0" ]; then
  echo
  echo "REPORT ONLY: schemas match exactly. Re-run with --repair-ledger to record"
  echo "the missing ledger rows (this is the only mutating step, and it touches"
  echo "supabase_migrations.schema_migrations only)."
  "$MR_HERE/lib/ledger_state.sh" report
  exit 0
fi

echo
echo "== ledger-only repair =="
"$MR_HERE/lib/ledger_state.sh" repair

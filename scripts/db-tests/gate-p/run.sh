#!/usr/bin/env bash
# Gate-P — ephemeral-Postgres proof that one batch carrying the SAME claim twice
# no longer destroys the whole batch (0218).
#
# ⚠️ THIS GATE EXISTS BECAUSE PRODUCTION FAILED, NOT BECAUSE SOMEONE IMAGINED IT.
# On the first real re-mine sweep (2026-09-19) one of 11 jobs dead-lettered with
# "ON CONFLICT DO UPDATE command cannot affect row a second time" and wrote
# NOTHING for the creator holding the largest corpus in the store.
#
# The batch is the unit of loss, so the assertion that matters is not "the
# duplicate collapsed" but "the OTHER rows still landed".
set -euo pipefail
export LC_ALL=C LANG=C PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIG="$REPO/supabase/migrations/0218_two_rows_that_normalised_the_same_lost_the_whole_batch.sql"
OLD="$REPO/supabase/migrations/0216_the_conclusion_arrived_without_the_sentence_that_earned_it.sql"
[ -f "$MIG" ] || { echo "FATAL: 0218 not found"; exit 1; }
[ -f "$OLD" ] || { echo "FATAL: 0216 not found"; exit 1; }

if [ -z "${PGBIN:-}" ]; then
  for d in /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@16/bin; do
    [ -x "$d/initdb" ] && PGBIN="$d" && break
  done
  PGBIN="${PGBIN:-$(dirname "$(command -v initdb 2>/dev/null || echo /usr/bin/initdb)")}"
fi
WORK="$(mktemp -d)"; export PGHOST="$WORK/sock" PGUSER=postgres PGDATABASE=postgres
mkdir -p "$WORK/data" "$WORK/sock"
AS_PG=0
if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then chown -R postgres:postgres "$WORK"; AS_PG=1; fi
pg_run(){ if [ "$AS_PG" = "1" ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
cleanup(){ pg_run "$PGBIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
pg_run "$PGBIN/initdb" -D "$WORK/data" -U postgres --auth=trust --locale=C --encoding=UTF8 >/dev/null
pg_run "$PGBIN/pg_ctl" -D "$WORK/data" -o "-c unix_socket_directories=$WORK/sock -c listen_addresses=''" -l "$WORK/pg.log" start >/dev/null
for _ in $(seq 1 30); do "$PGBIN/pg_isready" -q && break || sleep 0.3; done
psql(){ "$PGBIN/psql" -v ON_ERROR_STOP=1 -qtAX "$@"; }

# ⚠️ EXTRACTED, NOT RETYPED — both versions. A hand-copied function would let
# this gate pass while the migration said something else.
awk '/^create or replace function public.merge_creator_knowledge/{f=1} f{print}' "$MIG" > "$WORK/new.sql"
awk '/^create or replace function public.merge_creator_knowledge/{f=1} f{print}' "$OLD" > "$WORK/old.sql"
grep -q 'select distinct on' "$WORK/new.sql" || { echo "FATAL: extracted 0218 carries no dedupe"; exit 1; }
grep -q 'select distinct on' "$WORK/old.sql" && { echo "FATAL: extracted 0216 already dedupes — wrong anchor"; exit 1; }

# Stand-in table carrying ONLY what the conflict key and the merge rules touch,
# with the 0121 unique index reproduced exactly.
# The migration's own revoke/grant lines name these roles; an ephemeral cluster
# has none of them. Creating them is what lets the function be applied VERBATIM
# rather than trimmed down to the part that happens to run here.
psql <<'EOSQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
EOSQL

psql <<'EOSQL'
create table public.creator_knowledge (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  voice_id uuid,
  kind text not null,
  text text,
  basis text not null default 'inferred',
  confidence numeric not null default 0.5,
  times_seen integer not null default 1,
  source_ref text, source_url text, source text,
  cost text, consensus text,
  extractor_version integer,
  evidence text, question_id text,
  updated_at timestamptz not null default now()
);
create unique index creator_knowledge_identity on public.creator_knowledge
  (owner_id, coalesce(voice_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, lower(btrim(text)));
EOSQL

OWNER='11111111-1111-1111-1111-111111111111'
VOICE='22222222-2222-2222-2222-222222222222'

# The batch that killed production: two items normalising to the SAME key
# (differing only by case and surrounding whitespace, which the index folds
# away), plus three innocent rows that MUST survive.
BATCH=$(cat <<JSON
[
 {"owner_id":"$OWNER","voice_id":"$VOICE","kind":"claim","text":"She charges 400 for a full rebind","evidence":"I charge four hundred","question_id":"what_she_charges","extractor_version":3},
 {"owner_id":"$OWNER","voice_id":"$VOICE","kind":"claim","text":"  she CHARGES 400 for a full rebind  ","extractor_version":3},
 {"owner_id":"$OWNER","voice_id":"$VOICE","kind":"fact","text":"Her screen time is ten hours","extractor_version":3},
 {"owner_id":"$OWNER","voice_id":"$VOICE","kind":"opinion","text":"Cheap rebinds fail inside a year","extractor_version":3},
 {"owner_id":"$OWNER","voice_id":"$VOICE","kind":"example","text":"The guest introduced her own business","extractor_version":3}
]
JSON
)
printf '%s' "$BATCH" > "$WORK/batch.json"

rows(){ psql -c "select count(*) from public.creator_knowledge"; }

# ── 1. THE OLD FUNCTION MUST FAIL. If it does not, the bug is not what the
#       production error said it was and this whole migration is unjustified.
psql -f "$WORK/old.sql" >/dev/null
set +e
OLD_ERR="$("$PGBIN/psql" -v ON_ERROR_STOP=1 -qtAX -c "select public.merge_creator_knowledge(pg_read_file('$WORK/batch.json')::jsonb)" 2>&1)"
OLD_RC=$?
set -e
if [ "$OLD_RC" = "0" ]; then
  echo "FAIL: the pre-0218 function accepted the duplicate batch — the reproduction is wrong"; exit 1
fi
case "$OLD_ERR" in
  *"cannot affect row a second time"*) echo "ok: pre-0218 reproduces the production failure" ;;
  *) echo "FAIL: pre-0218 failed for a DIFFERENT reason, so this fix is unproven:"; echo "$OLD_ERR"; exit 1 ;;
esac
if [ "$(rows)" != "0" ]; then echo "FAIL: the failed batch left rows behind"; exit 1; fi
echo "ok: the failed batch wrote NOTHING — the batch is the unit of loss"

# ── 2. THE FIXED FUNCTION MUST ACCEPT IT, AND KEEP THE INNOCENT ROWS.
psql -f "$WORK/new.sql" >/dev/null
psql -c "select public.merge_creator_knowledge(pg_read_file('$WORK/batch.json')::jsonb)" >/dev/null
GOT="$(rows)"
if [ "$GOT" != "4" ]; then echo "FAIL: expected 4 rows (5 offered, 1 duplicate collapsed), got $GOT"; exit 1; fi
echo "ok: 5 offered, 1 duplicate collapsed, 4 stored — the other rows survived"

# ── 3. FIRST OCCURRENCE WINS, AND IT IS THE ONE CARRYING THE EVIDENCE.
#       The targeted pass runs first, so the survivor must be its copy.
EV="$(psql -c "select coalesce(evidence,'<null>') from public.creator_knowledge where kind='claim'")"
QID="$(psql -c "select coalesce(question_id,'<null>') from public.creator_knowledge where kind='claim'")"
if [ "$EV" != "I charge four hundred" ]; then echo "FAIL: survivor lost its evidence (got '$EV')"; exit 1; fi
if [ "$QID" != "what_she_charges" ]; then echo "FAIL: survivor lost its question_id (got '$QID')"; exit 1; fi
echo "ok: the surviving row is the FIRST one, evidence and question_id intact"

# ── 4. A SECOND RUN OF THE SAME BATCH STILL MERGES AGAINST THE TABLE.
psql -c "select public.merge_creator_knowledge(pg_read_file('$WORK/batch.json')::jsonb)" >/dev/null
if [ "$(rows)" != "4" ]; then echo "FAIL: re-running the batch created duplicates"; exit 1; fi
TS="$(psql -c "select times_seen from public.creator_knowledge where kind='fact'")"
if [ "$TS" != "2" ]; then echo "FAIL: times_seen did not increment on re-merge (got $TS)"; exit 1; fi
echo "ok: re-merge is idempotent and still counts corroboration"

# ── MUTATION CONTROL ────────────────────────────────────────────────────────
# Remove the `distinct on` and the batch must fail again, with the SAME production
# error. This is the deterministic mutation: it restores exactly the pre-0218
# behaviour, so a gate that still passed here would be testing nothing at all.
python3 - "$WORK/new.sql" "$WORK/mut.sql" <<'PYMUT'
import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src).read()
anchor = """    select distinct on (
      owner_id,
      coalesce(voice_id, '00000000-0000-0000-0000-000000000000'::uuid),
      kind,
      lower(btrim(text))
    )
"""
assert s.count(anchor) == 1, "mutation anchor matched %d times" % s.count(anchor)
open(dst, "w").write(s.replace(anchor, "    select\n", 1))
PYMUT
if diff -q "$WORK/new.sql" "$WORK/mut.sql" >/dev/null; then echo "FATAL: mutation was a no-op"; exit 1; fi
if grep -q 'select distinct on' "$WORK/mut.sql"; then echo "FATAL: mutation did not remove the dedupe"; exit 1; fi
psql -c "truncate public.creator_knowledge" >/dev/null
psql -f "$WORK/mut.sql" >/dev/null
set +e
MUT_ERR="$("$PGBIN/psql" -v ON_ERROR_STOP=1 -qtAX -c "select public.merge_creator_knowledge(pg_read_file('$WORK/batch.json')::jsonb)" 2>&1)"
MUT_RC=$?
set -e
if [ "$MUT_RC" = "0" ]; then
  echo "FAIL: mutation control — removing the dedupe changed nothing, this gate proves nothing"; exit 1
fi
case "$MUT_ERR" in
  *"cannot affect row a second time"*) echo "ok: mutation control — without the dedupe the production failure returns" ;;
  *) echo "FAIL: mutation failed for an unrelated reason:"; echo "$MUT_ERR"; exit 1 ;;
esac

echo "GATE-P PASS"

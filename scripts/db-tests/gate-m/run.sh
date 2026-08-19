#!/usr/bin/env bash
# Gate-M — ephemeral-Postgres verification of 0143 (a failure may not erase a
# success).
#
# ⚠️ WRITTEN AFTER THE INCIDENT IT DESCRIBES. A forced re-run of 40
# already-assessed videos met a TikTok block. 38 returned a download error, the
# handler upserted that error onto `url`, and 38 good profiles were replaced by
# rows whose only content is a message about yt-dlp. Nothing errored. The queue
# drained. The table simply held less than it had an hour earlier.
#
# ⚖️ THE RULE LIVES IN THE DATABASE BECAUSE THE WORKER IS NOT THE ONLY WRITER.
# A driver script, a backfill, or an operator with psql can all upsert this
# table; a rule in one TypeScript handler binds exactly one of them. So the test
# is here too — against real Postgres running the real migration, not against a
# mock of it.
#
# Each refusal is paired with a MUTATION CONTROL: drop the trigger, watch the
# good row get destroyed. A test that would pass without the rule proves nothing
# about the rule.
set -euo pipefail
export LC_ALL=C LANG=C PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIG142="$REPO/supabase/migrations/0142_reference_content_profiles.sql"
MIG143="$REPO/supabase/migrations/0143_a_failure_may_not_erase_a_success.sql"
for f in "$MIG142" "$MIG143"; do [ -f "$f" ] || { echo "FATAL: $f not found"; exit 1; }; done

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

# 0142 grants to `authenticated`, which does not exist in a bare cluster.
psql -q -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
SQL
psql -q -v ON_ERROR_STOP=1 -f "$MIG142"
psql -q -v ON_ERROR_STOP=1 -f "$MIG143"

fail(){ echo "GATE-M FAIL: $1"; exit 1; }
ok(){ echo "  ok: $1"; }

good_row(){
  psql -q -v ON_ERROR_STOP=1 -c "
    delete from public.reference_content_profiles where url = 'u://1';
    insert into public.reference_content_profiles (url, platform, schema_version, profile, fields_accepted, error)
    values ('u://1', 'tiktok', 1, '{\"topic\":\"kept\"}'::jsonb, 18, null);"
}
q(){ psql -tAq -c "$1"; }

echo "1. SUCCESS + FAILURE — the incident"
good_row
psql -q -v ON_ERROR_STOP=1 -c "
  update public.reference_content_profiles
     set error = 'yt-dlp exited 1: blocked', profile = '{}'::jsonb, fields_accepted = 0
   where url = 'u://1';"
[ "$(q "select error is null from public.reference_content_profiles where url='u://1'")" = "t" ] \
  || fail "a failed retry erased a good assessment"
[ "$(q "select profile->>'topic' from public.reference_content_profiles where url='u://1'")" = "kept" ] \
  || fail "the profile was replaced"
[ "$(q "select fields_accepted from public.reference_content_profiles where url='u://1'")" = "18" ] \
  || fail "fields_accepted was zeroed"
ok "a failed retry leaves the good assessment exactly as it was"

# ⚠️ AND THE FAILURE IS STILL RECORDED. Discarding the overwrite without a trace
# would make a URL that fails a hundred times look like one nobody has retried —
# and "which URLs keep failing, and with what" is the question that would have
# caught the block hours earlier.
[ "$(q "select count(*) from public.reference_assessment_attempts where url='u://1' and result_status='failure'")" = "1" ] \
  || fail "the failed attempt was not recorded"
ok "and the attempt is recorded rather than discarded"

echo "2. MUTATION CONTROL — without the trigger, the row is destroyed"
psql -q -c "alter table public.reference_content_profiles disable trigger reference_assessment_merge_guard" >/dev/null
good_row
psql -q -v ON_ERROR_STOP=1 -c "
  update public.reference_content_profiles set error = 'blocked', profile = '{}'::jsonb, fields_accepted = 0
   where url = 'u://1';"
[ "$(q "select error is null from public.reference_content_profiles where url='u://1'")" = "f" ] \
  || fail "MUTATION CONTROL DID NOT REPRODUCE — this gate proves nothing"
ok "control reproduces the incident with the trigger off"
psql -q -c "alter table public.reference_content_profiles enable trigger reference_assessment_merge_guard" >/dev/null

echo "3. FAILURE + SUCCESS — a damaged row recovers, and stops being a target"
psql -q -v ON_ERROR_STOP=1 -c "
  delete from public.reference_content_profiles where url = 'u://2';
  insert into public.reference_content_profiles (url, platform, schema_version, profile, fields_accepted, error, recovery_batch)
  values ('u://2', 'tiktok', 1, '{}'::jsonb, 0, 'old failure', 'proof_410_damage');
  update public.reference_content_profiles
     set error = null, profile = '{\"topic\":\"recovered\"}'::jsonb, fields_accepted = 18, assessed_at = now()
   where url = 'u://2';"
[ "$(q "select error is null from public.reference_content_profiles where url='u://2'")" = "t" ] \
  || fail "a successful re-read did not promote over a failure"
[ "$(q "select recovery_batch is null from public.reference_content_profiles where url='u://2'")" = "t" ] \
  || fail "a recovered row is still marked as needing recovery"
[ "$(q "select last_success_at is not null from public.reference_content_profiles where url='u://2'")" = "t" ] \
  || fail "last_success_at was not stamped on promotion"
ok "a recovered row is promoted and un-marked"

echo "4. SUCCESS + SUCCESS — a newer read still wins"
good_row
psql -q -v ON_ERROR_STOP=1 -c "
  update public.reference_content_profiles
     set profile = '{\"topic\":\"newer\"}'::jsonb, fields_accepted = 17
   where url = 'u://1';"
[ "$(q "select profile->>'topic' from public.reference_content_profiles where url='u://1'")" = "newer" ] \
  || fail "a good re-read was refused — the guard is too broad"
ok "a better read replaces an older one"

echo "5. FAILURE + FAILURE — the latest failure is kept, and the marker survives"
psql -q -v ON_ERROR_STOP=1 -c "
  delete from public.reference_content_profiles where url = 'u://3';
  insert into public.reference_content_profiles (url, platform, schema_version, profile, fields_accepted, error, recovery_batch)
  values ('u://3', 'tiktok', 1, '{}'::jsonb, 0, 'first failure', 'proof_410_damage');
  update public.reference_content_profiles set error = 'second failure' where url = 'u://3';"
[ "$(q "select error from public.reference_content_profiles where url='u://3'")" = "second failure" ] \
  || fail "a later failure did not update the failure metadata"
[ "$(q "select recovery_batch from public.reference_content_profiles where url='u://3'")" = "proof_410_damage" ] \
  || fail "a failed recovery attempt cleared the recovery marker"
ok "the newest failure is kept and the row stays a recovery target"

echo "gate-M: all cases passed"

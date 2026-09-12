#!/usr/bin/env bash
# Gate-N — ephemeral-Postgres verification of the gallery curation trigger (0199).
#
# Extracts the AUTHORITATIVE function straight out of the migration, attaches it
# to stand-in tables, and proves all four states: a fresh video enqueues, a
# finished one does not, an in-flight one does not, and a RECENTLY FAILED one
# does not — plus the control that matters most, an OLD failure that MUST still
# enqueue, because the fix is a cooldown and not a blacklist. Ends with a
# mutation that removes the new check and confirms the gate then FAILS.
set -euo pipefail
export LC_ALL=C LANG=C PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIG="$REPO/supabase/migrations/0199_a_video_that_cannot_be_read_is_asked_every_morning.sql"
[ -f "$MIG" ] || { echo "FATAL: 0199 not found"; exit 1; }

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

# ⚠️ EXTRACTED, NOT RETYPED. A hand-copied function would pass this gate while
# the migration said something else — the defect class this repo keeps closing.
awk '/^create or replace function public.enqueue_gallery_visual_analysis/{f=1} f{print}' "$MIG" > "$WORK/fn.sql"
grep -q 'interval .7 days.' "$WORK/fn.sql" || { echo "FATAL: extracted function carries no cooldown"; exit 1; }

psql <<'EOSQL'
create table public.jobs (
  id bigserial primary key, type text not null, payload jsonb not null,
  status text not null default 'queued', attempts int not null default 0,
  created_at timestamptz not null default now()
);
create table public.reference_content_profiles (url text primary key, visual_profile jsonb);
create table public.gallery_items (id bigserial primary key, url text not null, platform text, niche text);
EOSQL
psql -f "$WORK/fn.sql" >/dev/null
psql -c "create trigger t after insert on public.gallery_items for each row execute function public.enqueue_gallery_visual_analysis()" >/dev/null

jobs_for(){ psql -c "select count(*) from public.jobs where payload->>'url'='$1'"; }
expect(){ # name url want
  local got; got="$(jobs_for "$2")"
  if [ "$got" != "$3" ]; then echo "FAIL: $1 — jobs for $2 = $got, want $3"; exit 1; fi
  echo "ok: $1"
}

# 1. A fresh video enqueues exactly one pass.
psql -c "insert into public.gallery_items(url,platform,niche) values ('u/fresh','youtube','a')" >/dev/null
expect "fresh video enqueues" "u/fresh" 1

# 2. A video that already has a finished visual pass does not.
psql -c "insert into public.reference_content_profiles(url,visual_profile) values ('u/done','{\"x\":1}')" >/dev/null
psql -c "insert into public.gallery_items(url,platform,niche) values ('u/done','youtube','a')" >/dev/null
expect "finished pass is not repeated" "u/done" 0

# 3. A video with a pass in flight is not double-queued.
psql -c "insert into public.jobs(type,payload,status) values ('assess_reference','{\"url\":\"u/inflight\"}','running')" >/dev/null
psql -c "insert into public.gallery_items(url,platform,niche) values ('u/inflight','youtube','a')" >/dev/null
expect "in-flight pass is not double-queued" "u/inflight" 1   # the pre-seeded one only

# 4. THE FIX: a video that dead-lettered YESTERDAY is not asked again today.
psql -c "insert into public.jobs(type,payload,status,created_at) values ('assess_reference','{\"url\":\"u/recentfail\"}','failed', now() - interval '1 day')" >/dev/null
psql -c "insert into public.gallery_items(url,platform,niche) values ('u/recentfail','youtube','a')" >/dev/null
expect "recent failure is not retried daily" "u/recentfail" 1  # the pre-seeded one only

# 5. ⚠️ THE CONTROL THAT MAKES IT A COOLDOWN AND NOT A BLACKLIST. A failure
#    older than the window MUST enqueue again — an extractor fix since then is
#    exactly the case this must not outlive.
psql -c "insert into public.jobs(type,payload,status,created_at) values ('assess_reference','{\"url\":\"u/oldfail\"}','failed', now() - interval '30 days')" >/dev/null
psql -c "insert into public.gallery_items(url,platform,niche) values ('u/oldfail','youtube','a')" >/dev/null
expect "an expired failure is retried" "u/oldfail" 2           # pre-seeded + a new one

# 6. ⚠️ A HISTORICAL FAILURE MUST NEVER SUPPRESS A VIDEO THAT NOW WORKS.
psql -c "insert into public.jobs(type,payload,status,created_at) values ('assess_reference','{\"url\":\"u/failedthenfixed\"}','failed', now() - interval '1 day')" >/dev/null
psql -c "insert into public.reference_content_profiles(url,visual_profile) values ('u/failedthenfixed','{\"x\":1}')" >/dev/null
psql -c "insert into public.gallery_items(url,platform,niche) values ('u/failedthenfixed','youtube','a')" >/dev/null
expect "a since-succeeded video is unaffected by its old failure" "u/failedthenfixed" 1

# ── MUTATION CONTROL ────────────────────────────────────────────────────────
# Remove the cooldown check and case 4 must start failing. A gate that passes
# with the guard deleted is testing nothing.
python3 - "$WORK/fn.sql" "$WORK/fn_mut.sql" <<'PYMUT'
import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src).read()
block = """  if exists (
    select 1 from public.jobs j
    where j.type = 'assess_reference'
      and j.payload ->> 'url' = new.url
      and j.status = 'failed'
      and j.created_at > now() - interval '7 days'
  ) then
    return new;
  end if;
"""
assert s.count(block) == 1, "mutation anchor matched %d times" % s.count(block)
open(dst, "w").write(s.replace(block, "", 1))
PYMUT
if diff -q "$WORK/fn.sql" "$WORK/fn_mut.sql" >/dev/null; then echo "FATAL: mutation was a no-op"; exit 1; fi
if grep -q "interval '7 days'" "$WORK/fn_mut.sql"; then echo "FATAL: mutation did not remove the cooldown"; exit 1; fi
psql -f "$WORK/fn_mut.sql" >/dev/null
psql -c "insert into public.gallery_items(url,platform,niche) values ('u/recentfail','youtube','b')" >/dev/null
MUT="$(jobs_for 'u/recentfail')"
if [ "$MUT" = "1" ]; then echo "FAIL: mutation control — removing the cooldown changed nothing"; exit 1; fi
echo "ok: mutation control — without the cooldown the daily re-enqueue returns (jobs=$MUT)"

echo "GATE-N PASS"

#!/usr/bin/env bash
# Gate canary-feedback: an ephemeral-Postgres proof of 0293's RLS rule.
#
# The rule: a signed-in creator may insert or update a canary_feedback row only
# for HER OWN generation, and only when its saved blueprint carries the
# server-set tag `canary: true`. She reads only her own rows, and nobody deletes.
#
# 0293 is applied VERBATIM to stand-in tables (auth.users, public.generations).
# auth.uid() reads a session setting, the way Supabase's does. Fictional ids,
# no network. A mutation control drops the canary clause, and the gate must
# then catch the leak, or it proves nothing.
set -euo pipefail
export LC_ALL=C LANG=C PGCLIENTENCODING=UTF8 PGOPTIONS="-c client_min_messages=warning"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIG="$REPO/supabase/migrations/0293_canary_feedback.sql"
[ -f "$MIG" ] || { echo "FATAL: 0293 not found"; exit 1; }

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

HER=00000000-0000-4000-8000-0000000000a1
OTHER=00000000-0000-4000-8000-0000000000b2
G_CANARY=00000000-0000-4000-8000-00000000c001   # hers, canary:true
G_PLAIN=00000000-0000-4000-8000-00000000c002    # hers, no tag
G_FALSE=00000000-0000-4000-8000-00000000c003    # hers, canary:false
G_STRING=00000000-0000-4000-8000-00000000c004   # hers, canary:"yes"
G_OTHERS=00000000-0000-4000-8000-00000000c005   # someone else's, canary:true
G_CANARY2=00000000-0000-4000-8000-00000000c006  # hers, canary:true (for the update-move case)

setup(){
psql <<EOSQL
drop schema if exists auth cascade; drop table if exists public.canary_feedback, public.generations cascade;
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end \$\$;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
create table public.generations (id uuid primary key, user_id uuid not null references auth.users(id), blueprint jsonb);
alter table public.generations enable row level security;
create policy gen_own on public.generations for select to authenticated using (user_id = auth.uid());
grant select on public.generations to authenticated;
insert into auth.users values ('$HER'), ('$OTHER');
insert into public.generations values
  ('$G_CANARY', '$HER', '{"canary": true}'), ('$G_PLAIN', '$HER', '{}'), ('$G_FALSE', '$HER', '{"canary": false}'),
  ('$G_STRING', '$HER', '{"canary": "yes"}'), ('$G_OTHERS', '$OTHER', '{"canary": true}'), ('$G_CANARY2', '$HER', '{"canary": true}');
EOSQL
psql -f "$1"
psql -c "grant select, insert, update, delete on public.canary_feedback to anon, authenticated;"
}

# Run one statement as a signed-in user; prints OK or DENIED.
as(){ local uid="$1" sql="$2"
  if psql -c "set role authenticated; select set_config('request.jwt.claim.sub', '$uid', false); $sql" >/dev/null 2>"$WORK/err"; then echo OK; else echo DENIED; fi; }
count(){ psql -c "select count(*) from public.canary_feedback $1"; }
FAILS=0
expect(){ if [ "$2" != "$3" ]; then echo "FAIL: $1 (expected $3, got $2)"; FAILS=$((FAILS+1)); else echo "ok: $1"; fi; }
ins(){ echo "insert into public.canary_feedback (generation_id, owner_id, rating) values ('$1', '$2', ${3:-7})"; }

run_matrix(){
  expect "her own canary generation: insert" "$(as $HER "$(ins $G_CANARY $HER)")" OK
  expect "her own untagged generation: insert refused" "$(as $HER "$(ins $G_PLAIN $HER)")" DENIED
  expect "canary:false: insert refused" "$(as $HER "$(ins $G_FALSE $HER)")" DENIED
  expect "canary:\"yes\" (not the boolean tag): insert refused" "$(as $HER "$(ins $G_STRING $HER)")" DENIED
  expect "someone else's canary generation: insert refused" "$(as $HER "$(ins $G_OTHERS $HER)")" DENIED
  expect "claiming another owner_id: insert refused" "$(as $OTHER "$(ins $G_OTHERS $HER)")" DENIED
  expect "other user on her generation: insert refused" "$(as $OTHER "$(ins $G_CANARY $OTHER)")" DENIED
  expect "anon: insert refused" "$(if psql -c "set role anon; $(ins $G_CANARY $HER)" >/dev/null 2>&1; then echo OK; else echo DENIED; fi)" DENIED
  expect "rating 11 refused by the check" "$(as $HER "$(ins $G_CANARY2 $HER 11)")" DENIED
  expect "upsert (the component's write) updates her row" \
    "$(as $HER "insert into public.canary_feedback (generation_id, owner_id, rating, note) values ('$G_CANARY', '$HER', 9, 'n') on conflict (generation_id) do update set rating = excluded.rating, note = excluded.note")" OK
  expect "rating after upsert" "$(psql -c "select rating from public.canary_feedback where generation_id='$G_CANARY'")" 9
  expect "moving her row onto an untagged generation: update refused" "$(as $HER "update public.canary_feedback set generation_id='$G_PLAIN' where generation_id='$G_CANARY'")" DENIED
  as $OTHER "update public.canary_feedback set rating = 1" >/dev/null
  expect "other user's update touches nothing" "$(psql -c "select rating from public.canary_feedback where generation_id='$G_CANARY'")" 9
  expect "other user reads none of her rows" "$(as $OTHER "select 1" >/dev/null; psql -c "set role authenticated; select set_config('request.jwt.claim.sub', '$OTHER', false); select count(*) from public.canary_feedback" | tail -1)" 0
  expect "she reads her row" "$(psql -c "set role authenticated; select set_config('request.jwt.claim.sub', '$HER', false); select count(*) from public.canary_feedback" | tail -1)" 1
  as $HER "delete from public.canary_feedback" >/dev/null
  expect "no delete policy: her delete removes nothing" "$(count "")" 1
  expect "total rows written" "$(count "")" 1
}

setup "$MIG"
run_matrix
[ "$FAILS" = "0" ] || { echo "gate-canary-feedback: $FAILS failure(s)"; exit 1; }

# ── MUTATION CONTROL: without the canary clause the gate must fail. ──
sed "s/ and (g.blueprint ->> 'canary') = 'true'//g" "$MIG" > "$WORK/mut.sql"
grep -q "'canary'" "$WORK/mut.sql" && { echo "FATAL: mutation anchor did not match"; exit 1; }
setup "$WORK/mut.sql"
MUT="$(run_matrix || true)"
FAILS=0
if echo "$MUT" | grep -q "^FAIL: her own untagged generation"; then echo "ok: mutation control caught the missing canary clause"
else echo "FAIL: mutation control was not caught"; exit 1; fi
echo "gate-canary-feedback: PASS"

#!/usr/bin/env bash
# Gate-H — ephemeral-Postgres verification of the CAPABILITY FLAGS SQL (0103).
#
# The TypeScript half (packages/shared/src/editor/capabilities.ts) refuses to
# coerce `"true"` into `true`. That is worth nothing if the column accepts it,
# because the reader is not the only writer a column ever gets: a support tool,
# a future edge function, a hand-run UPDATE. The CHECK is the thing that makes
# "unset is not false" a property of the DATA rather than of one code path, and
# a CHECK constraint nobody executes is a comment.
#
# WHAT IT PROVES, in both directions:
#
#   1. the three known flags accept `true`, `false` and `null`;
#   2. `"true"`, `1`, `"yes"` and `{}`-shaped nonsense are REFUSED, not coerced
#      — the failure mode where a missing answer becomes a confident one;
#   3. a FOURTH key is refused, which is how an enum grows back;
#   4. the column grants exist, because a column `authenticated` cannot write
#      is a feature that fails with a bare 42501 after the credit is spent —
#      the defect 0051 and 0053 both exist to correct.
#
# Every positive is paired with its negative, and the CHECK carries a mutation
# control: dropped, the refused value goes in.
set -euo pipefail
export LC_ALL=C LANG=C PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIG="$REPO/supabase/migrations/0103_capability_flags.sql"
[ -f "$MIG" ] || { echo "FATAL: $MIG not found"; exit 1; }

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

O_ID='22222222-2222-2222-2222-222222222222'
G_ID='44444444-4444-4444-4444-444444444444'
V_ID='66666666-6666-6666-6666-666666666666'

# The two tables as 0001/0002 create them, reduced to the columns 0103 touches
# plus the identity ones. The revoke-then-grant-per-column pattern is reproduced
# EXACTLY, because assertion 4 is about that pattern and a stand-in with a
# table-level grant would pass it without the migration doing anything.
psql -q -v ON_ERROR_STOP=1 <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end \$\$;
grant usage on schema public to authenticated, anon, service_role;
create schema auth;
create table auth.users (id uuid primary key);
insert into auth.users values ('$O_ID');

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  blueprint jsonb not null default '{}'::jsonb,
  selected_hook text,
  scene_timeline jsonb,
  approved boolean);
insert into public.generations (id, user_id) values ('$G_ID', '$O_ID');
grant select, insert on public.generations to authenticated;
revoke update on public.generations from authenticated, anon;
grant update (selected_hook, approved, scene_timeline) on public.generations to authenticated;

create table public.brand_voices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  handle text not null,
  profile jsonb,
  brand_kit jsonb,
  status text not null default 'building');
insert into public.brand_voices (id, owner_id, handle) values ('$V_ID', '$O_ID', 'someone');
grant select, insert on public.brand_voices to authenticated;
revoke update on public.brand_voices from authenticated, anon;
grant update (profile, brand_kit, status) on public.brand_voices to authenticated;
SQL

# PRE-STATE: the columns must not exist yet, or every assertion below could be
# satisfied by a database that already had them and a migration that did nothing.
PRE=$(psql -tAc "select count(*) from information_schema.columns
       where table_name in ('generations','brand_voices')
         and column_name in ('capability_flags','default_capability_flags')" | tr -d '[:space:]')
if [ "$PRE" != "0" ]; then
  echo "GATE-H FAIL: the capability columns already exist before 0103 — nothing here is attributable to the migration"
  exit 1
fi
echo "  pre-state: neither capability column exists (so 0103 is what adds them)"

psql -q -v ON_ERROR_STOP=1 -f "$MIG"
echo "0103 applied"

run(){ psql -q -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1; }
ok(){ if run "$1"; then echo "  ok: $2"; else echo "GATE-H FAIL: legitimate statement REJECTED ($2)"; psql -c "$1" 2>&1 | tail -3; exit 1; fi; }
no(){ if run "$1"; then echo "GATE-H FAIL: forbidden statement ACCEPTED ($2)"; exit 1; else echo "  rejected: $2"; fi; }
eq(){ local got; got="$(psql -tAc "$1" | tr -d '[:space:]')"; if [ "$got" != "$2" ]; then
  echo "GATE-H FAIL: $3 — expected '$2', got '$got'"; exit 1; else echo "  ok: $3"; fi; }
setg(){ echo "update public.generations set capability_flags = '$1'::jsonb where id='$G_ID'"; }

echo "== 1. the three flags accept true, false and NULL"
ok "$(setg '{"can_film_objects":true}')" "can_film_objects = true"
ok "$(setg '{"can_film_objects":false}')" "can_film_objects = false"
ok "$(setg '{"can_film_objects":null}')" "an explicit null — withdrawing an answer"
ok "$(setg '{"can_film_objects":true,"can_record_screen":false,"needs_approval":null}')" "all three at once, mixed"
ok "$(setg '{}')" "an empty object — answered nothing"
ok "update public.generations set capability_flags = null where id='$G_ID'" "the column itself null — never asked"

echo "== 2. UNSET IS NOT FALSE — no value that could be coerced is stored"
# Each of these becomes a confident `true` under a truthiness read, and for
# can_film_objects a wrong answer either removes a screen the creator needed or
# asks them to film something they cannot.
no "$(setg '{"can_film_objects":"true"}')" 'the STRING "true"'
no "$(setg '{"can_film_objects":"false"}')" 'the STRING "false"'
no "$(setg '{"can_film_objects":1}')" "the number 1"
no "$(setg '{"can_film_objects":0}')" "the number 0"
no "$(setg '{"can_film_objects":"yes"}')" 'the string "yes"'
no "$(setg '{"can_film_objects":{}}')" "an object"
no "$(setg '{"can_film_objects":[]}')" "an array"

echo "== 3. a FOURTH key is refused — this is how an enum grows back"
no "$(setg '{"is_explainer":true}')" "an unknown flag name"
no "$(setg '{"can_film_objects":true,"archetype":"demonstrator"}')" "an archetype smuggled in beside a real flag"
no "update public.generations set capability_flags = '[]'::jsonb where id='$G_ID'" "an array instead of an object"
no "update public.generations set capability_flags = '\"flags\"'::jsonb where id='$G_ID'" "a bare string"

echo "== 4. the same rules hold on the brand default"
ok "update public.brand_voices set default_capability_flags = '{\"needs_approval\":true}'::jsonb where id='$V_ID'" \
   "a real boolean default"
no "update public.brand_voices set default_capability_flags = '{\"needs_approval\":\"true\"}'::jsonb where id='$V_ID'" \
   'the STRING "true" on the default'
no "update public.brand_voices set default_capability_flags = '{\"can_fly\":true}'::jsonb where id='$V_ID'" \
   "an unknown flag on the default"

echo "== 5. MUTATION CONTROL: without the CHECK, the coercible value goes in"
psql -q -c "alter table public.generations drop constraint generations_capability_flags_shape" >/dev/null
ok "$(setg '{"can_film_objects":"true"}')" 'with the CHECK dropped, "true" is accepted — the refusals above are the constraint'
psql -q -v ON_ERROR_STOP=1 -c "update public.generations set capability_flags = null where id='$G_ID';
  alter table public.generations add constraint generations_capability_flags_shape
    check (public.is_capability_flags(capability_flags))" >/dev/null

echo "== 6. THE COLUMN GRANTS — the defect 0051 and 0053 both exist to correct"
# A column `authenticated` cannot write is a feature that fails with a bare
# 42501, and in the scene_timeline case it failed AFTER the credit was spent.
eq "select has_column_privilege('authenticated','public.generations','capability_flags','UPDATE')::text" \
   "true" "authenticated may UPDATE generations.capability_flags"
eq "select has_column_privilege('authenticated','public.brand_voices','default_capability_flags','UPDATE')::text" \
   "true" "authenticated may UPDATE brand_voices.default_capability_flags"
# And the revoke is still in force everywhere else — the grant is a column, not
# a table, so a new column tomorrow is still unwritable until someone says so.
eq "select has_column_privilege('authenticated','public.generations','blueprint','UPDATE')::text" \
   "false" "and still may NOT update an ungranted column"
eq "select has_column_privilege('anon','public.generations','capability_flags','UPDATE')::text" \
   "false" "anon may not write flags at all"

echo "== 7. no default was invented for existing rows"
# A backfill would be an answer nobody gave. Every row that existed before 0103
# must read as unanswered, not as `false`.
eq "select count(*) from public.generations where capability_flags is not null" "0" \
   "every pre-existing generation is still unanswered"
eq "select count(*) from public.brand_voices where default_capability_flags is not null" "1" \
   "and only the row this gate wrote carries a default"

echo
echo "GATE-H PASS — 0103's capability-flag SQL executed and verified (positives, negatives, 1 mutation control)"

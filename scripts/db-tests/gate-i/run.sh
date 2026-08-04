#!/usr/bin/env bash
# Gate-I — ephemeral-Postgres verification of the OUTCOME LOG's SQL (0105).
#
# §7b's absolute rule is "never conclude 'this hook caused performance' from one
# successful video", and it calls that failure the same as "Attention Score 9.6"
# wearing a different costume. A rule like that never ships broken as a
# DECISION — it ships as an absent check on a hurried Tuesday. So it is a CHECK
# constraint, and a constraint nobody executes is a comment.
#
# WHAT IT PROVES, in both directions:
#   1. a correlation with no sample size, or n=1, CANNOT BE INSERTED;
#   2. a hypothesis cannot carry a sample size, and a business outcome cannot
#      exist without attribution — the per-type evidence rules;
#   3. the observation log is APPEND-ONLY: a measurement that can be rewritten
#      is not a measurement;
#   4. the metric list is CLOSED, so "engagement" cannot appear;
#   5. two readings a minute apart are two facts; the same reading twice is one;
#   6. a client cannot put a sentence in the product's mouth.
set -euo pipefail
export LC_ALL=C LANG=C PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIG="$REPO/supabase/migrations/0105_outcome_log.sql"
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
P_ID='33333333-3333-3333-3333-333333333333'

psql -q -v ON_ERROR_STOP=1 <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end \$\$;
grant usage on schema public to authenticated, anon, service_role;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as \$\$ select '$O_ID'::uuid \$\$;
insert into auth.users values ('$O_ID');
-- workspace_peers(), which the read policies use.
create function public.workspace_peers() returns setof uuid language sql stable as
  \$\$ select auth.uid() \$\$;
-- 0007's posts, reduced to what 0105 references plus the scalar columns it
-- deliberately does NOT replace.
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  views bigint, likes bigint, comments bigint);
insert into public.posts (id, owner_id) values ('$P_ID', '$O_ID');
SQL

PRE=$(psql -tAc "select count(*) from information_schema.tables
      where table_name in ('post_outcome_observations','dna_claims')" | tr -d '[:space:]')
if [ "$PRE" != "0" ]; then
  echo "GATE-I FAIL: the outcome tables already exist before 0105 — nothing here is attributable to the migration"
  exit 1
fi
echo "  pre-state: neither outcome table exists (so 0105 is what adds them)"

psql -q -v ON_ERROR_STOP=1 -f "$MIG"
echo "0105 applied"

run(){ psql -q -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1; }
ok(){ if run "$1"; then echo "  ok: $2"; else echo "GATE-I FAIL: legitimate statement REJECTED ($2)"; psql -c "$1" 2>&1 | tail -3; exit 1; fi; }
no(){ if run "$1"; then echo "GATE-I FAIL: forbidden statement ACCEPTED ($2)"; exit 1; else echo "  rejected: $2"; fi; }
eq(){ local got; got="$(psql -tAc "$1" | tr -d '[:space:]')"; if [ "$got" != "$2" ]; then
  echo "GATE-I FAIL: $3 — expected '$2', got '$got'"; exit 1; else echo "  ok: $3"; fi; }
claim(){ echo "insert into public.dna_claims (owner_id, claim_type, statement, sample_size, attribution) values ('$O_ID', '$1', '$2', $3, $4)"; }
obsv(){ echo "insert into public.post_outcome_observations (owner_id, post_id, metric, value, observed_at, source) values ('$O_ID','$P_ID','$1',$2,'$3','$4')"; }

echo "== 1. THE ABSOLUTE RULE: n=1 is never a correlation"
no "$(claim correlation 'list formats do better' null null)" "a correlation with NO sample size"
no "$(claim correlation 'list formats do better' 1 null)" "a correlation drawn from ONE video"
no "$(claim correlation 'list formats do better' 0 null)" "a correlation drawn from zero"
ok "$(claim correlation 'list formats do better' 2 null)" "a correlation at the floor, with its N stated"
ok "$(claim correlation 'list formats also do better' 40 null)" "and comfortably above it"

echo "== 2. the per-type evidence rules"
no "$(claim hypothesis 'the hook may help' 9 null)" "a HYPOTHESIS carrying a sample size (untested by definition)"
ok "$(claim hypothesis 'the hook may help' null null)" "a hypothesis with none"
no "$(claim business_outcome '3 leads' null null)" "a BUSINESS OUTCOME with no attribution"
no "$(claim business_outcome '3 leads' null "'   '")" "attribution that is only whitespace"
ok "$(claim business_outcome '3 leads' null "'utm=aug4'")" "an attributed business outcome"
ok "$(claim confirmed_preference 'you keep choosing punchy' null null)" "a confirmed preference"
no "$(claim causation 'the hook caused this' 40 null)" "a CAUSATION claim — there is no such type"
no "$(claim hypothesis '   ' null null)" "an empty statement"

echo "== 3. MUTATION CONTROL on the n=1 rule"
psql -q -c "alter table public.dna_claims drop constraint dna_claims_correlation_needs_sample" >/dev/null
ok "$(claim correlation 'one good video means everything' 1 null)" \
   "with the constraint dropped, n=1 goes in — the refusals above are the CHECK"
psql -q -v ON_ERROR_STOP=1 -c "delete from public.dna_claims where sample_size = 1;
  alter table public.dna_claims add constraint dna_claims_correlation_needs_sample
    check (claim_type <> 'correlation' or (sample_size is not null and sample_size >= 2))" >/dev/null

echo "== 4. the observation log records measurements, closed-list only"
ok "$(obsv views 1200 '2026-08-04T12:00:00Z' platform_api)" "a platform reading"
ok "$(obsv views 4800 '2026-08-05T12:00:00Z' platform_api)" "the SAME metric a day later — a second fact, not an overwrite"
ok "$(obsv leads 3 '2026-08-05T12:00:00Z' manual)" "a business metric, entered by hand"
no "$(obsv engagement 5 '2026-08-05T12:00:00Z' platform_api)" "the metric 'engagement' — the list is closed"
no "$(obsv views -5 '2026-08-05T12:00:00Z' platform_api)" "a negative view count (a broken reader, not a fact)"
no "$(obsv views 5 '2026-08-05T12:00:00Z' guesswork)" "an unknown source"
eq "select count(*) from public.post_outcome_observations where metric='views'" "2" \
   "both readings of the same metric survive — the history IS the point"

echo "== 5. the log is APPEND-ONLY"
no "update public.post_outcome_observations set value = 999999 where metric='views'" \
   "UPDATE on a recorded measurement"
no "delete from public.post_outcome_observations where metric='views'" \
   "DELETE on a recorded measurement"
eq "select count(*) from public.post_outcome_observations where value=999999" "0" "and nothing changed"
psql -q -c "drop trigger trg_post_outcome_observations_append_only on public.post_outcome_observations" >/dev/null
ok "update public.post_outcome_observations set value = 999999 where metric='leads'" \
   "MUTATION CONTROL: with the trigger dropped the UPDATE succeeds"
psql -q -v ON_ERROR_STOP=1 -c "update public.post_outcome_observations set value = 3 where metric='leads';
  create trigger trg_post_outcome_observations_append_only
  before update or delete on public.post_outcome_observations
  for each row execute function public.post_outcome_observations_append_only()" >/dev/null

echo "== 6. the same reading twice is ONE fact"
no "$(obsv views 1200 '2026-08-04T12:00:00Z' platform_api)" \
   "re-reading the same metric at the same instant from the same source"
ok "$(obsv views 1201 '2026-08-04T12:00:01Z' platform_api)" "a second later IS a second fact"

echo "== 7. a client may not put a sentence in the product's mouth"
eq "select has_table_privilege('authenticated','public.dna_claims','INSERT')::text" "false" \
   "authenticated may NOT write a claim"
eq "select has_table_privilege('authenticated','public.dna_claims','SELECT')::text" "true" \
   "but may read its own"
eq "select has_table_privilege('authenticated','public.post_outcome_observations','INSERT')::text" "true" \
   "and may log its own measurements"
eq "select has_table_privilege('anon','public.post_outcome_observations','SELECT')::text" "false" \
   "anon sees nothing"

echo
echo "GATE-I PASS — 0105's outcome-log SQL executed and verified (positives, negatives, 2 mutation controls)"

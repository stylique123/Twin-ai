#!/usr/bin/env bash
# Gate-F — ephemeral-Postgres verification of the Phase 8 plan/output SQL (0094).
#
# Gate-0 §7 names this path the "plan/output SQL hostile gate", and §6 freezes
# the invariant it exists to prove:
#
#   `completed` with a null or non-ready output must be IMPOSSIBLE, not merely
#   unused.
#
# "Unused" is a property of today's callers. This gate asks the only question
# that outlives them: can the database be talked into it AT ALL — as the owner
# of the database, which is the role service_role stands in for, with triggers
# that ignore RLS because that is the entire point of putting the guard there.
#
# EVERY POSITIVE IS PAIRED WITH ITS NEGATIVE. A gate that only proves forbidden
# things fail can be satisfied by a database that refuses everything, and one
# that only proves legitimate things succeed can be satisfied by a database with
# no guards at all. Both directions are asserted for each rule.
#
# AND THERE IS A MUTATION CONTROL. With the append-only trigger dropped, the
# UPDATE that must fail starts succeeding — which is what proves the refusal is
# the trigger and not an accident of the schema.
set -euo pipefail
export LC_ALL=C LANG=C PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIG="$REPO/supabase/migrations/0094_editor_editplan_render_completion.sql"
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

P_ID='11111111-1111-1111-1111-111111111111'   # project
O_ID='22222222-2222-2222-2222-222222222222'   # owner
J_ID='33333333-3333-3333-3333-333333333333'   # job
G_ID='44444444-4444-4444-4444-444444444444'   # generation
S_ID='55555555-5555-5555-5555-555555555555'   # source asset
A_ID='66666666-6666-6666-6666-666666666666'   # output asset
SHA_P="$(printf 'a%.0s' $(seq 1 64))"         # plan digest
SHA_D="$(printf 'b%.0s' $(seq 1 64))"         # decision digest
SHA_O="$(printf 'c%.0s' $(seq 1 64))"         # output file digest
SHA_X="$(printf 'd%.0s' $(seq 1 64))"         # a DIFFERENT file digest
WORKER='worker-1'

# Stand-ins for the objects 0094 references but does not create. The migration is
# applied VERBATIM; only its external dependencies are faked, so nothing about
# the guards themselves is paraphrased. In particular `editor_assert_lease` is
# the REAL fencing shape — a job row that must be running and locked by this
# worker — so the fenced RPCs are exercised through the fence, not around it.
bootstrap(){
  psql -q -v ON_ERROR_STOP=1 <<SQL
drop schema if exists auth cascade;
drop table if exists public.edit_outputs cascade;
drop table if exists public.edit_plans cascade;
drop table if exists public.edit_projects cascade;
drop table if exists public.media_assets cascade;
drop table if exists public.generations cascade;
drop table if exists public.jobs cascade;
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end \$\$;
grant usage on schema public to authenticated, anon, service_role;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as \$\$ select null::uuid \$\$;
insert into auth.users values ('$O_ID');
create table public.generations (id uuid primary key);
insert into public.generations values ('$G_ID');
create table public.media_assets (id uuid primary key);
insert into public.media_assets values ('$S_ID'), ('$A_ID');
create table public.jobs (
  id uuid primary key, status text not null, locked_by text, attempt integer not null default 1,
  payload jsonb not null default '{}'::jsonb);
insert into public.jobs values ('$J_ID', 'running', '$WORKER', 1, jsonb_build_object('project_id','$P_ID'));

create table public.edit_projects (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid not null references public.generations(id) on delete cascade,
  source_asset_id uuid not null references public.media_assets(id),
  status text not null default 'queued',
  output_asset_id uuid references public.media_assets(id),
  completed_at timestamptz);
insert into public.edit_projects (id, owner_id, generation_id, source_asset_id, status)
  values ('$P_ID', '$O_ID', '$G_ID', '$S_ID', 'compiling');

-- 0078's REAL edit_plans, reproduced verbatim. THIS IS THE FIX FOR THE FLAW
-- THAT LET TWO DEFECTS THROUGH: the bootstrap used to create no edit_plans at
-- all, so 0094 built its own and the gate proved a migration that only works
-- on a database where the table is absent. It is not absent anywhere real —
-- 0078 has created it since the start of the editor work. A stand-in that is
-- missing what production has is not a stand-in, it is a different database.
create table public.edit_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  edit_project_id uuid not null references public.edit_projects(id) on delete cascade,
  version integer not null,
  schema_version integer not null,
  plan jsonb not null,
  plan_hash text not null,
  status text not null default 'draft'
    check (status in ('draft','validated','rendering','rendered','rejected')),
  created_at timestamptz not null default now()
);
create unique index edit_plans_version_uniq on public.edit_plans (edit_project_id, version);
create index edit_plans_owner_idx on public.edit_plans (owner_id);
alter table public.edit_plans enable row level security;
create policy "edit_plans read" on public.edit_plans
  for select to authenticated using (owner_id = (select auth.uid()));
grant select on public.edit_plans to authenticated;
revoke all on public.edit_plans from anon;
revoke insert, update, delete, truncate, references, trigger on public.edit_plans from authenticated;

-- The REAL fencing predicate from 0081, reproduced exactly.
create function public.editor_assert_lease(p_project uuid, p_job uuid, p_worker text, p_attempt integer)
returns void language plpgsql security definer set search_path = pg_catalog, public as \$\$
begin
  perform 1 from public.jobs
    where id = p_job and status = 'running' and locked_by = p_worker
      and attempt = p_attempt and payload->>'project_id' = p_project::text
    for update;
  if not found then
    raise exception 'lease_lost: worker % no longer holds the running lease for project %', p_worker, p_project;
  end if;
end; \$\$;

SQL
}

bootstrap
psql -q -v ON_ERROR_STOP=1 -f "$MIG"
echo "0094 applied"

run(){ psql -q -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1; }
ok(){ if run "$1"; then echo "  ok: $2"; else echo "GATE-F FAIL: legitimate statement REJECTED ($2)"; psql -c "$1" 2>&1 | tail -3; exit 1; fi; }
no(){ if run "$1"; then echo "GATE-F FAIL: forbidden statement ACCEPTED ($2)"; exit 1; else echo "  rejected: $2"; fi; }
# A zero-row UPDATE fires no FOR EACH ROW trigger, so an empty table makes every
# append-only assertion pass vacuously. Every such table is seeded and the seed
# is CHECKED before the assertions that depend on it.
require_rows(){
  n=$(psql -tAc "select count(*) from $1")
  if [ "$n" -lt 1 ]; then
    echo "GATE-F FAIL: public.$1 is empty, so an UPDATE/DELETE against it fires no row trigger."
    exit 1
  fi
}

PLAN_JSON='{"identity":{"planVersion":"edit-plan-v1"},"output":{"durationMs":60000}}'
RECORD="select public.editor_record_edit_plan('$P_ID','$J_ID','$WORKER',1,'$SHA_P','$SHA_D','boot','snap','srcsum','edit-plan-v1','edit-policy-v1','edit-compiler-1','$PLAN_JSON'::jsonb,60000)"

echo "== plan persistence is FENCED =="
no "select public.editor_record_edit_plan('$P_ID','$J_ID','not-this-worker',1,'$SHA_P','$SHA_D','boot','snap','srcsum','edit-plan-v1','edit-policy-v1','edit-compiler-1','$PLAN_JSON'::jsonb,60000)" \
   "a worker that does not hold the lease cannot record a plan"
no "select public.editor_record_edit_plan('$P_ID','$J_ID','$WORKER',9,'$SHA_P','$SHA_D','boot','snap','srcsum','edit-plan-v1','edit-policy-v1','edit-compiler-1','$PLAN_JSON'::jsonb,60000)" \
   "a STALE ATTEMPT token cannot record a plan"
ok "$RECORD" "the lease-holder at the right attempt records the plan"
require_rows edit_plans

echo "== recompiling is idempotent; DIVERGING is not =="
ok "$RECORD" "the same plan recorded twice returns the same row (crash-resume)"
no "select public.editor_record_edit_plan('$P_ID','$J_ID','$WORKER',1,'$SHA_X','$SHA_D','boot','snap','srcsum','edit-plan-v1','edit-policy-v1','edit-compiler-1','$PLAN_JSON'::jsonb,60000)" \
   "a DIFFERENT plan for the same project is refused (edit_plan_divergent)"
n=$(psql -tAc "select count(*) from public.edit_plans where edit_project_id = '$P_ID'")
[ "$n" = "1" ] || { echo "GATE-F FAIL: expected exactly one plan row, found $n"; exit 1; }
echo "  ok: exactly one plan row survives both attempts"

echo "== the plan is IMMUTABLE for every role, service_role included =="
no "update public.edit_plans set output_duration_ms = 1 where edit_project_id = '$P_ID'" \
   "UPDATE edit_plans (as the database owner, triggers ignore RLS)"
no "update public.edit_plans set plan_hash = '$SHA_X' where edit_project_id = '$P_ID'" \
   "UPDATE the plan digest"
no "delete from public.edit_plans where edit_project_id = '$P_ID'" \
   "DELETE edit_plans"

echo "== plan shape CHECKs =="
no "insert into public.edit_plans (owner_id,edit_project_id,version,schema_version,plan,plan_hash) values ('$O_ID','$P_ID',9,1,'{}'::jsonb,'not-a-sha')" \
   "a non-sha256 plan digest"
no "insert into public.edit_plans (owner_id,edit_project_id,version,schema_version,plan,plan_hash) values ('$O_ID','$P_ID',9,1,'[1,2]'::jsonb,'$SHA_X')" \
   "a plan that is not a JSON object"
no "insert into public.edit_plans (owner_id,edit_project_id,version,schema_version,plan,plan_hash,output_duration_ms) values ('$O_ID','$P_ID',9,1,'{}'::jsonb,'$SHA_X',-1)" \
   "a negative output duration"

echo "== output reservation: the PATH IS SERVER-DERIVED =="
no "select public.editor_reserve_output('$P_ID','$J_ID','$WORKER',1,'video','media')" \
   "reserving while the project is still compiling (wrong stage)"
run "update public.edit_projects set status = 'rendering' where id = '$P_ID'"
ok "select public.editor_reserve_output('$P_ID','$J_ID','$WORKER',1,'video','media')" \
   "the lease-holder reserves the video output while rendering"
require_rows edit_outputs
got=$(psql -tAc "select storage_path from public.edit_outputs where edit_project_id='$P_ID' and kind='video'")
want="edit-outputs/$O_ID/$P_ID/1/output.mp4"
[ "$got" = "$want" ] || { echo "GATE-F FAIL: derived path is '$got', expected '$want'"; exit 1; }
echo "  ok: the path was derived from ids the database holds, not supplied"
ok "select public.editor_reserve_output('$P_ID','$J_ID','$WORKER',1,'video','media')" \
   "reserving twice returns the same reservation (crash-resume)"
no "select public.editor_reserve_output('$P_ID','$J_ID','$WORKER',1,'thumbnail','media')" \
   "an unknown output kind"
ok "select public.editor_reserve_output('$P_ID','$J_ID','$WORKER',1,'cover','media')" \
   "the cover reserves alongside the video"

echo "== a path outside the owner's prefix cannot be STORED, even directly =="
no "insert into public.edit_outputs (owner_id,edit_project_id,edit_plan_id,attempt,storage_bucket,storage_path,kind) select '$O_ID','$P_ID',id,1,'media','edit-outputs/../../etc/passwd','video' from public.edit_plans limit 1" \
   "a traversal in storage_path"
no "insert into public.edit_outputs (owner_id,edit_project_id,edit_plan_id,attempt,storage_bucket,storage_path,kind) select '$O_ID','$P_ID',id,1,'media','anywhere/i/like.mp4','video' from public.edit_plans limit 1" \
   "an arbitrary storage_path"

echo "== READY MEANS MEASURED =="
no "update public.edit_outputs set state='ready' where edit_project_id='$P_ID' and kind='video'" \
   "marking ready with no bytes, digest or timestamp"
no "update public.edit_outputs set state='ready', bytes=100, ready_at=now() where edit_project_id='$P_ID' and kind='video'" \
   "marking ready with no digest"
no "update public.edit_outputs set state='ready', bytes=100, sha256='$SHA_O', ready_at=now() where edit_project_id='$P_ID' and kind='video'" \
   "marking a VIDEO ready with no measured duration"
ok "select public.editor_mark_output_ready('$P_ID','$J_ID','$WORKER',1,'video',100,'$SHA_O',60000)" \
   "the RPC marks it ready WITH its measurements"
ok "select public.editor_mark_output_ready('$P_ID','$J_ID','$WORKER',1,'video',100,'$SHA_O',60000)" \
   "marking the SAME file ready twice is idempotent"
no "select public.editor_mark_output_ready('$P_ID','$J_ID','$WORKER',1,'video',999,'$SHA_X',60000)" \
   "marking a DIFFERENT file ready under the same path (output_completion_conflict)"

echo "== measurements and identity are not rewritable =="
no "update public.edit_outputs set sha256='$SHA_X' where edit_project_id='$P_ID' and kind='video'" \
   "rewriting a recorded digest"
no "update public.edit_outputs set bytes=1 where edit_project_id='$P_ID' and kind='video'" \
   "rewriting a recorded size"
no "update public.edit_outputs set state='reserved' where edit_project_id='$P_ID' and kind='video'" \
   "walking ready back to reserved"
no "update public.edit_outputs set storage_path='edit-outputs/$O_ID/$P_ID/1/cover.jpg' where edit_project_id='$P_ID' and kind='video'" \
   "changing the storage path after reservation"
no "delete from public.edit_outputs where edit_project_id='$P_ID' and kind='video'" \
   "deleting an output row"

echo "== COMPLETION: what 0094 closes, and what it deliberately does not =="
#
# THE DIRECT-UPDATE PATH IS OPEN UNTIL 8.5, AND THIS SAYS SO OUT LOUD.
#
# 0094 does NOT install the completion trigger. `check_activation_gate.mjs`
# refuses a migration tying `completed` to a non-null output before the renderer
# exists, and it is right: nothing yet PRODUCES an output, so the rule's only
# observable effect today would be breaking the simulated pipeline.
#
# What that means for this gate has to be stated, not glossed: a bare UPDATE to
# `completed` is currently ACCEPTED. Asserting it is refused would be asserting
# something false, and quietly deleting the assertion would leave a reader to
# assume the direct path was covered. So it is asserted as ALLOWED, labelled as
# a known gap, and the RPC — the only path Phase 8 will ever use — is proven
# closed below.
#
# When 8.5 lands the trigger, these two `ok`s become `no`s and the gap closes.
run "update public.edit_projects set status='validating' where id='$P_ID'"
ok "update public.edit_projects set status='completed', output_asset_id=null where id='$P_ID'" \
   "KNOWN GAP until 8.5: a bare UPDATE to completed with a null output is not yet refused"
run "update public.edit_projects set status='validating', output_asset_id=null, completed_at=null where id='$P_ID'"
no "select public.editor_complete_output('$P_ID','$J_ID','not-this-worker',1,'$A_ID')" \
   "completing without the lease"
ok "select public.editor_complete_output('$P_ID','$J_ID','$WORKER',1,'$A_ID')" \
   "the lease-holder completes with a ready video and an output asset"
ok "select public.editor_complete_output('$P_ID','$J_ID','$WORKER',1,'$A_ID')" \
   "completing twice onto the SAME asset is idempotent"
no "select public.editor_complete_output('$P_ID','$J_ID','$WORKER',1,'$S_ID')" \
   "completing onto a DIFFERENT asset (output_completion_conflict)"

echo "== and the same invariant on a project whose output was never made ready =="
P2='77777777-7777-7777-7777-777777777777'
J2='88888888-8888-8888-8888-888888888888'
S2='99999999-9999-9999-9999-999999999999'
psql -q -v ON_ERROR_STOP=1 <<SQL >/dev/null
insert into public.media_assets values ('$S2');
insert into public.jobs values ('$J2','running','$WORKER',1, jsonb_build_object('project_id','$P2'));
insert into public.edit_projects (id, owner_id, generation_id, source_asset_id, status)
  values ('$P2','$O_ID','$G_ID','$S2','validating');
SQL
no "select public.editor_complete_output('$P2','$J2','$WORKER',1,'$A_ID')" \
   "the RPC refuses to complete a project with no READY video"

# THE BRANCH GATE-F COULD NOT SEE.
#
# Gate-F builds its own edit_projects stand-in, so it never exercises the
# SIMULATED pipeline that exists today — the one where compiling/rendering/
# validating are scaffolds and every project completes with output_asset_id
# NULL. The first version of this migration refused exactly that, which would
# have reddened Phases 3-7 of the staging matrix (phase7's A3 asserts the null
# by name) while every assertion in this file stayed green.
#
# A hostile SQL gate that cannot see the shape the production pipeline actually
# produces is testing a database nobody runs. Both paths are asserted now.
echo "== the SCAFFOLD path: completing while CLAIMING NOTHING is allowed =="
ok "update public.edit_projects set status='completed' where id='$P2'" \
   "a project with no outputs and a null asset completes (today's simulated pipeline)"
got=$(psql -tAc "select coalesce(output_asset_id::text,'NULL') from public.edit_projects where id='$P2'")
[ "$got" = "NULL" ] || { echo "GATE-F FAIL: scaffold completion left output_asset_id='$got'"; exit 1; }
echo "  ok: and it still claims no output"

echo "== but a project that RESERVED an output cannot complete claiming nothing =="
P3='aaaaaaaa-0000-0000-0000-000000000003'
J3='bbbbbbbb-0000-0000-0000-000000000003'
S3='cccccccc-0000-0000-0000-000000000003'
psql -q -v ON_ERROR_STOP=1 <<SQL >/dev/null
insert into public.media_assets values ('$S3');
insert into public.jobs values ('$J3','running','$WORKER',1, jsonb_build_object('project_id','$P3'));
insert into public.edit_projects (id, owner_id, generation_id, source_asset_id, status)
  values ('$P3','$O_ID','$G_ID','$S3','compiling');
SQL
# Walk it through the real stage order — the RPCs are stage-fenced, so a fixture
# that jumps straight to `rendering` cannot record a plan at all.
ok "select public.editor_record_edit_plan('$P3','$J3','$WORKER',1,'$SHA_D','$SHA_P','boot','snap','srcsum','edit-plan-v1','edit-policy-v1','edit-compiler-1','$PLAN_JSON'::jsonb,60000)" \
   "the second project records its own plan while compiling"
run "update public.edit_projects set status='rendering' where id='$P3'"
# A RESERVED but never-ready output: the crash-mid-render shape.
ok "select public.editor_reserve_output('$P3','$J3','$WORKER',1,'video','media')" \
   "and reserves a video output"
run "update public.edit_projects set status='validating' where id='$P3'"
no "select public.editor_complete_output('$P3','$J3','$WORKER',1,'$A_ID')" \
   "the RPC refuses the made-it-then-lost-it case: an output was reserved and never became ready"

echo "== client roles: read yes, write no; anon nothing =="
ok "set role authenticated; select 1 from public.edit_plans limit 1; reset role" \
   "authenticated may SELECT plans"
no "set role authenticated; insert into public.edit_plans (owner_id,edit_project_id,version,schema_version,plan,plan_hash) values ('$O_ID','$P_ID',9,1,'{}'::jsonb,'$SHA_X')" \
   "authenticated may NOT insert a plan"
no "set role authenticated; update public.edit_outputs set bytes=5 where kind='video'" \
   "authenticated may NOT update an output"
no "set role anon; select 1 from public.edit_plans limit 1" \
   "anon may not read plans at all"
no "set role anon; select 1 from public.edit_outputs limit 1" \
   "anon may not read outputs at all"
no "set role authenticated; select public.editor_complete_output('$P_ID','$J_ID','$WORKER',1,'$A_ID')" \
   "authenticated may not execute the completion RPC"

echo "== MUTATION CONTROL: without the trigger, the UPDATE succeeds =="
# If this DOES NOT succeed, the append-only refusals above were passing for some
# other reason and prove nothing about the trigger.
psql -q -v ON_ERROR_STOP=1 -c "drop trigger trg_edit_plans_guard on public.edit_plans" >/dev/null
if run "update public.edit_plans set output_duration_ms = 2 where edit_project_id = '$P_ID'"; then
  echo "  ok: with the guard removed the UPDATE goes through — the trigger is what refuses it"
else
  echo "GATE-F FAIL: the UPDATE still failed with the append-only trigger dropped."
  echo "             The refusals above are therefore not attributable to it."
  exit 1
fi

# THE SECOND MUTATION CONTROL IS GONE, ON PURPOSE.
#
# It dropped `trg_edit_projects_completion` and proved the refusals were
# attributable to it. That trigger is not in 0094 any more, so the control has
# no subject — and a control that drops a trigger which was never created would
# either error or, worse, "pass" by dropping nothing.
#
# It moves to 8.5 with the trigger it tests. The remaining control above still
# proves the plan-immutability refusals are attributable to their trigger.

echo "GATE-F PASS"

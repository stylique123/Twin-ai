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
MIG2="$REPO/supabase/migrations/0096_editor_output_asset_and_completion.sql"
MIG3="$REPO/supabase/migrations/0097_editor_output_bucket_fence.sql"
for m in "$MIG" "$MIG2" "$MIG3"; do
  [ -f "$m" ] || { echo "FATAL: $m not found"; exit 1; }
done

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
SHA_EV="$(printf 'e%.0s' $(seq 1 64))"        # the fifth project's output digest
SHA_AN="$(printf 'f%.0s' $(seq 1 64))"        # the sixth project's output digest
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
-- media_assets, with the columns 0096's RPC actually writes. A stand-in of
-- `(id uuid primary key)` was enough while nothing inserted into it, and became
-- wrong the moment something did — the third time in this branch that a
-- convenient stand-in hid what production has. The unique index on
-- storage_path is what makes the RPC's crash-resume idempotency real rather
-- than assumed.
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  workspace_id uuid,
  generation_id uuid references public.generations(id) on delete set null,
  kind text check (kind in ('source','music','output','thumbnail')),
  bucket text,
  storage_path text unique,
  content_sha256 text,
  mime_type text,
  size_bytes bigint,
  duration_ms bigint,
  width integer,
  height integer,
  frame_rate_num integer,
  frame_rate_den integer,
  status text);
insert into public.media_assets (id) values ('$S_ID'), ('$A_ID');
create table public.jobs (
  id uuid primary key, status text not null, locked_by text, attempt integer not null default 1,
  payload jsonb not null default '{}'::jsonb);
insert into public.jobs values ('$J_ID', 'running', '$WORKER', 1, jsonb_build_object('project_id','$P_ID'));

create table public.edit_projects (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid not null references public.generations(id) on delete cascade,
  source_asset_id uuid not null references public.media_assets(id),
  workspace_id uuid,
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
psql -q -v ON_ERROR_STOP=1 -f "$MIG2"
psql -q -v ON_ERROR_STOP=1 -f "$MIG3"
echo "0094 + 0096 + 0097 applied"

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
# Its counterpart: a REFUSAL must also leave the table as it found it. An RPC
# that raises after inserting would be "rejected" by the `no` helper and still
# have written the row — a refusal is about state, not about the return value.
require_no_rows(){
  n=$(psql -tAc "select count(*) from $1")
  if [ "$n" -ne 0 ]; then
    echo "GATE-F FAIL: public.$1 holds $n row(s) after a refusal — $2"
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
no "select public.editor_reserve_output('$P_ID','$J_ID','$WORKER',1,'video','edits')" \
   "reserving while the project is still compiling (wrong stage)"

run "update public.edit_projects set status = 'rendering' where id = '$P_ID'"

# THE BUCKET IS FENCED TOO (0097). This gate passed nine times reserving into
# 'media' — a bucket 0065 never creates and nothing in the product references —
# because a throwaway Postgres has no storage for a bucket name to be wrong
# ABOUT. Every value passed, so the value proved nothing.
#
# THESE RUN AFTER THE STAGE IS ADVANCED, and that placement is the whole point.
# Sitting above the advance they were unfalsifiable: the wrong-stage check would
# have rejected them just as flatly with the fence deleted, so they would have
# gone on passing while proving nothing — the same shape of hole they exist to
# close. Here the stage is right, the lease is right, and the bucket is the only
# thing left that can refuse.
no "select public.editor_reserve_output('$P_ID','$J_ID','$WORKER',1,'video','media')" \
   "reserving into 'media' — the bucket that never existed"
no "select public.editor_reserve_output('$P_ID','$J_ID','$WORKER',1,'video','takes')" \
   "reserving a finished render into the SOURCE bucket"
no "select public.editor_reserve_output('$P_ID','$J_ID','$WORKER',1,'video','')" \
   "reserving into an empty bucket name"
no "select public.editor_reserve_output('$P_ID','$J_ID','$WORKER',1,'video',null)" \
   "reserving into a null bucket — 'is distinct from', not '<>', is what catches this"
require_no_rows edit_outputs "a refused reservation must leave NO row behind"
ok "select public.editor_reserve_output('$P_ID','$J_ID','$WORKER',1,'video','edits')" \
   "the lease-holder reserves the video output while rendering"
require_rows edit_outputs
got=$(psql -tAc "select storage_path from public.edit_outputs where edit_project_id='$P_ID' and kind='video'")
want="edit-outputs/$O_ID/$P_ID/1/output.mp4"
[ "$got" = "$want" ] || { echo "GATE-F FAIL: derived path is '$got', expected '$want'"; exit 1; }
echo "  ok: the path was derived from ids the database holds, not supplied"
ok "select public.editor_reserve_output('$P_ID','$J_ID','$WORKER',1,'video','edits')" \
   "reserving twice returns the same reservation (crash-resume)"
no "select public.editor_reserve_output('$P_ID','$J_ID','$WORKER',1,'thumbnail','edits')" \
   "an unknown output kind"
ok "select public.editor_reserve_output('$P_ID','$J_ID','$WORKER',1,'cover','edits')" \
   "the cover reserves alongside the video"

echo "== a path outside the owner's prefix cannot be STORED, even directly =="
no "insert into public.edit_outputs (owner_id,edit_project_id,edit_plan_id,attempt,storage_bucket,storage_path,kind) select '$O_ID','$P_ID',id,1,'edits','edit-outputs/../../etc/passwd','video' from public.edit_plans limit 1" \
   "a traversal in storage_path"
no "insert into public.edit_outputs (owner_id,edit_project_id,edit_plan_id,attempt,storage_bucket,storage_path,kind) select '$O_ID','$P_ID',id,1,'edits','anywhere/i/like.mp4','video' from public.edit_plans limit 1" \
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
# THE GAP 8.4 LEFT OPEN, NOW CLOSED. This assertion was an `ok` labelled
# "KNOWN GAP until 8.5" for exactly as long as the trigger was deferred. 0096
# installs it, so it is a refusal now — and the flip is the evidence that the
# deferral was tracked rather than forgotten.
no "update public.edit_projects set status='completed', output_asset_id=null where id='$P_ID'" \
   "a bare UPDATE to completed with reserved outputs and a null asset"
no "select public.editor_complete_output('$P_ID','$J_ID','not-this-worker',1,'$A_ID')" \
   "completing without the lease"
# THIS BLOCK USED TO PASS A BARE $A_ID, an asset that was never the rendered
# output. It only worked because `editor_complete_output` did not reconcile —
# the exact hole the audit found. With reconciliation in place the fixture has
# to do what the worker does: mint the asset FROM the reserved row, then
# complete onto it.
ok "select public.editor_create_output_asset('$P_ID','$J_ID','$WORKER',1,1080,1920,30,1,'video/mp4')" \
   "the derived output asset is minted from the ready row"
A_REAL=$(psql -tAc "select id from public.media_assets where storage_path='edit-outputs/$O_ID/$P_ID/1/output.mp4'")
ok "select public.editor_complete_output('$P_ID','$J_ID','$WORKER',1,'$A_REAL')" \
   "the lease-holder completes onto the DERIVED asset"
ok "select public.editor_complete_output('$P_ID','$J_ID','$WORKER',1,'$A_REAL')" \
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
ok "select public.editor_reserve_output('$P3','$J3','$WORKER',1,'video','edits')" \
   "and reserves a video output"
run "update public.edit_projects set status='validating' where id='$P3'"
no "select public.editor_complete_output('$P3','$J3','$WORKER',1,'$A_ID')" \
   "the RPC refuses the made-it-then-lost-it case: an output was reserved and never became ready"

echo "== the OUTPUT ASSET: 0094 could complete onto one but never made one =="
# 0094 shipped `editor_complete_output(..., p_output_asset)` with nothing in the
# schema able to CREATE that asset, and no media_assets insert anywhere in the
# worker. The completion path was unreachable as merged. 0096 adds the fenced
# RPC; these assertions are what stop it regressing to an unfenced insert.
P4='dddddddd-0000-0000-0000-000000000004'
J4='eeeeeeee-0000-0000-0000-000000000004'
S4='ffffffff-0000-0000-0000-000000000004'
psql -q -v ON_ERROR_STOP=1 <<SQL >/dev/null
insert into public.media_assets values ('$S4');
insert into public.jobs values ('$J4','running','$WORKER',1, jsonb_build_object('project_id','$P4'));
insert into public.edit_projects (id, owner_id, generation_id, source_asset_id, status)
  values ('$P4','$O_ID','$G_ID','$S4','compiling');
SQL
no "select public.editor_create_output_asset('$P4','$J4','$WORKER',1,1080,1920,30,1,'video/mp4')" \
   "minting an output asset for a project with NO reserved output"
ok "select public.editor_record_edit_plan('$P4','$J4','$WORKER',1,'$SHA_O','$SHA_P','boot','snap','srcsum','edit-plan-v1','edit-policy-v1','edit-compiler-1','$PLAN_JSON'::jsonb,60000)" \
   "the fourth project records its plan"
run "update public.edit_projects set status='rendering' where id='$P4'"
ok "select public.editor_reserve_output('$P4','$J4','$WORKER',1,'video','edits')" \
   "and reserves its video output"
no "select public.editor_create_output_asset('$P4','$J4','$WORKER',1,1080,1920,30,1,'video/mp4')" \
   "minting an asset while the output is RESERVED but not ready"
ok "select public.editor_mark_output_ready('$P4','$J4','$WORKER',1,'video',4096,'$SHA_X',60000)" \
   "the output becomes ready with its measurements"
no "select public.editor_create_output_asset('$P4','$J4','not-this-worker',1,1080,1920,30,1,'video/mp4')" \
   "minting without the lease"
ok "select public.editor_create_output_asset('$P4','$J4','$WORKER',1,1080,1920,30,1,'video/mp4')" \
   "the lease-holder mints the output asset once the video is ready"
ok "select public.editor_create_output_asset('$P4','$J4','$WORKER',1,1080,1920,30,1,'video/mp4')" \
   "minting twice returns the same asset (crash-resume)"
# Scoped to THIS project: P_ID now mints its own derived asset too, so a global
# count is no longer the right question. "One per project" is the invariant the
# partial unique index actually enforces.
n=$(psql -tAc "select count(*) from public.media_assets where storage_path like 'edit-outputs/%/$P4/%'")
[ "$n" = "1" ] || { echo "GATE-F FAIL: expected exactly one output asset for $P4, found $n"; exit 1; }
echo "  ok: exactly one output asset exists for this project"
# The asset is DERIVED: path, bucket, owner and digest all come from the
# reserved row, not from arguments the caller could disagree with.
got=$(psql -tAc "select storage_path||'|'||coalesce(content_sha256,'')||'|'||coalesce(size_bytes::text,'') from public.media_assets where storage_path like 'edit-outputs/%/$P4/%'")
want="edit-outputs/$O_ID/$P4/1/output.mp4|$SHA_X|4096"
[ "$got" = "$want" ] || { echo "GATE-F FAIL: derived asset is '$got', expected '$want'"; exit 1; }
echo "  ok: path, digest and size were DERIVED from the reserved output"
# THE DURATION IS THE MEASURED ONE, AND THERE IS NO WAY TO PASS ANOTHER.
# The output was marked ready with a measured 60000ms. The RPC has no duration
# parameter at all — it was removed after the render stage was caught passing
# the plan's PROMISED length, which the +/-250ms tolerance lets differ from what
# ffprobe read. This asserts the value came from edit_outputs, and the arity
# check below is what stops the parameter quietly returning.
d=$(psql -tAc "select coalesce(duration_ms::text,'NULL') from public.media_assets where storage_path like 'edit-outputs/%/$P4/%'")
[ "$d" = "60000" ] || { echo "GATE-F FAIL: asset duration is '$d', expected the MEASURED 60000"; exit 1; }
echo "  ok: duration came from edit_outputs.measured_duration_ms"
nargs=$(psql -tAc "select pronargs from pg_proc where proname='editor_create_output_asset'")
[ "$nargs" = "9" ] || { echo "GATE-F FAIL: editor_create_output_asset takes $nargs args, expected 9 — a duration parameter has returned"; exit 1; }
echo "  ok: the RPC takes 9 arguments — no duration among them"

echo "== and the completed project must point at it =="
run "update public.edit_projects set status='validating' where id='$P4'"
a4=$(psql -tAc "select id from public.media_assets where storage_path like 'edit-outputs/%/$P4/%'")
ok "select public.editor_complete_output('$P4','$J4','$WORKER',1,'$a4')" \
   "completion onto the minted asset"

echo "== THE FIRST completion must not bind an UNRELATED asset =="
# THE CASE GATE-F PREVIOUSLY MISSED. Its "different asset" test ran AFTER a
# successful completion, so the idempotency comparison rejected the second call
# — it exercised the safe ordering. The dangerous case is the FIRST completion
# using the wrong asset, and nothing tested it.
P5='11111111-2222-3333-4444-000000000005'
J5='22222222-3333-4444-5555-000000000005'
S5='33333333-4444-5555-6666-000000000005'
OTHER='44444444-5555-6666-7777-000000000005'
O2='55555555-6666-7777-8888-000000000005'
psql -q -v ON_ERROR_STOP=1 <<SQL >/dev/null
insert into auth.users values ('$O2');
insert into public.media_assets (id) values ('$S5');
insert into public.jobs values ('$J5','running','$WORKER',1, jsonb_build_object('project_id','$P5'));
insert into public.edit_projects (id, owner_id, generation_id, source_asset_id, status)
  values ('$P5','$O_ID','$G_ID','$S5','compiling');
SQL
ok "select public.editor_record_edit_plan('$P5','$J5','$WORKER',1,'$SHA_EV','$SHA_P','boot','snap','srcsum','edit-plan-v1','edit-policy-v1','edit-compiler-1','$PLAN_JSON'::jsonb,60000)" \
   "the fifth project records its plan"
run "update public.edit_projects set status='rendering' where id='$P5'"
ok "select public.editor_reserve_output('$P5','$J5','$WORKER',1,'video','edits')" \
   "and reserves its video output"
ok "select public.editor_mark_output_ready('$P5','$J5','$WORKER',1,'video',2048,'$SHA_EV',60000)" \
   "and marks it ready"
run "update public.edit_projects set status='validating' where id='$P5'"

# An unrelated asset: right owner, wrong everything else.
psql -q -v ON_ERROR_STOP=1 -c "insert into public.media_assets (id, owner_id, kind, bucket, storage_path, content_sha256, status) values ('$OTHER','$O_ID','output','edits','edit-outputs/somewhere/else/output.mp4','$SHA_X','ready')" >/dev/null
no "select public.editor_complete_output('$P5','$J5','$WORKER',1,'$OTHER')" \
   "completing onto an asset whose STORAGE PATH is not the rendered output"
no "select public.editor_complete_output('$P5','$J5','$WORKER',1,'$S5')" \
   "completing onto the SOURCE asset"

# Right path, wrong owner — an asset moved onto the path is still not the row.
psql -q -v ON_ERROR_STOP=1 <<SQL >/dev/null
update public.media_assets set storage_path='edit-outputs/$O_ID/$P5/1/output.mp4', owner_id='$O2' where id='$OTHER';
SQL
no "select public.editor_complete_output('$P5','$J5','$WORKER',1,'$OTHER')" \
   "completing onto an asset at the right path but a DIFFERENT owner"
psql -q -v ON_ERROR_STOP=1 -c "update public.media_assets set owner_id='$O_ID', content_sha256='$SHA_O' where id='$OTHER'" >/dev/null
no "select public.editor_complete_output('$P5','$J5','$WORKER',1,'$OTHER')" \
   "completing onto an asset carrying a DIFFERENT digest than the validated output"
# CONTROL: the properly minted asset still completes, so the four refusals are
# about reconciliation and not about the project being uncompletable.
psql -q -v ON_ERROR_STOP=1 -c "update public.media_assets set storage_path='edit-outputs/other/discarded.mp4' where id='$OTHER'" >/dev/null
ok "select public.editor_create_output_asset('$P5','$J5','$WORKER',1,1080,1920,30,1,'video/mp4')" \
   "the derived asset is minted"
a5=$(psql -tAc "select id from public.media_assets where storage_path='edit-outputs/$O_ID/$P5/1/output.mp4'")
ok "select public.editor_complete_output('$P5','$J5','$WORKER',1,'$a5')" \
   "CONTROL: completion onto the DERIVED asset succeeds"

echo "== mark-ready is STAGE-FENCED =="
P6='11111111-2222-3333-4444-000000000006'
J6='22222222-3333-4444-5555-000000000006'
S6='33333333-4444-5555-6666-000000000006'
psql -q -v ON_ERROR_STOP=1 <<SQL >/dev/null
insert into public.media_assets (id) values ('$S6');
insert into public.jobs values ('$J6','running','$WORKER',1, jsonb_build_object('project_id','$P6'));
insert into public.edit_projects (id, owner_id, generation_id, source_asset_id, status)
  values ('$P6','$O_ID','$G_ID','$S6','compiling');
SQL
ok "select public.editor_record_edit_plan('$P6','$J6','$WORKER',1,'$SHA_AN','$SHA_P','boot','snap','srcsum','edit-plan-v1','edit-policy-v1','edit-compiler-1','$PLAN_JSON'::jsonb,60000)" \
   "the sixth project records its plan"
run "update public.edit_projects set status='rendering' where id='$P6'"
ok "select public.editor_reserve_output('$P6','$J6','$WORKER',1,'video','edits')" \
   "and reserves its output while rendering"
# The project moves on (cancelled) while the lease is still briefly valid.
run "update public.edit_projects set status='cancelled' where id='$P6'"
no "select public.editor_mark_output_ready('$P6','$J6','$WORKER',1,'video',2048,'$SHA_AN',60000)" \
   "marking an output READY after the project left the rendering stage"

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

echo "== MUTATION CONTROL: without the completion guard, an UNREADY output completes =="
# Restored with the trigger. 8.4 removed this control when it deferred the
# trigger, because a control that drops something never created would either
# error or "pass" by dropping nothing. The subject is P3: it reserved a video
# output that never became ready, so the guard refuses it (asserted above) and
# only removing the guard can let it through.
psql -q -v ON_ERROR_STOP=1 <<SQL >/dev/null
drop trigger trg_edit_projects_completion on public.edit_projects;
update public.edit_projects set status='validating', output_asset_id=null, completed_at=null where id='$P3';
SQL
if run "update public.edit_projects set status='completed' where id='$P3'"; then
  echo "  ok: with the completion guard removed the unready-output completion goes through"
else
  echo "GATE-F FAIL: completing with an unready output still failed after dropping the guard."
  echo "             The completion refusals are therefore not attributable to it."
  exit 1
fi

echo "GATE-F PASS"

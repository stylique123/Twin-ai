#!/usr/bin/env bash
# Gate-G — ephemeral-Postgres verification of the REVIEW GATE's SQL (0102).
#
# WHY THIS EXISTS AT ALL. Gates D, E and F each apply a named migration; 0102 was
# applied by NONE of them, so nothing in CI executed a line of it. A migration
# that no job runs is a migration whose first execution is against a real
# database — and 0102 does not add an isolated table, it REPLACES the stage
# guard every editor project transitions through and the reconciler that decides
# which projects are dead. Both are load-bearing for projects that have nothing
# to do with reviews.
#
# WHAT IT PROVES, in both directions:
#
#   1. the pause is REACHABLE and BOUNDED — `directing -> awaiting_review ->
#      compiling` is admitted, and awaiting_review releases into compiling and
#      nowhere else.
#   2. THE SKIP STILL WORKS. `directing -> compiling` must stay legal, because
#      that is the transition every project takes while the gate is off,
#      including every project already in flight when this deploys. This is the
#      assertion that would have caught the obvious implementation — putting
#      `awaiting_review` inside the pipeline array — which passes every test
#      about reviews and strands every project that is not having one.
#   3. `editor_submit_review` does its three effects TOGETHER or not at all, is
#      idempotent on a repeat of the SAME overlay, and refuses a DIFFERENT one.
#   4. the overlay is immutable once written.
#   5. the reconciler SKIPS a parked project and still fails a genuinely lost
#      one — the negative half matters more than the positive here, because a
#      reconciler that skips everything also passes assertion 5's first half.
#
# EVERY POSITIVE IS PAIRED WITH ITS NEGATIVE, and the guards carry mutation
# controls: with the trigger dropped, the transition that must fail starts
# succeeding. A green assertion on its own proves only that the statement ran.
set -euo pipefail
export LC_ALL=C LANG=C PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIG="$REPO/supabase/migrations/0102_editor_review_gate.sql"
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

O_ID='22222222-2222-2222-2222-222222222222'   # owner
O2_ID='2222222a-2222-2222-2222-222222222222'  # a DIFFERENT owner
G_ID='44444444-4444-4444-4444-444444444444'   # generation
S_ID='55555555-5555-5555-5555-555555555555'   # source asset
P_ID='11111111-1111-1111-1111-111111111111'   # the project under review

# Stand-ins for what 0102 references but does not create. `auth.uid()` is a
# SETTABLE stand-in rather than a constant, because half of this gate is about
# WHO is calling: `editor_submit_review` is the first editor RPC an ordinary
# authenticated user invokes directly, and a stand-in that always returns the
# owner cannot tell an ownership check from its absence.
bootstrap(){
  psql -q -v ON_ERROR_STOP=1 <<SQL
drop schema if exists auth cascade;
drop table if exists public.edit_review_overlays cascade;
drop table if exists public.edit_events cascade;
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
create function auth.uid() returns uuid language sql stable as
  \$\$ select nullif(current_setting('gate.uid', true), '')::uuid \$\$;
insert into auth.users values ('$O_ID'), ('$O2_ID');
create table public.generations (id uuid primary key);
insert into public.generations values ('$G_ID');
create table public.media_assets (id uuid primary key);
insert into public.media_assets values ('$S_ID');

-- 0078's jobs shape, with the columns 0102's reconciler and enqueue touch.
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  type text not null,
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  dedup_key text unique,
  error text,
  result jsonb,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());

-- 0078's edit_projects, with every column 0102 reads or writes. A stand-in
-- missing one of them is a different database — the flaw gate-F names.
create table public.edit_projects (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid not null references public.generations(id) on delete cascade,
  source_asset_id uuid not null references public.media_assets(id),
  status text not null default 'queued',
  failure_code text,
  failure_details jsonb,
  cancel_requested_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz);
-- SEEDED, and the seed is checked below. A zero-row UPDATE fires no FOR EACH
-- ROW trigger, so an empty table makes every transition assertion pass
-- vacuously — including the pre-state one that exists to attribute the pause
-- to 0102. It caught its own absence the first time this gate ran.
insert into public.edit_projects (id, owner_id, generation_id, source_asset_id, status)
  values ('$P_ID', '$O_ID', '$G_ID', '$S_ID', 'directing');
create table public.edit_events (
  id bigserial primary key,
  project_id uuid not null references public.edit_projects(id) on delete cascade,
  stage text,
  pct integer,
  message_code text,
  details jsonb,
  created_at timestamptz not null default now());

-- 0080's TRIGGER. 0102 replaces the guard FUNCTION and leaves the trigger in
-- place, so a gate that omitted the trigger would test a function nothing
-- calls and report every illegal transition as accepted.
create trigger trg_edit_projects_stage
  before update of status on public.edit_projects
  for each row execute function public.edit_projects_guard_stage();
SQL
}

# The guard function must exist before the trigger references it, so 0080's
# definition is applied first — VERBATIM from the migration, not paraphrased,
# because assertion 2 is precisely that 0102 does not narrow it.
psql -q -v ON_ERROR_STOP=1 <<'SQL'
create or replace function public.edit_projects_guard_stage()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  pipeline constant text[] := array['queued','inspecting','transcribing','analyzing',
    'directing','compiling','rendering','validating','completed'];
  o integer; n integer;
begin
  if new.status = old.status then return new; end if;
  if old.status in ('completed','failed','cancelled') then
    raise exception 'edit_projects: % is terminal — status is immutable', old.status;
  end if;
  if new.status in ('failed','cancelled') then return new; end if;
  o := array_position(pipeline, old.status);
  n := array_position(pipeline, new.status);
  if n is null or o is null or n <> o + 1 then
    raise exception 'edit_projects: illegal stage transition % -> %', old.status, new.status;
  end if;
  return new;
end; $$;
SQL

bootstrap

SEEDED="$(psql -tAc "select count(*) from public.edit_projects where id='$P_ID'" | tr -d '[:space:]')"
if [ "$SEEDED" != "1" ]; then
  echo "GATE-G FAIL: the project row is missing, so every UPDATE below touches zero rows and fires no trigger"
  exit 1
fi

# THE PRE-STATE ASSERTION. Before 0102, parking must be IMPOSSIBLE — otherwise
# every "the pause works" assertion below could be satisfied by a guard that
# admits anything, and the gate would prove nothing about the migration.
if psql -q -v ON_ERROR_STOP=1 \
    -c "update public.edit_projects set status='awaiting_review' where id='$P_ID'" >/dev/null 2>&1; then
  echo "GATE-G FAIL: the pre-0102 guard already admits awaiting_review — the gate cannot attribute anything to the migration"
  exit 1
fi
echo "  pre-state: the 0080 guard refuses awaiting_review (so 0102 is what admits it)"

psql -q -v ON_ERROR_STOP=1 -f "$MIG"
echo "0102 applied"

run(){ psql -q -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1; }
ok(){ if run "$1"; then echo "  ok: $2"; else echo "GATE-G FAIL: legitimate statement REJECTED ($2)"; psql -c "$1" 2>&1 | tail -3; exit 1; fi; }
no(){ if run "$1"; then echo "GATE-G FAIL: forbidden statement ACCEPTED ($2)"; exit 1; else echo "  rejected: $2"; fi; }
eq(){ local got; got="$(psql -tAc "$1" | tr -d '[:space:]')"; if [ "$got" != "$2" ]; then
  echo "GATE-G FAIL: $3 — expected '$2', got '$got'"; exit 1; else echo "  ok: $3"; fi; }
setstatus(){ psql -q -c "update public.edit_projects set status='$1' where id='$P_ID'" >/dev/null 2>&1 || true; }
# The guard forbids arbitrary jumps, so a test that needs a project in some
# state gets there by rewriting the row with the trigger disabled — the SETUP
# must never be the thing under test.
force(){ psql -q -v ON_ERROR_STOP=1 -c "
  alter table public.edit_projects disable trigger trg_edit_projects_stage;
  update public.edit_projects set status='$1', cancel_requested_at=${2:-null} where id='$P_ID';
  alter table public.edit_projects enable trigger trg_edit_projects_stage;" >/dev/null
}
as_user(){ psql -q -v ON_ERROR_STOP=1 -c "select set_config('gate.uid', '$1', false); $2" >/dev/null 2>&1; }

echo "== 1. the pause is reachable and bounded"
force directing
ok "update public.edit_projects set status='awaiting_review' where id='$P_ID'" \
   "directing -> awaiting_review"
ok "update public.edit_projects set status='compiling' where id='$P_ID'" \
   "awaiting_review -> compiling"
force awaiting_review
no "update public.edit_projects set status='rendering' where id='$P_ID'" \
   "awaiting_review -> rendering (it releases into compiling and nowhere else)"
no "update public.edit_projects set status='directing' where id='$P_ID'" \
   "awaiting_review -> directing (no going back)"
ok "update public.edit_projects set status='cancelled' where id='$P_ID'" \
   "awaiting_review -> cancelled (an abandoned review must have an exit)"

echo "== 2. THE SKIP STILL WORKS — the assertion that catches the obvious implementation"
force directing
ok "update public.edit_projects set status='compiling' where id='$P_ID'" \
   "directing -> compiling with NO review (every project while the gate is off)"
force analyzing
ok "update public.edit_projects set status='directing' where id='$P_ID'" \
   "analyzing -> directing (the ordinary walk is untouched)"
no "update public.edit_projects set status='validating' where id='$P_ID'" \
   "directing -> validating (the +1 rule still holds)"

echo "== 3. MUTATION CONTROL on the guard"
# `force` toggles the trigger itself, so it must run BEFORE the disable — the
# first version disabled, then called force, which re-enabled it, and the
# control failed by proving the guard was still on. The setup must never be the
# thing under test.
force directing
psql -q -c "alter table public.edit_projects disable trigger trg_edit_projects_stage" >/dev/null
ok "update public.edit_projects set status='validating' where id='$P_ID'" \
   "with the trigger OFF the illegal jump succeeds — the refusals above are the guard"
psql -q -c "alter table public.edit_projects enable trigger trg_edit_projects_stage" >/dev/null

echo "== 4. editor_submit_review — three effects together, or none"
force awaiting_review
OVERLAY='{"schemaVersion":1,"removeWordRanges":[{"startWordIndex":5,"endWordIndex":9}],"keepSelections":[],"respellWords":[],"dropZoomAnchors":[]}'
OTHER='{"schemaVersion":1,"removeWordRanges":[],"keepSelections":[1],"respellWords":[],"dropZoomAnchors":[]}'

# A DIFFERENT owner must not be able to submit, and must not learn the project
# exists. Checked BEFORE the happy path, so a pass cannot be an artefact of the
# row already having been consumed.
if as_user "$O2_ID" "select public.editor_submit_review('$P_ID', '$OVERLAY'::jsonb, 40)"; then
  echo "GATE-G FAIL: a different owner submitted a review"; exit 1
fi
echo "  rejected: a different owner cannot submit"
eq "select count(*) from public.edit_review_overlays" "0" "the refusal wrote nothing"
eq "select status from public.edit_projects where id='$P_ID'" "awaiting_review" "the refusal moved nothing"

if ! as_user "$O_ID" "select public.editor_submit_review('$P_ID', '$OVERLAY'::jsonb, 40)"; then
  echo "GATE-G FAIL: the owner's own submit was refused"
  psql -c "select set_config('gate.uid','$O_ID',false); select public.editor_submit_review('$P_ID', '$OVERLAY'::jsonb, 40)" 2>&1 | tail -3
  exit 1
fi
echo "  ok: the owner submits"
eq "select count(*) from public.edit_review_overlays where edit_project_id='$P_ID'" "1" "the overlay is stored"
eq "select status from public.edit_projects where id='$P_ID'" "compiling" "the project is released into compiling"
eq "select count(*) from public.jobs where dedup_key='editor_v2:$P_ID:2'" "1" "the resume job is queued"
eq "select count(*) from public.edit_events where project_id='$P_ID' and message_code='review_submitted'" "1" \
   "the submission is on the durable trail"

echo "== 5. idempotent on the SAME overlay, refusing a DIFFERENT one"
# The project has already left awaiting_review, which is exactly the state a
# double-click lands in: the second call must converge, not raise wrong_stage.
if ! as_user "$O_ID" "select public.editor_submit_review('$P_ID', '$OVERLAY'::jsonb, 40)"; then
  echo "GATE-G FAIL: resubmitting the SAME overlay was refused (a double-click must converge)"; exit 1
fi
echo "  ok: the same overlay resubmits idempotently"
eq "select count(*) from public.edit_review_overlays where edit_project_id='$P_ID'" "1" "and writes no second row"
if as_user "$O_ID" "select public.editor_submit_review('$P_ID', '$OTHER'::jsonb, 40)"; then
  echo "GATE-G FAIL: a DIFFERENT overlay was accepted for a project already reviewed"; exit 1
fi
echo "  rejected: a different overlay (a second review is a versioned re-edit, which does not exist)"

echo "== 6. the overlay is immutable once written"
no "update public.edit_review_overlays set overlay='$OTHER'::jsonb where edit_project_id='$P_ID'" \
   "UPDATE on a stored overlay (the plan cites its digest)"
eq "select overlay->'removeWordRanges'->0->>'startWordIndex' from public.edit_review_overlays where edit_project_id='$P_ID'" \
   "5" "and the stored bytes are unchanged"
psql -q -c "drop trigger trg_edit_review_overlays_immutable on public.edit_review_overlays" >/dev/null
ok "update public.edit_review_overlays set spoken_word_count=41 where edit_project_id='$P_ID'" \
   "MUTATION CONTROL: with the trigger dropped the UPDATE succeeds"
psql -q -c "create trigger trg_edit_review_overlays_immutable before update on public.edit_review_overlays
            for each row execute function public.edit_review_overlays_immutable()" >/dev/null

echo "== 7. wrong stage, cancellation, and a live job all refuse"
psql -q -v ON_ERROR_STOP=1 -c "delete from public.edit_review_overlays; delete from public.jobs" >/dev/null
force rendering
if as_user "$O_ID" "select public.editor_submit_review('$P_ID', '$OVERLAY'::jsonb, 40)"; then
  echo "GATE-G FAIL: a review was accepted for a project that is already rendering"; exit 1
fi
echo "  rejected: wrong stage"
eq "select count(*) from public.edit_review_overlays" "0" "and wrote nothing"

force awaiting_review "now()"
if as_user "$O_ID" "select public.editor_submit_review('$P_ID', '$OVERLAY'::jsonb, 40)"; then
  echo "GATE-G FAIL: a review was accepted for a project being cancelled"; exit 1
fi
echo "  rejected: the project is being cancelled"

force awaiting_review
psql -q -v ON_ERROR_STOP=1 -c "insert into public.jobs (owner_id, type, status, payload, dedup_key)
  values ('$O_ID','editor_v2','running', jsonb_build_object('project_id','$P_ID'), 'editor_v2:$P_ID:1')" >/dev/null
# NO SECOND DRIVER. `editor_assert_lease` fences a job against its OWN lease, so
# two live jobs would both pass it and drive one project.
if as_user "$O_ID" "select public.editor_submit_review('$P_ID', '$OVERLAY'::jsonb, 40)"; then
  echo "GATE-G FAIL: a resume job was queued while another editor_v2 job was still live"; exit 1
fi
echo "  rejected: a live editor_v2 job is still running"
eq "select count(*) from public.jobs where dedup_key='editor_v2:$P_ID:2'" "0" "and queued no second driver"

echo "== 8. the reconciler skips a parked project and still fails a lost one"
psql -q -v ON_ERROR_STOP=1 -c "delete from public.jobs; delete from public.edit_review_overlays;
  update public.edit_projects set created_at = now() - interval '2 hours' where id='$P_ID'" >/dev/null
force awaiting_review
eq "select (public.editor_reconcile_lost_projects(600))->>'awaiting_review'" "1" \
   "the parked project is counted as waiting"
eq "select status from public.edit_projects where id='$P_ID'" "awaiting_review" \
   "and left exactly where it was"
eq "select (public.editor_reconcile_lost_projects(600))->>'failed'" "0" "and failed nothing"

# THE NEGATIVE HALF, which matters more: a reconciler that skipped everything
# would pass all three assertions above.
force compiling
eq "select (public.editor_reconcile_lost_projects(600))->>'failed'" "1" \
   "a genuinely lost project (compiling, no job) IS still failed"
eq "select failure_code from public.edit_projects where id='$P_ID'" "lost_job" "with the right code"

echo "== 9. the resume job is VISIBLE to the sweep — it is not keyed :1"
psql -q -v ON_ERROR_STOP=1 -c "delete from public.edit_events; delete from public.jobs" >/dev/null
force compiling
psql -q -v ON_ERROR_STOP=1 -c "insert into public.jobs (owner_id, type, status, payload, dedup_key)
  values ('$O_ID','editor_v2','running', jsonb_build_object('project_id','$P_ID'), 'editor_v2:$P_ID:2')" >/dev/null
eq "select (public.editor_reconcile_lost_projects(600))->>'failed'" "0" \
   "a project resumed under a :2 job is HEALTHY, not lost"
eq "select status from public.edit_projects where id='$P_ID'" "compiling" \
   "and was not failed while its worker was running"

echo
echo "GATE-G PASS — 0102's review gate SQL executed and verified (positives, negatives, 2 mutation controls)"

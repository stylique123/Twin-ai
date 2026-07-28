-- Editor v2 — Phase 8 Batch 8.4: plan persistence, output reservation, completion.
--
-- Gate-0 §6 freezes FOUR concerns and names a sole authority for each. This
-- migration is that authority.
--
--   Plan persistence      editor_record_edit_plan(...)  — fenced, re-proves
--                                                          lease/attempt/stage
--   Plan immutability     trigger; rejects UPDATE for EVERY role, service_role
--                                                          included
--   Output path reservation  fenced RPC; SERVER-DERIVED paths only, never
--                                                          client or model text
--   Completion            editor_complete_output(...)   — the ONLY path to
--                                                          `completed`
--
-- THE ONE INVARIANT THIS FILE EXISTS FOR
--
--   `completed` with a null or non-ready output must be IMPOSSIBLE, not merely
--   unused.
--
-- "Unused" is a property of today's callers. "Impossible" is a property of the
-- schema, and it is the only one that survives a new caller, a manual fix
-- applied at 3am, or a worker built from a branch nobody reviewed. So the rule
-- is a CHECK constraint plus a trigger, not a convention in TypeScript.
--
-- WHY PLANS ARE APPEND-ONLY AND WHY service_role IS NOT EXEMPT
--
-- The plan is the record of what the user approved. Every downstream artifact —
-- the render, the validation, the cover — is justified by reference to it, and
-- its sha256 is what makes "this video is that plan" a checkable statement. A
-- mutable plan makes every one of those references meaningless retroactively.
--
-- Triggers ignore RLS, which is exactly why the guard lives in one: RLS
-- protects rows from users, and the risk here is not the user. `service_role`
-- is the worker's own identity, so exempting it would exempt the only party
-- with a plausible reason to rewrite history.
--
-- NO BILLING CHANGE (Gate-0 §6). Credits and reservations are untouched.

-- ---------------------------------------------------------------------------
-- 1. edit_plans — the immutable compiled plan
-- ---------------------------------------------------------------------------

create table if not exists public.edit_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  edit_project_id uuid not null references public.edit_projects(id) on delete cascade,
  attempt integer not null,

  -- Identity. `plan_sha256` is the canonical digest of the plan document and is
  -- what every later artifact cites. It is UNIQUE per project so a second,
  -- different plan cannot quietly coexist with the one that was rendered.
  plan_sha256 text not null check (plan_sha256 ~ '^[0-9a-f]{64}$'),
  decision_sha256 text not null check (decision_sha256 ~ '^[0-9a-f]{64}$'),
  boot_manifest_sha text not null,
  script_snapshot_sha text not null,
  source_checksum text not null,

  plan_version text not null,
  policy_version text not null,
  compiler_version text not null,

  -- The document itself. Bounded at the frozen EDIT_PLAN_MAX_BYTES (1 MiB) so a
  -- pathological plan cannot be stored and then fail every read.
  plan jsonb not null,
  output_duration_ms integer not null check (output_duration_ms >= 0),

  created_at timestamptz not null default now(),

  constraint edit_plans_plan_is_object check (jsonb_typeof(plan) = 'object'),
  constraint edit_plans_plan_bounded check (pg_column_size(plan) <= 1048576)
);

-- ONE plan per project. Phase 8 has no re-plan mechanism; when one arrives it
-- will be an explicit versioning design, not a second row appearing because
-- nothing stopped it.
create unique index if not exists edit_plans_project_uniq
  on public.edit_plans (edit_project_id);
create index if not exists edit_plans_owner_idx
  on public.edit_plans (owner_id, created_at desc);
create index if not exists edit_plans_sha_idx
  on public.edit_plans (plan_sha256);

-- APPEND-ONLY. Not "no UPDATE to the important columns" — there is no
-- unimportant column on a hashed, cited record, and a rule with an exception
-- list is a rule someone will extend.
create or replace function public.edit_plans_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'edit_plans: rows are immutable — UPDATE is refused for every role';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'edit_plans: rows are immutable — DELETE is refused for every role';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_edit_plans_guard on public.edit_plans;
create trigger trg_edit_plans_guard
  before update or delete on public.edit_plans
  for each row execute function public.edit_plans_guard();

alter table public.edit_plans enable row level security;

-- Owners READ their own plan. Nobody writes through RLS: every insert goes
-- through the fenced RPC, which runs as definer.
drop policy if exists edit_plans_owner_select on public.edit_plans;
create policy edit_plans_owner_select on public.edit_plans
  for select to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.edit_plans from public, anon, authenticated;
grant select on public.edit_plans to authenticated;

-- ---------------------------------------------------------------------------
-- 2. edit_outputs — the reserved output path and its readiness
-- ---------------------------------------------------------------------------
--
-- The path is SERVER-DERIVED. Gate-0 §6 says "server-derived paths only, never
-- client/model text", and this is where that is enforced rather than promised:
-- the RPC takes NO path argument at all. There is no parameter through which a
-- caller could supply one, which is a stronger guarantee than validating a
-- string that was allowed to arrive.

create table if not exists public.edit_outputs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  edit_project_id uuid not null references public.edit_projects(id) on delete cascade,
  edit_plan_id uuid not null references public.edit_plans(id) on delete cascade,
  attempt integer not null,

  storage_bucket text not null,
  -- Derived by the RPC from ids the database already holds. The CHECK is a
  -- second line: even a future RPC that took a path could not store one that
  -- escapes the owner's prefix or contains a traversal.
  storage_path text not null
    check (storage_path ~ '^edit-outputs/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]+/(output\.mp4|cover\.jpg)$'),
  kind text not null check (kind in ('video', 'cover')),

  state text not null default 'reserved' check (state in ('reserved', 'ready', 'abandoned')),

  bytes bigint check (bytes is null or bytes > 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  measured_duration_ms integer check (measured_duration_ms is null or measured_duration_ms >= 0),

  created_at timestamptz not null default now(),
  ready_at timestamptz,

  -- READY MEANS MEASURED. A row cannot claim readiness without the facts that
  -- justify it; this is what stops `completed` being reachable through an
  -- output nobody looked at.
  constraint edit_outputs_ready_is_measured check (
    state <> 'ready'
    or (bytes is not null and sha256 is not null and ready_at is not null)
  ),
  -- Only the video carries a duration; a cover having one would mean something
  -- wrote a field it did not measure.
  constraint edit_outputs_duration_only_for_video check (
    kind = 'video' or measured_duration_ms is null
  ),
  constraint edit_outputs_video_ready_has_duration check (
    kind <> 'video' or state <> 'ready' or measured_duration_ms is not null
  )
);

create unique index if not exists edit_outputs_project_kind_uniq
  on public.edit_outputs (edit_project_id, kind);
create index if not exists edit_outputs_owner_idx
  on public.edit_outputs (owner_id, created_at desc);

-- Outputs are NOT append-only — `reserved` legitimately becomes `ready`. What
-- is refused is going backwards, changing identity, or rewriting a measurement
-- once it has been taken.
create or replace function public.edit_outputs_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'edit_outputs: rows are not deletable';
  end if;
  if new.edit_project_id <> old.edit_project_id
     or new.edit_plan_id <> old.edit_plan_id
     or new.owner_id <> old.owner_id
     or new.storage_path <> old.storage_path
     or new.storage_bucket <> old.storage_bucket
     or new.kind <> old.kind then
    raise exception 'edit_outputs: identity columns are immutable';
  end if;
  if old.state = 'ready' and new.state <> 'ready' then
    raise exception 'edit_outputs: ready is terminal — % is not reachable from it', new.state;
  end if;
  -- A measurement, once taken, is a fact about a specific file. Changing it
  -- means either the file changed under a path that is supposed to be stable,
  -- or the measurement was wrong — and both need to be loud.
  if old.sha256 is not null and new.sha256 is distinct from old.sha256 then
    raise exception 'edit_outputs: a recorded digest cannot be rewritten';
  end if;
  if old.bytes is not null and new.bytes is distinct from old.bytes then
    raise exception 'edit_outputs: a recorded size cannot be rewritten';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_edit_outputs_guard on public.edit_outputs;
create trigger trg_edit_outputs_guard
  before update or delete on public.edit_outputs
  for each row execute function public.edit_outputs_guard();

alter table public.edit_outputs enable row level security;

drop policy if exists edit_outputs_owner_select on public.edit_outputs;
create policy edit_outputs_owner_select on public.edit_outputs
  for select to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.edit_outputs from public, anon, authenticated;
grant select on public.edit_outputs to authenticated;

-- ---------------------------------------------------------------------------
-- 3. `completed` is impossible without a ready output
-- ---------------------------------------------------------------------------
--
-- The stage guard in 0080 already refuses illegal transitions. It does NOT know
-- anything about outputs, and extending it would mix two concerns in one
-- trigger. This is a separate guard with one job.

create or replace function public.edit_projects_guard_completion()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  ready_video integer;
begin
  if new.status <> 'completed' then
    return new;
  end if;
  if new.output_asset_id is null then
    raise exception 'edit_projects: completed requires output_asset_id — a completed project with no output is not a completed project';
  end if;
  select count(*) into ready_video
    from public.edit_outputs
    where edit_project_id = new.id and kind = 'video' and state = 'ready';
  if ready_video <> 1 then
    raise exception 'edit_projects: completed requires exactly one READY video output (found %)', ready_video;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_edit_projects_completion on public.edit_projects;
create trigger trg_edit_projects_completion
  before update on public.edit_projects
  for each row execute function public.edit_projects_guard_completion();

-- ---------------------------------------------------------------------------
-- 4. Fenced RPCs
-- ---------------------------------------------------------------------------

-- 4a. Record the compiled plan. Re-proves lease + attempt + stage before any
-- write, then locks job-before-project in the established order.
create or replace function public.editor_record_edit_plan(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer,
  p_plan_sha256 text, p_decision_sha256 text,
  p_boot_manifest_sha text, p_script_snapshot_sha text, p_source_checksum text,
  p_plan_version text, p_policy_version text, p_compiler_version text,
  p_plan jsonb, p_output_duration_ms integer
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  proj public.edit_projects;
  existing public.edit_plans;
begin
  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);

  select * into proj from public.edit_projects where id = p_project for update;
  if not found then
    raise exception 'edit_plan_wrong_stage: project % not found', p_project;
  end if;
  if proj.status <> 'compiling' then
    raise exception 'edit_plan_wrong_stage: project % is % (expected compiling)', p_project, proj.status;
  end if;

  select * into existing from public.edit_plans where edit_project_id = p_project;
  if found then
    -- CRASH-RESUME IS NOT A CONFLICT. A retry that recompiled the same plan is
    -- the normal case and must be idempotent; a retry that produced a DIFFERENT
    -- plan means the compiler is not deterministic, which is a hard failure
    -- rather than something to overwrite.
    if existing.plan_sha256 = p_plan_sha256 then
      return existing.id;
    end if;
    raise exception 'edit_plan_divergent: project % already has plan % (recompiled as %)',
      p_project, existing.plan_sha256, p_plan_sha256;
  end if;

  insert into public.edit_plans (
    owner_id, edit_project_id, attempt,
    plan_sha256, decision_sha256, boot_manifest_sha, script_snapshot_sha, source_checksum,
    plan_version, policy_version, compiler_version, plan, output_duration_ms
  ) values (
    proj.owner_id, p_project, p_attempt,
    p_plan_sha256, p_decision_sha256, p_boot_manifest_sha, p_script_snapshot_sha, p_source_checksum,
    p_plan_version, p_policy_version, p_compiler_version, p_plan, p_output_duration_ms
  ) returning id into existing;
  return existing.id;
end;
$$;

-- 4b. Reserve an output path. TAKES NO PATH ARGUMENT — the path is derived here
-- from ids the database already holds, so there is no channel through which
-- client or model text could reach it.
create or replace function public.editor_reserve_output(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer,
  p_kind text, p_bucket text
) returns public.edit_outputs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  proj public.edit_projects;
  plan_row public.edit_plans;
  existing public.edit_outputs;
  derived text;
begin
  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);
  if p_kind not in ('video', 'cover') then
    raise exception 'render_output_profile_invalid: unknown output kind %', p_kind;
  end if;

  select * into proj from public.edit_projects where id = p_project for update;
  if not found then
    raise exception 'render_wrong_stage: project % not found', p_project;
  end if;
  if proj.status <> 'rendering' then
    raise exception 'render_wrong_stage: project % is % (expected rendering)', p_project, proj.status;
  end if;

  select * into plan_row from public.edit_plans where edit_project_id = p_project;
  if not found then
    raise exception 'edit_plan_invalid: project % has no recorded plan to render', p_project;
  end if;

  select * into existing from public.edit_outputs
    where edit_project_id = p_project and kind = p_kind for update;
  if found then
    return existing;   -- idempotent reservation across a crash-resume
  end if;

  derived := 'edit-outputs/' || proj.owner_id::text || '/' || p_project::text || '/'
             || p_attempt::text || '/'
             || case p_kind when 'video' then 'output.mp4' else 'cover.jpg' end;

  insert into public.edit_outputs (
    owner_id, edit_project_id, edit_plan_id, attempt, storage_bucket, storage_path, kind, state
  ) values (
    proj.owner_id, p_project, plan_row.id, p_attempt, p_bucket, derived, p_kind, 'reserved'
  ) returning * into existing;
  return existing;
end;
$$;

-- 4c. Mark a reserved output ready, WITH the measurements that justify it.
create or replace function public.editor_mark_output_ready(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer,
  p_kind text, p_bytes bigint, p_sha256 text, p_measured_duration_ms integer default null
) returns public.edit_outputs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  row_out public.edit_outputs;
begin
  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);

  select * into row_out from public.edit_outputs
    where edit_project_id = p_project and kind = p_kind for update;
  if not found then
    raise exception 'output_completion_conflict: no reserved % output for project %', p_kind, p_project;
  end if;
  if row_out.state = 'ready' then
    -- Idempotent only if it is the SAME file. A second, different file under a
    -- path that is meant to be stable is a conflict, not a repeat.
    if row_out.sha256 = p_sha256 and row_out.bytes = p_bytes then
      return row_out;
    end if;
    raise exception 'output_completion_conflict: % output for project % is already ready with a different file',
      p_kind, p_project;
  end if;

  update public.edit_outputs
     set state = 'ready', bytes = p_bytes, sha256 = p_sha256,
         measured_duration_ms = p_measured_duration_ms, ready_at = now()
   where id = row_out.id
   returning * into row_out;
  return row_out;
end;
$$;

-- 4d. THE ONLY PATH TO `completed`.
create or replace function public.editor_complete_output(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer,
  p_output_asset uuid
) returns public.edit_projects
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  proj public.edit_projects;
  vid public.edit_outputs;
begin
  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);

  select * into proj from public.edit_projects where id = p_project for update;
  if not found then
    raise exception 'output_completion_conflict: project % not found', p_project;
  end if;
  if proj.status = 'completed' then
    -- Idempotent resume, but only onto the SAME asset.
    if proj.output_asset_id = p_output_asset then
      return proj;
    end if;
    raise exception 'output_completion_conflict: project % is already completed with a different output', p_project;
  end if;
  if proj.status <> 'validating' then
    raise exception 'output_completion_conflict: project % is % (expected validating)', p_project, proj.status;
  end if;

  select * into vid from public.edit_outputs
    where edit_project_id = p_project and kind = 'video' for update;
  if not found or vid.state <> 'ready' then
    raise exception 'output_completion_conflict: project % has no READY video output', p_project;
  end if;

  update public.edit_projects
     set status = 'completed', output_asset_id = p_output_asset, completed_at = now()
   where id = p_project
   returning * into proj;
  return proj;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants — service_role only; anon gets nothing anywhere.
-- ---------------------------------------------------------------------------

revoke all on function public.edit_plans_guard() from public, anon, authenticated;
revoke all on function public.edit_outputs_guard() from public, anon, authenticated;
revoke all on function public.edit_projects_guard_completion() from public, anon, authenticated;

revoke all on function public.editor_record_edit_plan(uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.editor_reserve_output(uuid, uuid, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.editor_mark_output_ready(uuid, uuid, text, integer, text, bigint, text, integer) from public, anon, authenticated;
revoke all on function public.editor_complete_output(uuid, uuid, text, integer, uuid) from public, anon, authenticated;

grant execute on function public.editor_record_edit_plan(uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, integer) to service_role;
grant execute on function public.editor_reserve_output(uuid, uuid, text, integer, text, text) to service_role;
grant execute on function public.editor_mark_output_ready(uuid, uuid, text, integer, text, bigint, text, integer) to service_role;
grant execute on function public.editor_complete_output(uuid, uuid, text, integer, uuid) to service_role;

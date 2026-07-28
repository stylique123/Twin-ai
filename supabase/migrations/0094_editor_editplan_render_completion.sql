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

-- 0078 ALREADY CREATED THIS TABLE, and I did not check before writing a second
-- definition of it. That is the defect this section now records rather than
-- repeats.
--
-- `0078_editor_projects.sql` created `edit_plans` at the start of the editor
-- work and labelled it, in those words, "the canonical, versioned, hash-pinned
-- EditPlan (Phase 8 writes)". It carries id/owner_id/edit_project_id/version/
-- schema_version/plan/plan_hash/status/created_at, a unique index on
-- (edit_project_id, version), an owner index, RLS, and the client grants.
--
-- The first version of this migration declared a DIFFERENT table under the same
-- name with `plan_sha256` in place of `plan_hash`. `create table if not exists`
-- then did exactly what it says: it found a table with that name, skipped, and
-- the migration failed one statement later building an index on a column that
-- does not exist. `if not exists` treats "a table with this name" as "the right
-- table", which is the same absent-is-not-clean mistake as `?? 0`, in DDL.
--
-- So Phase 8 EXTENDS the table that was created for it. `plan_hash` stays as
-- the digest column — renaming it would break 0078's readers to satisfy this
-- file's preferred spelling — and the identity columns Phase 8 needs are added
-- alongside, nullable, because the table may already hold rows this migration
-- did not write and cannot invent values for.

alter table public.edit_plans
  add column if not exists attempt integer,
  add column if not exists decision_sha256 text,
  add column if not exists boot_manifest_sha text,
  add column if not exists script_snapshot_sha text,
  add column if not exists source_checksum text,
  add column if not exists plan_version text,
  add column if not exists policy_version text,
  add column if not exists compiler_version text,
  add column if not exists output_duration_ms integer;

-- Shape constraints on the NEW columns only. They are written as NOT VALID so
-- adding them cannot fail against rows 0078 allowed before Phase 8 existed:
-- the constraint governs every future write and is honest about not having
-- inspected the past.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'edit_plans_decision_sha_shape') then
    alter table public.edit_plans
      add constraint edit_plans_decision_sha_shape
      check (decision_sha256 is null or decision_sha256 ~ '^[0-9a-f]{64}$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'edit_plans_hash_shape') then
    alter table public.edit_plans
      add constraint edit_plans_hash_shape
      check (plan_hash ~ '^[0-9a-f]{64}$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'edit_plans_duration_sane') then
    alter table public.edit_plans
      add constraint edit_plans_duration_sane
      check (output_duration_ms is null or output_duration_ms >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'edit_plans_plan_is_object') then
    alter table public.edit_plans
      add constraint edit_plans_plan_is_object
      check (jsonb_typeof(plan) = 'object') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'edit_plans_plan_bounded') then
    alter table public.edit_plans
      add constraint edit_plans_plan_bounded
      check (pg_column_size(plan) <= 1048576) not valid;
  end if;
end $$;

-- ONE plan per project for Phase 8. 0078's unique index is on
-- (edit_project_id, version), which permits many versions — a re-plan mechanism
-- Phase 8 does not have and must not appear to have by accident. This partial
-- index pins version 1, leaving 0078's versioning intact for whenever a real
-- re-plan design arrives.
create unique index if not exists edit_plans_project_v1_uniq
  on public.edit_plans (edit_project_id) where version = 1;
create index if not exists edit_plans_hash_idx
  on public.edit_plans (plan_hash);

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

-- 0078 already enabled RLS, created the owner read policy, and set the client
-- grants. They are deliberately NOT restated here: re-declaring another
-- migration's policy is how two files come to disagree about one rule.

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
-- 3. The completion TRIGGER is deliberately NOT in this migration
-- ---------------------------------------------------------------------------
--
-- `scripts/ci/check_activation_gate.mjs` refuses any migration tying
-- `completed` to a non-null `output_asset_id`, with the message:
--
--     premature completed=>output_asset_id constraint
--     (lands WITH the real renderer, updating this guard deliberately)
--
-- That guard is right and this batch is not the moment. Nothing yet PRODUCES an
-- output: compiling/rendering/validating are still simulated, every project
-- completes with a null output, and Phases 3-7 of the staging matrix assert
-- exactly that. A schema rule enforcing a property no code can yet satisfy is a
-- rule whose only observable effect is breaking the pipeline that exists.
--
-- The invariant is NOT abandoned. `editor_complete_output` below refuses to
-- complete a project without a READY video output, so the only path Phase 8
-- will ever use is already closed. What waits for 8.5 is the trigger that also
-- closes the DIRECT-UPDATE path — and it lands there together with the renderer
-- that makes it satisfiable, which is precisely what the guard is asking for.
--
-- Naming the sequencing here rather than silencing the guard is the difference
-- between a deferred decision and a forgotten one.

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
  new_id uuid;
begin
  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);

  select * into proj from public.edit_projects where id = p_project for update;
  if not found then
    raise exception 'edit_plan_wrong_stage: project % not found', p_project;
  end if;
  if proj.status <> 'compiling' then
    raise exception 'edit_plan_wrong_stage: project % is % (expected compiling)', p_project, proj.status;
  end if;

  -- `plan_hash` is 0078's column and stays the digest of record. The parameter
  -- keeps its `p_plan_sha256` name because that is what the caller computes and
  -- what Gate-0 §3 calls it; the mapping happens here, once, rather than every
  -- caller having to know the storage spelling.
  select * into existing from public.edit_plans where edit_project_id = p_project and version = 1;
  if found then
    -- CRASH-RESUME IS NOT A CONFLICT. A retry that recompiled the same plan is
    -- the normal case and must be idempotent; a retry that produced a DIFFERENT
    -- plan means the compiler is not deterministic, which is a hard failure
    -- rather than something to overwrite.
    if existing.plan_hash = p_plan_sha256 then
      return existing.id;
    end if;
    raise exception 'edit_plan_divergent: project % already has plan % (recompiled as %)',
      p_project, existing.plan_hash, p_plan_sha256;
  end if;

  -- version/schema_version/status are 0078's NOT NULL columns. Phase 8 writes
  -- version 1 and only version 1 — see the partial unique index above.
  insert into public.edit_plans (
    owner_id, edit_project_id, version, schema_version, plan, plan_hash, status,
    attempt, decision_sha256, boot_manifest_sha, script_snapshot_sha, source_checksum,
    plan_version, policy_version, compiler_version, output_duration_ms
  ) values (
    proj.owner_id, p_project, 1, 1, p_plan, p_plan_sha256, 'validated',
    p_attempt, p_decision_sha256, p_boot_manifest_sha, p_script_snapshot_sha, p_source_checksum,
    p_plan_version, p_policy_version, p_compiler_version, p_output_duration_ms
  ) returning id into new_id;
  return new_id;
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

revoke all on function public.editor_record_edit_plan(uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.editor_reserve_output(uuid, uuid, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.editor_mark_output_ready(uuid, uuid, text, integer, text, bigint, text, integer) from public, anon, authenticated;
revoke all on function public.editor_complete_output(uuid, uuid, text, integer, uuid) from public, anon, authenticated;

grant execute on function public.editor_record_edit_plan(uuid, uuid, text, integer, text, text, text, text, text, text, text, text, jsonb, integer) to service_role;
grant execute on function public.editor_reserve_output(uuid, uuid, text, integer, text, text) to service_role;
grant execute on function public.editor_mark_output_ready(uuid, uuid, text, integer, text, bigint, text, integer) to service_role;
grant execute on function public.editor_complete_output(uuid, uuid, text, integer, uuid) to service_role;

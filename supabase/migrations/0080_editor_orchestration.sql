-- Editor v2 — Phase 3: worker orchestration primitives.
--
-- Everything the editor_v2 worker loop needs to drive edit_projects durably
-- and safely, enforced AT THE DATABASE (the 0078 lesson applied forward):
--
--   1. Stage-transition guard on edit_projects: the pipeline advances one
--      stage at a time, terminal states are immutable, failed/cancelled are
--      reachable from any active stage — for EVERY role, service_role included.
--   2. renew_job_lease(): a long-running handler extends its visibility lease;
--      a worker that lost the lease learns it (returns 0) instead of clobbering.
--   3. dead_letter_job(): permanent (non-retryable) errors settle immediately
--      instead of burning the remaining retry budget.
--   4. editor_advance_stage() / editor_finish_project() / editor_append_event():
--      FENCED, atomic project-state writes. Each call re-proves that the caller
--      still holds the RUNNING lease on the project's job before touching the
--      project or its event history — a reclaimed (stale) worker cannot advance
--      state, finish the project, or even append an event. Duplicate-worker
--      prevention lives here, not only in claim-time SKIP LOCKED.
--   5. cancel_requested_at + editor_request_cancel(): cancellation foundations.
--      The owner requests; a queued project settles immediately; a running one
--      is observed by the worker at the next stage boundary.
--   6. editor_reconcile_lost_projects(): the lost-job sweeper (pg_cron). An
--      active project whose job vanished / dead-lettered / settled without a
--      terminal project state is failed loudly (or re-enqueued when still
--      queued) — no project can hang forever in a non-terminal state.
--
-- Phase-3 boundary: NO stage does real work yet (simulated handlers in the
-- worker). No AI provider, media analysis, plan, render, output asset, or
-- credit charge is involved. Billing reservation is DESIGN-ONLY this phase
-- (docs/editor-v2-worker-orchestration.md).
--
-- Lock ordering (deadlock avoidance): every function that touches both rows
-- locks the JOB row first, then the PROJECT row.

-- ---------------------------------------------------------------------------
-- 1. Cancellation flag + stage-transition guard
-- ---------------------------------------------------------------------------
alter table public.edit_projects add column if not exists cancel_requested_at timestamptz;

create or replace function public.edit_projects_guard_stage()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  pipeline constant text[] := array['queued','inspecting','transcribing','analyzing',
    'directing','compiling','rendering','validating','completed'];
  o integer;
  n integer;
begin
  if new.status = old.status then
    return new;
  end if;
  if old.status in ('completed','failed','cancelled') then
    raise exception 'edit_projects: % is terminal — status is immutable', old.status;
  end if;
  -- failed/cancelled are reachable from any ACTIVE stage.
  if new.status in ('failed','cancelled') then
    return new;
  end if;
  o := array_position(pipeline, old.status);
  n := array_position(pipeline, new.status);
  if n is null or o is null or n <> o + 1 then
    raise exception 'edit_projects: illegal stage transition % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;

create trigger trg_edit_projects_stage
  before update of status on public.edit_projects
  for each row execute function public.edit_projects_guard_stage();
revoke all on function public.edit_projects_guard_stage() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Lease renewal (generic jobs-queue primitive, editor_v2's first consumer)
-- ---------------------------------------------------------------------------
create or replace function public.renew_job_lease(p_id uuid, p_worker text)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare n integer;
begin
  update public.jobs
     set locked_at = now(), updated_at = now()
   where id = p_id and status = 'running' and locked_by = p_worker;
  get diagnostics n = row_count;
  return n; -- 0 = the lease was lost (reclaimed/settled): the caller must STOP
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Immediate dead-letter for permanent (non-retryable) errors
-- ---------------------------------------------------------------------------
create or replace function public.dead_letter_job(p_id uuid, p_error text, p_worker text)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare n integer;
begin
  update public.jobs
     set status = 'failed', error = p_error,
         attempts = greatest(attempts, max_attempts),
         locked_at = null, locked_by = null, updated_at = now()
   where id = p_id and status = 'running' and locked_by = p_worker;
  get diagnostics n = row_count;
  return n; -- 0 = lease lost; the current owner decides the job's fate
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Fenced project-state writes
-- ---------------------------------------------------------------------------
-- Shared fence: prove the caller still holds the RUNNING lease on the
-- project's job, locking the job row (job before project, always).
create or replace function public.editor_assert_lease(p_project uuid, p_job uuid, p_worker text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform 1 from public.jobs
    where id = p_job
      and status = 'running'
      and locked_by = p_worker
      and payload->>'project_id' = p_project::text
    for update;
  if not found then
    raise exception 'lease_lost: worker % no longer holds the running lease for project %', p_worker, p_project;
  end if;
end;
$$;

create or replace function public.editor_advance_stage(
  p_project uuid, p_job uuid, p_worker text, p_to text,
  p_pct integer default null,
  p_message_code text default 'stage_started',
  p_details jsonb default '{}'::jsonb
) returns public.edit_projects
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  proj public.edit_projects;
begin
  perform public.editor_assert_lease(p_project, p_job, p_worker);

  select * into proj from public.edit_projects where id = p_project for update;
  if not found then
    raise exception 'editor_advance_stage: project % not found', p_project;
  end if;
  if proj.status in ('completed','failed','cancelled') then
    raise exception 'project_terminal: project % is already %', p_project, proj.status;
  end if;

  update public.edit_projects
     set status = p_to,
         started_at = coalesce(started_at, now())
   where id = p_project
   returning * into proj; -- trg_edit_projects_stage validates the transition

  insert into public.edit_events (project_id, stage, pct, message_code, details)
  values (p_project, p_to, p_pct, p_message_code, p_details);

  return proj; -- carries cancel_requested_at: the worker's cancellation signal
end;
$$;

create or replace function public.editor_finish_project(
  p_project uuid, p_job uuid, p_worker text, p_status text,
  p_failure_code text default null,
  p_details jsonb default '{}'::jsonb
) returns public.edit_projects
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  proj public.edit_projects;
begin
  if p_status not in ('completed','failed','cancelled') then
    raise exception 'editor_finish_project: % is not a terminal status', p_status;
  end if;

  perform public.editor_assert_lease(p_project, p_job, p_worker);

  select * into proj from public.edit_projects where id = p_project for update;
  if not found then
    raise exception 'editor_finish_project: project % not found', p_project;
  end if;
  if proj.status in ('completed','failed','cancelled') then
    raise exception 'project_terminal: project % is already %', p_project, proj.status;
  end if;

  update public.edit_projects
     set status = p_status,
         failure_code = p_failure_code,
         failure_details = case when p_status = 'failed' then p_details else failure_details end,
         started_at = coalesce(started_at, now()),
         completed_at = now()
   where id = p_project
   returning * into proj;

  insert into public.edit_events (project_id, stage, pct, message_code, details)
  values (p_project, p_status,
          case when p_status = 'completed' then 100 else null end,
          'project_' || p_status,
          p_details);

  return proj;
end;
$$;

-- Fenced history append WITHOUT a status change (resume markers, retry
-- scheduling, stage timeouts). Same lease proof as the transitions.
create or replace function public.editor_append_event(
  p_project uuid, p_job uuid, p_worker text,
  p_message_code text,
  p_pct integer default null,
  p_details jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  proj public.edit_projects;
begin
  perform public.editor_assert_lease(p_project, p_job, p_worker);
  select * into proj from public.edit_projects where id = p_project;
  if not found then
    raise exception 'editor_append_event: project % not found', p_project;
  end if;
  insert into public.edit_events (project_id, stage, pct, message_code, details)
  values (p_project, proj.status, p_pct, p_message_code, p_details);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Owner cancellation (the ONLY client-invokable function in this file)
-- ---------------------------------------------------------------------------
create or replace function public.editor_request_cancel(p_project uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  proj public.edit_projects;
  j public.jobs;
begin
  -- Ownership pre-check without locks (owner_id is immutable per 0078's guard,
  -- so an unlocked read cannot go stale). Foreign and missing projects get the
  -- SAME error: no existence observation for non-owners.
  perform 1 from public.edit_projects
    where id = p_project and owner_id = (select auth.uid());
  if not found then
    raise exception 'not_found';
  end if;

  -- Lock order: job first, then project (matches the worker-side functions).
  select * into j from public.jobs
   where dedup_key = 'editor_v2:' || p_project::text || ':1'
   for update;

  select * into proj from public.edit_projects where id = p_project for update;

  if proj.status in ('completed','failed','cancelled') then
    return proj.status; -- settled: cancellation is an idempotent no-op
  end if;

  if proj.cancel_requested_at is null then
    update public.edit_projects
       set cancel_requested_at = now()
     where id = p_project
     returning * into proj;
    insert into public.edit_events (project_id, stage, message_code)
    values (p_project, proj.status, 'cancel_requested');
  end if;

  -- Unclaimed queued work settles immediately: no worker will ever run it.
  -- (We hold the job row lock, so claim_job's SKIP LOCKED cannot grab it
  -- concurrently; after commit it is 'done' and no longer claimable.)
  if proj.status = 'queued' and (j.id is null or j.status = 'queued') then
    if j.id is not null then
      update public.jobs
         set status = 'done', result = jsonb_build_object('cancelled', true),
             locked_at = null, locked_by = null, updated_at = now()
       where id = j.id;
    end if;
    update public.edit_projects
       set status = 'cancelled', completed_at = now()
     where id = p_project;
    insert into public.edit_events (project_id, stage, message_code)
    values (p_project, 'cancelled', 'project_cancelled');
    return 'cancelled';
  end if;

  -- Claimed/running: the worker observes cancel_requested_at at the next
  -- stage boundary and finishes the project as cancelled.
  return 'cancel_requested';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Lost-job reconciliation (cron sweeper)
-- ---------------------------------------------------------------------------
create or replace function public.editor_reconcile_lost_projects(p_min_age_secs integer default 600)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r record;
  j public.jobs;
  proj public.edit_projects;
  examined integer := 0;
  requeued integer := 0;
  failed integer := 0;
begin
  for r in
    select p.id from public.edit_projects p
     where p.status not in ('completed','failed','cancelled')
       and p.created_at < now() - make_interval(secs => p_min_age_secs)
     order by p.created_at
  loop
    examined := examined + 1;
    -- Lock order: job first, then project.
    select * into j from public.jobs
     where dedup_key = 'editor_v2:' || r.id::text || ':1'
     for update;

    if j.id is not null and j.status in ('queued','running') then
      continue; -- healthy: work is pending or in flight
    end if;

    select * into proj from public.edit_projects where id = r.id for update;
    if proj.status in ('completed','failed','cancelled') then
      continue; -- settled while we were iterating
    end if;

    if j.id is null and proj.status = 'queued' then
      -- The job insert was lost but nothing ran: heal by re-enqueueing under
      -- the SAME dedup key (idempotent by construction).
      insert into public.jobs (owner_id, type, status, payload, dedup_key)
      values (
        proj.owner_id, 'editor_v2', 'queued',
        jsonb_build_object('project_id', proj.id, 'generation_id', proj.generation_id,
                           'source_asset_id', proj.source_asset_id),
        'editor_v2:' || proj.id::text || ':1'
      )
      on conflict (dedup_key) where dedup_key is not null do nothing;
      insert into public.edit_events (project_id, stage, message_code)
      values (proj.id, proj.status, 'job_reenqueued');
      requeued := requeued + 1;
    else
      -- Job vanished mid-flight, dead-lettered, or settled without the project
      -- reaching a terminal state: fail the project LOUDLY (never hang).
      update public.edit_projects
         set status = 'failed',
             failure_code = case
               when j.id is null then 'lost_job'
               when j.status = 'failed' then 'job_dead_lettered'
               else 'job_settled_without_project'
             end,
             failure_details = jsonb_strip_nulls(jsonb_build_object(
               'reconciled', true, 'job_id', j.id, 'job_status', j.status, 'job_error', j.error)),
             started_at = coalesce(started_at, now()),
             completed_at = now()
       where id = proj.id;
      insert into public.edit_events (project_id, stage, message_code, details)
      values (proj.id, 'failed', 'project_failed',
              jsonb_strip_nulls(jsonb_build_object('reconciled', true, 'job_status', j.status)));
      failed := failed + 1;
    end if;
  end loop;

  return jsonb_build_object('examined', examined, 'requeued', requeued, 'failed', failed);
end;
$$;

-- Sweep every 5 minutes where pg_cron exists (same pattern as 0062/0066).
do $outer$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'twinai-editor-reconcile';
    perform cron.schedule(
      'twinai-editor-reconcile',
      '*/5 * * * *',
      $cron$ select public.editor_reconcile_lost_projects(); $cron$
    );
  end if;
end
$outer$;

-- ---------------------------------------------------------------------------
-- Grants: explicit-only. Worker/cron primitives are service_role-execute-only;
-- editor_request_cancel is the single authenticated entry point.
-- ---------------------------------------------------------------------------
revoke all on function public.renew_job_lease(uuid, text)                                       from public, anon, authenticated;
revoke all on function public.dead_letter_job(uuid, text, text)                                 from public, anon, authenticated;
revoke all on function public.editor_assert_lease(uuid, uuid, text)                             from public, anon, authenticated;
revoke all on function public.editor_advance_stage(uuid, uuid, text, text, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.editor_finish_project(uuid, uuid, text, text, text, jsonb)        from public, anon, authenticated;
revoke all on function public.editor_append_event(uuid, uuid, text, text, integer, jsonb)       from public, anon, authenticated;
revoke all on function public.editor_reconcile_lost_projects(integer)                           from public, anon, authenticated;
revoke all on function public.editor_request_cancel(uuid)                                       from public, anon;

grant execute on function public.renew_job_lease(uuid, text)                                        to service_role;
grant execute on function public.dead_letter_job(uuid, text, text)                                  to service_role;
grant execute on function public.editor_advance_stage(uuid, uuid, text, text, integer, text, jsonb) to service_role;
grant execute on function public.editor_finish_project(uuid, uuid, text, text, text, jsonb)         to service_role;
grant execute on function public.editor_append_event(uuid, uuid, text, text, integer, jsonb)        to service_role;
grant execute on function public.editor_reconcile_lost_projects(integer)                            to service_role;
grant execute on function public.editor_request_cancel(uuid)                                        to authenticated, service_role;

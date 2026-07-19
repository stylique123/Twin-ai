-- Editor v2 — Phase 3 gate hardening (corrective, forward-only — 0080 is
-- applied to staging and immutable there, so these are drop/recreates).
--
-- 1. ATTEMPT-TOKEN FENCING. 0080 fenced on (job id, status='running',
--    locked_by). locked_by alone is not a fencing token: the SAME worker
--    identity can reclaim a job after its lease lapses (new attempt), and the
--    stale first run's writes would still match locked_by. `jobs.attempts` is
--    the immutable per-claim token — claim_job increments it and nothing ever
--    decrements it — so every fenced call now also proves attempts = the
--    value observed at claim time. A stale run always carries a lower
--    attempt and is rejected even against its own successor.
--    complete_job/fail_job gain the same optional token.
-- 2. CANCEL DURING RETRY DELAY. editor_request_cancel now settles immediately
--    whenever the job is UNCLAIMED (queued or missing) — including a job
--    parked in retry backoff — not only when the project is still 'queued'.
--    We hold the job row lock, so a concurrent claim cannot race the settle.
-- 3. RECONCILER RESPECTS CANCELLATION + TERMINAL-PROJECT STALE JOBS.
--    * a swept project with cancel_requested_at set settles as 'cancelled',
--      never re-enqueued and never mislabeled 'failed'
--    * requeue heals emit their event/counter ONLY when the insert actually
--      inserted (idempotent repeats, concurrent runs converge)
--    * NEW sweep: an editor_v2 job left queued/stale-running under an already
--      terminal project is closed (the worker would no-op it anyway; the
--      sweep guarantees convergence without a claim). Actively leased running
--      jobs are never touched (60s minimum staleness).

-- ---------------------------------------------------------------------------
-- 1a. Generic queue primitives: attempt-token fencing
-- ---------------------------------------------------------------------------
drop function if exists public.renew_job_lease(uuid, text);
create function public.renew_job_lease(p_id uuid, p_worker text, p_attempt integer)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare n integer;
begin
  update public.jobs
     set locked_at = now(), updated_at = now()
   where id = p_id and status = 'running' and locked_by = p_worker and attempts = p_attempt;
  get diagnostics n = row_count;
  return n; -- 0 = the lease was lost (reclaimed/settled): the caller must STOP
end;
$$;

drop function if exists public.dead_letter_job(uuid, text, text);
create function public.dead_letter_job(p_id uuid, p_error text, p_worker text, p_attempt integer)
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
   where id = p_id and status = 'running' and locked_by = p_worker and attempts = p_attempt;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- complete_job / fail_job (0022 signatures) gain the optional attempt token.
-- Named-argument RPC calls from older worker binaries (no p_attempt) still
-- resolve — the token defaults to null = unfenced-by-attempt, locked_by-only,
-- exactly the 0022 behavior.
drop function if exists public.complete_job(uuid, jsonb, text);
create function public.complete_job(p_id uuid, p_result jsonb, p_worker text default null, p_attempt integer default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare n integer;
begin
  update public.jobs
     set status = 'done', result = coalesce(p_result, '{}'::jsonb),
         locked_at = null, locked_by = null, error = null, updated_at = now()
   where id = p_id
     and (p_worker is null or locked_by = p_worker)
     and (p_attempt is null or attempts = p_attempt);
  get diagnostics n = row_count;
  return n; -- 0 = the caller no longer owns this job (reclaimed); don't clobber
end;
$$;

drop function if exists public.fail_job(uuid, text, integer, text);
create function public.fail_job(p_id uuid, p_error text, p_backoff_secs integer default 30, p_worker text default null, p_attempt integer default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare j public.jobs; n integer;
begin
  select * into j from public.jobs where id = p_id for update;
  if not found then return 0; end if;
  if p_worker is not null and j.locked_by is distinct from p_worker then
    return 0;
  end if;
  if p_attempt is not null and j.attempts is distinct from p_attempt then
    return 0;
  end if;

  if j.attempts >= j.max_attempts then
    update public.jobs
       set status = 'failed', error = p_error, locked_at = null, locked_by = null, updated_at = now()
     where id = p_id;
  else
    update public.jobs
       set status = 'queued', error = p_error, locked_at = null, locked_by = null,
           run_after = now() + make_interval(secs => p_backoff_secs * (j.attempts + 1)),
           updated_at = now()
     where id = p_id;
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1b. Editor fence: prove job + running lease + attempt token, atomically
-- ---------------------------------------------------------------------------
drop function if exists public.editor_assert_lease(uuid, uuid, text);
create function public.editor_assert_lease(p_project uuid, p_job uuid, p_worker text, p_attempt integer)
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
      and attempts = p_attempt
      and payload->>'project_id' = p_project::text
    for update;
  if not found then
    raise exception 'lease_lost: worker % (attempt %) no longer holds the running lease for project %', p_worker, p_attempt, p_project;
  end if;
end;
$$;

drop function if exists public.editor_advance_stage(uuid, uuid, text, text, integer, text, jsonb);
create function public.editor_advance_stage(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer, p_to text,
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
  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);

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

drop function if exists public.editor_finish_project(uuid, uuid, text, text, text, jsonb);
create function public.editor_finish_project(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer, p_status text,
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

  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);

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

drop function if exists public.editor_append_event(uuid, uuid, text, text, integer, jsonb);
create function public.editor_append_event(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer,
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
  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);
  select * into proj from public.edit_projects where id = p_project;
  if not found then
    raise exception 'editor_append_event: project % not found', p_project;
  end if;
  insert into public.edit_events (project_id, stage, pct, message_code, details)
  values (p_project, proj.status, p_pct, p_message_code, p_details);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Cancellation: settle whenever the job is unclaimed (incl. retry backoff)
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

  -- UNCLAIMED work (never started, or parked in retry backoff) settles
  -- immediately: no worker owns it, and we hold the job row lock so
  -- claim_job's SKIP LOCKED cannot grab it concurrently.
  if j.id is null or j.status = 'queued' then
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
-- 3. Reconciler: cancellation-aware, idempotent heals, terminal-job sweep
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
  n integer;
  examined integer := 0;
  requeued integer := 0;
  failed integer := 0;
  cancelled integer := 0;
  closed_stale integer := 0;
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
      continue; -- healthy: work is pending or in flight (reclaim handles
                -- expired running leases at the next claim)
    end if;

    select * into proj from public.edit_projects where id = r.id for update;
    if proj.status in ('completed','failed','cancelled') then
      continue; -- settled while we were iterating (or by a concurrent run)
    end if;

    if proj.cancel_requested_at is not null then
      -- The owner asked to cancel and the job is gone/settled: honor the
      -- cancellation — never re-enqueue, never mislabel as failure.
      update public.edit_projects
         set status = 'cancelled',
             started_at = coalesce(started_at, now()),
             completed_at = now()
       where id = proj.id;
      insert into public.edit_events (project_id, stage, message_code, details)
      values (proj.id, 'cancelled', 'project_cancelled', jsonb_build_object('reconciled', true));
      cancelled := cancelled + 1;
    elsif j.id is null and proj.status = 'queued' then
      insert into public.jobs (owner_id, type, status, payload, dedup_key)
      values (
        proj.owner_id, 'editor_v2', 'queued',
        jsonb_build_object('project_id', proj.id, 'generation_id', proj.generation_id,
                           'source_asset_id', proj.source_asset_id),
        'editor_v2:' || proj.id::text || ':1'
      )
      on conflict (dedup_key) where dedup_key is not null do nothing;
      get diagnostics n = row_count;
      if n > 0 then
        -- Event + counter only when THIS run actually healed it — repeated
        -- and concurrent reconciler runs stay idempotent.
        insert into public.edit_events (project_id, stage, message_code)
        values (proj.id, proj.status, 'job_reenqueued');
        requeued := requeued + 1;
      end if;
    else
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

  -- Converse sweep: a queued (or long-stale running) editor_v2 job under an
  -- already TERMINAL project. A worker claim would no-op it eventually; the
  -- sweep guarantees convergence without one. The 60s staleness floor means
  -- an actively leased running job is never touched.
  for r in
    select j2.id as job_id, p2.id as project_id, p2.status as pstatus
      from public.jobs j2
      join public.edit_projects p2 on j2.dedup_key = 'editor_v2:' || p2.id::text || ':1'
     where j2.type = 'editor_v2'
       and p2.status in ('completed','failed','cancelled')
       and (
         j2.status = 'queued'
         or (j2.status = 'running'
             and j2.locked_at < now() - make_interval(secs => greatest(p_min_age_secs, 60)))
       )
  loop
    update public.jobs
       set status = 'done',
           result = coalesce(result, '{}'::jsonb) || jsonb_build_object('reconciled', true, 'closed_reason', 'project_terminal'),
           locked_at = null, locked_by = null, updated_at = now()
     where id = r.job_id
       and (status = 'queued'
            or (status = 'running' and locked_at < now() - make_interval(secs => greatest(p_min_age_secs, 60))));
    get diagnostics n = row_count;
    if n > 0 then
      insert into public.edit_events (project_id, stage, message_code, details)
      values (r.project_id, r.pstatus, 'stale_job_closed', jsonb_build_object('reconciled', true));
      closed_stale := closed_stale + 1;
    end if;
  end loop;

  return jsonb_build_object('examined', examined, 'requeued', requeued, 'failed', failed,
                            'cancelled', cancelled, 'closed_stale_jobs', closed_stale);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants for the new signatures (drop removed the old grants with the fns).
-- ---------------------------------------------------------------------------
revoke all on function public.renew_job_lease(uuid, text, integer)                                        from public, anon, authenticated;
revoke all on function public.dead_letter_job(uuid, text, text, integer)                                  from public, anon, authenticated;
revoke all on function public.complete_job(uuid, jsonb, text, integer)                                    from public, anon, authenticated;
revoke all on function public.fail_job(uuid, text, integer, text, integer)                                from public, anon, authenticated;
revoke all on function public.editor_assert_lease(uuid, uuid, text, integer)                              from public, anon, authenticated;
revoke all on function public.editor_advance_stage(uuid, uuid, text, integer, text, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.editor_finish_project(uuid, uuid, text, integer, text, text, jsonb)         from public, anon, authenticated;
revoke all on function public.editor_append_event(uuid, uuid, text, integer, text, integer, jsonb)        from public, anon, authenticated;
revoke all on function public.editor_reconcile_lost_projects(integer)                                     from public, anon, authenticated;
revoke all on function public.editor_request_cancel(uuid)                                                 from public, anon;

grant execute on function public.renew_job_lease(uuid, text, integer)                                        to service_role;
grant execute on function public.dead_letter_job(uuid, text, text, integer)                                  to service_role;
grant execute on function public.complete_job(uuid, jsonb, text, integer)                                    to service_role;
grant execute on function public.fail_job(uuid, text, integer, text, integer)                                to service_role;
grant execute on function public.editor_advance_stage(uuid, uuid, text, integer, text, integer, text, jsonb) to service_role;
grant execute on function public.editor_finish_project(uuid, uuid, text, integer, text, text, jsonb)         to service_role;
grant execute on function public.editor_append_event(uuid, uuid, text, integer, text, integer, jsonb)        to service_role;
grant execute on function public.editor_reconcile_lost_projects(integer)                                     to service_role;
grant execute on function public.editor_request_cancel(uuid)                                                 to authenticated, service_role;

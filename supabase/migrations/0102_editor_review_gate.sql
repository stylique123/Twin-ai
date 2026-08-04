-- 0102 — THE REVIEW GATE: where the pipeline waits for the person.
--
-- Phase 10 item 4. The overlay's CONTRACT landed in worker/src/jobs/reviewOverlay.ts
-- and the COMPILER now consumes its span fields. This is the third piece: where
-- the overlay lives, and when the pipeline stops long enough for one to exist.
--
-- ── WHY A NEW RESTING STATE, AND NOT A NEW STAGE ──────────────────────────
--
-- Every other status on edit_projects names work a worker is doing. This one
-- names work a PERSON is doing, and the difference is load-bearing in three
-- places, each of which fails destructively if it is missed:
--
--   1. the lost-project reconciler fails any non-terminal project whose job is
--      gone. Here the job is gone ON PURPOSE — it finished, and the next one
--      does not exist until the creator submits. Left unhandled, every review
--      would be swept to `failed: lost_job` ten minutes after it started.
--   2. the worker's stage list is empty for it, and an empty stage list falls
--      through to `finishProject('completed')`. A duplicate claim would mark a
--      project complete that has not been compiled, rendered or validated.
--   3. the stage guard is a strict +1 walk down one array. Inserting the status
--      INTO that array would make `directing -> compiling` illegal — which is
--      the transition every project takes while the gate is off, including
--      every project already in flight when this deploys.
--
-- So the pipeline array is UNCHANGED and the two review transitions are added
-- beside it as explicit allowances. Turning the gate on or off can then never
-- strand a project mid-flight in either direction.
--
-- ── THE OVERLAY IS WRITTEN ONCE, BY THE RPC, AND NEVER AGAIN ──────────────
--
-- `edit_director_decisions` is append-only because a record of what the model
-- chose that can be rewritten afterwards is not evidence. The creator's edits
-- are held to the identical standard: the plan cites the overlay's digest in
-- `identity.reviewOverlaySha256`, so an overlay that could change after the
-- plan was recorded would make the plan's own identity a lie.
--
-- There is deliberately NO draft row. Editing happens in the browser; the
-- submit is the write. A draft table would need its own freeze rule, its own
-- "which draft did the plan use" question, and would answer neither better.
--
-- ── THE DIGEST IS NOT COMPUTED HERE, AND THAT IS ON PURPOSE ───────────────
--
-- `sha256(overlay::text)` in Postgres and `sha256Hex(canonicalJson(overlay))`
-- in the worker are DIFFERENT NUMBERS: jsonb orders keys by length-then-bytes,
-- canonicalJson orders them lexicographically. Storing a digest computed one
-- way beside a plan citing one computed the other would produce two digests for
-- one document and an integrity check that fails on correct data. The worker
-- validates the overlay (which sorts every list) and digests the validated
-- form; this table stores the document and nothing else. A client-supplied
-- digest was never an option — it is the client's own claim about its own data.

-- ---------------------------------------------------------------------------
-- 1. The overlay
-- ---------------------------------------------------------------------------
create table if not exists public.edit_review_overlays (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- ONE overlay per project, forever. A second review of the same project is a
  -- versioned re-edit, which does not exist yet and must not be smuggled in as
  -- a second row nothing chooses between.
  edit_project_id uuid not null unique references public.edit_projects(id) on delete cascade,
  overlay jsonb not null,
  -- What the transcript looked like when the creator edited it. The worker
  -- re-validates the overlay against the recording's own word count at compile
  -- time; this is here so a mismatch can be READ rather than only refused.
  spoken_word_count integer not null check (spoken_word_count >= 0),
  submitted_at timestamptz not null default now()
);

create index if not exists edit_review_overlays_owner_idx
  on public.edit_review_overlays (owner_id, submitted_at desc);

-- Immutability, enforced rather than promised. DELETE is left to the project's
-- own cascade: an overlay outliving the project it edits would be an orphan
-- record of an edit to nothing.
create or replace function public.edit_review_overlays_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'edit_review_overlays: an overlay is written once — the plan cites its digest';
end;
$$;

drop trigger if exists trg_edit_review_overlays_immutable on public.edit_review_overlays;
create trigger trg_edit_review_overlays_immutable
  before update on public.edit_review_overlays
  for each row execute function public.edit_review_overlays_immutable();
revoke all on function public.edit_review_overlays_immutable() from public, anon, authenticated;

alter table public.edit_review_overlays enable row level security;
alter table public.edit_review_overlays force row level security;

-- The owner may READ their own overlay — the review screen shows what was
-- submitted, and a support conversation needs it to be quotable. Nobody writes
-- through the table; the only writer is the RPC below, which is the whole point
-- of putting the stage check and the enqueue in one transaction with the write.
drop policy if exists edit_review_overlays_owner_select on public.edit_review_overlays;
create policy edit_review_overlays_owner_select on public.edit_review_overlays
  for select to authenticated using (owner_id = (select auth.uid()));

revoke all on public.edit_review_overlays from public, anon;
grant select on public.edit_review_overlays to authenticated;
grant all on public.edit_review_overlays to service_role;

-- ---------------------------------------------------------------------------
-- 2. The stage guard admits the two review transitions
-- ---------------------------------------------------------------------------
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
  -- failed/cancelled are reachable from any ACTIVE stage, INCLUDING the review
  -- pause. A creator who abandons a review must be able to cancel it, and a
  -- project cannot be allowed to rest here forever with no exit.
  if new.status in ('failed','cancelled') then
    return new;
  end if;
  -- The review pause, beside the pipeline rather than inside it. Only these two
  -- transitions exist: the worker parks a directed project, and submitting the
  -- review releases it into compiling. `directing -> compiling` stays legal, so
  -- a project pinned or resumed while the gate is off is never stranded.
  if old.status = 'directing' and new.status = 'awaiting_review' then
    return new;
  end if;
  if old.status = 'awaiting_review' and new.status = 'compiling' then
    return new;
  end if;
  if old.status = 'awaiting_review' then
    raise exception 'edit_projects: awaiting_review only releases into compiling (asked for %)', new.status;
  end if;
  o := array_position(pipeline, old.status);
  n := array_position(pipeline, new.status);
  if n is null or o is null or n <> o + 1 then
    raise exception 'edit_projects: illegal stage transition % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;
revoke all on function public.edit_projects_guard_stage() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Submitting the review
-- ---------------------------------------------------------------------------
-- Called by the OWNER (authenticated), not by a worker: no lease exists here,
-- because the whole point of the pause is that no worker is running. Ownership
-- is therefore re-proved from auth.uid() rather than assumed from a service key.
--
-- ONE TRANSACTION, three effects that must not come apart: the overlay is
-- stored, the project is released into compiling, and the resume job is queued.
-- Any two without the third leaves a project that renders an edit nobody
-- recorded, or rests forever holding an edit nothing will read.
create or replace function public.editor_submit_review(
  p_project uuid, p_overlay jsonb, p_spoken_word_count integer
) returns public.edit_projects
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  proj public.edit_projects;
  existing public.edit_review_overlays;
  live integer;
begin
  if auth.uid() is null then
    raise exception 'review_forbidden: no authenticated caller';
  end if;
  if p_overlay is null or jsonb_typeof(p_overlay) <> 'object' then
    raise exception 'review_overlay_invalid: the overlay must be a json object';
  end if;
  if p_spoken_word_count is null or p_spoken_word_count < 0 then
    raise exception 'review_overlay_invalid: spoken_word_count must be a non-negative integer';
  end if;

  select * into proj from public.edit_projects where id = p_project for update;
  if not found or proj.owner_id <> auth.uid() then
    -- One message for "not yours" and "not there", so this cannot be used to
    -- learn which project ids exist.
    raise exception 'review_forbidden: no such project for this owner';
  end if;

  -- IDEMPOTENT ON THE SAME SUBMISSION, REFUSING A DIFFERENT ONE. A double-click
  -- or a retried request must land the same edit; a SECOND, DIFFERENT edit is a
  -- versioned re-edit, which does not exist yet.
  select * into existing from public.edit_review_overlays where edit_project_id = p_project;
  if found then
    if existing.overlay = p_overlay then
      return proj;
    end if;
    raise exception 'review_already_submitted: this project already carries a different review';
  end if;

  if proj.status <> 'awaiting_review' then
    raise exception 'review_wrong_stage: project % is % (expected awaiting_review)', p_project, proj.status;
  end if;
  if proj.cancel_requested_at is not null then
    raise exception 'review_cancelled: this project is being cancelled';
  end if;

  -- NO SECOND DRIVER. The `:1` dedup key used to guarantee one editor_v2 job
  -- per project by itself; a resume job breaks that guarantee unless this is
  -- checked, because `editor_assert_lease` fences a job against ITS OWN lease
  -- and would happily let two jobs drive one project. The window this refuses
  -- is the millisecond between the worker parking the project and its own job
  -- settling — a creator cannot reach it, and failing closed costs them a retry
  -- rather than a double-rendered video.
  select count(*) into live from public.jobs
   where type = 'editor_v2'
     and payload->>'project_id' = p_project::text
     and status in ('queued','running');
  if live > 0 then
    raise exception 'review_not_ready: the previous run has not settled yet — retry in a moment';
  end if;

  insert into public.edit_review_overlays (owner_id, edit_project_id, overlay, spoken_word_count)
  values (proj.owner_id, p_project, p_overlay, p_spoken_word_count);

  update public.edit_projects
     set status = 'compiling'
   where id = p_project
   returning * into proj;

  insert into public.edit_events (project_id, stage, message_code, details)
  values (p_project, 'compiling', 'review_submitted',
          jsonb_build_object('spoken_word_count', p_spoken_word_count));

  insert into public.jobs (owner_id, type, status, payload, dedup_key)
  values (
    proj.owner_id, 'editor_v2', 'queued',
    jsonb_build_object('project_id', proj.id, 'generation_id', proj.generation_id,
                       'source_asset_id', proj.source_asset_id, 'resumed_after', 'review'),
    'editor_v2:' || proj.id::text || ':2'
  )
  on conflict (dedup_key) where dedup_key is not null do nothing;

  return proj;
end;
$$;

revoke all on function public.editor_submit_review(uuid, jsonb, integer) from public, anon;
grant execute on function public.editor_submit_review(uuid, jsonb, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The reconciler learns that resting is not dying
-- ---------------------------------------------------------------------------
-- Two changes to 0081's sweep, both required by the pause:
--
--   * an `awaiting_review` project is SKIPPED. It has no live job by design,
--     which is the exact signature the sweep otherwise reads as a lost job.
--     Without this every review is failed as `lost_job` after p_min_age_secs.
--   * jobs are matched by PREFIX rather than by the literal `:1` key, so the
--     resume job (`:2`) is visible to both sweeps. A sweep that cannot see the
--     job it is reasoning about concludes the job is gone — the resumed project
--     would be failed WHILE ITS WORKER WAS RUNNING, and the converse sweep
--     would never close a stale resume job.
-- The sweeps and `editor_assert_lease` all reach an editor_v2 job through its
-- payload's project id. That was an unindexed expression scan the moment the
-- dedup-key shortcut stopped being usable, so the index goes in with the change
-- that starts depending on it rather than after the first slow sweep.
create index if not exists jobs_editor_v2_project_idx
  on public.jobs ((payload->>'project_id'), created_at desc)
  where type = 'editor_v2';

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
  awaiting integer := 0;
begin
  for r in
    select p.id from public.edit_projects p
     where p.status not in ('completed','failed','cancelled')
       and p.created_at < now() - make_interval(secs => p_min_age_secs)
     order by p.created_at
  loop
    examined := examined + 1;
    -- Lock order: job first, then project. The newest job wins: a resumed
    -- project has a settled `:1` and a live `:2`, and reading the older one
    -- would call a healthy project lost.
    select * into j from public.jobs
     where type = 'editor_v2'
       and payload->>'project_id' = r.id::text
     order by created_at desc
     limit 1
     for update;

    if j.id is not null and j.status in ('queued','running') then
      continue; -- healthy: work is pending or in flight
    end if;

    select * into proj from public.edit_projects where id = r.id for update;
    if proj.status in ('completed','failed','cancelled') then
      continue; -- settled while we were iterating (or by a concurrent run)
    end if;

    -- WAITING ON A PERSON. No live job is the CORRECT state here, and a
    -- cancellation request is still honoured below, so nothing rests forever
    -- against the owner's wishes.
    if proj.status = 'awaiting_review' and proj.cancel_requested_at is null then
      awaiting := awaiting + 1;
      continue;
    end if;

    if proj.cancel_requested_at is not null then
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
  -- already TERMINAL project. Matched by project id rather than by the `:1`
  -- key, for the same reason as above.
  for r in
    select j2.id as job_id, p2.id as project_id, p2.status as pstatus
      from public.jobs j2
      join public.edit_projects p2 on j2.payload->>'project_id' = p2.id::text
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
                            'cancelled', cancelled, 'closed_stale_jobs', closed_stale,
                            'awaiting_review', awaiting);
end;
$$;

revoke all on function public.editor_reconcile_lost_projects(integer) from public, anon, authenticated;
grant execute on function public.editor_reconcile_lost_projects(integer) to service_role;

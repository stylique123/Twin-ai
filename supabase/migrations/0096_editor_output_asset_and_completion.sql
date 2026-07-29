-- Editor v2 — Phase 8 Batch 8.5: the output asset, and the completion trigger.
--
-- Two things 0094 left open, both deliberately and both recorded at the time.
--
-- ---------------------------------------------------------------------------
-- 1. A GAP IN 0094, FOUND WHILE WIRING THE RENDERER
-- ---------------------------------------------------------------------------
--
-- `editor_complete_output(..., p_output_asset uuid)` takes an asset id and
-- refuses without one. NOTHING IN 0094 CREATES THAT ASSET. There is no
-- `media_assets` insert anywhere in the worker either — source assets are
-- created by the `source-asset` edge function, which has no business making
-- render outputs.
--
-- So as merged, the completion path was unreachable: the worker would have had
-- to insert into `media_assets` directly, which is exactly the unfenced write
-- the rest of Phase 8 exists to prevent. This adds the missing fenced RPC.
--
-- The output asset is DERIVED, not described by the caller. It takes no path,
-- no bucket, no owner, no digest and NO DURATION: every one of those is already
-- known to the database from the reserved `edit_outputs` row and the project,
-- and a parameter is a way for them to disagree.
--
-- THE DURATION PARAMETER WAS REMOVED AFTER IT WAS WRITTEN, and the reason is
-- worth keeping. It was `coalesce(p_duration_ms, vid.measured_duration_ms)`,
-- and the render stage was passing `plan.output.durationMs` — so the asset
-- recorded what the plan PROMISED rather than what ffprobe MEASURED. Those are
-- allowed to differ: Gate-0 §4 freezes a ±250 ms tolerance, which exists
-- precisely because they do. Every consumer of the asset — player, scrubber,
-- thumbnail picker — would then be working from a claim.
--
-- `vid.measured_duration_ms` is the number ffprobe read off the finished file,
-- and `edit_outputs_video_ready_has_duration` already guarantees it is present
-- before the row can be READY. Deleting the parameter is what makes the wrong
-- value unpassable rather than merely discouraged.
--
-- Width, height and frame rate DO come from the plan, and that is safe for a
-- different reason: `validateProbedOutput` refuses any output whose raster,
-- pixel format or frame-rate ratio is not EXACTLY the profile's. Validation has
-- already proven the measured values equal the planned ones, so there is no gap
-- for them to disagree across. Duration is the one field the contract lets vary.
--
-- ---------------------------------------------------------------------------
-- 2. THE COMPLETION TRIGGER, DEFERRED FROM 0094 AND NOW DUE
-- ---------------------------------------------------------------------------
--
-- `check_activation_gate.mjs` refused a migration tying `completed` to a
-- non-null output before the renderer existed:
--
--     premature completed=>output_asset_id constraint
--     (lands WITH the real renderer, updating this guard deliberately)
--
-- 8.4 followed that sequencing rather than silencing the guard, and Gate-F has
-- carried the consequence as an explicit `KNOWN GAP until 8.5` assertion ever
-- since: a bare `update ... set status='completed'` was ACCEPTED.
--
-- The renderer now exists. This closes the direct-UPDATE path, and the guard is
-- updated in the same commit — which is what "updating this guard deliberately"
-- asks for, done at the moment it becomes true rather than as a convenience.

-- ---------------------------------------------------------------------------
-- 1. editor_create_output_asset — fenced, fully derived
-- ---------------------------------------------------------------------------

create or replace function public.editor_create_output_asset(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer,
  p_width integer, p_height integer,
  p_fps_num integer, p_fps_den integer, p_mime text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  proj public.edit_projects;
  vid public.edit_outputs;
  existing public.media_assets;
  new_id uuid;
begin
  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);

  select * into proj from public.edit_projects where id = p_project for update;
  if not found then
    raise exception 'output_completion_conflict: project % not found', p_project;
  end if;

  -- The asset may only be minted for an output that is ALREADY READY. Creating
  -- it earlier would produce a `media_assets` row pointing at a file that may
  -- never exist, and `status = 'ready'` on it would be a claim nobody measured.
  select * into vid from public.edit_outputs
    where edit_project_id = p_project and kind = 'video' for update;
  if not found then
    raise exception 'output_completion_conflict: project % has no reserved video output', p_project;
  end if;
  if vid.state <> 'ready' then
    raise exception 'output_completion_conflict: the video output for project % is not ready', p_project;
  end if;

  -- Idempotent across a crash-resume: the reserved storage_path is unique in
  -- media_assets, so a second attempt finds the row the first one made rather
  -- than colliding on the unique index.
  select * into existing from public.media_assets where storage_path = vid.storage_path;
  if found then
    return existing.id;
  end if;

  insert into public.media_assets (
    owner_id, workspace_id, generation_id, kind, bucket, storage_path,
    content_sha256, mime_type, size_bytes, duration_ms,
    width, height, frame_rate_num, frame_rate_den, status
  ) values (
    proj.owner_id, proj.workspace_id, proj.generation_id, 'output',
    vid.storage_bucket, vid.storage_path,
    vid.sha256, p_mime, vid.bytes, vid.measured_duration_ms,
    p_width, p_height, p_fps_num, p_fps_den, 'ready'
  ) returning id into new_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. `completed` is now impossible without a ready output
-- ---------------------------------------------------------------------------
--
-- The rule is stated as what it protects, unchanged from 0094's reasoning:
--
--   A completed project may never CLAIM an output that was not validated.
--
--     output_asset_id non-null -> exactly one READY video, or refuse
--     any edit_outputs row     -> rendering was attempted, so it must have
--                                 finished: ready video AND a claimed asset
--     neither                  -> the scaffold, which claims nothing
--
-- The third branch stays. Production still runs with EDITOR_RENDER_ENABLED
-- unset, so compiling/rendering/validating remain simulated and every project
-- still completes with a null output — Phases 3-7 of the matrix assert exactly
-- that, and phase7's A3 checks the null by name. Removing the branch now would
-- redden seven passing phases to enforce a property no production code can yet
-- satisfy, which is the mistake 0094's first draft made.
--
-- What has changed is that the branch is no longer the ONLY thing standing
-- between a bad completion and the database. With the renderer real, any run
-- that produces an output reserves one first, so branch two governs it.

create or replace function public.edit_projects_guard_completion()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  ready_video integer;
  any_outputs integer;
begin
  if new.status <> 'completed' then
    return new;
  end if;

  select count(*) into any_outputs
    from public.edit_outputs where edit_project_id = new.id;
  select count(*) into ready_video
    from public.edit_outputs
    where edit_project_id = new.id and kind = 'video' and state = 'ready';

  if new.output_asset_id is not null then
    if ready_video <> 1 then
      raise exception 'edit_projects: completed with an output asset requires exactly one READY video output (found %)', ready_video;
    end if;
    return new;
  end if;

  -- Null asset. Permitted ONLY when nothing was ever reserved: a project that
  -- began rendering and then completed while claiming no output has lost the
  -- output it made, which is worse than failing.
  if any_outputs > 0 then
    raise exception 'edit_projects: completed with reserved outputs requires a READY video and an output_asset_id (outputs %, ready %)', any_outputs, ready_video;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_edit_projects_completion on public.edit_projects;
create trigger trg_edit_projects_completion
  before update on public.edit_projects
  for each row execute function public.edit_projects_guard_completion();


-- ---------------------------------------------------------------------------
-- 3. RECONCILE THE COMPLETION ASSET (audit finding, P0)
-- ---------------------------------------------------------------------------
--
-- 0094's `editor_complete_output` proves a READY video output EXISTS, then
-- writes whatever `p_output_asset` it was handed into
-- `edit_projects.output_asset_id`. It never checks that the asset IS that
-- output. A caller could complete a project onto an unrelated media_assets row
-- — another user's, another generation's, a source asset — and every guard
-- would pass.
--
-- Today's caller does the right thing: `editor_create_output_asset` derives the
-- asset from the reserved row, and the worker passes that id back. But "the
-- current caller is correct" is a property of one build of one worker, and it
-- is exactly the standard the rest of this migration refuses. The whole reason
-- `completed` is guarded in SQL is that the callers worth insuring against are
-- the ones nobody reviewed.
--
-- Gate-F did not catch it. Its "different asset" case runs AFTER a successful
-- completion, so the idempotency comparison rejects the second call — it tests
-- the safe ordering. The dangerous case is the FIRST completion using the wrong
-- asset, and that is now both fixed and asserted.
--
-- Reconciliation is on STORAGE PATH, not on id: the path is what the database
-- itself derived in `editor_reserve_output`, so an asset matching it is the
-- asset for this output by construction. Owner and digest are checked too,
-- because an asset can be moved onto a path without being the same row.
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
  ass public.media_assets;
begin
  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);

  select * into proj from public.edit_projects where id = p_project for update;
  if not found then
    raise exception 'output_completion_conflict: project % not found', p_project;
  end if;
  if proj.status = 'completed' then
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

  select * into ass from public.media_assets where id = p_output_asset;
  if not found then
    raise exception 'output_completion_conflict: output asset % does not exist', p_output_asset;
  end if;
  if ass.storage_path is distinct from vid.storage_path
     or ass.bucket is distinct from vid.storage_bucket then
    raise exception 'output_completion_conflict: asset % is not the rendered output for project % (path mismatch)', p_output_asset, p_project;
  end if;
  if ass.owner_id is distinct from proj.owner_id then
    raise exception 'output_completion_conflict: asset % belongs to a different owner', p_output_asset;
  end if;
  if ass.content_sha256 is distinct from vid.sha256 then
    raise exception 'output_completion_conflict: asset % does not carry the validated output digest', p_output_asset;
  end if;
  if ass.kind <> 'output' then
    raise exception 'output_completion_conflict: asset % is kind %, not an output', p_output_asset, ass.kind;
  end if;

  update public.edit_projects
     set status = 'completed', output_asset_id = p_output_asset, completed_at = now()
   where id = p_project
   returning * into proj;
  return proj;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. STAGE-FENCE editor_mark_output_ready (audit finding)
-- ---------------------------------------------------------------------------
--
-- 0094's version re-proves the lease and the attempt but never loads the
-- project, so it does not re-prove the STAGE — despite that file's own contract
-- saying every stateful operation re-proves all three. A worker whose project
-- was cancelled or moved on could still mark an output READY while its lease
-- remained briefly valid, publishing a measurement for a stage that is no
-- longer permitted to produce one.
create or replace function public.editor_mark_output_ready(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer,
  p_kind text, p_bytes bigint, p_sha256 text, p_measured_duration_ms integer default null
) returns public.edit_outputs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  proj public.edit_projects;
  row_out public.edit_outputs;
begin
  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);

  select * into proj from public.edit_projects where id = p_project for update;
  if not found then
    raise exception 'output_completion_conflict: project % not found', p_project;
  end if;
  -- rendering produces the bytes; validating may still be finishing the cover.
  if proj.status not in ('rendering', 'validating') then
    raise exception 'render_wrong_stage: project % is % (expected rendering or validating)', p_project, proj.status;
  end if;

  select * into row_out from public.edit_outputs
    where edit_project_id = p_project and kind = p_kind for update;
  if not found then
    raise exception 'output_completion_conflict: no reserved % output for project %', p_kind, p_project;
  end if;
  if row_out.state = 'ready' then
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

-- ---------------------------------------------------------------------------
-- 5. Grants — service_role only; anon gets nothing.
-- ---------------------------------------------------------------------------

revoke all on function public.edit_projects_guard_completion() from public, anon, authenticated;
revoke all on function public.editor_create_output_asset(uuid, uuid, text, integer, integer, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.editor_create_output_asset(uuid, uuid, text, integer, integer, integer, integer, integer, text) to service_role;

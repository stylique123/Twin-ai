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
-- no bucket, no owner and no duration argument: every one of those is already
-- known to the database from the reserved `edit_outputs` row and the project,
-- and a parameter is a way for them to disagree.
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
  p_duration_ms integer, p_width integer, p_height integer,
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
    vid.sha256, p_mime, vid.bytes, coalesce(p_duration_ms, vid.measured_duration_ms),
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
-- 3. Grants — service_role only; anon gets nothing.
-- ---------------------------------------------------------------------------

revoke all on function public.edit_projects_guard_completion() from public, anon, authenticated;
revoke all on function public.editor_create_output_asset(uuid, uuid, text, integer, integer, integer, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.editor_create_output_asset(uuid, uuid, text, integer, integer, integer, integer, integer, integer, text) to service_role;

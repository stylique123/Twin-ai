-- 0097: the output bucket is 'edits', and the database says so.
--
-- WHAT WAS WRONG
--
-- `EDITOR_OUTPUT_BUCKET` defaulted to 'media' — a bucket that does not exist.
-- 0065 creates exactly two: 'takes' (raw recordings) and 'edits' (finished
-- renders, EDLs, thumbs, logos). Nothing in this repository creates 'media',
-- grants on it, or writes a policy for it, and the variable is set in no
-- deployment, no compose file and no workflow. Every render would therefore
-- have encoded successfully, validated successfully, and then 404'd on upload.
--
-- WHY IT SURVIVED EVERY GATE
--
-- Gate-F reserved outputs into 'media' nine times and passed nine times,
-- because a throwaway Postgres has no storage for a bucket name to be wrong
-- ABOUT. This is the fourth time a stand-in has concealed production in Phase 8,
-- and the pattern is identical each time: the test double is missing exactly the
-- thing the value describes, so any value passes.
--
-- WHAT THIS CHANGES
--
-- `editor_reserve_output` already refuses to accept a PATH, deriving it from ids
-- the database holds, so that no client or model text can reach it. It then took
-- the BUCKET as free text — the same channel, left open. It is now fenced the
-- way 0091 fences the source bucket ('source_policy_bucket'), so a misconfigured
-- worker is refused at the reservation, before an encode is spent, instead of
-- failing at the upload after one.
--
-- The parameter is kept rather than removed: `edit_outputs.storage_bucket` is a
-- real column that 0096's completion reconciles against the minted asset, and a
-- fenced parameter keeps one authority for the value instead of hard-coding the
-- same string in two RPCs.
--
-- NOT CHANGED: the derived path. `edit-outputs/<owner>/<project>/<attempt>/…`
-- puts the owner id in the SECOND segment, so the legacy `edits` RLS policies
-- (0006/0057), which key on `foldername(name)[1]`, do not grant the owner direct
-- read access. That is deliberate and not a defect here: finished edits are
-- served by an edge function that authorizes the caller and signs with the
-- service role (functions/review, functions/social, functions/generate-thumbnail
-- all do exactly this), never by direct client download. Phase 8 has no such
-- endpoint yet — that is a missing deliverable, recorded here so the layout is
-- a decision rather than an accident.

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
  -- THE FENCE. Checked before any state is read or taken, so a misconfigured
  -- worker cannot hold a row lock while being told no.
  if p_bucket is distinct from 'edits' then
    raise exception 'render_output_bucket_invalid: outputs are written to edits, not %', p_bucket;
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

-- Any row already reserved into a bucket that does not exist is unrenderable and
-- was never uploaded to (the upload is what would have failed). There are none
-- in any environment — EDITOR_RENDER_ENABLED has never been enabled outside a
-- staging matrix run, and no matrix run has yet reached the upload — so this is
-- an assertion rather than a repair: it fails the migration loudly instead of
-- leaving rows that point at nothing.
do $$
declare stale integer;
begin
  select count(*) into stale from public.edit_outputs where storage_bucket <> 'edits';
  if stale > 0 then
    raise exception 'edit_outputs carries % row(s) reserved into a non-edits bucket; resolve before fencing', stale;
  end if;
end;
$$;

revoke all on function public.editor_reserve_output(uuid, uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.editor_reserve_output(uuid, uuid, text, integer, text, text) to service_role;

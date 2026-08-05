-- 0107 — CREATING AND FINALIZING A CLIP.
--
-- Phase 12 item 13. 0106 gave a clip somewhere to live; this is how one gets
-- written, because `authenticated` holds SELECT on `media_assets` and nothing
-- else (0076 revokes insert/update/delete). Every write goes through a
-- security-definer RPC, exactly as a source does.
--
-- ── A CLIP IS NOT A SOURCE, AND THIS IS WHERE THAT SAVES WORK ─────────────
--
-- `editor_create_source_asset` is ~200 lines because a source carries the
-- CAPTURE CONTRACT: the recording-script snapshot, its SHA, the intent row, the
-- marker version, the exact-descriptor equality check on retry. All of that
-- exists to prove one thing — that the take the editor cuts is the take of the
-- script the creator read.
--
-- A screen recording is not read from a script and is not the thing the editor
-- cuts. NONE of that ceremony applies, and inventing a parallel version of it
-- would be ritual rather than proof. What DOES apply is the idempotency
-- backbone, because a creator retries a screen capture constantly — the picker
-- is cancelled, the wrong window is shared, the tab is refreshed.
--
-- ── WHAT IS ENFORCED, AND WHY EACH ONE ───────────────────────────────────
--
--   * the generation must be the caller's — proven from the row, not claimed
--   * one attempt is one asset, converging on retry rather than minting rows
--   * a per-generation CAP, because a screen recorder with a stuck retry loop
--     is a storage bill nobody notices until it arrives
--   * the same 20 GB per-owner quota a source is held to, counted across BOTH
--     kinds: a clip and a take cost the same to store, so a separate allowance
--     would just be the same bill under two names
--   * the path is SERVER-DERIVED. A client-supplied path is a client writing
--     wherever it likes, which is the defect 0091 documents at length.

-- ---------------------------------------------------------------------------
-- create: mint (or converge on) the row, and hand back the path to upload to
-- ---------------------------------------------------------------------------
create or replace function public.editor_create_clip_asset(
  p_owner uuid,
  p_generation uuid,
  p_attempt uuid,
  p_bucket text,
  p_mime text,
  p_size_bytes bigint,
  p_label text default null
) returns table(asset_id uuid, storage_path text, status text, created boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  max_clips constant int := 12;   -- per generation
  quota constant bigint := 21474836480; -- 20 GB per owner, shared with sources
  gen_owner uuid;
  a public.media_assets;
  ext text;
  label text := nullif(btrim(coalesce(p_label, '')), '');
  new_id uuid;
  new_path text;
  clip_count int;
  used_bytes bigint;
begin
  if p_bucket is distinct from 'takes' then raise exception 'clip_policy_bucket'; end if;
  -- A screen capture is webm on every browser that can produce one; mp4 is
  -- admitted for Safari's sake. The list is closed for the same reason the
  -- source's is: a mime the validator has never seen is a file nothing can read.
  if p_mime not in ('video/webm','video/mp4') then raise exception 'clip_policy_mime'; end if;
  ext := case when p_mime = 'video/webm' then 'webm' else 'mp4' end;
  -- Floor as well as ceiling: a sub-2KB "recording" is a cancelled picker, and
  -- storing it would put an unplayable row in front of the creator.
  if p_size_bytes is null or p_size_bytes < 2048 or p_size_bytes > 629145600 then
    raise exception 'clip_policy_size';
  end if;
  if label is not null and length(label) > 200 then raise exception 'clip_policy_label'; end if;

  -- OWNER-scoped lock, as the source RPC does: same-attempt retries converge,
  -- and two concurrent DISTINCT attempts cannot both slip past the cap.
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 0));

  select user_id into gen_owner from public.generations where id = p_generation;
  if gen_owner is null or gen_owner is distinct from p_owner then
    raise exception 'clip_forbidden: no such generation for this owner';
  end if;

  -- CONVERGE. The unique index on (owner, generation, attempt) is what makes a
  -- retry safe; this returns the existing row rather than failing on it.
  -- ALIASED, and every column qualified. `RETURNS TABLE` puts `status`,
  -- `storage_path`, `asset_id` and `created` in scope as variables, so an
  -- unqualified `status` in a WHERE clause resolves to the OUT parameter rather
  -- than the column — which is an ambiguity error at runtime, not at create
  -- time. Gate-K caught it on the first call.
  select * into a from public.media_assets m
   where m.owner_id = p_owner and m.generation_id = p_generation
     and m.recording_attempt_id = p_attempt;
  if found then
    if a.kind is distinct from 'clip' then
      raise exception 'clip_attempt_conflict: attempt % already belongs to a %', p_attempt, a.kind;
    end if;
    if a.status in ('rejected','deleted') then
      raise exception 'clip_asset_rejected: %', a.id;
    end if;
    -- The descriptor must match what was agreed the first time. A second call
    -- with a different mime or size is a DIFFERENT recording wearing the same
    -- attempt id, and silently returning the old path would upload it over one.
    if a.bucket is distinct from p_bucket
       or a.mime_type is distinct from p_mime
       or a.size_bytes is distinct from p_size_bytes then
      raise exception 'clip_attempt_conflict: divergent upload descriptor for %', a.id;
    end if;
    return query select a.id, a.storage_path, a.status, false;
    return;
  end if;

  select count(*) into clip_count from public.media_assets m
   where m.owner_id = p_owner and m.generation_id = p_generation and m.kind = 'clip'
     and m.status <> 'deleted';
  if clip_count >= max_clips then
    raise exception 'clip_limit_reached: % clips already on this video', clip_count;
  end if;

  select coalesce(sum(m.size_bytes), 0) into used_bytes from public.media_assets m
   where m.owner_id = p_owner and m.status <> 'deleted';
  if used_bytes + p_size_bytes > quota then
    raise exception 'clip_quota_exceeded';
  end if;

  new_id := gen_random_uuid();
  -- The owner id LEADS the path, because the `takes` read policy authorizes on
  -- the first folder — the same reason covers live under `${user}/ai-thumb/`.
  -- A creator who cannot sign their own clip cannot play it back.
  new_path := p_owner::text || '/' || p_generation::text || '/clip-' || new_id::text || '.' || ext;

  insert into public.media_assets
    (id, owner_id, generation_id, kind, recording_attempt_id, bucket, storage_path,
     mime_type, size_bytes, status, clip_label)
  values
    (new_id, p_owner, p_generation, 'clip', p_attempt, p_bucket, new_path,
     p_mime, p_size_bytes, 'uploading', label);

  return query select new_id, new_path, 'uploading'::text, true;
end;
$$;

revoke all on function public.editor_create_clip_asset(uuid, uuid, uuid, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.editor_create_clip_asset(uuid, uuid, uuid, text, text, bigint, text) to service_role;

-- ---------------------------------------------------------------------------
-- finalize: the bytes are up
-- ---------------------------------------------------------------------------
-- Goes straight to `ready`. A source passes through `validating` because a
-- worker ffprobes it against the capture contract; 0091's
-- `source_validate_not_source` REFUSES to run that validator on a non-source,
-- and rightly — it enforces properties of a recorded take. A clip that claimed
-- `validating` would wait forever for a job that will never be queued.
create or replace function public.editor_finalize_clip(
  p_owner uuid, p_asset uuid, p_size_bytes bigint
) returns public.media_assets
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  a public.media_assets;
begin
  select * into a from public.media_assets m where m.id = p_asset for update;
  if not found or a.owner_id is distinct from p_owner then
    raise exception 'clip_forbidden: no such clip for this owner';
  end if;
  if a.kind is distinct from 'clip' then
    raise exception 'clip_finalize_not_clip: % is a %', p_asset, a.kind;
  end if;
  -- IDEMPOTENT. A retried finalize after a dropped response must not fail, and
  -- must not move a settled row.
  if a.status = 'ready' then
    return a;
  end if;
  if a.status <> 'uploading' then
    raise exception 'clip_finalize_wrong_state: % is %', p_asset, a.status;
  end if;
  -- The size agreed at create is the size that had to be uploaded. A mismatch
  -- means the bytes are not the bytes the row describes, and marking that ready
  -- would put a file the creator never recorded into their video.
  if p_size_bytes is distinct from a.size_bytes then
    raise exception 'clip_finalize_size_mismatch: expected %, got %', a.size_bytes, p_size_bytes;
  end if;

  update public.media_assets m
     set status = 'ready', validated_at = now()
   where m.id = p_asset
   returning * into a;
  return a;
end;
$$;

revoke all on function public.editor_finalize_clip(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.editor_finalize_clip(uuid, uuid, bigint) to service_role;

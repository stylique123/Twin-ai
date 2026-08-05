-- 0107 — CAPTURING A CLIP, WITHOUT PRETENDING IT IS A TAKE.
--
-- Phase 12 item 13. 0106 gave `media_assets` the `clip` kind, the
-- `clip_label` column and the attempt-uniqueness that makes a cancelled
-- share-picker cost nothing. What it deliberately did NOT give it was a way in:
-- every writer of `media_assets` is a source writer, and each of them enforces
-- something that is true of a recorded TAKE and false of a screen capture.
--
-- ── WHY NOT WIDEN THE SOURCE PATH ─────────────────────────────────────────
--
-- `editor_create_source_asset` binds a canonical recording-script snapshot to
-- the asset, verifies a per-scene dialogue SHA against the teleprompter, and
-- refuses a capture whose accepted windows are not the script's scenes. Every
-- one of those is the right check for the one take the editor cuts. A screen
-- recording has no dialogue, no scenes and no teleprompter — widening that
-- function would mean adding a branch that skips its own guarantees, and a
-- guard with a bypass is the shape of every "it validated, just not that one"
-- postmortem. 0091's `source_validate_not_source` already says the same thing
-- from the other side: the source validator REFUSES a non-source, on purpose.
--
-- So a clip gets its own three functions, each smaller than the source
-- equivalent because a clip promises less — and what it does not promise is
-- absent rather than stubbed.
--
-- ── WHAT A CLIP STILL PROMISES ────────────────────────────────────────────
--
--   * ONE ATTEMPT IS ONE ASSET. Inherited from 0106's constraint and enforced
--     here the same way sources are: a create for an attempt that already has a
--     row converges on that row after checking the descriptor matches, rather
--     than minting a second half-uploaded asset. A screen capture is exactly
--     where a creator retries — wrong window, cancelled picker, refreshed tab —
--     so this matters MORE here than for a take, not less.
--   * THE BYTES ARE MEASURED BEFORE THEY ARE TRUSTED. `validate_clip` probes
--     the object and writes duration/dimensions/checksum. Nothing may compose a
--     clip that has not been measured, because `EditPlanV1.composition`
--     (schema v7) requires a real duration and a real checksum and neither can
--     be invented from an upload.
--   * READY MEANS PROBED. The status ladder is unchanged —
--     uploading → validating → ready — so a clip cannot skip to `ready` and
--     there is no path that marks one ready without a measurement.
--
-- ── AND WHAT IT DOES NOT ──────────────────────────────────────────────────
--
-- No script binding, no capture intent, no manifest, no generation pointer. A
-- clip is not the spine of a project and nothing points at it as one; it is
-- found by `generation_id + kind + clip_label`, which is the index 0106 added.

-- ---------------------------------------------------------------------------
-- 1. create — idempotent per attempt
-- ---------------------------------------------------------------------------
create or replace function public.editor_create_clip_asset(
  p_owner uuid,
  p_generation uuid,
  p_attempt uuid,
  p_label text,
  p_bucket text,
  p_mime text,
  p_size_bytes bigint
) returns table(asset_id uuid, storage_path text, status text, created boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  max_open constant int := 10;
  quota constant bigint := 21474836480; -- 20 GB per owner, the source quota
  gen_owner uuid;
  a public.media_assets;
  ext text;
  label text := nullif(btrim(coalesce(p_label, '')), '');
  new_id uuid;
  new_path text;
  open_count int;
  used_bytes bigint;
begin
  if p_bucket is distinct from 'takes' then raise exception 'clip_policy_bucket'; end if;
  if p_mime not in ('video/webm','video/mp4','video/quicktime') then raise exception 'clip_policy_mime'; end if;
  ext := case when p_mime = 'video/webm' then 'webm' else 'mp4' end;
  -- A clip is footage, not a take: the same floor (an empty file is never a
  -- recording) and the same ceiling (the bucket's own cap) as a source. The
  -- numbers are repeated rather than shared because they bound DIFFERENT
  -- policies that happen to agree today, and a later decision to allow longer
  -- screen captures must not silently move the take's limit too.
  if p_size_bytes is null or p_size_bytes < 2048 or p_size_bytes > 629145600 then raise exception 'clip_policy_size'; end if;
  -- 0106's length bound, checked here as well as by the constraint: a create
  -- that fails on a CHECK reports a constraint name, and the caller cannot tell
  -- the creator which field was wrong.
  if label is not null and length(label) > 200 then raise exception 'clip_policy_label'; end if;

  -- OWNER-scoped lock, exactly as the source create takes: same-attempt retries
  -- converge AND concurrent distinct attempts cannot both slip past a cap.
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 0));

  select user_id into gen_owner from public.generations where id = p_generation;
  if gen_owner is null or gen_owner is distinct from p_owner then
    raise exception 'clip_generation_not_owned: % / %', p_owner, p_generation using errcode = 'raise_exception';
  end if;

  select * into a from public.media_assets m
   where m.owner_id = p_owner and m.generation_id = p_generation and m.recording_attempt_id = p_attempt
   for update;

  if found then
    -- The attempt already exists. It must be a CLIP: an attempt id reused
    -- across kinds would let a clip create converge on a source row and hand
    -- back its upload target.
    if a.kind is distinct from 'clip' then
      raise exception 'clip_attempt_conflict: attempt % is not a clip', p_attempt using errcode = 'raise_exception';
    end if;
    if a.status in ('rejected','deleted') then
      raise exception 'clip_asset_rejected: %', a.id using errcode = 'raise_exception';
    end if;
    -- EXACT descriptor equality, same posture as the source path: a divergent
    -- retry fails closed and leaves the original row untouched. The label is
    -- part of it — the same attempt filling a different declared slot is a
    -- different intent, not a retry of this one.
    if a.bucket is distinct from p_bucket
       or a.mime_type is distinct from p_mime
       or a.size_bytes is distinct from p_size_bytes
       or a.clip_label is distinct from label
       or a.storage_path is distinct from (p_owner::text || '/' || p_generation::text || '/' || a.id::text || '.' || ext) then
      raise exception 'clip_attempt_conflict: divergent upload descriptor for %', a.id using errcode = 'raise_exception';
    end if;
    return query select a.id, a.storage_path, a.status, false;
    return;
  end if;

  -- Caps, checked only on the path that actually creates something.
  -- Columns are qualified because this function's OUT parameters are named
  -- `storage_path` and `status`, and an unqualified `status` here resolves to
  -- the OUT parameter rather than to the column — a shadowing that fails loudly
  -- inside plpgsql but would be easy to reintroduce by copying a line.
  select count(*) into open_count from public.media_assets m
   where m.owner_id = p_owner and m.kind in ('source','clip') and m.status in ('uploading','validating');
  if open_count >= max_open then raise exception 'clip_too_many_open'; end if;

  select coalesce(sum(m.size_bytes), 0) into used_bytes from public.media_assets m
   where m.owner_id = p_owner and m.status <> 'deleted';
  if used_bytes + p_size_bytes > quota then raise exception 'clip_quota_exceeded'; end if;

  new_id := gen_random_uuid();
  new_path := p_owner::text || '/' || p_generation::text || '/' || new_id::text || '.' || ext;
  insert into public.media_assets (
    id, owner_id, generation_id, kind, recording_attempt_id,
    bucket, storage_path, mime_type, size_bytes, clip_label, status
  ) values (
    new_id, p_owner, p_generation, 'clip', p_attempt,
    p_bucket, new_path, p_mime, p_size_bytes, label, 'uploading'
  ) returning * into a;

  return query select a.id, a.storage_path, a.status, true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. finalize — uploading -> validating, plus the one probe job
-- ---------------------------------------------------------------------------
-- The same reconciliation the source finalize does, for the same reason: a
-- browser cannot share a transaction with storage, so a repeat (timeout, second
-- tab) must converge rather than duplicate. The dedup key makes "exactly one
-- probe per clip version" a database guarantee.
create or replace function public.editor_finalize_clip(
  p_asset_id uuid, p_object_bytes bigint default null, p_object_etag text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.media_assets;
begin
  select * into a from public.media_assets where id = p_asset_id for update;
  if not found then raise exception 'editor_finalize_clip: asset % not found', p_asset_id; end if;
  -- A clip finalize must never settle a source. The mirror of 0091's
  -- `source_validate_not_source`, which is what stops a clip going through the
  -- take validator; this stops a take going through the clip one.
  if a.kind is distinct from 'clip' then
    raise exception 'editor_finalize_clip: asset % is not a clip', p_asset_id;
  end if;

  if a.status = 'uploading' then
    update public.media_assets
       set status = 'validating',
           size_bytes = coalesce(p_object_bytes, size_bytes),
           metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
             'finalized_bytes', p_object_bytes, 'finalized_etag', p_object_etag))
     where id = p_asset_id
     returning * into a;
  end if;

  if a.status = 'validating' then
    insert into public.jobs (owner_id, type, status, payload, dedup_key)
    values (
      a.owner_id, 'validate_clip', 'queued',
      jsonb_build_object('asset_id', a.id, 'generation_id', a.generation_id, 'validation_version', a.validation_version),
      'validate_clip:' || a.id || ':' || a.validation_version
    )
    on conflict (dedup_key) where dedup_key is not null do nothing;
  end if;

  return a.status;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. complete — validating -> ready, with the MEASURED facts
-- ---------------------------------------------------------------------------
-- Guarded on `validating` and on the kind, so a replayed worker call can never
-- resurrect a rejected clip or write measured facts onto a take. Metadata is
-- MERGED at the database (`||`), never replaced: `finalized_etag` and
-- `finalized_bytes` recorded at finalize must survive, because the probe
-- re-checks the object against them and erasing them would skip that check
-- forever.
create or replace function public.editor_complete_clip(
  p_asset uuid,
  p_content_sha text,
  p_size_bytes bigint,
  p_duration_ms bigint,
  p_width int,
  p_height int,
  p_frame_rate_num int,
  p_frame_rate_den int,
  p_rotation int,
  p_has_audio boolean,
  p_probe jsonb
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  updated int;
begin
  update public.media_assets
     set status = 'ready',
         content_sha256 = p_content_sha,
         size_bytes = coalesce(p_size_bytes, size_bytes),
         duration_ms = p_duration_ms,
         width = p_width,
         height = p_height,
         frame_rate_num = p_frame_rate_num,
         frame_rate_den = p_frame_rate_den,
         rotation = p_rotation,
         has_audio = p_has_audio,
         metadata = metadata || coalesce(p_probe, '{}'::jsonb),
         validated_at = now()
   where id = p_asset and kind = 'clip' and status = 'validating';
  get diagnostics updated = row_count;
  if updated = 0 then
    -- Never silently report success for a write that matched nothing. The
    -- caller decides whether this is an idempotent repeat or a real divergence;
    -- what it must not do is settle a job as "ready" against a row that is not.
    raise exception 'editor_complete_clip: asset % is not a validating clip', p_asset;
  end if;
  return 'ready';
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: service role only, for all three.
-- ---------------------------------------------------------------------------
-- The edge function verifies the caller and then calls these; a client that
-- could call them directly could mint an asset row for a generation it does not
-- own, or mark its own clip ready without a probe.
revoke all on function public.editor_create_clip_asset(uuid, uuid, uuid, text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.editor_create_clip_asset(uuid, uuid, uuid, text, text, text, bigint)
  to service_role;

revoke all on function public.editor_finalize_clip(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.editor_finalize_clip(uuid, bigint, text) to service_role;

revoke all on function public.editor_complete_clip(uuid, text, bigint, bigint, int, int, int, int, int, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.editor_complete_clip(uuid, text, bigint, bigint, int, int, int, int, int, boolean, jsonb)
  to service_role;

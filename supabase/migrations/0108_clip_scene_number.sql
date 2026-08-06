-- 0108 — A CLIP REMEMBERS WHICH LINE IT WAS RECORDED FOR.
--
-- 0107 stores a clip's LABEL, which is what the creator sees and what the
-- capture surface matches slots on. The compiler needs something else: the
-- SCENE NUMBER, because that is what the capture manifest's accepted windows are
-- keyed by and therefore the only thing that can say where in the finished video
-- a clip plays (`sceneOutputWindow`).
--
-- ── WHY NOT DERIVE IT FROM THE LABEL AT COMPILE TIME ──────────────────────
--
-- The obvious alternative is to look the label up in the script when compiling.
-- It is wrong twice over:
--
--   * The pinned script snapshot does not carry `clip_label` — it carries scene
--     number, type, dialogue and the teleprompter flag. Adding a field to it
--     changes its SHA, and that SHA is what binds a take to the script it was
--     recorded against (0091, and the shared/worker/DB mirrors that must agree
--     byte for byte). Every project in flight would fail its pin.
--   * Reading the LIVE `generations.scene_timeline` instead would place a clip
--     using a script that may have changed since the clip was recorded. The
--     whole pinning discipline exists so a compile cannot be moved by an edit
--     made after the fact.
--
-- Storing it on the clip is neither: the number is written down at the moment
-- the creator points at a slot, from the same script they were reading.
--
-- NULLABLE, and null is a real state. A clip captured before this column
-- existed, or one recorded without a declared slot, has no scene to play over —
-- the compiler drops it with a warning rather than guessing a window, which is
-- the same refusal `sceneOutputWindow` makes for a scene nothing recorded.

alter table public.media_assets
  add column if not exists clip_scene_number int;

-- A scene number is a positive integer or it is absent. `0` is not a scene, and
-- a negative one is a bug that would otherwise sit in the column until the
-- compiler quietly failed to match it.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'media_assets_clip_scene_number_positive'
  ) then
    alter table public.media_assets
      add constraint media_assets_clip_scene_number_positive
      check (clip_scene_number is null or clip_scene_number > 0);
  end if;
end$$;

-- Only a clip has one. A source asset is the whole take; it is not "for" a scene.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'media_assets_clip_scene_number_only_clip'
  ) then
    alter table public.media_assets
      add constraint media_assets_clip_scene_number_only_clip
      check (clip_scene_number is null or kind = 'clip');
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- create — the same function, plus the scene number
-- ---------------------------------------------------------------------------
-- DROPPED rather than overloaded. A second function differing only by a
-- defaulted trailing argument is ambiguous to resolve and lets an old caller
-- keep writing rows with no scene number long after the surface stopped sending
-- one — the migration would then have changed nothing it claimed to.
drop function if exists public.editor_create_clip_asset(uuid, uuid, uuid, text, text, text, bigint);

create function public.editor_create_clip_asset(
  p_owner uuid,
  p_generation uuid,
  p_attempt uuid,
  p_label text,
  p_bucket text,
  p_mime text,
  p_size_bytes bigint,
  -- WHERE IT PLAYS. Null for a capture with no declared slot; see the header.
  p_scene_number int default null
) returns table(asset_id uuid, storage_path text, status text, created boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  max_open constant int := 10;   -- in flight, per owner
  max_clips constant int := 12;  -- total, per generation
  quota constant bigint := 21474836480; -- 20 GB per owner, the source quota
  gen_owner uuid;
  a public.media_assets;
  ext text;
  label text := nullif(btrim(coalesce(p_label, '')), '');
  scene int := p_scene_number;
  new_id uuid;
  new_path text;
  open_count int;
  clip_count int;
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
  -- A scene is a positive integer, and a scene number with no label is a
  -- placement with nothing to place. The capture surface only ever sends the
  -- pair, so either alone is a caller error rather than a state to tolerate.
  if scene is not null and scene <= 0 then raise exception 'clip_policy_scene'; end if;
  if scene is not null and label is null then raise exception 'clip_policy_scene'; end if;

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
       -- The scene joins the descriptor because the same attempt filling a slot
       -- on a DIFFERENT line is a different intent, exactly as a different
       -- label is — and accepting it would move a clip already recorded.
       or a.clip_scene_number is distinct from scene
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

  -- A PER-GENERATION CEILING, which the open-count above does not give.
  -- That one bounds work IN FLIGHT and drains as captures settle; this bounds
  -- how many a single video can accumulate over its whole life. A screen
  -- recorder in a retry loop settles each clip successfully and then records
  -- another — every one of them `ready`, none of them in flight — and the only
  -- thing that notices is the storage bill. `MAX_OVERLAYS` in the plan contract
  -- is 40, so 12 is well inside what a video could actually show.
  select count(*) into clip_count from public.media_assets m
   where m.owner_id = p_owner and m.generation_id = p_generation
     and m.kind = 'clip' and m.status <> 'deleted';
  if clip_count >= max_clips then
    raise exception 'clip_limit_reached: % clips already on this video', clip_count;
  end if;

  select coalesce(sum(m.size_bytes), 0) into used_bytes from public.media_assets m
   where m.owner_id = p_owner and m.status <> 'deleted';
  if used_bytes + p_size_bytes > quota then raise exception 'clip_quota_exceeded'; end if;

  new_id := gen_random_uuid();
  new_path := p_owner::text || '/' || p_generation::text || '/' || new_id::text || '.' || ext;
  insert into public.media_assets (
    id, owner_id, generation_id, kind, recording_attempt_id,
    bucket, storage_path, mime_type, size_bytes, clip_label, clip_scene_number, status
  ) values (
    new_id, p_owner, p_generation, 'clip', p_attempt,
    p_bucket, new_path, p_mime, p_size_bytes, label, scene, 'uploading'
  ) returning * into a;

  return query select a.id, a.storage_path, a.status, true;
end;
$$;

-- Service role only, as 0107 had it: the edge function verifies the caller and
-- then calls this, and a client that could call it directly could mint an asset
-- row for a generation it does not own.
revoke all on function public.editor_create_clip_asset(uuid, uuid, uuid, text, text, text, bigint, int)
  from public, anon, authenticated;
grant execute on function public.editor_create_clip_asset(uuid, uuid, uuid, text, text, text, bigint, int)
  to service_role;

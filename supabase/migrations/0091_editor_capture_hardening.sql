-- Editor v2 — Phase 7 exit correction: capture-provenance HARDENING.
--
-- 0090 was already applied to the shared staging project, so its contents are
-- immutable history. This FORWARD migration carries the audit-mandated
-- corrections on top of the live 0090 (all statements are CREATE OR REPLACE /
-- ADD COLUMN IF NOT EXISTS / DROP+CREATE POLICY, so re-applying is safe):
--
--   1. NEW-ERA MARKER: media_assets.capture_contract_version distinguishes new
--      capture-aware sources from true legacy assets SERVER-SIDE, so an absent
--      intent can never masquerade as "legacy" and let a source reach `ready`
--      without provenance.
--   2. Ready-flip guard keyed on the marker (any origin), replacing 0090's
--      teleprompter-intent-only guard. Legacy assets (NULL marker) unaffected.
--   3. editor_write_capture_manifest becomes fully CONFLICT-VERIFYING on EVERY
--      path (settled / pre-existing / concurrent-insert): an existing manifest
--      is accepted only if origin, owner, intent hash, normalization version,
--      manifest hash AND the manifest JSON are all identical; otherwise it fails
--      closed with capture_manifest_conflict. Plus owner/source/intent
--      integrity checks.
--   4. Capture-table read RLS widened to owner + workspace peers (sharing seam).
--
-- No compiler/renderer/output. Zero-delta boundary holds.

-- ---------------------------------------------------------------------------
-- 1. New-era marker.
-- ---------------------------------------------------------------------------
alter table public.media_assets
  add column if not exists capture_contract_version integer;

-- The marker is either absent (true legacy) or exactly the current era (1).
alter table public.media_assets
  drop constraint if exists media_assets_capture_contract_version_check;
alter table public.media_assets
  add constraint media_assets_capture_contract_version_check
  check (capture_contract_version is null or capture_contract_version = 1);

-- ---------------------------------------------------------------------------
-- 2. Ready-flip guard: a NEW-ERA source (marker not null) can NEVER become
--    `ready` without its normalized capture manifest — regardless of origin.
-- ---------------------------------------------------------------------------
create or replace function public.editor_capture_ready_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare has_manifest boolean;
begin
  if new.status = 'ready' and old.status is distinct from 'ready' and new.kind = 'source'
     and new.capture_contract_version is not null then
    select exists(
      select 1 from public.source_capture_manifests m where m.source_asset_id = new.id
    ) into has_manifest;
    if not has_manifest then
      raise exception 'capture_manifest_required: new-era source % cannot be ready without a normalized capture manifest', new.id
        using errcode = 'raise_exception';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists media_assets_capture_ready_guard on public.media_assets;
create trigger media_assets_capture_ready_guard
  before update of status on public.media_assets
  for each row execute function public.editor_capture_ready_guard();

-- ---------------------------------------------------------------------------
-- 3. Fully conflict-verifying manifest writer.
-- ---------------------------------------------------------------------------
create or replace function public.editor_write_capture_manifest(
  p_asset uuid,
  p_origin text,
  p_intent_sha256 text,
  p_manifest jsonb,
  p_manifest_sha256 text,
  p_normalization_version text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  a public.media_assets;
  intent_row public.source_capture_intents;
  existing public.source_capture_manifests;
begin
  select * into a from public.media_assets where id = p_asset;
  if not found then
    raise exception 'capture_manifest_asset_missing: %', p_asset;
  end if;

  -- SETTLED (outside the validating window): a stale/late writer. If a manifest
  -- already exists it must be EXACTLY this one (idempotent recovery); ANY
  -- divergence — including a different manifest JSON — fails closed. If none
  -- exists, there is nothing to write (lost race), return null.
  if a.status <> 'validating' then
    select * into existing from public.source_capture_manifests where source_asset_id = p_asset;
    if found then
      if existing.origin is distinct from p_origin
         or existing.owner_id is distinct from a.owner_id
         or existing.intent_sha256 is distinct from p_intent_sha256
         or existing.normalization_version is distinct from p_normalization_version
         or existing.manifest_sha256 is distinct from p_manifest_sha256
         or existing.manifest is distinct from p_manifest then
        raise exception 'capture_manifest_conflict: settled asset % has a divergent manifest', p_asset;
      end if;
      return existing.id;
    end if;
    return null;
  end if;

  select * into intent_row from public.source_capture_intents where source_asset_id = p_asset;
  if not found then
    raise exception 'capture_manifest_no_intent: asset % has no capture intent', p_asset;
  end if;

  -- INTEGRITY: the intent must bind to THIS asset and owner, and the caller's
  -- origin + intent hash must equal the stored intent.
  if intent_row.owner_id is distinct from a.owner_id then
    raise exception 'capture_manifest_owner_mismatch: intent owner does not match asset % owner', p_asset;
  end if;
  if intent_row.source_asset_id is distinct from p_asset then
    raise exception 'capture_manifest_asset_mismatch: intent not bound to asset %', p_asset;
  end if;
  if intent_row.origin is distinct from p_origin then
    raise exception 'capture_manifest_origin_mismatch: intent % vs manifest %', intent_row.origin, p_origin;
  end if;
  if intent_row.intent_sha256 is distinct from p_intent_sha256 then
    raise exception 'capture_manifest_intent_mismatch: manifest not bound to the stored intent';
  end if;

  -- PRE-EXISTING: identical → idempotent; any divergence (incl. JSON) → closed.
  select * into existing from public.source_capture_manifests where source_asset_id = p_asset;
  if found then
    if existing.origin is distinct from p_origin
       or existing.owner_id is distinct from a.owner_id
       or existing.intent_sha256 is distinct from p_intent_sha256
       or existing.normalization_version is distinct from p_normalization_version
       or existing.manifest_sha256 is distinct from p_manifest_sha256
       or existing.manifest is distinct from p_manifest then
      raise exception 'capture_manifest_conflict: a divergent manifest already exists for %', p_asset;
    end if;
    return existing.id;
  end if;

  insert into public.source_capture_manifests
    (source_asset_id, owner_id, origin, intent_sha256, manifest, manifest_sha256, normalization_version)
  values
    (p_asset, a.owner_id, p_origin, p_intent_sha256, p_manifest, p_manifest_sha256, p_normalization_version)
  on conflict (source_asset_id) do nothing;

  -- CONCURRENT INSERT: another writer may have won between the check and insert.
  -- Re-read and verify the winning row is byte-identical (hash AND JSON), else
  -- fail closed.
  select * into existing from public.source_capture_manifests where source_asset_id = p_asset;
  if existing.origin is distinct from p_origin
     or existing.owner_id is distinct from a.owner_id
     or existing.intent_sha256 is distinct from p_intent_sha256
     or existing.normalization_version is distinct from p_normalization_version
     or existing.manifest_sha256 is distinct from p_manifest_sha256
     or existing.manifest is distinct from p_manifest then
    raise exception 'capture_manifest_conflict: a concurrent divergent manifest exists for %', p_asset;
  end if;
  return existing.id;
end;
$$;

revoke all on function public.editor_write_capture_manifest(uuid, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.editor_write_capture_manifest(uuid, text, text, jsonb, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Read RLS widened to owner + workspace peers (constitution sharing seam).
-- ---------------------------------------------------------------------------
drop policy if exists source_capture_intents_owner_read on public.source_capture_intents;
create policy source_capture_intents_owner_read
  on public.source_capture_intents for select
  using (owner_id = auth.uid() or owner_id in (select public.workspace_peers()));

drop policy if exists source_capture_manifests_owner_read on public.source_capture_manifests;
create policy source_capture_manifests_owner_read
  on public.source_capture_manifests for select
  using (owner_id = auth.uid() or owner_id in (select public.workspace_peers()));

-- ---------------------------------------------------------------------------
-- 5. Gate-D (Constitution §10D): ONE server-authoritative, transactional
--    source-create RPC + its helpers. Everything between the extraction markers
--    is SELF-CONTAINED (media_assets / generations / source_capture_intents +
--    pgcrypto) so scripts/db-tests/gate-d/run.sh loads the AUTHORITATIVE
--    definitions straight from THIS file.
--
-- The DB is an INDEPENDENT authority: editor_validate_capture_input re-enforces
-- the COMPLETE frozen SourceCaptureIntentInputV1 contract (same stable codes as
-- shared capture.ts), the numeric contract mirrors shared Number.isSafeInteger
-- (numeric integral + [0, 2^53-1], so JSON 1.0 is accepted and 1.5 / >2^53-1 are
-- rejected without any bigint-overflow error), and the create RPC constrains
-- every policy arg (bucket/mime/size) and enforces caps under an OWNER-scoped
-- lock so concurrent DISTINCT attempts cannot both cross a boundary.
-- ---------------------------------------------------------------------------
-- >>> GATE-D-FUNCTIONS-BEGIN (extracted verbatim by scripts/db-tests/gate-d/run.sh)

-- Canonical serialization of one accepted-segments array. Numbers are emitted
-- via trunc(numeric)::text so an integral float on the wire (e.g. 2000.0) is
-- byte-identical to JSON.stringify(2000) — matching shared canonicalJson.
create or replace function public.editor_capture_segments_canonical(segs jsonb)
returns text language sql immutable as $$
  select '[' || coalesce((
    select string_agg(
      '{"endMs":' || trunc((seg->>'endMs')::numeric)::text
      || ',"intendedDialogueSha256":' || to_jsonb(seg->>'intendedDialogueSha256')::text
      || ',"sceneNumber":' || trunc((seg->>'sceneNumber')::numeric)::text
      || ',"startMs":' || trunc((seg->>'startMs')::numeric)::text
      || '}', ',' order by ord)
    from jsonb_array_elements(coalesce(segs, '[]'::jsonb)) with ordinality as t(seg, ord)
  ), '') || ']'
$$;

-- Canonical of the BROWSER INPUT projection (no sourceAssetId / recordedAt).
-- Byte-identical to shared canonicalJson(SourceCaptureIntentInputV1).
create or replace function public.editor_capture_intent_input_canonical(p jsonb)
returns text language sql immutable as $$
  select '{'
    || '"acceptedSegments":' || public.editor_capture_segments_canonical(p->'acceptedSegments') || ','
    || '"clientAttemptId":' || to_jsonb(p->>'clientAttemptId')::text || ','
    || '"generationId":' || to_jsonb(p->>'generationId')::text || ','
    || '"origin":' || to_jsonb(p->>'origin')::text || ','
    || '"recorderClock":' || to_jsonb(p->>'recorderClock')::text || ','
    || '"recordingScriptSha256":' || (case when jsonb_typeof(p->'recordingScriptSha256')='null'
                                          then 'null' else to_jsonb(p->>'recordingScriptSha256')::text end) || ','
    || '"schemaVersion":1'
    || '}'
$$;

-- Canonical of the STORED intent (what intent_sha256 covers): input projection
-- PLUS the server-authority sourceAssetId + recordedAt, sorted.
create or replace function public.editor_capture_intent_canonical(p jsonb)
returns text language sql immutable as $$
  select '{'
    || '"acceptedSegments":' || public.editor_capture_segments_canonical(p->'acceptedSegments') || ','
    || '"clientAttemptId":' || to_jsonb(p->>'clientAttemptId')::text || ','
    || '"generationId":' || to_jsonb(p->>'generationId')::text || ','
    || '"origin":' || to_jsonb(p->>'origin')::text || ','
    || '"recordedAt":' || to_jsonb(p->>'recordedAt')::text || ','
    || '"recorderClock":' || to_jsonb(p->>'recorderClock')::text || ','
    || '"recordingScriptSha256":' || (case when jsonb_typeof(p->'recordingScriptSha256')='null'
                                          then 'null' else to_jsonb(p->>'recordingScriptSha256')::text end) || ','
    || '"schemaVersion":1,'
    || '"sourceAssetId":' || to_jsonb(p->>'sourceAssetId')::text
    || '}'
$$;

create or replace function public.editor_capture_intent_sha256(p jsonb)
returns text language sql immutable as $$
  select encode(digest(convert_to(public.editor_capture_intent_canonical(p), 'UTF8'), 'sha256'), 'hex')
$$;

-- INDEPENDENT full-contract validation of the client SourceCaptureIntentInputV1.
-- Reads only client-authority keys (server fields ignored, so it also revalidates
-- a stored doc). Bounded numeric contract: number type + integral + [0, 2^53-1]
-- (sceneNumber >= 1), checked in `numeric` so a huge value cannot overflow.
create or replace function public.editor_validate_capture_input(
  p jsonb, p_uuid_gen uuid default null, p_uuid_attempt uuid default null
) returns void language plpgsql immutable as $$
declare
  origin text; segs jsonb; seg jsonb; n int;
  prev_end numeric := -1; seen numeric[] := '{}';
  sc numeric; st numeric; en numeric;
  maxint constant numeric := 9007199254740991; -- 2^53-1
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'capture_intent_not_object'; end if;
  if jsonb_typeof(p->'schemaVersion') <> 'number' or (p->>'schemaVersion')::numeric <> 1 then raise exception 'capture_intent_schema'; end if;
  origin := p->>'origin';
  if origin is null or origin not in ('teleprompter','upload') then raise exception 'capture_intent_bad_origin'; end if;
  if (p->>'generationId') !~ uuid_re then raise exception 'capture_intent_bad_id'; end if;
  if (p->>'clientAttemptId') !~ uuid_re then raise exception 'capture_intent_bad_id'; end if;
  if p_uuid_gen is not null and (p->>'generationId') is distinct from p_uuid_gen::text then raise exception 'capture_intent_generation_mismatch'; end if;
  if p_uuid_attempt is not null and (p->>'clientAttemptId') is distinct from p_uuid_attempt::text then raise exception 'capture_intent_attempt_mismatch'; end if;

  -- recordingScriptSha256 key MUST be present for BOTH origins (undefined != null).
  if not (p ? 'recordingScriptSha256') then
    if origin = 'teleprompter' then raise exception 'capture_intent_bad_script_sha'; else raise exception 'capture_intent_upload_shape'; end if;
  end if;
  if origin = 'teleprompter' then
    if (p->>'recordingScriptSha256') !~ '^[0-9a-f]{64}$' then raise exception 'capture_intent_bad_script_sha'; end if;
    if (p->>'recorderClock') is distinct from 'mediarecorder-active-time-ms' then raise exception 'capture_intent_bad_clock'; end if;
  else
    if jsonb_typeof(p->'recordingScriptSha256') <> 'null' then raise exception 'capture_intent_upload_shape'; end if;
    if (p->>'recorderClock') is distinct from 'none' then raise exception 'capture_intent_upload_shape'; end if;
  end if;

  if jsonb_typeof(p->'acceptedSegments') <> 'array' then raise exception 'capture_intent_bad_segments'; end if;
  segs := p->'acceptedSegments';
  n := jsonb_array_length(segs);
  if origin = 'upload' then
    if n <> 0 then raise exception 'capture_intent_upload_shape'; end if;
  else
    if n = 0 then raise exception 'capture_intent_no_segments'; end if;
    if n > 200 then raise exception 'capture_intent_too_many'; end if;
  end if;

  for i in 0 .. n - 1 loop
    seg := segs->i;
    if jsonb_typeof(seg) <> 'object' then raise exception 'capture_intent_bad_segments'; end if;
    if jsonb_typeof(seg->'sceneNumber') <> 'number' then raise exception 'capture_intent_bad_scene'; end if;
    sc := (seg->>'sceneNumber')::numeric;
    if sc <> trunc(sc) or sc < 1 or sc > maxint then raise exception 'capture_intent_bad_scene'; end if;
    if sc = any(seen) then raise exception 'capture_intent_dup_scene'; end if;
    seen := seen || sc;
    if jsonb_typeof(seg->'startMs') <> 'number' then raise exception 'capture_intent_bad_time'; end if;
    if jsonb_typeof(seg->'endMs') <> 'number' then raise exception 'capture_intent_bad_time'; end if;
    st := (seg->>'startMs')::numeric; en := (seg->>'endMs')::numeric;
    if st <> trunc(st) or st < 0 or st > maxint then raise exception 'capture_intent_bad_time'; end if;
    if en <> trunc(en) or en < 0 or en > maxint then raise exception 'capture_intent_bad_time'; end if;
    if en - st < 250 then raise exception 'capture_intent_short_segment'; end if;
    if st < prev_end then raise exception 'capture_intent_overlap'; end if;
    prev_end := en;
    if (seg->>'intendedDialogueSha256') !~ '^[0-9a-f]{64}$' then raise exception 'capture_intent_bad_dialogue_sha'; end if;
  end loop;

  -- Byte cap on the INPUT canonical (server fields excluded) — a real value, not
  -- the previous NULL-concatenation no-op.
  if octet_length(convert_to(public.editor_capture_intent_input_canonical(p), 'UTF8')) > 65536 then
    raise exception 'capture_intent_too_large';
  end if;
end;
$$;

-- Build the STORED intent jsonb from client input + server-authority fields.
create or replace function public.editor_build_stored_intent(
  p_input jsonb, p_asset uuid, p_generation uuid, p_attempt uuid, p_recorded_at text
) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'origin', p_input->>'origin',
    'generationId', p_generation::text,
    'sourceAssetId', p_asset::text,
    'recordingScriptSha256', case when (p_input->>'recordingScriptSha256') is null then null else to_jsonb(p_input->>'recordingScriptSha256') end,
    'clientAttemptId', p_attempt::text,
    'recorderClock', p_input->>'recorderClock',
    'acceptedSegments', coalesce(p_input->'acceptedSegments', '[]'::jsonb),
    'recordedAt', p_recorded_at
  )
$$;

create or replace function public.editor_create_source_asset(
  p_owner uuid,
  p_generation uuid,
  p_attempt uuid,
  p_input jsonb,
  p_bucket text,
  p_mime text,
  p_size_bytes bigint
) returns table(asset_id uuid, storage_path text, status text, intent_sha256 text, created boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  max_open constant int := 5;
  quota constant bigint := 21474836480; -- 20 GB per owner
  gen_owner uuid;
  a public.media_assets;
  existing_intent public.source_capture_intents;
  origin text := p_input->>'origin';
  script_sha text := nullif(p_input->>'recordingScriptSha256','');
  ext text;
  recorded_at_str text;
  stored jsonb;
  computed_sha text;
  new_id uuid;
  new_path text;
  open_count int;
  used_bytes bigint;
begin
  if p_bucket is distinct from 'takes' then raise exception 'source_policy_bucket'; end if;
  if p_mime not in ('video/webm','video/mp4','video/quicktime') then raise exception 'source_policy_mime'; end if;
  ext := case when p_mime = 'video/webm' then 'webm' else 'mp4' end;
  if p_size_bytes is null or p_size_bytes < 2048 or p_size_bytes > 629145600 then raise exception 'source_policy_size'; end if;

  -- OWNER-scoped lock: serializes ALL creates for one owner, so same-attempt
  -- retries converge AND concurrent DISTINCT attempts cannot both pass a cap.
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 0));

  select user_id into gen_owner from public.generations where id = p_generation;
  if gen_owner is null or gen_owner is distinct from p_owner then
    raise exception 'source_generation_not_owned: % / %', p_owner, p_generation using errcode = 'raise_exception';
  end if;

  perform public.editor_validate_capture_input(p_input, p_generation, p_attempt);

  select * into a from public.media_assets
   where owner_id = p_owner and generation_id = p_generation and recording_attempt_id = p_attempt;

  if found then
    if a.status in ('rejected','deleted') then
      raise exception 'source_asset_rejected: %', a.id using errcode = 'raise_exception';
    end if;
    -- The retry's upload descriptor must match the stored asset exactly.
    if a.bucket is distinct from p_bucket
       or a.mime_type is distinct from p_mime
       or a.size_bytes is distinct from p_size_bytes
       or a.storage_path not like ('%.' || ext) then
      raise exception 'source_attempt_conflict: divergent upload descriptor for %', a.id using errcode = 'raise_exception';
    end if;
    -- Marker transition: an eligible in-flight legacy row is atomically upgraded;
    -- a settled unmarked row must never masquerade as legacy — fail closed.
    if a.capture_contract_version is null then
      if a.status in ('uploading','validating') then
        update public.media_assets set capture_contract_version = 1 where id = a.id;
        a.capture_contract_version := 1;
      else
        raise exception 'source_attempt_conflict: settled legacy asset % cannot be upgraded', a.id using errcode = 'raise_exception';
      end if;
    end if;

    select * into existing_intent from public.source_capture_intents where source_asset_id = a.id;
    if found then
      recorded_at_str := existing_intent.intent->>'recordedAt';
      stored := public.editor_build_stored_intent(p_input, a.id, p_generation, p_attempt, recorded_at_str);
      perform public.editor_validate_capture_input(stored, p_generation, p_attempt);
      computed_sha := public.editor_capture_intent_sha256(stored);
      -- FULL verify: recomputed sha AND the immutable stored JSON AND every
      -- relational column. A corrupted row whose sha happens to match still fails.
      if computed_sha is distinct from existing_intent.intent_sha256
         or existing_intent.intent is distinct from stored
         or existing_intent.owner_id is distinct from p_owner
         or existing_intent.generation_id is distinct from p_generation
         or existing_intent.source_asset_id is distinct from a.id
         or existing_intent.origin is distinct from origin
         or existing_intent.recording_script_sha256 is distinct from script_sha
         or existing_intent.client_attempt_id is distinct from p_attempt then
        raise exception 'capture_intent_conflict: a different capture intent already exists for %', a.id using errcode = 'raise_exception';
      end if;
      return query select a.id, a.storage_path, a.status, existing_intent.intent_sha256, false;
      return;
    end if;
    -- Just-upgraded / recovery: attach the intent, then RE-READ + fully verify.
    recorded_at_str := to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    stored := public.editor_build_stored_intent(p_input, a.id, p_generation, p_attempt, recorded_at_str);
    perform public.editor_validate_capture_input(stored, p_generation, p_attempt);
    computed_sha := public.editor_capture_intent_sha256(stored);
    insert into public.source_capture_intents
      (source_asset_id, owner_id, generation_id, origin, recording_script_sha256, client_attempt_id, intent, intent_sha256, recorded_at)
    values (a.id, p_owner, p_generation, origin, script_sha, p_attempt, stored, computed_sha, recorded_at_str::timestamptz)
    on conflict (source_asset_id) do nothing;
    select * into existing_intent from public.source_capture_intents where source_asset_id = a.id;
    if existing_intent.intent_sha256 is distinct from computed_sha
       or existing_intent.intent is distinct from stored
       or existing_intent.owner_id is distinct from p_owner
       or existing_intent.generation_id is distinct from p_generation
       or existing_intent.origin is distinct from origin
       or existing_intent.recording_script_sha256 is distinct from script_sha
       or existing_intent.client_attempt_id is distinct from p_attempt then
      raise exception 'capture_intent_conflict: a concurrent divergent intent exists for %', a.id using errcode = 'raise_exception';
    end if;
    return query select a.id, a.storage_path, a.status, existing_intent.intent_sha256, false;
    return;
  end if;

  -- New asset: caps enforced under the owner lock (race-free across attempts).
  select count(*) into open_count from public.media_assets m
   where m.owner_id = p_owner and m.kind = 'source' and m.status in ('uploading','validating');
  if open_count >= max_open then
    raise exception 'source_too_many_open' using errcode = 'raise_exception';
  end if;
  select coalesce(sum(m.size_bytes),0) into used_bytes from public.media_assets m
   where m.owner_id = p_owner and m.status <> 'deleted';
  if used_bytes + p_size_bytes > quota then
    raise exception 'source_quota_exceeded' using errcode = 'raise_exception';
  end if;

  new_id := gen_random_uuid();
  new_path := p_owner::text || '/' || p_generation::text || '/' || new_id::text || '.' || ext;
  recorded_at_str := to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  stored := public.editor_build_stored_intent(p_input, new_id, p_generation, p_attempt, recorded_at_str);
  perform public.editor_validate_capture_input(stored, p_generation, p_attempt);
  computed_sha := public.editor_capture_intent_sha256(stored);

  insert into public.media_assets
    (id, owner_id, generation_id, recording_attempt_id, kind, bucket, storage_path, mime_type, size_bytes, status, capture_contract_version)
  values
    (new_id, p_owner, p_generation, p_attempt, 'source', p_bucket, new_path, p_mime, p_size_bytes, 'uploading', 1);

  insert into public.source_capture_intents
    (source_asset_id, owner_id, generation_id, origin, recording_script_sha256, client_attempt_id, intent, intent_sha256, recorded_at)
  values (new_id, p_owner, p_generation, origin, script_sha, p_attempt, stored, computed_sha, recorded_at_str::timestamptz);

  return query select new_id, new_path, 'uploading'::text, computed_sha, true;
end;
$$;
-- <<< GATE-D-FUNCTIONS-END

-- Service-role-only across EVERY Gate-D function (helpers included).
revoke all on function public.editor_capture_segments_canonical(jsonb) from public, anon, authenticated;
revoke all on function public.editor_capture_intent_input_canonical(jsonb) from public, anon, authenticated;
revoke all on function public.editor_capture_intent_canonical(jsonb) from public, anon, authenticated;
revoke all on function public.editor_capture_intent_sha256(jsonb) from public, anon, authenticated;
revoke all on function public.editor_validate_capture_input(jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.editor_build_stored_intent(jsonb, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.editor_create_source_asset(uuid, uuid, uuid, jsonb, text, text, bigint) from public, anon, authenticated;
grant execute on function public.editor_capture_segments_canonical(jsonb) to service_role;
grant execute on function public.editor_capture_intent_input_canonical(jsonb) to service_role;
grant execute on function public.editor_capture_intent_canonical(jsonb) to service_role;
grant execute on function public.editor_capture_intent_sha256(jsonb) to service_role;
grant execute on function public.editor_validate_capture_input(jsonb, uuid, uuid) to service_role;
grant execute on function public.editor_build_stored_intent(jsonb, uuid, uuid, uuid, text) to service_role;
grant execute on function public.editor_create_source_asset(uuid, uuid, uuid, jsonb, text, text, bigint) to service_role;

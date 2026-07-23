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
--    source-create RPC. Replaces the edge's two separate writes (media_assets
--    INSERT + source_capture_intents INSERT) with a single atomic function so a
--    crash can never leave a new-era orphan. It:
--      * takes an attempt-scoped advisory lock so concurrent first calls with
--        different proposed ids converge on ONE authoritative asset,
--      * verifies owner/generation ownership + binds the client input to THIS
--        generation + attempt (embedded ids vs relational truth),
--      * resolves-or-creates the single media_assets row (marker stamped),
--      * constructs the STORED SourceCaptureIntentV1 INSIDE the transaction from
--        the resolved asset id + a server-assigned recordedAt, canonicalizes and
--        hashes it with editor_capture_intent_sha256 (byte-parity with shared
--        canonicalJson — proven by a DB↔TS parity test), and inserts-or-verifies
--        it: identical retry is idempotent, a divergent payload fails closed
--        with capture_intent_conflict,
--      * enforces open-asset + quota caps at mint (race-free under the lock).
--    No upload token is minted by the edge until this RPC succeeds.
-- ---------------------------------------------------------------------------

-- Deterministic canonical serializer for the STORED capture intent. Emits
-- byte-identical output to shared canonicalJson(SourceCaptureIntentV1): sorted
-- top-level keys, sorted segment keys, array order preserved, no insignificant
-- whitespace. All string fields are ASCII (uuids/hex/enums/ISO); to_jsonb(text)
-- escaping matches JSON.stringify (Unicode-safe, proven by parity fixtures).
create or replace function public.editor_capture_intent_canonical(p jsonb)
returns text language sql immutable as $$
  select '{'
    || '"acceptedSegments":[' || coalesce((
         select string_agg(
           '{"endMs":' || (seg->>'endMs')
           || ',"intendedDialogueSha256":' || to_jsonb(seg->>'intendedDialogueSha256')::text
           || ',"sceneNumber":' || (seg->>'sceneNumber')
           || ',"startMs":' || (seg->>'startMs')
           || '}', ',' order by ord)
         from jsonb_array_elements(p->'acceptedSegments') with ordinality as t(seg, ord)
       ), '') || '],'
    || '"clientAttemptId":' || to_jsonb(p->>'clientAttemptId')::text || ','
    || '"generationId":' || to_jsonb(p->>'generationId')::text || ','
    || '"origin":' || to_jsonb(p->>'origin')::text || ','
    || '"recordedAt":' || to_jsonb(p->>'recordedAt')::text || ','
    || '"recorderClock":' || to_jsonb(p->>'recorderClock')::text || ','
    || '"recordingScriptSha256":' || (case when p->'recordingScriptSha256' is null or jsonb_typeof(p->'recordingScriptSha256')='null'
                                          then 'null' else to_jsonb(p->>'recordingScriptSha256')::text end) || ','
    || '"schemaVersion":1,'
    || '"sourceAssetId":' || to_jsonb(p->>'sourceAssetId')::text
    || '}'
$$;

create or replace function public.editor_capture_intent_sha256(p jsonb)
returns text language sql immutable as $$
  select encode(digest(convert_to(public.editor_capture_intent_canonical(p), 'UTF8'), 'sha256'), 'hex')
$$;

-- Build the STORED intent jsonb from client input + server-authority fields,
-- rebuilt field-by-field from RELATIONAL truth (never trusting embedded ids).
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
  p_ext text,
  p_size_bytes bigint,
  p_max_open int,
  p_quota_bytes bigint
) returns table(asset_id uuid, storage_path text, status text, intent_sha256 text, created boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  gen_owner uuid;
  a public.media_assets;
  existing_intent public.source_capture_intents;
  origin text := p_input->>'origin';
  recorded_at_str text;
  stored jsonb;
  computed_sha text;
  new_id uuid;
  new_path text;
  open_count int;
  used_bytes bigint;
begin
  -- Serialize concurrent creates of the SAME recording attempt so the
  -- authoritative asset id is chosen once; late callers block, then resolve.
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':' || p_generation::text || ':' || p_attempt::text, 0));

  select user_id into gen_owner from public.generations where id = p_generation;
  if gen_owner is null or gen_owner is distinct from p_owner then
    raise exception 'source_generation_not_owned: % / %', p_owner, p_generation using errcode = 'raise_exception';
  end if;

  if origin not in ('teleprompter','upload') then
    raise exception 'capture_intent_bad_origin' using errcode = 'raise_exception';
  end if;
  if (p_input->>'generationId') is distinct from p_generation::text then
    raise exception 'capture_intent_generation_mismatch' using errcode = 'raise_exception';
  end if;
  if (p_input->>'clientAttemptId') is distinct from p_attempt::text then
    raise exception 'capture_intent_attempt_mismatch' using errcode = 'raise_exception';
  end if;
  if origin = 'teleprompter' then
    if (p_input->>'recordingScriptSha256') !~ '^[0-9a-f]{64}$' then raise exception 'capture_intent_bad_script_sha'; end if;
    if (p_input->>'recorderClock') is distinct from 'mediarecorder-active-time-ms' then raise exception 'capture_intent_bad_clock'; end if;
    if jsonb_array_length(coalesce(p_input->'acceptedSegments','[]'::jsonb)) = 0 then raise exception 'capture_intent_no_segments'; end if;
  else
    if p_input ? 'recordingScriptSha256' and jsonb_typeof(p_input->'recordingScriptSha256') <> 'null' then raise exception 'capture_intent_upload_shape'; end if;
    if (p_input->>'recorderClock') is distinct from 'none' then raise exception 'capture_intent_upload_shape'; end if;
    if jsonb_array_length(coalesce(p_input->'acceptedSegments','[]'::jsonb)) <> 0 then raise exception 'capture_intent_upload_shape'; end if;
  end if;

  select * into a from public.media_assets
   where owner_id = p_owner and generation_id = p_generation and recording_attempt_id = p_attempt;

  if found then
    if a.status in ('rejected','deleted') then
      raise exception 'source_asset_rejected: %', a.id using errcode = 'raise_exception';
    end if;
    select * into existing_intent from public.source_capture_intents where source_asset_id = a.id;
    if found then
      recorded_at_str := existing_intent.intent->>'recordedAt';
      stored := public.editor_build_stored_intent(p_input, a.id, p_generation, p_attempt, recorded_at_str);
      computed_sha := public.editor_capture_intent_sha256(stored);
      if computed_sha is distinct from existing_intent.intent_sha256 then
        raise exception 'capture_intent_conflict: a different capture intent already exists for %', a.id using errcode = 'raise_exception';
      end if;
      return query select a.id, a.storage_path, a.status, existing_intent.intent_sha256, false;
      return;
    end if;
    -- Marked asset without intent (recovery): bind one now.
    recorded_at_str := to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    stored := public.editor_build_stored_intent(p_input, a.id, p_generation, p_attempt, recorded_at_str);
    computed_sha := public.editor_capture_intent_sha256(stored);
    insert into public.source_capture_intents
      (source_asset_id, owner_id, generation_id, origin, recording_script_sha256, client_attempt_id, intent, intent_sha256, recorded_at)
    values (a.id, p_owner, p_generation, origin, nullif(p_input->>'recordingScriptSha256',''), p_attempt, stored, computed_sha, recorded_at_str::timestamptz)
    on conflict (source_asset_id) do nothing;
    return query select a.id, a.storage_path, a.status, computed_sha, false;
    return;
  end if;

  select count(*) into open_count from public.media_assets m
   where m.owner_id = p_owner and m.kind = 'source' and m.status in ('uploading','validating');
  if open_count >= p_max_open then
    raise exception 'source_too_many_open' using errcode = 'raise_exception';
  end if;
  select coalesce(sum(m.size_bytes),0) into used_bytes from public.media_assets m
   where m.owner_id = p_owner and m.status <> 'deleted';
  if used_bytes + p_size_bytes > p_quota_bytes then
    raise exception 'source_quota_exceeded' using errcode = 'raise_exception';
  end if;

  new_id := gen_random_uuid();
  new_path := p_owner::text || '/' || p_generation::text || '/' || new_id::text || '.' || p_ext;
  recorded_at_str := to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  stored := public.editor_build_stored_intent(p_input, new_id, p_generation, p_attempt, recorded_at_str);
  computed_sha := public.editor_capture_intent_sha256(stored);

  insert into public.media_assets
    (id, owner_id, generation_id, recording_attempt_id, kind, bucket, storage_path, mime_type, size_bytes, status, capture_contract_version)
  values
    (new_id, p_owner, p_generation, p_attempt, 'source', p_bucket, new_path, p_mime, p_size_bytes, 'uploading', 1);

  insert into public.source_capture_intents
    (source_asset_id, owner_id, generation_id, origin, recording_script_sha256, client_attempt_id, intent, intent_sha256, recorded_at)
  values (new_id, p_owner, p_generation, origin, nullif(p_input->>'recordingScriptSha256',''), p_attempt, stored, computed_sha, recorded_at_str::timestamptz);

  return query select new_id, new_path, 'uploading'::text, computed_sha, true;
end;
$$;

revoke all on function public.editor_create_source_asset(uuid, uuid, uuid, jsonb, text, text, text, bigint, int, bigint) from public, anon, authenticated;
grant execute on function public.editor_create_source_asset(uuid, uuid, uuid, jsonb, text, text, text, bigint, int, bigint) to service_role;

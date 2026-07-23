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
-- 4b. SOURCE-BOUND recording-script snapshot (Constitution §5.1 / Boot).
--     The ONE canonical Recording-Script snapshot, captured at CREATE time and
--     bound to the source asset — so Boot pins the script the take was recorded
--     against, NEVER the current (possibly-since-edited) generation script.
--     Append-only + set-once per source; owner-scoped read RLS.
-- ---------------------------------------------------------------------------
-- generation_id is NOT NULL: a row exists ONLY for a teleprompter take, which always
-- binds to its generation. Uploads get NO row (their provenance is the no-captured-
-- script form), so this table can never hold a script-less binding.
create table if not exists public.source_script_snapshots (
  source_asset_id uuid primary key references public.media_assets(id) on delete cascade,
  owner_id uuid not null,
  generation_id uuid not null,
  snapshot jsonb not null,
  snapshot_sha text not null check (snapshot_sha ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.source_script_snapshots enable row level security;
drop trigger if exists source_script_snapshots_immutable on public.source_script_snapshots;
create trigger source_script_snapshots_immutable before update or delete on public.source_script_snapshots
  for each row execute function public.editor_capture_no_mutate();
-- Read: owner + workspace peers. Writes: NONE for anon/authenticated (only the
-- SECURITY DEFINER create RPC writes, as the table owner). No INSERT/UPDATE/DELETE
-- policy exists, and the direct table grants are revoked, so a client cannot write.
drop policy if exists source_script_snapshots_owner_read on public.source_script_snapshots;
create policy source_script_snapshots_owner_read
  on public.source_script_snapshots for select
  using (owner_id = auth.uid() or owner_id in (select public.workspace_peers()));
revoke insert, update, delete on public.source_script_snapshots from anon, authenticated;

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

-- ---- ONE canonical Recording-Script snapshot (Constitution §5.1 / Boot) --------
-- Byte-identical to shared buildRecordingScriptSnapshot: NFC-normalize strings,
-- collapse every run of WhiteSpace ∪ LineTerminator (JS `\s`: all Unicode Zs plus
-- TAB/LF/VT/FF/CR and U+FEFF — the class is spelled out so the bytes match) to a
-- single space, then trim.
create or replace function public.editor_snapshot_normalize(s text)
returns text language sql immutable as $$
  select btrim(regexp_replace(
    normalize(s, NFC),
    '[\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+',
    ' ', 'g'))
$$;

-- Canonical of the FULL, unfiltered recording script from a generation's
-- scene_timeline + selected_hook. Keys sorted (generationId, hook, scenes,
-- schemaVersion); each scene sorted (dialogue, sceneNumber, sceneType,
-- showInTeleprompter). Matches shared canonicalJson exactly.
create or replace function public.editor_recording_script_canonical(
  p_generation uuid, p_scene_timeline jsonb, p_selected_hook text
) returns text language sql immutable as $$
  with tl as (
    select case when jsonb_typeof(p_scene_timeline) = 'object' then p_scene_timeline else null end as t
  ),
  hk as (
    select case
      when (select jsonb_typeof(t->'hook') from tl) = 'string' then (select t->>'hook' from tl)
      else p_selected_hook end as raw
  ),
  hook_norm as (
    select case when raw is not null and public.editor_snapshot_normalize(raw) <> ''
      then public.editor_snapshot_normalize(raw) else null end as hn from hk
  ),
  body as (
    select coalesce((
      select string_agg(
        '{"dialogue":' || (case when jsonb_typeof(s->'dialogue') = 'string'
                                then to_jsonb(public.editor_snapshot_normalize(s->>'dialogue'))::text else 'null' end)
        || ',"sceneNumber":' || (case when jsonb_typeof(s->'scene_number') = 'number'
                                        and (s->>'scene_number')::numeric = trunc((s->>'scene_number')::numeric)
                                      then trunc((s->>'scene_number')::numeric)::text else ord::text end)
        || ',"sceneType":' || (case when jsonb_typeof(s->'scene_type') = 'string'
                                    then to_jsonb(public.editor_snapshot_normalize(s->>'scene_type'))::text else '"talking_head"' end)
        || ',"showInTeleprompter":' || (case when (s->'show_in_teleprompter') is distinct from to_jsonb(false) then 'true' else 'false' end)
        || '}', ',' order by ord)
      from tl, lateral jsonb_array_elements(coalesce((select t->'scenes' from tl), '[]'::jsonb)) with ordinality as e(s, ord)
    ), '') as scenes
  )
  select '{'
    || '"generationId":' || to_jsonb(p_generation::text)::text || ','
    || '"hook":' || (select case when hn is null then 'null' else to_jsonb(hn)::text end from hook_norm) || ','
    || '"scenes":[' || (select scenes from body) || '],'
    || '"schemaVersion":1'
    || '}'
$$;

create or replace function public.editor_recording_script_sha256(
  p_generation uuid, p_scene_timeline jsonb, p_selected_hook text
) returns text language sql immutable as $$
  select encode(digest(convert_to(
    public.editor_recording_script_canonical(p_generation, p_scene_timeline, p_selected_hook), 'UTF8'), 'sha256'), 'hex')
$$;

-- Recorder→DB acceptance policy (Constitution §5.1), UNAMBIGUOUS:
--   * Build the ORDERED teleprompter scene list (array order, show_in_teleprompter
--     unless explicitly false). A DUPLICATE scene_number among teleprompter scenes is
--     ambiguous → capture_script_ambiguous_scene (no arbitrary LIMIT 1 pick).
--   * Each accepted segment must map to a TELEPROMPTER scene (a hidden/non-teleprompter
--     or absent scene → capture_segment_not_teleprompter), appear in STRICTLY
--     INCREASING teleprompter order (a documented ordered subset; gaps allowed) →
--     capture_segment_order otherwise, and its intendedDialogueSha256 must equal
--     sha256(NFC(dialogue)) (NFC-only, matching shared normalizeDialogue; null→'').
create or replace function public.editor_verify_capture_dialogue_shas(
  p_scene_timeline jsonb, p_segments jsonb
) returns void language plpgsql immutable as $$
declare
  s jsonb; sc numeric;
  tele_nums numeric[] := '{}';
  tele_dlg text[] := '{}';
  seg jsonb; pos int; prev_pos int := 0; want text;
begin
  for s in select value from jsonb_array_elements(coalesce(p_scene_timeline->'scenes', '[]'::jsonb)) loop
    if (s->'show_in_teleprompter') is distinct from to_jsonb(false) then
      if jsonb_typeof(s->'scene_number') <> 'number' then
        raise exception 'capture_script_ambiguous_scene: non-numeric teleprompter scene_number' using errcode = 'raise_exception';
      end if;
      sc := (s->>'scene_number')::numeric;
      if sc = any(tele_nums) then
        raise exception 'capture_script_ambiguous_scene: duplicate scene %', sc using errcode = 'raise_exception';
      end if;
      tele_nums := tele_nums || sc;
      tele_dlg := tele_dlg || coalesce(s->>'dialogue', '');
    end if;
  end loop;

  for seg in select value from jsonb_array_elements(coalesce(p_segments, '[]'::jsonb)) loop
    sc := (seg->>'sceneNumber')::numeric;
    pos := array_position(tele_nums, sc);
    if pos is null then
      raise exception 'capture_segment_not_teleprompter: scene %', sc using errcode = 'raise_exception';
    end if;
    if pos <= prev_pos then
      raise exception 'capture_segment_order: scene % out of teleprompter order', sc using errcode = 'raise_exception';
    end if;
    prev_pos := pos;
    want := encode(digest(convert_to(normalize(tele_dlg[pos], NFC), 'UTF8'), 'sha256'), 'hex');
    if (seg->>'intendedDialogueSha256') is distinct from want then
      raise exception 'capture_dialogue_sha_mismatch: scene %', sc using errcode = 'raise_exception';
    end if;
  end loop;
end;
$$;

-- INDEPENDENT full-contract validation of the client SourceCaptureIntentInputV1.
-- Reads only client-authority keys (server fields ignored, so it also revalidates
-- a stored doc). Bounded numeric contract: number type + integral + [0, 2^53-1]
-- (sceneNumber >= 1), checked in `numeric` so a huge value cannot overflow.
create or replace function public.editor_validate_capture_input(
  p jsonb, p_uuid_gen uuid default null, p_uuid_attempt uuid default null, p_allow_server boolean default false
) returns void language plpgsql immutable as $$
declare
  origin text; segs jsonb; seg jsonb; n int; k text;
  prev_end numeric := -1; seen numeric[] := '{}';
  sc numeric; st numeric; en numeric;
  maxint constant numeric := 9007199254740991; -- 2^53-1
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  recorded_re constant text := '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$';
  input_keys constant text[] := array['schemaVersion','origin','generationId','recordingScriptSha256','clientAttemptId','recorderClock','acceptedSegments'];
  seg_keys constant text[] := array['sceneNumber','startMs','endMs','intendedDialogueSha256'];
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'capture_intent_not_object'; end if;
  -- Unknown top-level keys FAIL (Constitution §5.1). Stored form additionally
  -- allows the two server-authority keys.
  for k in select jsonb_object_keys(p) loop
    if not (k = any(input_keys) or (p_allow_server and k in ('sourceAssetId','recordedAt'))) then
      raise exception 'capture_intent_unknown_key: %', k;
    end if;
  end loop;
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
    for k in select jsonb_object_keys(seg) loop
      if not (k = any(seg_keys)) then raise exception 'capture_intent_unknown_segment_key: %', k; end if;
    end loop;
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

  -- Stored form: the server-authority fields must be present + well-formed.
  if p_allow_server then
    if (p->>'sourceAssetId') is null or (p->>'sourceAssetId') !~ uuid_re then raise exception 'capture_intent_bad_id'; end if;
    if (p->>'recordedAt') is null or (p->>'recordedAt') !~ recorded_re then raise exception 'capture_intent_bad_recorded_at'; end if;
  end if;

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

-- Verify + persist the SOURCE-BOUND recording-script snapshot in the same create
-- transaction — TELEPROMPTER ONLY. An UPLOAD was not recorded against a script, so it
-- gets NO source_script_snapshots row (Boot builds the explicit no-captured-script
-- form deterministically). For teleprompter the asserted recordingScriptSha256 must
-- equal the server-recomputed snapshot SHA (ONE canonical), every accepted segment's
-- dialogue SHA + teleprompter membership + order must hold, and the canonical is
-- size-capped exactly like shared. Persist is set-once per source (append-only table).
create or replace function public.editor_persist_script_binding(
  p_asset uuid, p_owner uuid, p_generation uuid, p_origin text, p_script_sha text,
  p_snap_canonical text, p_snap_sha text, p_scene_timeline jsonb, p_segments jsonb
) returns void language plpgsql as $$
begin
  -- Upload: NEVER recast as recorded-against-script — no snapshot row at all.
  if p_origin <> 'teleprompter' then return; end if;
  if octet_length(convert_to(p_snap_canonical, 'UTF8')) > 65536 then
    raise exception 'script_snapshot_too_large' using errcode = 'raise_exception';
  end if;
  if p_script_sha is distinct from p_snap_sha then
    raise exception 'capture_script_sha_mismatch: asserted % vs script %', p_script_sha, p_snap_sha using errcode = 'raise_exception';
  end if;
  perform public.editor_verify_capture_dialogue_shas(p_scene_timeline, p_segments);
  insert into public.source_script_snapshots (source_asset_id, owner_id, generation_id, snapshot, snapshot_sha)
  values (p_asset, p_owner, p_generation, p_snap_canonical::jsonb, p_snap_sha)
  on conflict (source_asset_id) do nothing;
end;
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
  gen_scene_timeline jsonb;
  gen_selected_hook text;
  snap_canonical text;
  snap_sha text;
  a public.media_assets;
  existing_intent public.source_capture_intents;
  origin text := p_input->>'origin';
  script_sha text := nullif(p_input->>'recordingScriptSha256','');
  ext text;
  recorded_at_str text;
  stored jsonb;
  computed_sha text;
  -- snap declared above (gen_scene_timeline / snap_canonical / snap_sha)
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

  select user_id, scene_timeline, selected_hook
    into gen_owner, gen_scene_timeline, gen_selected_hook
    from public.generations where id = p_generation;
  if gen_owner is null or gen_owner is distinct from p_owner then
    raise exception 'source_generation_not_owned: % / %', p_owner, p_generation using errcode = 'raise_exception';
  end if;

  perform public.editor_validate_capture_input(p_input, p_generation, p_attempt);

  -- ONE canonical recording-script snapshot, bound to THIS source at capture time.
  -- Computed from the generation's script NOW so Boot later pins the script the take
  -- was recorded against, never a since-edited generation. The verify (teleprompter
  -- SHA + dialogue SHAs) and the persist happen ONLY on the two first-persist paths
  -- below; an idempotent retry converges via the immutable stored-intent comparison
  -- (so a since-edited generation never breaks a legitimate retry).
  snap_canonical := public.editor_recording_script_canonical(p_generation, gen_scene_timeline, gen_selected_hook);
  snap_sha := encode(digest(convert_to(snap_canonical, 'UTF8'), 'sha256'), 'hex');

  -- Row-lock the existing attempt (item 3): serializes this create against the
  -- validation/ready-completion transaction, so a marker upgrade + intent attach
  -- cannot race a status flip to `ready` — the ready guard stays authoritative.
  select * into a from public.media_assets
   where owner_id = p_owner and generation_id = p_generation and recording_attempt_id = p_attempt
   for update;

  if found then
    if a.status in ('rejected','deleted') then
      raise exception 'source_asset_rejected: %', a.id using errcode = 'raise_exception';
    end if;
    -- Marker state machine: only NULL (legacy) or exactly 1 is supported.
    if a.capture_contract_version is not null and a.capture_contract_version <> 1 then
      raise exception 'source_attempt_conflict: unsupported capture_contract_version % on %', a.capture_contract_version, a.id using errcode = 'raise_exception';
    end if;
    -- EXACT server-derived descriptor equality: bucket, mime, size, and the full
    -- owner/generation/asset.ext path (not a suffix). Any divergence fails closed
    -- and leaves the original row unchanged.
    if a.bucket is distinct from p_bucket
       or a.mime_type is distinct from p_mime
       or a.size_bytes is distinct from p_size_bytes
       or a.storage_path is distinct from (p_owner::text || '/' || p_generation::text || '/' || a.id::text || '.' || ext) then
      raise exception 'source_attempt_conflict: divergent upload descriptor for %', a.id using errcode = 'raise_exception';
    end if;

    select * into existing_intent from public.source_capture_intents where source_asset_id = a.id;
    if found then
      -- Row already has an intent. Upgrade a NULL in-flight legacy marker; a
      -- settled legacy row with an intent is inconsistent → fail closed.
      if a.capture_contract_version is null then
        if a.status in ('uploading','validating') then
          update public.media_assets set capture_contract_version = 1 where id = a.id;
        else
          raise exception 'source_attempt_conflict: settled legacy asset % cannot be upgraded', a.id using errcode = 'raise_exception';
        end if;
      end if;
      recorded_at_str := existing_intent.intent->>'recordedAt';
      stored := public.editor_build_stored_intent(p_input, a.id, p_generation, p_attempt, recorded_at_str);
      perform public.editor_validate_capture_input(stored, p_generation, p_attempt, true);
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

    -- No intent yet. Recovery/attach is allowed ONLY for an IN-FLIGHT row (under
    -- the row lock). A SETTLED row with no intent — legacy OR marker-1 — is an
    -- inconsistent state and MUST fail closed: never attach provenance after
    -- ready/rejected/deleted, and never let a marker-1 `ready` source lack it.
    if a.status not in ('uploading','validating') then
      raise exception 'source_attempt_conflict: settled asset % has no capture intent', a.id using errcode = 'raise_exception';
    end if;
    if a.capture_contract_version is null then
      update public.media_assets set capture_contract_version = 1 where id = a.id;
    end if;
    recorded_at_str := to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    stored := public.editor_build_stored_intent(p_input, a.id, p_generation, p_attempt, recorded_at_str);
    perform public.editor_validate_capture_input(stored, p_generation, p_attempt, true);
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
    perform public.editor_persist_script_binding(a.id, p_owner, p_generation, origin, script_sha, snap_canonical, snap_sha, gen_scene_timeline, p_input->'acceptedSegments');
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
  perform public.editor_validate_capture_input(stored, p_generation, p_attempt, true);
  computed_sha := public.editor_capture_intent_sha256(stored);

  insert into public.media_assets
    (id, owner_id, generation_id, recording_attempt_id, kind, bucket, storage_path, mime_type, size_bytes, status, capture_contract_version)
  values
    (new_id, p_owner, p_generation, p_attempt, 'source', p_bucket, new_path, p_mime, p_size_bytes, 'uploading', 1);

  insert into public.source_capture_intents
    (source_asset_id, owner_id, generation_id, origin, recording_script_sha256, client_attempt_id, intent, intent_sha256, recorded_at)
  values (new_id, p_owner, p_generation, origin, script_sha, p_attempt, stored, computed_sha, recorded_at_str::timestamptz);

  perform public.editor_persist_script_binding(new_id, p_owner, p_generation, origin, script_sha, snap_canonical, snap_sha, gen_scene_timeline, p_input->'acceptedSegments');

  return query select new_id, new_path, 'uploading'::text, computed_sha, true;
end;
$$;
-- <<< GATE-D-FUNCTIONS-END

-- Service-role-only across EVERY Gate-D function (helpers included).
revoke all on function public.editor_capture_segments_canonical(jsonb) from public, anon, authenticated;
revoke all on function public.editor_capture_intent_input_canonical(jsonb) from public, anon, authenticated;
revoke all on function public.editor_capture_intent_canonical(jsonb) from public, anon, authenticated;
revoke all on function public.editor_capture_intent_sha256(jsonb) from public, anon, authenticated;
revoke all on function public.editor_validate_capture_input(jsonb, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.editor_build_stored_intent(jsonb, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.editor_snapshot_normalize(text) from public, anon, authenticated;
revoke all on function public.editor_recording_script_canonical(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.editor_recording_script_sha256(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.editor_verify_capture_dialogue_shas(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.editor_persist_script_binding(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.editor_create_source_asset(uuid, uuid, uuid, jsonb, text, text, bigint) from public, anon, authenticated;
grant execute on function public.editor_capture_segments_canonical(jsonb) to service_role;
grant execute on function public.editor_capture_intent_input_canonical(jsonb) to service_role;
grant execute on function public.editor_capture_intent_canonical(jsonb) to service_role;
grant execute on function public.editor_capture_intent_sha256(jsonb) to service_role;
grant execute on function public.editor_validate_capture_input(jsonb, uuid, uuid, boolean) to service_role;
grant execute on function public.editor_build_stored_intent(jsonb, uuid, uuid, uuid, text) to service_role;
grant execute on function public.editor_snapshot_normalize(text) to service_role;
grant execute on function public.editor_recording_script_canonical(uuid, jsonb, text) to service_role;
grant execute on function public.editor_recording_script_sha256(uuid, jsonb, text) to service_role;
grant execute on function public.editor_verify_capture_dialogue_shas(jsonb, jsonb) to service_role;
grant execute on function public.editor_persist_script_binding(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.editor_create_source_asset(uuid, uuid, uuid, jsonb, text, text, bigint) to service_role;

-- ===========================================================================
-- Gate-D create RPC (candidate for 0091). Verified locally against a faithful
-- media_assets/generations/source_capture_intents schema subset.
-- ===========================================================================
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
  -- Serialize concurrent creates of the SAME recording attempt so the authoritative
  -- asset id is chosen once; late callers block, then resolve the committed row.
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':' || p_generation::text || ':' || p_attempt::text, 0));

  -- Ownership: the generation must belong to the caller.
  select user_id into gen_owner from public.generations where id = p_generation;
  if gen_owner is null or gen_owner is distinct from p_owner then
    raise exception 'source_generation_not_owned: % / %', p_owner, p_generation using errcode = 'raise_exception';
  end if;

  -- Integrity: the client-asserted input must bind to THIS generation + attempt.
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
    if p_input ? 'recordingScriptSha256' and (p_input->'recordingScriptSha256') is not null
       and jsonb_typeof(p_input->'recordingScriptSha256') <> 'null' then raise exception 'capture_intent_upload_shape'; end if;
    if (p_input->>'recorderClock') is distinct from 'none' then raise exception 'capture_intent_upload_shape'; end if;
    if jsonb_array_length(coalesce(p_input->'acceptedSegments','[]'::jsonb)) <> 0 then raise exception 'capture_intent_upload_shape'; end if;
  end if;

  -- Resolve the one authoritative asset for this attempt.
  select * into a from public.media_assets
   where owner_id = p_owner and generation_id = p_generation and recording_attempt_id = p_attempt;

  if found then
    if a.status in ('rejected','deleted') then
      raise exception 'source_asset_rejected: %', a.id using errcode = 'raise_exception';
    end if;
    new_id := a.id; new_path := a.storage_path;
    -- Rebuild the stored intent using the EXISTING recordedAt + resolved id, so an
    -- identical retry re-derives the identical sha and a divergent payload does not.
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
    -- Marked asset without an intent (recovery): insert one now bound to it.
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

  -- New asset: enforce abuse/cost caps at mint (race-free under the attempt lock).
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

-- Build the stored intent jsonb from the client input + server-authority fields.
-- Rebuilt field-by-field from RELATIONAL truth (never trusting embedded ids).
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

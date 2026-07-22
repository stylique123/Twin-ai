-- Editor v2 — Phase 6 correction: bind the fenced writers to the pinned
-- boot manifest, and validate manifest structure + snapshot ownership at pin.
--
-- 0086 established editor_pin_manifest (set-once) and editor_record_analysis
-- (digest-keyed writer). Two integrity gaps remained, closed here WITHOUT
-- rewriting 0086 (its columns/indexes/other functions stay as applied):
--
-- 1. editor_record_analysis accepted ANY well-formed (component, digest,
--    bundle_version) even if it did not match the project's pinned
--    boot_manifest. A stale/rogue caller could record a component the pinned
--    manifest never authorized. Now the digest AND the bundle version MUST
--    equal boot_manifest->componentDigests/componentVersions for the exact
--    component, or the write fails closed (manifest_mismatch).
--
-- 2. editor_pin_manifest accepted any jsonb as the manifest and did not tie
--    the snapshot to the project. Now the manifest must carry the required
--    Phase-6 provenance structure (component versions/digests, reproducible
--    build inputs — exact 40-hex commit + Dockerfile + dependency-lock
--    digests, model-artifact digests, rules digest, epoch), and the snapshot's
--    generationId MUST equal edit_projects.generation_id.
--
-- Both are `create or replace` of the SAME signatures 0086 granted, so the
-- worker binary keeps working unchanged; the checks only ADD rejections.

-- ---------------------------------------------------------------------------
-- editor_pin_manifest: structural validation + snapshot-ownership binding
-- ---------------------------------------------------------------------------
create or replace function public.editor_pin_manifest(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer,
  p_manifest jsonb, p_manifest_sha text,
  p_snapshot jsonb, p_snapshot_sha text
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  proj public.edit_projects;
begin
  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);

  if p_manifest is null or p_manifest_sha is null or p_snapshot is null or p_snapshot_sha is null then
    raise exception 'editor_pin_manifest: manifest and snapshot must both be present';
  end if;
  if pg_column_size(p_manifest) > 32768 then
    raise exception 'component_too_large: boot manifest exceeds 32KiB';
  end if;
  if pg_column_size(p_snapshot) > 131072 then
    raise exception 'script_snapshot_too_large: snapshot exceeds the storage bound';
  end if;

  -- Required Phase-6 manifest structure (defense in depth: the worker builds
  -- this, the DB refuses to pin anything that is not a complete manifest).
  if jsonb_typeof(p_manifest->'componentVersions') is distinct from 'object'
     or jsonb_typeof(p_manifest->'componentDigests') is distinct from 'object'
     or jsonb_typeof(p_manifest->'modelArtifacts') is distinct from 'object'
     or jsonb_typeof(p_manifest->'build') is distinct from 'object'
     or jsonb_typeof(p_manifest->'rules') is distinct from 'object'
     or jsonb_typeof(p_manifest->'ffmpeg') is distinct from 'object' then
    raise exception 'manifest_invalid: boot manifest is missing a required section';
  end if;
  if (p_manifest->>'manifestEpoch') is null or (p_manifest->>'manifestEpoch') !~ '^[0-9]+$' then
    raise exception 'manifest_invalid: manifestEpoch missing or non-integer';
  end if;
  if coalesce(p_manifest->'componentVersions'->>'inspection','') = ''
     or coalesce(p_manifest->'componentVersions'->>'speech','') = ''
     or coalesce(p_manifest->'componentVersions'->>'visual','') = ''
     or coalesce(p_manifest->'componentVersions'->>'audio','') = ''
     or coalesce(p_manifest->'componentVersions'->>'hook','') = '' then
    raise exception 'manifest_invalid: componentVersions incomplete';
  end if;
  if coalesce(p_manifest->'componentDigests'->>'visual','') !~ '^[0-9a-f]{64}$'
     or coalesce(p_manifest->'componentDigests'->>'audio','') !~ '^[0-9a-f]{64}$'
     or coalesce(p_manifest->'componentDigests'->>'hook','') !~ '^[0-9a-f]{64}$' then
    raise exception 'manifest_invalid: componentDigests must be 64-hex sha256';
  end if;
  -- Reproducible build provenance: an exact commit + Dockerfile + dependency
  -- lock, never null/placeholder. This is what makes a rebuilt image provably
  -- the same build (or the pin fails).
  if coalesce(p_manifest->'build'->>'workerCommit','') !~ '^[0-9a-f]{40}$'
     or coalesce(p_manifest->'build'->>'dockerfileSha256','') !~ '^[0-9a-f]{64}$'
     or coalesce(p_manifest->'build'->>'dependencyLockSha256','') !~ '^[0-9a-f]{64}$' then
    raise exception 'manifest_invalid: build provenance (commit/dockerfile/dependency-lock) missing or malformed';
  end if;
  if coalesce(p_manifest->'rules'->>'boundsSha256','') !~ '^[0-9a-f]{64}$' then
    raise exception 'manifest_invalid: rules.boundsSha256 must be 64-hex';
  end if;
  if coalesce(p_manifest->'modelArtifacts'->'speech'->>'artifactSha256','') !~ '^[0-9a-f]{64}$'
     or coalesce(p_manifest->'modelArtifacts'->'faceDetector'->>'artifactSha256','') !~ '^[0-9a-f]{64}$' then
    raise exception 'manifest_invalid: model artifact digests missing or malformed';
  end if;

  select * into proj from public.edit_projects where id = p_project for update;
  if not found then
    raise exception 'editor_pin_manifest: project % not found', p_project;
  end if;
  if proj.status in ('completed','failed','cancelled') then
    raise exception 'project_terminal: project % is already %', p_project, proj.status;
  end if;

  -- The snapshot must be the snapshot of THIS project's generation.
  if p_snapshot->>'generationId' is distinct from proj.generation_id::text then
    raise exception 'snapshot_generation_mismatch: snapshot generationId does not match the project generation';
  end if;

  if proj.boot_manifest_sha is not null then
    if proj.boot_manifest_sha = p_manifest_sha and proj.script_snapshot_sha = p_snapshot_sha then
      return 'already_pinned';
    end if;
    raise exception 'manifest_mismatch: project % is pinned to a different manifest', p_project;
  end if;

  update public.edit_projects
     set boot_manifest = p_manifest,
         boot_manifest_sha = p_manifest_sha,
         script_snapshot = p_snapshot,
         script_snapshot_sha = p_snapshot_sha
   where id = p_project;

  insert into public.edit_events (project_id, stage, message_code, details, dedupe_key)
  values (p_project, proj.status, 'manifest_pinned',
          jsonb_build_object('manifest_sha', p_manifest_sha, 'snapshot_sha', p_snapshot_sha),
          'pin:' || p_manifest_sha)
  on conflict (project_id, dedupe_key) where dedupe_key is not null do nothing;

  return 'pinned';
end;
$$;

-- ---------------------------------------------------------------------------
-- editor_record_analysis: bind digest + bundle version to the pinned manifest
-- ---------------------------------------------------------------------------
create or replace function public.editor_record_analysis(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer,
  p_component text, p_schema_version integer, p_bundle_version text,
  p_component_digest text, p_source_hash text, p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  proj public.edit_projects;
  a public.media_assets;
  existing public.media_analyses;
  row_id uuid;
  inserted integer;
  cap integer;
begin
  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);

  if p_component not in ('visual','audio','hook') then
    raise exception 'editor_record_analysis: % is not a digest-keyed component', p_component;
  end if;
  if p_component_digest is null or p_component_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'editor_record_analysis: component_digest must be a 64-hex sha256';
  end if;

  cap := case p_component when 'visual' then 262144 when 'audio' then 65536 else 16384 end;
  if pg_column_size(p_result) > cap then
    raise exception 'component_too_large: % payload exceeds % bytes', p_component, cap;
  end if;

  select * into proj from public.edit_projects where id = p_project;
  if not found then
    raise exception 'editor_record_analysis: project % not found', p_project;
  end if;
  if proj.status in ('completed','failed','cancelled') then
    raise exception 'project_terminal: project % is already %', p_project, proj.status;
  end if;
  if proj.boot_manifest_sha is null then
    raise exception 'manifest_mismatch: project % has no pinned boot manifest', p_project;
  end if;

  -- The component digest AND bundle version must EXACTLY match what the pinned
  -- boot manifest authorized for this component — a caller can only record the
  -- component identity the project was pinned to.
  if proj.boot_manifest->'componentDigests'->>p_component is distinct from p_component_digest then
    raise exception 'manifest_mismatch: component digest does not match the pinned boot manifest for %', p_component;
  end if;
  if proj.boot_manifest->'componentVersions'->>p_component is distinct from p_bundle_version then
    raise exception 'manifest_mismatch: bundle version does not match the pinned boot manifest for %', p_component;
  end if;

  select * into a from public.media_assets where id = proj.source_asset_id;
  if not found then
    raise exception 'editor_record_analysis: source asset % missing', proj.source_asset_id;
  end if;
  if a.content_sha256 is distinct from p_source_hash then
    raise exception 'checksum_mismatch: recorded hash does not match the source asset';
  end if;

  insert into public.media_analyses
    (owner_id, source_asset_id, source_hash, schema_version, analyzer_bundle_version,
     component, component_digest, manifest_sha, result)
  values
    (proj.owner_id, proj.source_asset_id, p_source_hash, p_schema_version, p_bundle_version,
     p_component, p_component_digest, proj.boot_manifest_sha, p_result)
  on conflict (source_asset_id, component, component_digest)
    where component_digest is not null
    do nothing;
  get diagnostics inserted = row_count;

  select * into existing from public.media_analyses
   where source_asset_id = proj.source_asset_id
     and component = p_component
     and component_digest = p_component_digest;
  if not found then
    raise exception 'editor_record_analysis: component row vanished after insert';
  end if;
  if existing.source_hash is distinct from p_source_hash then
    raise exception 'checksum_mismatch: existing component was recorded for different source bytes';
  end if;
  row_id := existing.id;

  insert into public.edit_events (project_id, stage, message_code, details, dedupe_key)
  values (p_project, proj.status,
          case when inserted = 1 then 'analysis_component_recorded' else 'analysis_component_reused' end,
          jsonb_build_object('component', p_component, 'component_digest', p_component_digest,
                             'bundle_version', p_bundle_version),
          'analysis:' || p_component || ':' || p_component_digest
            || ':' || case when inserted = 1 then 'recorded' else 'reused' end)
  on conflict (project_id, dedupe_key) where dedupe_key is not null do nothing;

  return jsonb_build_object('id', row_id, 'recorded', inserted = 1);
end;
$$;

-- Grants unchanged from 0086 (create or replace preserves them, but re-assert
-- explicitly so a fresh apply is self-contained).
revoke all on function public.editor_pin_manifest(uuid, uuid, text, integer, jsonb, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.editor_record_analysis(uuid, uuid, text, integer, text, integer, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.editor_pin_manifest(uuid, uuid, text, integer, jsonb, text, jsonb, text) to service_role;
grant execute on function public.editor_record_analysis(uuid, uuid, text, integer, text, integer, text, text, text, jsonb) to service_role;

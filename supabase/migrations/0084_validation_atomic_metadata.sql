-- Editor v2 — Phase 4 gate hardening (round 2).
--
-- 1. editor_complete_validation(): validate_source's ready-flip becomes ONE
--    atomic DB statement with a DATABASE-LEVEL metadata merge
--    (metadata || patch) — no client-side read-modify-write window where a
--    concurrent metadata writer could be lost. Status-guarded (validating
--    only; the transition trigger enforces it too). Service-role only.
-- 2. editor_record_inspection() gains an optional, FENCED integrity backfill:
--    when a legacy asset lacks finalized_etag/finalized_bytes and the worker
--    has just download-verified the sha256, the CURRENT trusted etag/size are
--    merged into the asset metadata (DB-level ||). The next project then
--    reconciles the etag and reuses the cached inspection with no download.

create or replace function public.editor_complete_validation(
  p_asset uuid, p_sha256 text, p_duration_ms integer, p_width integer,
  p_height integer, p_rotation integer, p_has_audio boolean,
  p_size_bytes bigint, p_meta_patch jsonb
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare n integer;
begin
  update public.media_assets
     set status = 'ready',
         content_sha256 = p_sha256,
         duration_ms = p_duration_ms,
         width = p_width,
         height = p_height,
         rotation = p_rotation,
         has_audio = p_has_audio,
         size_bytes = coalesce(p_size_bytes, size_bytes),
         validated_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || p_meta_patch
   where id = p_asset and status = 'validating';
  get diagnostics n = row_count;
  return n; -- 0 = lost race (another worker settled it): caller no-ops
end;
$$;

revoke all on function public.editor_complete_validation(uuid, text, integer, integer, integer, integer, boolean, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.editor_complete_validation(uuid, text, integer, integer, integer, integer, boolean, bigint, jsonb) to service_role;

drop function if exists public.editor_record_inspection(uuid, uuid, text, integer, text, integer, text, text, jsonb);
create function public.editor_record_inspection(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer,
  p_component text, p_schema_version integer, p_bundle_version text,
  p_source_hash text, p_result jsonb,
  p_backfill_etag text default null, p_backfill_bytes bigint default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  proj public.edit_projects;
  a public.media_assets;
  row_id uuid;
begin
  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);

  select * into proj from public.edit_projects where id = p_project;
  if not found then
    raise exception 'editor_record_inspection: project % not found', p_project;
  end if;
  if proj.status in ('completed','failed','cancelled') then
    raise exception 'project_terminal: project % is already %', p_project, proj.status;
  end if;

  select * into a from public.media_assets where id = proj.source_asset_id;
  if not found then
    raise exception 'editor_record_inspection: source asset % missing', proj.source_asset_id;
  end if;
  if a.content_sha256 is distinct from p_source_hash then
    raise exception 'checksum_mismatch: recorded hash does not match the source asset';
  end if;

  -- Fenced one-time integrity backfill for legacy assets: only fills ABSENT
  -- keys (never overwrites an existing finalize reference), only under a
  -- live lease, only after the caller sha256-verified the downloaded bytes.
  if p_backfill_etag is not null and (a.metadata->>'finalized_etag') is null then
    update public.media_assets
       set metadata = coalesce(metadata, '{}'::jsonb)
                      || jsonb_strip_nulls(jsonb_build_object(
                           'finalized_etag', p_backfill_etag,
                           'finalized_bytes', p_backfill_bytes,
                           'integrity_backfilled', true))
     where id = a.id and (metadata->>'finalized_etag') is null;
  end if;

  insert into public.media_analyses
    (owner_id, source_asset_id, source_hash, schema_version, analyzer_bundle_version, component, result)
  values
    (proj.owner_id, proj.source_asset_id, p_source_hash, p_schema_version, p_bundle_version, p_component, p_result)
  on conflict (source_asset_id, component, analyzer_bundle_version) do nothing;

  select id into row_id from public.media_analyses
   where source_asset_id = proj.source_asset_id
     and component = p_component
     and analyzer_bundle_version = p_bundle_version;

  update public.edit_projects
     set analysis_version = p_bundle_version
   where id = p_project;

  return row_id;
end;
$$;

revoke all on function public.editor_record_inspection(uuid, uuid, text, integer, text, integer, text, text, jsonb, text, bigint) from public, anon, authenticated;
grant execute on function public.editor_record_inspection(uuid, uuid, text, integer, text, integer, text, text, jsonb, text, bigint) to service_role;

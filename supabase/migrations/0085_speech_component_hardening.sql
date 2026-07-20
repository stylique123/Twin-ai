-- Editor v2 — Phase 5 (speech analysis) hardening of the fenced component
-- writer. editor_record_inspection was already component-generic (Phase 4
-- passes p_component, bounded by the media_analyses check constraint); Phase 5
-- reuses it for the immutable `speech` component. Two tightenings:
--
-- 1. RESULT SIZE BOUND at the database: a speech analysis carries word lists,
--    VAD evidence and an energy curve — all bounded by construction in the
--    worker, but the DB is the last line. Reject any component payload over
--    1 MiB with a stable error instead of letting an unbounded document in.
-- 2. analysis_version tracks the INSPECTION bundle only. Phase 4 defined
--    edit_projects.analysis_version as the inspection epoch; recording a
--    speech (or later visual/audio/hook) component must not clobber it —
--    each component's own version lives on its media_analyses row.
--
-- Same signature, so the Phase-4 worker binary keeps working unchanged.

create or replace function public.editor_record_inspection(
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

  if pg_column_size(p_result) > 1048576 then
    raise exception 'component_too_large: % payload exceeds 1MiB', p_component;
  end if;

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

  -- Inspection epoch only — sibling components never clobber it.
  if p_component = 'inspection' then
    update public.edit_projects
       set analysis_version = p_bundle_version
     where id = p_project;
  end if;

  return row_id;
end;
$$;

revoke all on function public.editor_record_inspection(uuid, uuid, text, integer, text, integer, text, text, jsonb, text, bigint) from public, anon, authenticated;
grant execute on function public.editor_record_inspection(uuid, uuid, text, integer, text, integer, text, text, jsonb, text, bigint) to service_role;

-- Editor v2 — Phase 4: analysis components + per-asset cache identity.
--
-- 1. CACHE-SECURITY FIX. 0078's unique (source_hash, analyzer_bundle_version)
--    was GLOBAL: two unrelated users uploading identical bytes would collide —
--    the second insert fails, and reusing the first row would let one tenant's
--    asset lifecycle (and row visibility) leak into another's. Replaced with
--    per-asset identity: unique (source_asset_id, component,
--    analyzer_bundle_version). Each owned asset gets its own analysis; no
--    cross-tenant deduplication (deliberate — revisit only with proven
--    economic value via a separate private cache table).
-- 2. COMPONENT MODEL. One row per analysis COMPONENT ('inspection' now;
--    'speech'/'visual'/'audio'/'hook' in later phases), each independently
--    versioned, immutable once written, traceable to the source checksum, and
--    recomputed only when its version changes. Later phases ADD component
--    rows; they never mutate Phase 4's inspection.
-- 3. DB-ENFORCED immutability: UPDATE always raises; DELETE only via the FK
--    retention cascade (asset/generation deletion), like edit_events.
-- 4. editor_record_inspection(): the FENCED writer. Re-proves the worker's
--    lease (attempt token) AND that the checksum being recorded matches the
--    project's CURRENT source asset — a stale worker cannot publish, and an
--    analysis can never attach to a different asset. Concurrent cache misses
--    converge on one row (ON CONFLICT DO NOTHING + re-read).

alter table public.media_analyses
  add column if not exists component text not null default 'inspection';

drop index if exists media_analyses_reuse_uniq;
create unique index media_analyses_asset_component_uniq
  on public.media_analyses (source_asset_id, component, analyzer_bundle_version);

create or replace function public.media_analyses_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'media_analyses is append-only: components are immutable once written';
  end if;
  if pg_trigger_depth() = 1 then
    raise exception 'media_analyses is append-only: direct deletes are not permitted (retention runs via the asset cascade)';
  end if;
  return old;
end;
$$;

create trigger trg_media_analyses_append_only
  before update or delete on public.media_analyses
  for each row execute function public.media_analyses_append_only();
revoke all on function public.media_analyses_append_only() from public, anon, authenticated;

create or replace function public.editor_record_inspection(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer,
  p_component text, p_schema_version integer, p_bundle_version text,
  p_source_hash text, p_result jsonb
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
  -- The recorded checksum MUST be the checksum of the project's CURRENT
  -- source asset — an analysis can never attach to different bytes.
  if a.content_sha256 is distinct from p_source_hash then
    raise exception 'checksum_mismatch: recorded hash does not match the source asset';
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

revoke all on function public.editor_record_inspection(uuid, uuid, text, integer, text, integer, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.editor_record_inspection(uuid, uuid, text, integer, text, integer, text, text, jsonb) to service_role;

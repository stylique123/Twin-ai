-- Editor v2 — Phase 6: digest-keyed analysis components + pinned boot manifest.
--
-- 1. CACHE IDENTITY (tenant-safe, digest-keyed). Phase-4/5 components are
--    keyed (source_asset_id, component, analyzer_bundle_version). Phase-6
--    components (visual/audio/hook) are keyed
--    (source_asset_id, component, component_digest) where component_digest =
--    sha256(canonicalJson({version, effectiveConfig, modelHashes,
--    boundsSha256})) — the FULL effective configuration and model identity,
--    not just a version label. There is deliberately NO global content-hash
--    dedup: identity always includes source_asset_id (per-tenant asset), and
--    manifest_sha on a row is PROVENANCE only, never part of the key.
--
--    The old total unique index (source_asset_id, component,
--    analyzer_bundle_version) is REPLACED by two partial unique indexes:
--      * legacy rows (component_digest IS NULL) keep the exact old identity —
--        inspection/speech writers keep converging on one row per version;
--      * digest rows (component_digest IS NOT NULL) are unique per digest —
--        two DIFFERENT digests for the same (asset, component) may coexist
--        (a config/model change recomputes without deleting history), while
--        the SAME digest converges on one row.
--    Both fenced writers name the matching partial predicate in their
--    ON CONFLICT target (required for partial unique indexes).
--
-- 2. PINNED BOOT MANIFEST + SCRIPT SNAPSHOT on edit_projects, set exactly
--    once by the fenced editor_pin_manifest BEFORE queued->inspecting.
--    Both-or-neither column pairs are CHECK-enforced; a set-once trigger
--    makes the pin immutable; re-pinning with a DIFFERENT sha fails closed
--    (manifest_mismatch), re-pinning with the same sha is an idempotent no-op.
--
-- 3. edit_events.dedupe_key: crash-retry event accounting. A retried attempt
--    re-announcing the same durable fact (same component digest recorded /
--    reused, same manifest pinned) collapses onto one event row via a partial
--    unique index instead of double-counting.
--
-- Rollback posture: purely additive for legacy writers (their identity and
-- ON CONFLICT behaviour are unchanged); the Phase-5 worker binary keeps
-- working against this schema unmodified.

-- ---------------------------------------------------------------------------
-- 1. media_analyses: digest identity columns + partial unique indexes
-- ---------------------------------------------------------------------------
alter table public.media_analyses
  add column if not exists component_digest text,
  add column if not exists manifest_sha text;

alter table public.media_analyses
  add constraint media_analyses_component_digest_shape
  check (component_digest is null or component_digest ~ '^[0-9a-f]{64}$');
alter table public.media_analyses
  add constraint media_analyses_manifest_sha_shape
  check (manifest_sha is null or manifest_sha ~ '^[0-9a-f]{64}$');
-- A digest row must carry its manifest provenance; legacy rows carry neither.
alter table public.media_analyses
  add constraint media_analyses_digest_provenance
  check ((component_digest is null) = (manifest_sha is null));

drop index if exists media_analyses_asset_component_uniq;
create unique index media_analyses_legacy_component_uniq
  on public.media_analyses (source_asset_id, component, analyzer_bundle_version)
  where component_digest is null;
create unique index media_analyses_component_digest_uniq
  on public.media_analyses (source_asset_id, component, component_digest)
  where component_digest is not null;

-- ---------------------------------------------------------------------------
-- 2. editor_record_inspection: same body as 0085, ON CONFLICT now names the
--    legacy partial index's predicate (required once the index is partial).
-- ---------------------------------------------------------------------------
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
  on conflict (source_asset_id, component, analyzer_bundle_version)
    where component_digest is null
    do nothing;

  select id into row_id from public.media_analyses
   where source_asset_id = proj.source_asset_id
     and component = p_component
     and analyzer_bundle_version = p_bundle_version
     and component_digest is null;

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

-- ---------------------------------------------------------------------------
-- 3. edit_events.dedupe_key (retry-safe event accounting)
-- ---------------------------------------------------------------------------
alter table public.edit_events
  add column if not exists dedupe_key text;
create unique index if not exists edit_events_dedupe_uniq
  on public.edit_events (project_id, dedupe_key)
  where dedupe_key is not null;

-- ---------------------------------------------------------------------------
-- 4. edit_projects: pinned boot manifest + script snapshot (set-once)
-- ---------------------------------------------------------------------------
alter table public.edit_projects
  add column if not exists boot_manifest jsonb,
  add column if not exists boot_manifest_sha text,
  add column if not exists script_snapshot jsonb,
  add column if not exists script_snapshot_sha text;

alter table public.edit_projects
  add constraint edit_projects_manifest_pair
  check ((boot_manifest is null) = (boot_manifest_sha is null));
alter table public.edit_projects
  add constraint edit_projects_snapshot_pair
  check ((script_snapshot is null) = (script_snapshot_sha is null));
-- Manifest and snapshot are pinned TOGETHER (one fenced call), never one-sided.
alter table public.edit_projects
  add constraint edit_projects_pin_together
  check ((boot_manifest_sha is null) = (script_snapshot_sha is null));
alter table public.edit_projects
  add constraint edit_projects_manifest_sha_shape
  check (boot_manifest_sha is null or boot_manifest_sha ~ '^[0-9a-f]{64}$');
alter table public.edit_projects
  add constraint edit_projects_snapshot_sha_shape
  check (script_snapshot_sha is null or script_snapshot_sha ~ '^[0-9a-f]{64}$');

create or replace function public.edit_projects_guard_pin()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.boot_manifest_sha is not null and
     (new.boot_manifest_sha is distinct from old.boot_manifest_sha
      or new.boot_manifest is distinct from old.boot_manifest) then
    raise exception 'manifest_mismatch: boot manifest is pinned once and immutable';
  end if;
  if old.script_snapshot_sha is not null and
     (new.script_snapshot_sha is distinct from old.script_snapshot_sha
      or new.script_snapshot is distinct from old.script_snapshot) then
    raise exception 'manifest_mismatch: script snapshot is pinned once and immutable';
  end if;
  return new;
end;
$$;

create trigger trg_edit_projects_guard_pin
  before update of boot_manifest, boot_manifest_sha, script_snapshot, script_snapshot_sha
  on public.edit_projects
  for each row execute function public.edit_projects_guard_pin();
revoke all on function public.edit_projects_guard_pin() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. editor_pin_manifest: fenced, set-once, idempotent-on-equal
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
  -- Snapshot cap: the worker enforces the exact 65536-byte CANONICAL cap and
  -- fails closed (script_snapshot_too_large) before calling; the DB backstop
  -- bounds the stored jsonb representation.
  if pg_column_size(p_snapshot) > 131072 then
    raise exception 'script_snapshot_too_large: snapshot exceeds the storage bound';
  end if;

  select * into proj from public.edit_projects where id = p_project for update;
  if not found then
    raise exception 'editor_pin_manifest: project % not found', p_project;
  end if;
  if proj.status in ('completed','failed','cancelled') then
    raise exception 'project_terminal: project % is already %', p_project, proj.status;
  end if;

  if proj.boot_manifest_sha is not null then
    if proj.boot_manifest_sha = p_manifest_sha and proj.script_snapshot_sha = p_snapshot_sha then
      return 'already_pinned'; -- idempotent resume/retry
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
-- 6. editor_record_analysis: the fenced digest-keyed component writer
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

  -- Per-component payload caps (mirrors the worker-side build caps).
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
  -- Provenance binding: components exist only under a pinned manifest, and the
  -- caller must be operating under THAT manifest.
  if proj.boot_manifest_sha is null then
    raise exception 'manifest_mismatch: project % has no pinned boot manifest', p_project;
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
  -- A digest-matched row recorded for DIFFERENT bytes is an integrity failure,
  -- never a reuse (cannot happen through this writer; guard anyway).
  if existing.source_hash is distinct from p_source_hash then
    raise exception 'checksum_mismatch: existing component was recorded for different source bytes';
  end if;
  row_id := existing.id;

  -- Event accounting: recorded vs reused are SEPARATE durable facts; retried
  -- attempts collapse onto one row each via the dedupe key.
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

-- ---------------------------------------------------------------------------
-- Grants: explicit-only, worker (service_role) execute.
-- ---------------------------------------------------------------------------
revoke all on function public.editor_pin_manifest(uuid, uuid, text, integer, jsonb, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.editor_record_analysis(uuid, uuid, text, integer, text, integer, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.editor_pin_manifest(uuid, uuid, text, integer, jsonb, text, jsonb, text) to service_role;
grant execute on function public.editor_record_analysis(uuid, uuid, text, integer, text, integer, text, text, text, jsonb) to service_role;

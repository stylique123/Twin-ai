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

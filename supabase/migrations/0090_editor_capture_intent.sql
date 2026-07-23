-- Editor v2 — Phase 7 exit correction: Source Capture Intent / Manifest.
--
-- Closes the source-provenance defect (Constitution §4.1): the teleprompter's
-- accepted per-scene windows lived only in browser React refs and were lost on
-- upload, so the editor could not know which retake the creator accepted. This
-- migration persists two immutable, distinct documents bound to ONE source
-- asset:
--   * source_capture_intents    — what the browser asserted (append-only), written
--                                 at source-asset `create`.
--   * source_capture_manifests  — the server-normalized truth (append-only),
--                                 written by validate_source against the MEASURED
--                                 media duration, before the asset becomes ready.
--
-- NEW-ERA MARKER (server-side, absence cannot masquerade as legacy): the edge
-- stamps media_assets.capture_contract_version on every new source it creates
-- (capture is mandatory there). A source with that marker set can NEVER become
-- `ready` without its normalized manifest — regardless of origin — so a lost-
-- provenance teleprompter recording fails closed instead of silently becoming
-- editable. True legacy assets (created before this migration) have a NULL
-- marker and are grandfathered.
--
-- No compiler/renderer/output. Additive to 0076/0084. Zero-delta boundary holds.

-- ---------------------------------------------------------------------------
-- 1. Raw client-asserted intent (immutable, one per source asset).
-- ---------------------------------------------------------------------------
create table if not exists public.source_capture_intents (
  id uuid primary key default gen_random_uuid(),
  source_asset_id uuid not null unique references public.media_assets(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid references public.generations(id) on delete set null,
  origin text not null check (origin in ('teleprompter', 'upload')),
  recording_script_sha256 text check (recording_script_sha256 ~ '^[0-9a-f]{64}$'),
  client_attempt_id uuid not null,
  intent jsonb not null,
  intent_sha256 text not null check (intent_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- teleprompter requires a script identity; upload must not carry one.
  constraint capture_intent_origin_shape check (
    (origin = 'teleprompter' and recording_script_sha256 is not null)
    or (origin = 'upload' and recording_script_sha256 is null)
  )
);

create index if not exists source_capture_intents_owner_idx
  on public.source_capture_intents (owner_id);

-- ---------------------------------------------------------------------------
-- 2. Server-normalized manifest (immutable, one per source asset).
-- ---------------------------------------------------------------------------
create table if not exists public.source_capture_manifests (
  id uuid primary key default gen_random_uuid(),
  source_asset_id uuid not null unique references public.media_assets(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  origin text not null check (origin in ('teleprompter', 'upload')),
  intent_sha256 text not null check (intent_sha256 ~ '^[0-9a-f]{64}$'),
  manifest jsonb not null,
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  normalization_version text not null,
  created_at timestamptz not null default now()
);

create index if not exists source_capture_manifests_owner_idx
  on public.source_capture_manifests (owner_id);

-- ---------------------------------------------------------------------------
-- 3. Append-only immutability: no UPDATE, no DELETE (rows cascade only with
--    their source asset). A stable exception if anything tries.
-- ---------------------------------------------------------------------------
create or replace function public.editor_capture_no_mutate()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'capture_row_immutable: % is append-only', tg_table_name
    using errcode = 'raise_exception';
end;
$$;

drop trigger if exists source_capture_intents_immutable on public.source_capture_intents;
create trigger source_capture_intents_immutable
  before update or delete on public.source_capture_intents
  for each row execute function public.editor_capture_no_mutate();

drop trigger if exists source_capture_manifests_immutable on public.source_capture_manifests;
create trigger source_capture_manifests_immutable
  before update or delete on public.source_capture_manifests
  for each row execute function public.editor_capture_no_mutate();

-- ---------------------------------------------------------------------------
-- 3b. NEW-ERA MARKER (audit fix): distinguish new capture-aware sources from
--     true legacy assets SERVER-SIDE, so absence of an intent can never
--     masquerade as "legacy" and let a new source reach `ready` without
--     provenance. The edge stamps capture_contract_version atomically in the
--     media_assets INSERT; legacy assets (pre-migration) have NULL.
-- ---------------------------------------------------------------------------
alter table public.media_assets
  add column if not exists capture_contract_version integer;

-- ---------------------------------------------------------------------------
-- 4. Ready-flip guard: a NEW-ERA source (capture_contract_version not null)
--    can NEVER become `ready` without its normalized capture manifest —
--    regardless of origin. This closes the rejected-retake hole: a teleprompter
--    recording that lost its provenance (no manifest) fails closed. Legacy
--    assets (version NULL) are unaffected, so Phases 1-6 fixtures still flip.
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
-- 5. RLS: owner read-only; all writes are service-role only (edge fn / worker).
-- ---------------------------------------------------------------------------
alter table public.source_capture_intents enable row level security;
alter table public.source_capture_manifests enable row level security;

-- Owner AND workspace peers may read (constitution sharing seam, identical to
-- media_assets). Writes remain service-role only.
drop policy if exists source_capture_intents_owner_read on public.source_capture_intents;
create policy source_capture_intents_owner_read
  on public.source_capture_intents for select
  using (owner_id = auth.uid() or owner_id in (select public.workspace_peers()));

drop policy if exists source_capture_manifests_owner_read on public.source_capture_manifests;
create policy source_capture_manifests_owner_read
  on public.source_capture_manifests for select
  using (owner_id = auth.uid() or owner_id in (select public.workspace_peers()));

-- No INSERT/UPDATE/DELETE policies for anon/authenticated: writes go through the
-- service role (which bypasses RLS) exclusively.
revoke all on public.source_capture_intents from public, anon, authenticated;
revoke all on public.source_capture_manifests from public, anon, authenticated;
grant select on public.source_capture_intents to authenticated;
grant select on public.source_capture_manifests to authenticated;
grant all on public.source_capture_intents to service_role;
grant all on public.source_capture_manifests to service_role;

-- ---------------------------------------------------------------------------
-- 6. Fenced manifest writer: validate_source calls this AFTER ffprobe, with the
--    already-normalized manifest (normalization runs in the worker against the
--    measured duration). Requires the asset to still be `validating` and to have
--    a matching intent. Insert-once (idempotent on reclaim). Service-role only.
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
  row_id uuid;
begin
  select * into a from public.media_assets where id = p_asset;
  if not found then
    raise exception 'capture_manifest_asset_missing: %', p_asset;
  end if;

  -- SOURCE-VALIDATION FENCE: writes are legal ONLY inside the `validating`
  -- window (the same guard the atomic ready-flip relies on). A stale worker
  -- whose asset already settled finds status<>'validating' and no-ops.
  if a.status <> 'validating' then
    select id into row_id from public.source_capture_manifests where source_asset_id = p_asset;
    return row_id;
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

  -- CONFLICT VERIFICATION: an existing manifest must be EXACTLY the same
  -- (idempotent reclaim); ANY divergence is a stale/tampering write and fails
  -- closed rather than being silently accepted.
  select * into existing from public.source_capture_manifests where source_asset_id = p_asset;
  if found then
    if existing.intent_sha256 is distinct from p_intent_sha256
       or existing.manifest_sha256 is distinct from p_manifest_sha256
       or existing.normalization_version is distinct from p_normalization_version
       or existing.origin is distinct from p_origin
       or existing.owner_id is distinct from a.owner_id then
      raise exception 'capture_manifest_conflict: a divergent manifest already exists for %', p_asset;
    end if;
    return existing.id;
  end if;

  insert into public.source_capture_manifests
    (source_asset_id, owner_id, origin, intent_sha256, manifest, manifest_sha256, normalization_version)
  values
    (p_asset, a.owner_id, p_origin, p_intent_sha256, p_manifest, p_manifest_sha256, p_normalization_version)
  on conflict (source_asset_id) do nothing;

  select * into existing from public.source_capture_manifests where source_asset_id = p_asset;
  if existing.manifest_sha256 is distinct from p_manifest_sha256
     or existing.intent_sha256 is distinct from p_intent_sha256 then
    raise exception 'capture_manifest_conflict: a concurrent divergent manifest exists for %', p_asset;
  end if;
  return existing.id;
end;
$$;

revoke all on function public.editor_write_capture_manifest(uuid, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.editor_write_capture_manifest(uuid, text, text, jsonb, text, text) to service_role;

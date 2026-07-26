-- Faithful subset of the real schema for Gate-D create/complete RPC verification.
-- Mirror Supabase EXACTLY: pgcrypto lives in the `extensions` schema, NOT public.
-- A vanilla `create extension pgcrypto` would land it in public and let functions
-- that pin `search_path = pg_catalog, public` (no extensions) resolve digest()
-- locally while FAILING on Supabase — the exact trap that hid a migration-apply
-- break. Installing it in `extensions` makes the harness fail-for-real unless each
-- pgcrypto-calling function self-declares `extensions` on its search_path.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
-- A normal Supabase session has `extensions` on its path (so top-level scaffolding
-- digest() calls resolve); security-definer functions still pin their OWN path, so
-- one omitting `extensions` fails exactly as it would on Supabase.
alter database postgres set search_path = pg_catalog, public, extensions;

-- Supabase's standard roles, so grant-posture assertions are meaningful here.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  -- service_role mirrors Supabase: it BYPASSES RLS (the trusted server identity).
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
alter role service_role bypassrls;

drop table if exists public.source_capture_manifests cascade;
drop table if exists public.source_capture_intents cascade;
drop table if exists public.media_assets cascade;
drop table if exists public.generations cascade;

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  selected_hook text,
  scene_timeline jsonb,
  source_asset_id uuid,
  take_path text
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  generation_id uuid,
  recording_attempt_id uuid,
  kind text not null check (kind in ('source','music','output','thumbnail')),
  seq bigint generated always as identity,
  bucket text not null,
  storage_path text not null unique,  -- mirror 0076: real schema is UNIQUE; laxity here hid collision bugs
  content_sha256 text,
  mime_type text,
  size_bytes bigint,
  duration_ms bigint,
  width integer,
  height integer,
  frame_rate_num integer,
  frame_rate_den integer,
  rotation integer,
  has_audio boolean,
  status text not null default 'uploading' check (status in ('uploading','validating','ready','rejected','deleted')),
  validation_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  capture_contract_version integer check (capture_contract_version is null or capture_contract_version = 1),
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  constraint source_needs_attempt check (kind <> 'source' or recording_attempt_id is not null)
);
create unique index media_assets_attempt_uniq
  on public.media_assets (owner_id, generation_id, recording_attempt_id) where recording_attempt_id is not null;

-- Real status-transition guard (subset).
create or replace function public.media_assets_status_guard() returns trigger language plpgsql as $$
begin
  if old.status = new.status then return new; end if;
  if new.status = 'deleted' then return new; end if;
  if old.status = 'uploading' and new.status = 'validating' then return new; end if;
  if old.status = 'validating' and new.status in ('ready','rejected') then return new; end if;
  if old.status = 'rejected' and new.status = 'validating' then
    -- mirror 0079: re-validation is legal ONLY with an explicit version bump
    if new.validation_version is distinct from old.validation_version and new.validation_version > coalesce(old.validation_version, 0) then return new; end if;
    raise exception 'media_assets: rejected -> validating requires a validation_version bump';
  end if;
  raise exception 'media_assets: illegal status transition % -> %', old.status, new.status;
end; $$;
create trigger media_assets_status_guard before update of status on public.media_assets
  for each row execute function public.media_assets_status_guard();

-- 0090 capture intents (subset: table + append-only trigger).
-- The generation_id FK is declared WITH its real ON DELETE SET NULL action. It
-- previously read `generation_id uuid` with no FK at all, so the SET NULL
-- referential action never fired here — which is exactly how the guard's refusal
-- of that action (a cascade UPDATE) survived every gate and was first caught by
-- the staging matrix. A subset that omits a referential action cannot test it.
create table public.source_capture_intents (
  id uuid primary key default gen_random_uuid(),
  source_asset_id uuid not null unique references public.media_assets(id) on delete cascade,
  owner_id uuid not null,
  generation_id uuid references public.generations(id) on delete set null,
  origin text not null check (origin in ('teleprompter','upload')),
  recording_script_sha256 text check (recording_script_sha256 ~ '^[0-9a-f]{64}$'),
  client_attempt_id uuid not null,
  intent jsonb not null,
  intent_sha256 text not null check (intent_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint capture_intent_origin_shape check (
    (origin = 'teleprompter' and recording_script_sha256 is not null)
    or (origin = 'upload' and recording_script_sha256 is null))
);
-- NOTE: `editor_capture_no_mutate` is NOT defined here. It used to be a
-- hand-written copy, and the copy drifted from the migration in the direction
-- that HID a bug: it claimed to match "0091's forward-corrected function" while
-- the real chain (0090 → 0091 → 0093) behaved differently on the SET NULL path.
-- run.sh now loads the authoritative body straight out of 0093 before the
-- triggers below are exercised, so there is no mirror left to drift.
create trigger source_capture_intents_immutable before update or delete on public.source_capture_intents
  for each row execute function public.editor_capture_no_mutate();

create table public.source_capture_manifests (
  id uuid primary key default gen_random_uuid(),
  source_asset_id uuid not null unique references public.media_assets(id) on delete cascade,
  owner_id uuid not null,
  origin text not null check (origin in ('teleprompter','upload')),
  intent_sha256 text not null check (intent_sha256 ~ '^[0-9a-f]{64}$'),  -- mirror 0090
  manifest jsonb not null,
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),  -- mirror 0090
  normalization_version text not null,
  created_at timestamptz not null default now()
);
create trigger source_capture_manifests_immutable before update or delete on public.source_capture_manifests
  for each row execute function public.editor_capture_no_mutate();

-- 0091 source-bound recording-script snapshot (subset: table + append-only trigger).
create table public.source_script_snapshots (
  source_asset_id uuid primary key references public.media_assets(id) on delete cascade,
  owner_id uuid not null,
  generation_id uuid not null,
  snapshot jsonb not null,
  snapshot_sha text not null check (snapshot_sha ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create trigger source_script_snapshots_immutable before update or delete on public.source_script_snapshots
  for each row execute function public.editor_capture_no_mutate();

-- ---- item 7: real RLS identity matrix support -----------------------------
-- Minimal auth.uid() + workspace_peers() reading GUCs, so the read policies are
-- exercisable under SET ROLE (mirrors Supabase's auth.uid()).
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function public.workspace_peers() returns setof uuid language sql stable as $$
  select nullif(current_setting('test.workspace_peer', true), '')::uuid
   where nullif(current_setting('test.workspace_peer', true), '') is not null
$$;
-- Explicit privilege posture (mirrors 0091 §7): revoke ALL from public/anon/authenticated,
-- grant authenticated SELECT only, service_role full DML. RLS filters reads to owner+peer.
-- ALL THREE capture tables get identical posture — intents, manifests, and script
-- snapshots — so the identity matrix can prove each one under SET ROLE.
alter table public.source_capture_intents enable row level security;
alter table public.source_capture_manifests enable row level security;
alter table public.source_script_snapshots enable row level security;
drop policy if exists sci_owner_read on public.source_capture_intents;
create policy sci_owner_read on public.source_capture_intents for select
  using (owner_id = auth.uid() or owner_id in (select public.workspace_peers()));
drop policy if exists scm_owner_read on public.source_capture_manifests;
create policy scm_owner_read on public.source_capture_manifests for select
  using (owner_id = auth.uid() or owner_id in (select public.workspace_peers()));
drop policy if exists sss_owner_read on public.source_script_snapshots;
create policy sss_owner_read on public.source_script_snapshots for select
  using (owner_id = auth.uid() or owner_id in (select public.workspace_peers()));
revoke all on public.source_capture_intents from public, anon, authenticated;
revoke all on public.source_capture_manifests from public, anon, authenticated;
revoke all on public.source_script_snapshots from public, anon, authenticated;
grant select on public.source_capture_intents to authenticated;
grant select on public.source_capture_manifests to authenticated;
grant select on public.source_script_snapshots to authenticated;
grant select, insert, update, delete on public.source_capture_intents to service_role;
grant select, insert, update, delete on public.source_capture_manifests to service_role;
grant select, insert, update, delete on public.source_script_snapshots to service_role;

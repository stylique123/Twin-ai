-- Faithful subset of the real schema for Gate-D create/complete RPC verification.
create extension if not exists pgcrypto;

drop table if exists public.source_capture_manifests cascade;
drop table if exists public.source_capture_intents cascade;
drop table if exists public.media_assets cascade;
drop table if exists public.generations cascade;

create table public.generations (id uuid primary key default gen_random_uuid(), user_id uuid not null);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  generation_id uuid,
  recording_attempt_id uuid,
  kind text not null check (kind in ('source','music','output','thumbnail')),
  bucket text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  status text not null default 'uploading' check (status in ('uploading','validating','ready','rejected','deleted')),
  metadata jsonb not null default '{}'::jsonb,
  capture_contract_version integer check (capture_contract_version is null or capture_contract_version = 1),
  created_at timestamptz not null default now(),
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
  if old.status = 'rejected' and new.status = 'validating' then return new; end if;
  raise exception 'media_assets: illegal status transition % -> %', old.status, new.status;
end; $$;
create trigger media_assets_status_guard before update of status on public.media_assets
  for each row execute function public.media_assets_status_guard();

-- 0090 capture intents (subset: table + append-only trigger).
create table public.source_capture_intents (
  id uuid primary key default gen_random_uuid(),
  source_asset_id uuid not null unique references public.media_assets(id) on delete cascade,
  owner_id uuid not null,
  generation_id uuid,
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
create or replace function public.editor_capture_no_mutate() returns trigger language plpgsql as $$
begin raise exception 'capture_row_immutable: % is append-only', tg_table_name; end; $$;
create trigger source_capture_intents_immutable before update or delete on public.source_capture_intents
  for each row execute function public.editor_capture_no_mutate();

create table public.source_capture_manifests (
  id uuid primary key default gen_random_uuid(),
  source_asset_id uuid not null unique references public.media_assets(id) on delete cascade,
  owner_id uuid not null,
  origin text not null check (origin in ('teleprompter','upload')),
  intent_sha256 text not null,
  manifest jsonb not null,
  manifest_sha256 text not null,
  normalization_version text not null,
  created_at timestamptz not null default now()
);
create trigger source_capture_manifests_immutable before update or delete on public.source_capture_manifests
  for each row execute function public.editor_capture_no_mutate();

-- Faithful subset of the real schema for Gate-D create/complete RPC verification.
create extension if not exists pgcrypto;

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
  scene_timeline jsonb
);

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
-- Matches 0091's forward-corrected function: UPDATE always fails; a DIRECT delete
-- fails, but a sanctioned parent-cascade (pg_trigger_depth()>1) is permitted so
-- retention leaves no orphan rows.
create or replace function public.editor_capture_no_mutate() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'capture_row_immutable: % is append-only', tg_table_name using errcode = 'raise_exception';
  end if;
  if pg_trigger_depth() = 1 then
    raise exception 'capture_row_immutable: % direct deletes are not permitted (retention runs via the parent cascade)', tg_table_name using errcode = 'raise_exception';
  end if;
  return old;
end; $$;
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
-- Explicit privilege posture (mirrors 0091): revoke ALL from public/anon/authenticated,
-- grant authenticated SELECT only, service_role full DML. RLS filters reads to owner+peer.
alter table public.source_capture_intents enable row level security;
alter table public.source_script_snapshots enable row level security;
drop policy if exists sci_owner_read on public.source_capture_intents;
create policy sci_owner_read on public.source_capture_intents for select
  using (owner_id = auth.uid() or owner_id in (select public.workspace_peers()));
drop policy if exists sss_owner_read on public.source_script_snapshots;
create policy sss_owner_read on public.source_script_snapshots for select
  using (owner_id = auth.uid() or owner_id in (select public.workspace_peers()));
revoke all on public.source_capture_intents from public, anon, authenticated;
revoke all on public.source_script_snapshots from public, anon, authenticated;
grant select on public.source_capture_intents to authenticated;
grant select on public.source_script_snapshots to authenticated;
grant select, insert, update, delete on public.source_capture_intents to service_role;
grant select, insert, update, delete on public.source_script_snapshots to service_role;

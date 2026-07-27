-- migration-reconcile — PREREQUISITE PRELUDE for the disposable EXPECTED database.
--
-- Purpose: stand up the Supabase-specific objects that 0090-0093 REFERENCE but do
-- NOT own, so the four migrations can be applied BYTE-EXACTLY and unmodified.
--
-- Everything created here is deliberately OUTSIDE the compared surface. The
-- ownership ledger (see sql/20_ownership.sql) is computed as an AFTER-minus-BEFORE
-- catalog difference around the migration apply, so no object defined in this file
-- can ever enter the manifest. The two exceptions are attributes that 0090-0093
-- themselves ADD to a pre-existing table (media_assets.capture_contract_version and
-- its check constraint, the two triggers) — those are added by the migration, so
-- they are exact by construction, not by this stub's fidelity.
--
-- Fidelity still matters for one reason: an infidelity here can make a migration
-- FAIL to apply, or apply into a different shape. So the shapes below are copied
-- from the authoritative earlier migrations (0076 media_assets, 0088
-- edit_director_decisions) rather than invented.

-- Supabase puts pgcrypto in `extensions`, NOT public. A function that pins
-- `search_path = pg_catalog, public` without `extensions` resolves digest()
-- locally on a vanilla install and FAILS on Supabase. Mirror Supabase exactly so
-- the migrations apply here under the same resolution rules they face on staging.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
  execute format('alter database %I set search_path = pg_catalog, public, extensions', current_database());
end $$;

-- Supabase's standard roles, so grant/ACL posture is meaningful in the manifest.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
alter role service_role bypassrls;

-- auth.users / auth.uid(): the FK target and the RLS subject.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- The sharing seam 0091's capture-read policies call.
create or replace function public.workspace_peers() returns setof uuid language sql stable as $$
  select nullif(current_setting('test.workspace_peer', true), '')::uuid
   where nullif(current_setting('test.workspace_peer', true), '') is not null
$$;

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  selected_hook text,
  scene_timeline jsonb,
  source_asset_id uuid,
  take_path text
);

-- Shape copied from 0076 (the authority), including referential actions: an
-- omitted ON DELETE action has twice produced a false result in this project's
-- harnesses. capture_contract_version is NOT declared here — 0091 adds it, and the
-- manifest must observe the migration's own version of that column.
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  generation_id uuid references public.generations(id) on delete set null,
  kind text not null check (kind in ('source', 'music', 'output', 'thumbnail')),
  recording_attempt_id uuid,
  seq bigint generated always as identity,
  bucket text not null,
  storage_path text not null unique,
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
  status text not null default 'uploading'
    check (status in ('uploading', 'validating', 'ready', 'rejected', 'deleted')),
  validation_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  constraint media_assets_source_needs_attempt
    check (kind <> 'source' or recording_attempt_id is not null)
);
create index if not exists media_assets_generation_idx on public.media_assets (generation_id, kind, created_at desc);
create index if not exists media_assets_owner_idx on public.media_assets (owner_id, created_at desc);
create unique index if not exists media_assets_attempt_uniq
  on public.media_assets (owner_id, generation_id, recording_attempt_id)
  where recording_attempt_id is not null;

-- 0092 attaches a trigger to this table. Columns the guard reads (schema_version,
-- decision) are copied from 0088; the FK parents are collapsed to plain columns
-- because they are outside both the owned surface and the guard's reach.
create table if not exists public.edit_director_decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  edit_project_id uuid not null,
  director_call_id uuid not null,
  schema_version integer not null,
  envelope_sha256 text not null check (envelope_sha256 ~ '^[0-9a-f]{64}$'),
  response_sha256 text not null check (response_sha256 ~ '^[0-9a-f]{64}$'),
  decision jsonb not null,
  decision_sha256 text not null check (decision_sha256 ~ '^[0-9a-f]{64}$'),
  model text not null,
  provider text not null,
  auto_filler_removal boolean not null default false check (auto_filler_removal = false),
  created_at timestamptz not null default now()
);

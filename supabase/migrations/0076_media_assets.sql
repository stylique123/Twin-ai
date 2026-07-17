-- Editor v2 — Phase 1: durable source-asset truth.
--
-- A finished teleprompter recording / upload must become exactly ONE validated,
-- durable, privately owned source asset that survives refresh and devices and can
-- be referenced safely by ID. The browser-local pointer becomes a convenience
-- cache only; this table is the authority.
--
-- media_assets tracks source (and later: music, output, thumbnail) assets.
-- Lifecycle: uploading -> validating -> ready | rejected  (deleted = retention).
-- Rows are created/updated ONLY by the `source-asset` edge function and the
-- worker's `validate_source` job (service role). Clients get SELECT via RLS.
-- All media time is integer milliseconds (duration_ms), sizes in bytes.

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  generation_id uuid references public.generations(id) on delete set null,
  kind text not null check (kind in ('source', 'music', 'output', 'thumbnail')),
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
  -- Structured details (probe output, rejection reason). NEVER used for authorization.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  validated_at timestamptz
);

create index media_assets_generation_idx on public.media_assets (generation_id, kind, created_at desc);
create index media_assets_owner_idx on public.media_assets (owner_id, created_at desc);

alter table public.media_assets enable row level security;

-- Reads: the owner and their workspace peers (the same sharing seam the takes/
-- edits storage buckets use). No client INSERT/UPDATE/DELETE policies exist —
-- writes go through the service role only, so a client can never mark its own
-- asset "ready" or forge ownership.
create policy "media_assets read" on public.media_assets
  for select to authenticated
  using (owner_id = auth.uid() or owner_id in (select workspace_peers()));

grant select on public.media_assets to authenticated;

-- Durable source pointer on the generation. Authoritative over the legacy
-- compatibility field take_path (which the validator also writes so existing
-- playback keeps working). Written only by the service role.
alter table public.generations
  add column if not exists source_asset_id uuid references public.media_assets(id);

comment on column public.generations.source_asset_id is
  'Durable pointer to the validated source recording (media_assets.id). Authoritative; take_path is a compatibility projection.';

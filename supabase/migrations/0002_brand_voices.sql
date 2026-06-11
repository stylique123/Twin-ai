-- TwinAI Phase 2 — Brand-DNA from handle (the moat).
-- Adds brand voices (a confirmed voice profile per handle), a generic jobs queue
-- (the spine for all heavy/async work), account_type on profiles, and links a
-- generation to the brand voice it was written in.

-- ---------------------------------------------------------------------------
-- profiles.account_type  (creator | agency)
-- Agencies manage many brand voices; creators have one default.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists account_type text not null default 'creator';

grant update (account_type) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- brand_voices — one confirmed voice profile per handle.
--   status: building → ready | failed
--   profile(jsonb): { tone, pacing, vocabulary[], hook_style, niche,
--                     recurring_ctas[], dos[], donts[], sample_hooks[], summary }
-- ---------------------------------------------------------------------------
create table if not exists public.brand_voices (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  handle      text not null,
  platform    text not null default 'tiktok',
  label       text,                       -- friendly name (defaults to @handle)
  profile     jsonb,                       -- the synthesized voice; null until ready
  status      text not null default 'building',
  is_default  boolean not null default false,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists brand_voices_owner_idx
  on public.brand_voices (owner_id, created_at desc);

-- One default brand voice per owner: flipping one on flips the rest off.
create or replace function public.brand_voice_single_default()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.is_default then
    update public.brand_voices
      set is_default = false, updated_at = now()
      where owner_id = new.owner_id and id <> new.id and is_default;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists brand_voices_single_default on public.brand_voices;
create trigger brand_voices_single_default
  before insert or update on public.brand_voices
  for each row execute function public.brand_voice_single_default();

alter table public.brand_voices enable row level security;

create policy "own brand voices read"
  on public.brand_voices for select using (auth.uid() = owner_id);
create policy "own brand voices update"
  on public.brand_voices for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "own brand voices delete"
  on public.brand_voices for delete using (auth.uid() = owner_id);

-- Rows are created by edge functions (service role). Users may only edit the
-- editable parts of a confirmed voice (the chips on the confirm card) and toggle
-- which one is default — never status/handle/owner.
revoke update on public.brand_voices from authenticated, anon;
grant update (profile, label, is_default) on public.brand_voices to authenticated;

-- ---------------------------------------------------------------------------
-- jobs — the generic async work queue (the spine of all heavy work).
--   type: build_dna | ingest | transcribe | render | publish | refresh_gallery
--   status: queued → running → done | failed
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users (id) on delete cascade,
  type        text not null,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'queued',
  attempts    integer not null default 0,
  result      jsonb,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists jobs_status_idx on public.jobs (status, created_at);
create index if not exists jobs_owner_idx  on public.jobs (owner_id, created_at desc);

alter table public.jobs enable row level security;

-- Owners may watch their own jobs (progress). All writes are service-role only.
create policy "own jobs read" on public.jobs for select using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- generations.brand_voice_id — the voice a blueprint was written in.
-- ---------------------------------------------------------------------------
alter table public.generations
  add column if not exists brand_voice_id uuid references public.brand_voices (id) on delete set null;

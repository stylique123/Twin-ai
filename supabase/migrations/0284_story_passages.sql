-- Plan 2.2: THE PASSAGE STORE. Whole passages of the creator's own speech,
-- cut from her own timed transcripts and kept verbatim (never summarised),
-- tagged Moment / Meaning / Detail. Only her own words: rows come from
-- transcripts with subject = 'own'. Service role only; no client access.
create table if not exists public.story_passages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  voice_id uuid not null,
  source_url text,
  start_sec real not null,
  end_sec real not null,
  text text not null,
  kind text not null check (kind in ('story', 'process', 'other')),
  complete boolean not null default false,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (voice_id, source_url, start_sec)
);
create index if not exists story_passages_voice on public.story_passages (voice_id);
alter table public.story_passages enable row level security;

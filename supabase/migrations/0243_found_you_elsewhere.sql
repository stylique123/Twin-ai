-- FOUND YOU ELSEWHERE (24-ideas #15 podcasts / interviews, #16 press).
-- The worker searches once a month per voice and keeps what it finds as
-- CANDIDATES. Nothing is used until the creator confirms it is her
-- (`decide_mention`); only confirmed ones are filed into her knowledge.
create table if not exists public.creator_mentions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  voice_id uuid references public.brand_voices(id) on delete set null,
  kind text not null check (kind in ('podcast', 'interview', 'press')),
  title text not null check (length(title) between 4 and 200),
  outlet text not null check (length(outlet) between 1 and 120),
  url text not null check (url like 'https://%' and length(url) <= 400),
  published date,
  status text not null default 'found' check (status in ('found', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  filed_at timestamptz,
  unique (owner_id, url)
);
alter table public.creator_mentions enable row level security;
drop policy if exists creator_mentions_owner_read on public.creator_mentions;
create policy creator_mentions_owner_read on public.creator_mentions for select using (owner_id = auth.uid());

create table if not exists public.mention_searches (
  voice_id uuid primary key references public.brand_voices(id) on delete cascade,
  searched_at timestamptz not null default now()
);
alter table public.mention_searches enable row level security;

-- She decides; nobody else can. Only her own candidate, only once.
create or replace function public.decide_mention(p_id uuid, p_is_me boolean)
returns boolean language sql security definer set search_path = public as $$
  with u as (
    update public.creator_mentions
       set status = case when p_is_me then 'confirmed' else 'rejected' end, decided_at = now()
     where id = p_id and owner_id = auth.uid() and status = 'found'
    returning 1)
  select exists(select 1 from u);
$$;
revoke all on function public.decide_mention(uuid, boolean) from public, anon;
grant execute on function public.decide_mention(uuid, boolean) to authenticated;

-- One voice at a time: ready, and not searched in the last 30 days.
create or replace function public.mentions_due(p_limit integer default 1)
returns table (voice_id uuid, owner_id uuid, handle text, platform text, label text, niche text)
language sql stable security definer set search_path = public as $$
  select v.id, v.owner_id, v.handle, v.platform, v.label,
         coalesce(v.profile->>'sub_niche', v.profile->>'niche')
  from public.brand_voices v
  left join public.mention_searches s on s.voice_id = v.id
  where v.status = 'ready' and (s.voice_id is null or s.searched_at < now() - interval '30 days')
  order by s.searched_at nulls first
  limit greatest(1, least(p_limit, 5));
$$;
revoke all on function public.mentions_due(integer) from public, anon, authenticated;
grant execute on function public.mentions_due(integer) to service_role;

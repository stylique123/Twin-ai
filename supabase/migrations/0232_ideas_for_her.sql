-- NICHE BRAIN step 4 — IDEAS FOR HER: "post these next".
--
-- The worker writes a fresh batch (up to 6) per creator voice once a day from
-- everything the brain knows: her DNA, her products, her own best posts, the
-- scripts already written (never repeat), what is rising in her lane, world
-- moments, and the closest niche notes. The Create screen shows them; one tap
-- fills the idea box (and picks the product).
--
-- ⚖️ ADDITIVE. One owner-scoped table. The Create flow is unchanged when it is
-- empty.
create table if not exists public.creator_ideas (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  voice_id     uuid references public.brand_voices(id) on delete cascade,
  batch_day    date not null,
  title        text not null,
  premise      text not null,
  mode         text,
  goal         text,
  why          text,
  hook         text,
  product_id   uuid references public.product_entities(id) on delete set null,
  used_at      timestamptz,
  dismissed_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists creator_ideas_owner on public.creator_ideas (owner_id, batch_day desc);
alter table public.creator_ideas enable row level security;
drop policy if exists creator_ideas_read on public.creator_ideas;
create policy creator_ideas_read on public.creator_ideas for select to authenticated using (owner_id = auth.uid());
drop policy if exists creator_ideas_mark on public.creator_ideas;
create policy creator_ideas_mark on public.creator_ideas for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke update on public.creator_ideas from authenticated;
grant update (used_at, dismissed_at) on public.creator_ideas to authenticated;

-- voices due a fresh batch today. ⚠️ RANDOM ORDER: a voice whose batch keeps
-- failing must not head the queue forever and starve every other creator.
create or replace function public.ideas_due(p_day date, p_limit integer default 1)
returns table (voice_id uuid, owner_id uuid, profile jsonb)
language sql stable security definer set search_path = public as $$
  select v.id, v.owner_id, v.profile
  from public.brand_voices v
  where v.status = 'ready' and v.profile is not null
    and not exists (select 1 from public.creator_ideas i where i.voice_id = v.id and i.batch_day = p_day)
  order by random()
  limit greatest(1, least(p_limit, 10));
$$;
revoke all on function public.ideas_due(date, integer) from public, anon, authenticated;
grant execute on function public.ideas_due(date, integer) to service_role;

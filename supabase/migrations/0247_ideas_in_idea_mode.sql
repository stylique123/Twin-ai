-- IDEAS FOR YOU, REDESIGNED (owner's brief, 2026-09-27).
--
-- Every idea now says WHAT IT IS BUILT FROM, because that decides how it is
-- treated:
--   basis 'own'     — only her own proven pattern / confirmed facts → may be a
--                     ready draft (no follow-up questions), unless it sells.
--   basis 'event'   — tied to a dated moment (event_day) → she confirms first.
--   basis 'trend'   — a niche guess, not her proven pattern → she confirms.
--   basis 'product' — leans on a product detail not yet confirmed → confirms.
-- `ready` is DERIVED by the writer from those rules, never by the model.
--
-- Nothing good expires silently: an unpicked undated idea carries forward; a
-- dated idea whose day has passed is folded into `creator_seasonal_ideas`, so
-- next year's same date can raise it again, informed by whether she used it.
alter table public.creator_ideas
  add column if not exists basis text check (basis in ('own','event','trend','product')),
  add column if not exists event_day date,
  add column if not exists ready boolean not null default false,
  add column if not exists folded_at timestamptz;

create table if not exists public.creator_seasonal_ideas (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  voice_id    uuid references public.brand_voices(id) on delete cascade,
  source_idea uuid unique references public.creator_ideas(id) on delete set null,
  month       smallint not null check (month between 1 and 12),
  day         smallint not null check (day between 1 and 31),
  title       text not null,
  premise     text not null,
  mode        text,
  goal        text,
  outcome     text not null check (outcome in ('used','ignored','hidden')),
  created_at  timestamptz not null default now()
);
create index if not exists creator_seasonal_ideas_voice on public.creator_seasonal_ideas (voice_id, month, day);
alter table public.creator_seasonal_ideas enable row level security;
drop policy if exists creator_seasonal_ideas_read on public.creator_seasonal_ideas;
create policy creator_seasonal_ideas_read on public.creator_seasonal_ideas for select to authenticated using (owner_id = auth.uid());

-- Fold every dated idea whose day has passed. Idempotent (folded_at + unique source).
create or replace function public.fold_passed_ideas(p_today date)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.creator_seasonal_ideas (owner_id, voice_id, source_idea, month, day, title, premise, mode, goal, outcome)
  select i.owner_id, i.voice_id, i.id, extract(month from i.event_day)::smallint, extract(day from i.event_day)::smallint,
         i.title, i.premise, i.mode, i.goal,
         case when i.used_at is not null then 'used' when i.dismissed_at is not null then 'hidden' else 'ignored' end
  from public.creator_ideas i
  where i.event_day is not null and i.event_day < p_today and i.folded_at is null
  on conflict (source_idea) do nothing;
  get diagnostics n = row_count;
  update public.creator_ideas set folded_at = now()
  where event_day is not null and event_day < p_today and folded_at is null;
  return n;
end $$;
revoke all on function public.fold_passed_ideas(date) from public, anon, authenticated;
grant execute on function public.fold_passed_ideas(date) to service_role;

-- A fresh batch only when her open list has room: carried-forward ideas are
-- still hers, so a daily batch must not bury them.
create or replace function public.ideas_due(p_day date, p_limit integer default 1)
returns table (voice_id uuid, owner_id uuid, profile jsonb)
language sql stable security definer set search_path = public as $$
  select v.id, v.owner_id, v.profile
  from public.brand_voices v
  where v.status = 'ready' and v.profile is not null
    and not exists (select 1 from public.creator_ideas i where i.voice_id = v.id and i.batch_day = p_day)
    and (select count(*) from public.creator_ideas i
         where i.voice_id = v.id and i.used_at is null and i.dismissed_at is null
           and (i.event_day is null or i.event_day >= p_day)) < 8
  order by random()
  limit greatest(1, least(p_limit, 10));
$$;
revoke all on function public.ideas_due(date, integer) from public, anon, authenticated;
grant execute on function public.ideas_due(date, integer) to service_role;

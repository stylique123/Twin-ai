-- HER PANEL — the same ~10 test viewers for every script of one creator voice,
-- built once from her REAL posts (what did well, what did not) plus her DNA.
--
-- ⚖️ WHY FIXED: fresh viewers per script meant "Gift buyer" on Monday was a
-- different person on Tuesday, so two scripts' results could not be compared.
-- A fixed panel is also cheaper: the test reuses it instead of inventing ten
-- people every time. It is rebuilt weekly, or when her post count moves.
--
-- ⚠️ NOT HER COMMENTERS. The platform scrape stores comment COUNTS, not text,
-- so the panel is built from what her audience did (plays, likes, which posts
-- won) — real behaviour, but not real words. Comment text needs the TikTok /
-- Instagram connection.
--
-- Also widens audience_untested to the last 30 days, newest first, so scripts
-- written before test viewers existed get tested too.

create table if not exists public.audience_panels (
  voice_id    uuid primary key references public.brand_voices(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  personas    jsonb not null default '[]'::jsonb,
  built_from  jsonb not null default '{}'::jsonb,
  posts_seen  integer not null default 0,
  model       text,
  built_at    timestamptz not null default now()
);
alter table public.audience_panels enable row level security;
drop policy if exists audience_panels_own_read on public.audience_panels;
create policy audience_panels_own_read on public.audience_panels for select to authenticated
  using (owner_id = auth.uid());

alter table public.audience_tests add column if not exists panel_voice_id uuid;

-- Voices whose panel is missing, a week old, or built from fewer posts than she has now.
create or replace function public.panels_due(p_limit integer default 1)
returns table (voice_id uuid, owner_id uuid, profile jsonb, posts integer)
language sql stable security definer set search_path = public as $$
  select v.id, v.owner_id, v.profile,
         (select count(*)::int from public.scraped_posts s where s.voice_id = v.id)
  from public.brand_voices v
  left join public.audience_panels p on p.voice_id = v.id
  where v.status = 'ready' and v.profile is not null
    and (p.voice_id is null
         or p.built_at < now() - interval '7 days'
         or p.posts_seen < (select count(*) from public.scraped_posts s where s.voice_id = v.id) - 5)
  order by p.built_at nulls first
  limit greatest(1, least(p_limit, 10));
$$;
revoke all on function public.panels_due(integer) from public, anon, authenticated;
grant execute on function public.panels_due(integer) to service_role;

-- Her real posts, best and weakest, with what the reader learned from them.
create or replace function public.panel_evidence(p_voice uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with p as (
    select s.caption, s.plays, s.likes, r.topic, r.hook_type, r.why_it_works
    from public.scraped_posts s
    left join public.own_post_reads r on r.scraped_post_id = s.id and r.status = 'read'
    where s.voice_id = p_voice and s.caption is not null
  )
  select jsonb_build_object(
    'best',  coalesce((select jsonb_agg(x) from (select * from p order by plays desc nulls last limit 6) x), '[]'::jsonb),
    'worst', coalesce((select jsonb_agg(x) from (select * from p where plays is not null order by plays asc limit 4) x), '[]'::jsonb),
    'n',     (select count(*) from p)
  );
$$;
revoke all on function public.panel_evidence(uuid) from public, anon, authenticated;
grant execute on function public.panel_evidence(uuid) to service_role;

drop function if exists public.audience_untested(integer);
create or replace function public.audience_untested(p_limit integer default 3)
returns table (id uuid, user_id uuid, blueprint jsonb, reference_note text, profile jsonb, voice_id uuid)
language sql stable security definer set search_path = public as $$
  select g.id, g.user_id, g.blueprint, g.reference_note, v.profile, g.brand_voice_id
  from public.generations g
  left join public.brand_voices v on v.id = g.brand_voice_id
  where g.created_at > now() - interval '30 days'
    and coalesce(g.is_heartbeat, false) = false
    and g.blueprint ? 'hook_options'
    and not exists (select 1 from public.audience_tests t where t.generation_id = g.id)
  order by g.created_at desc
  limit greatest(1, least(p_limit, 10));
$$;
revoke all on function public.audience_untested(integer) from public, anon, authenticated;
grant execute on function public.audience_untested(integer) to service_role;

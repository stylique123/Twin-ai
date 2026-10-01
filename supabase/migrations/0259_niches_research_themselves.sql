-- ⚠️ OWNER 2026-10-01 ("the moat"): a new niche got only a small video scrape,
-- and only if NO video carried its label at all — a niche with three thin
-- rows got nothing more. Now:
--   1. niche_research: every sub-niche a creator brings is researched on its
--      own (dates, news, new products, competitors, live questions), with real
--      sources only, refreshed weekly; a NEW niche goes first.
--   2. The signup scrape fires while a niche has fewer than 12 videos, not 0.
--   3. Loop 4 (brain_learn): a rating tagged "Wrong product facts" was a trust
--      failure, not a craft verdict on the niche notes the script used. It no
--      longer moves those notes' rating credit.
create table if not exists public.niche_research (
  niche_key text primary key,
  sub_niche text not null,
  niche text,
  items jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  model text,
  researched_at timestamptz not null default now()
);
alter table public.niche_research enable row level security;
drop policy if exists niche_research_read on public.niche_research;
create policy niche_research_read on public.niche_research for select to authenticated using (true);

create or replace function public.niche_research_due(p_ttl_days int default 7)
returns table(sub_niche text, niche text)
language sql stable security definer set search_path = public as $fn$
  with mine as (
    select distinct on (k) k, coalesce(nullif(btrim(v.profile->>'sub_niche'), ''), v.profile->>'niche') as sub, v.profile->>'niche' as niche
    from public.brand_voices v,
         lateral (select btrim(regexp_replace(lower(coalesce(nullif(btrim(v.profile->>'sub_niche'), ''), v.profile->>'niche', '')), '[^a-z0-9]+', ' ', 'g')) as k) kk
    where v.status = 'ready' and v.profile is not null and kk.k <> ''
  )
  select m.sub, m.niche from mine m
  left join public.niche_research r on r.niche_key = left(m.k, 80)
  where r.niche_key is null or r.researched_at < now() - make_interval(days => greatest(1, p_ttl_days))
  order by (r.niche_key is null) desc, r.researched_at nulls first
  limit 1;
$fn$;
revoke all on function public.niche_research_due(int) from public;

create or replace function public.kick_discovery_on_new_niche()
returns trigger language plpgsql security definer set search_path = public, vault, net as $fn$
declare
  tok text; raw_niche text; raw_sub text; cand text;
  cands text[] := '{}'; to_send text[] := '{}'; window_secs integer := 3600;
begin
  if new.status <> 'ready' or old.status is not distinct from 'ready' then return new; end if;
  raw_niche := public.sanitize_niche(new.profile->>'niche');
  raw_sub   := public.sanitize_niche(new.profile->>'sub_niche');
  if raw_niche <> '' and (select count(*) from public.gallery_items gi where lower(gi.niche) = lower(raw_niche)) < 12 then
    cands := array_append(cands, raw_niche);
  end if;
  if raw_sub <> '' and lower(raw_sub) <> lower(raw_niche) and (select count(*) from public.gallery_items gi where lower(gi.niche) = lower(raw_sub)) < 12 then
    cands := array_append(cands, raw_sub);
  end if;
  foreach cand in array cands loop
    if not exists (select 1 from public.discovery_dispatch_log d where d.niche = lower(cand) and d.last_dispatch > now() - make_interval(secs => window_secs)) then
      to_send := array_append(to_send, cand);
      insert into public.discovery_dispatch_log (niche, last_dispatch) values (lower(cand), now())
      on conflict (niche) do update set last_dispatch = excluded.last_dispatch;
    end if;
  end loop;
  if array_length(to_send, 1) is null then return new; end if;
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'gh_dispatch_token';
  if tok is not null then
    begin
      perform net.http_post(
        url := 'https://api.github.com/repos/stylique123/Twin-ai/actions/workflows/deploy-discovery.yml/dispatches',
        headers := jsonb_build_object('Authorization', 'Bearer ' || tok, 'Accept', 'application/vnd.github+json', 'User-Agent', 'twinai-discovery-trigger', 'Content-Type', 'application/json'),
        body := jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('only_niche', array_to_string(to_send, ',')))
      );
    exception when others then
      insert into public.ops_events (kind, severity, detail)
      values ('discovery_dispatch_failed', 'warn', jsonb_build_object('error', sqlerrm, 'niches', array_to_string(to_send, ',')));
    end;
  end if;
  return new;
end
$fn$;

create or replace function public.brain_learn()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare n integer;
begin
  with gen as (
    select u.note_id, a.generation_id
    from public.brain_note_uses u
    left join lateral (
      select generation_id from public.script_attempts a
      where a.run_id = u.run_id and a.generation_id is not null limit 1
    ) a on true
  ),
  craft_ratings as (
    select * from public.script_ratings r
    where not (coalesce(to_jsonb(r.tags), '[]'::jsonb) ? 'Wrong product facts')
  ),
  outcome as (
    select g.note_id,
           count(*)::int used,
           count(*) filter (where coalesce(o.was_filmed, false)
                              or ge.take_path is not null or ge.source_asset_id is not null
                              or ge.approved_output_asset_id is not null or ge.accepted_final_at is not null
                              or exists (select 1 from public.edit_projects ep where ep.generation_id = g.generation_id))::int filmed,
           count(*) filter (where o.was_published)::int posted,
           coalesce(sum(o.views_7d), 0)::bigint views,
           coalesce(sum(r.stars), 0)::int rsum,
           count(r.stars)::int rn
    from gen g
    left join public.generations ge on ge.id = g.generation_id
    left join public.generation_outcomes o on o.generation_id = g.generation_id
    left join craft_ratings r on r.generation_id = g.generation_id
    group by g.note_id
  )
  update public.brain_notes b
     set used_count = o.used, filmed_count = o.filmed, posted_count = o.posted, outcome_views = o.views,
         rating_sum = o.rsum, rating_n = o.rn
    from outcome o
   where b.id = o.note_id
     and (b.used_count, b.filmed_count, b.posted_count, b.outcome_views, b.rating_sum, b.rating_n)
         is distinct from (o.used, o.filmed, o.posted, o.views, o.rsum, o.rn);
  get diagnostics n = row_count;
  return n;
end;
$function$;

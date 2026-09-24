-- NICHE BRAIN step 3 — WHAT IS RISING, AND WHAT SHE HAS ALREADY DONE.
--
-- Two read-only functions the script writer calls beside `brain_brief`.
--
-- 1. brain_trends — what the corpus is suddenly full of. Sub-niches and topics
--    in her lane, plus "moments": title words many DIFFERENT creators started
--    using this week (a World Cup, a holiday, a viral sound) across every niche.
--    ⚠️ HONEST ABOUT WHAT "RECENT" MEANS: it is when OUR scraper found the video,
--    not when it was posted. The scraper pulls fresh and popular posts, so the
--    two move together, but a spike can also be a scraping change. That is why
--    a trend needs several distinct creators, never several videos by one.
--
-- 2. creator_track_record — her own learning loop: her best and weakest posts
--    by plays, the scripts she already made (so ideas do not repeat and the
--    runway is visible), and what happened to them (filmed, posted, views).
--
-- ⚖️ ADDITIVE AND READ-ONLY. New functions only; no table is written.

create or replace function public.brain_trends(p_bucket text, p_sub_niche text)
returns table (kind text, label text, recent integer, prior integer, sample text)
language sql stable security definer set search_path = public as $$
  -- ⚠️ SHARES, NOT COUNTS. The corpus does not grow evenly (763 of 6,793 rows
  -- arrived in one fortnight), so a raw weekly count calls everything rising.
  -- A thing is rising when its share of the creators seen in the window at
  -- least DOUBLES against the prior four weeks.
  with r as (
    select cr.bucket, cr.sub_niche, cr.topic, g.creator, g.title,
           (g.created_at > now() - interval '7 days') is_recent
    from public.corpus_reads cr join public.gallery_items g on g.id = cr.gallery_item_id
    where cr.status = 'read' and g.created_at > now() - interval '35 days'
  ),
  lane as (select * from r where bucket is not distinct from p_bucket),
  lane_tot as (
    select count(distinct creator) filter (where is_recent) rt,
           count(distinct creator) filter (where not is_recent) pt from lane
  ),
  subs as (
    select 'sub_niche'::text kind, l.sub_niche label,
      count(distinct l.creator) filter (where l.is_recent)::int recent,
      count(distinct l.creator) filter (where not l.is_recent)::int prior,
      max(l.topic) sample, max(t.rt) rt, max(t.pt) pt
    from lane l cross join lane_tot t where l.sub_niche is not null group by l.sub_niche
  ),
  topics as (
    select 'topic'::text, l.topic, count(distinct l.creator) filter (where l.is_recent)::int,
      count(distinct l.creator) filter (where not l.is_recent)::int, max(l.title), max(t.rt), max(t.pt)
    from lane l cross join lane_tot t
    where l.sub_niche is not distinct from p_sub_niche and l.topic is not null group by l.topic
  ),
  g as (
    select creator, title, (created_at > now() - interval '7 days') is_recent
    from public.gallery_items where created_at > now() - interval '35 days'
  ),
  g_tot as (
    select count(distinct creator) filter (where is_recent) rt,
           count(distinct creator) filter (where not is_recent) pt from g
  ),
  words as (
    select lower(w) word, g.creator, g.is_recent, g.title
    from g, lateral regexp_split_to_table(coalesce(g.title, ''), '[^[:alnum:]#]+') w
    where length(w) >= 4 and w !~ '^[0-9]+$'
  ),
  moments as (
    select 'moment'::text, w.word, count(distinct w.creator) filter (where w.is_recent)::int,
      count(distinct w.creator) filter (where not w.is_recent)::int, max(w.title), max(t.rt), max(t.pt)
    from words w cross join g_tot t group by w.word
  ),
  allrows as (select * from subs union all select * from topics union all select * from moments)
  select kind, label, recent, prior, left(sample, 160)
  from allrows
  where recent >= 3
    and rt > 0
    -- a trend needs a real baseline: at least 30 creators in the prior window
    and pt >= 30
    and (recent::numeric / rt) >= 2 * ((prior::numeric + 1) / pt)
    and (kind <> 'moment' or recent >= 5)
  order by (kind = 'moment'), (recent::numeric / rt) / ((prior::numeric + 1) / pt) desc
  limit 20;
$$;
revoke all on function public.brain_trends(text, text) from public, anon, authenticated;
grant execute on function public.brain_trends(text, text) to service_role;

create or replace function public.creator_track_record(p_owner uuid, p_voice uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'best_posts', coalesce((
      select jsonb_agg(x) from (
        select left(caption, 140) caption, plays, likes from public.scraped_posts
        where owner_id = p_owner and (p_voice is null or voice_id = p_voice) and plays is not null and coalesce(caption,'') <> ''
        order by plays desc limit 5) x), '[]'::jsonb),
    'weakest_posts', coalesce((
      select jsonb_agg(x) from (
        select left(caption, 140) caption, plays from public.scraped_posts
        where owner_id = p_owner and (p_voice is null or voice_id = p_voice) and plays is not null and coalesce(caption,'') <> ''
        order by plays asc limit 3) x), '[]'::jsonb),
    'median_plays', (
      select percentile_cont(0.5) within group (order by plays) from public.scraped_posts
      where owner_id = p_owner and (p_voice is null or voice_id = p_voice) and plays is not null),
    'recent_scripts', coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select g.created_at, left(coalesce(g.blueprint->'concept'->>'premise', g.blueprint->'packaging'->'titles'->>0, ''), 160) premise,
               o.was_filmed, o.was_published, o.views_7d, g.script_intent
        from public.generations g
        left join public.generation_outcomes o on o.generation_id = g.id
        where g.user_id = p_owner and (p_voice is null or g.brand_voice_id = p_voice)
          and g.blueprint is not null and coalesce(g.is_heartbeat, false) = false
        order by g.created_at desc limit 12) x), '[]'::jsonb),
    'posted', coalesce((
      select jsonb_agg(x) from (
        select left(caption, 120) caption, views, likes, posted_at from public.posts
        where owner_id = p_owner and posted_at is not null order by posted_at desc limit 5) x), '[]'::jsonb)
  );
$$;
revoke all on function public.creator_track_record(uuid, uuid) from public, anon, authenticated;
grant execute on function public.creator_track_record(uuid, uuid) to service_role;

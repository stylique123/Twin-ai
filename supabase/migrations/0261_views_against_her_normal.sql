-- ⚠️ MOAT AUDIT 2026-10-01: a niche note's real-world credit counted raw views,
-- so one big account's video outweighed ten small creators' best posts. Credit
-- is now LIFT: a post's 7-day views over that creator's own median plays.
alter table public.brain_notes add column if not exists outcome_lift double precision not null default 0;

create or replace function public.brain_learn()
 returns integer language plpgsql security definer set search_path to 'public'
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
  her_normal as (
    select owner_id, greatest(percentile_cont(0.5) within group (order by plays), 1)::double precision as median_plays
    from public.scraped_posts where plays is not null and plays > 0 group by owner_id
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
           coalesce(sum(case when o.views_7d is not null and hn.median_plays is not null then o.views_7d / hn.median_plays end), 0)::double precision lift,
           coalesce(sum(r.stars), 0)::int rsum,
           count(r.stars)::int rn
    from gen g
    left join public.generations ge on ge.id = g.generation_id
    left join public.generation_outcomes o on o.generation_id = g.generation_id
    left join her_normal hn on hn.owner_id = ge.user_id
    left join craft_ratings r on r.generation_id = g.generation_id
    group by g.note_id
  )
  update public.brain_notes b
     set used_count = o.used, filmed_count = o.filmed, posted_count = o.posted, outcome_views = o.views,
         outcome_lift = o.lift, rating_sum = o.rsum, rating_n = o.rn
    from outcome o
   where b.id = o.note_id
     and (b.used_count, b.filmed_count, b.posted_count, b.outcome_views, b.outcome_lift, b.rating_sum, b.rating_n)
         is distinct from (o.used, o.filmed, o.posted, o.views, o.lift, o.rsum, o.rn);
  get diagnostics n = row_count;
  return n;
end;
$function$;

create or replace function public.brain_brief_scoped(p_embedding extensions.vector, p_owner uuid, p_min_similarity double precision default 0.6, p_k integer default 24)
 returns table(id uuid, kind text, title text, body text, sub_niche text, times_seen integer, total_views bigint, similarity double precision, is_hers boolean, filmed_count integer, posted_count integer)
 language sql stable security definer set search_path to 'public', 'extensions'
as $function$
  with near as (
    select n.id, n.kind, n.title, n.body, n.sub_niche, n.times_seen, n.total_views,
           1 - (n.embedding <=> p_embedding) as similarity,
           (n.owner_id is not null) as is_hers, n.filmed_count, n.posted_count, n.outcome_lift,
           case when n.rating_n > 0 then n.rating_sum::float / n.rating_n else null end as avg_rating
    from public.brain_notes n
    where n.embedding is not null and (n.owner_id is null or n.owner_id = p_owner)
    order by n.embedding <=> p_embedding
    limit 300
  )
  select id, kind, title, body, sub_niche, times_seen, total_views, similarity, is_hers, filmed_count, posted_count
  from near
  where similarity >= p_min_similarity
  order by similarity
         + 0.02 * ln(1 + times_seen)
         + case when is_hers then 0.05 else 0 end
         + 0.02 * ln(1 + filmed_count)
         + 0.03 * ln(1 + posted_count)
         + 0.02 * ln(1 + outcome_lift)
         + coalesce((avg_rating - 3) * 0.015, 0)
         desc
  limit greatest(1, least(p_k, 60));
$function$;

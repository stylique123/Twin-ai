-- ⚠️ OWNER AUDIT 2026-10-01 (gallery & niche classification). The Gallery fetched
-- the newest 200 rows of gallery_items and filtered them on gallery_items.niche —
-- the niche of whoever's search FOUND the video, the field 0227 replaced because
-- it says nothing about the video. All 8,103 videos are read (no backlog), but
-- corpus_reads.sub_niche is fragmented (708 labels, 573 used once), so an exact
-- sub_niche match would show one card. This ranks the WHOLE read corpus by how
-- close each video's own sub_niche and topic are to hers (trigram similarity),
-- then her bucket, and says which level matched so the page can be honest.
create extension if not exists pg_trgm;

create or replace function public.gallery_for_me(p_sub_niche text, p_niche text, p_bucket text, p_limit int default 120)
returns table(item jsonb, match text, score real)
language sql stable security definer set search_path = public, extensions as $fn$
  with me as (select lower(coalesce(nullif(btrim(p_sub_niche), ''), p_niche, '')) as sub,
                     lower(coalesce(p_niche, '')) as niche, coalesce(p_bucket, '') as bucket),
  scored as (
    select g, c.bucket,
           -- Measured on the coffee account: these weights put 25 coffee videos
           -- (roasting, packaging, micro-roastery launches) at 0.6+, and generic
           -- sales/business videos at ~0.4.
           greatest(similarity(lower(coalesce(c.sub_niche, '')), me.sub),
                    0.9 * word_similarity(me.niche, lower(coalesce(c.sub_niche, '') || ' ' || coalesce(c.topic, ''))),
                    0.8 * similarity(lower(coalesce(c.topic, '')), me.sub),
                    0.7 * word_similarity(me.niche, lower(coalesce(g.title, '')))) as sim,
           (c.bucket = me.bucket) as same_bucket
    from public.corpus_reads c
    join public.gallery_items g on g.id = c.gallery_item_id
    cross join me
    where c.status = 'read' and (g.visibility = 'public' or g.owner_id = auth.uid())
  ),
  ranked as (
    select distinct on ((g).url) g, sim, same_bucket,
           (sim + case when same_bucket then 0.25 else 0 end)::real as score
    from scored
    order by (g).url, sim desc
  )
  select to_jsonb(g) as item,
         case when sim >= 0.6 then 'sub_niche' when sim >= 0.45 then 'niche' when same_bucket then 'bucket' else 'other' end as match,
         score
  from ranked
  where sim >= 0.45 or same_bucket
  order by score desc
  limit greatest(1, least(p_limit, 300));
$fn$;
revoke all on function public.gallery_for_me(text, text, text, int) from public;
grant execute on function public.gallery_for_me(text, text, text, int) to authenticated;

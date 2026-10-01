-- ⚠️ OWNER AUDIT 2026-10-01: 860 sub-niche labels, most used once ("k-pop
-- audition tips" vs "kpop audition tips"). Each label used by fewer than 3
-- videos is folded into the closest established label (3+ videos) in the same
-- bucket when they are clearly the same thing (trigram similarity >= 0.5).
-- The original label is kept; matching reads the canonical one.
alter table public.corpus_reads add column if not exists sub_niche_canonical text;

create or replace function public.merge_sub_niches()
returns integer language plpgsql security definer set search_path = public, extensions as $fn$
declare n integer;
begin
  with c as (
    select bucket, lower(btrim(sub_niche)) s, count(*) cnt from public.corpus_reads
    where status = 'read' and sub_niche is not null and btrim(sub_niche) <> '' group by 1, 2
  ),
  big as (select * from c where cnt >= 3),
  m as (
    select distinct on (x.bucket, x.s) x.bucket, x.s raw, b.s canon
    from c x join big b on b.bucket = x.bucket and b.s <> x.s and similarity(x.s, b.s) >= 0.5
    where x.cnt < 3
    order by x.bucket, x.s, similarity(x.s, b.s) desc, b.cnt desc
  ),
  target as (
    select r.gallery_item_id, coalesce(m.canon, lower(btrim(r.sub_niche))) canon
    from public.corpus_reads r left join m on m.bucket = r.bucket and m.raw = lower(btrim(r.sub_niche))
    where r.status = 'read' and r.sub_niche is not null
  )
  update public.corpus_reads r set sub_niche_canonical = t.canon
    from target t where r.gallery_item_id = t.gallery_item_id and r.sub_niche_canonical is distinct from t.canon;
  get diagnostics n = row_count;
  return n;
end $fn$;
revoke all on function public.merge_sub_niches() from public;

-- The Gallery matches on the merged label too.
create or replace function public.gallery_for_me(p_sub_niche text, p_niche text, p_bucket text, p_limit int default 120)
returns table(item jsonb, match text, score real)
language sql stable security definer set search_path = public, extensions as $fn$
  with me as (select lower(coalesce(nullif(btrim(p_sub_niche), ''), p_niche, '')) as sub,
                     lower(coalesce(p_niche, '')) as niche, coalesce(p_bucket, '') as bucket),
  scored as (
    select g, c.bucket,
           greatest(similarity(lower(coalesce(c.sub_niche, '')), me.sub),
                    similarity(coalesce(c.sub_niche_canonical, ''), me.sub),
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

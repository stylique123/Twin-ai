-- ⚠️ OWNER 2026-10-02: a refillable-aromatherapy-candle creator saw "2 videos
-- close to your niche" and then DIY room decor, kids' crafts and optical
-- illusions — while 54 read candle videos sat in the corpus. Cause: 0258/0262
-- matched whole phrases by trigram, so "refillable aromatherapy candles" scored
-- 0.25 against "handmade soy candles" (a real candle video) and 0.52 against
-- "budget home decor" (on the word "home"). The bucket fallback then filled the
-- page with the whole "making" shelf.
--
-- Now: her CORE WORDS decide. The head noun of her sub-niche ("candle") marks a
-- video as her niche; her other distinctive words ("aromatherapy", "fragrance")
-- mark it as close. Generic words (home, natural, handmade, diy, tips…) never
-- match anything. A video that only shares her broad bucket is not returned.
create or replace function public.gallery_for_me(p_sub_niche text, p_niche text, p_bucket text, p_limit int default 120)
returns table(item jsonb, match text, score real)
language sql stable security definer set search_path = public, extensions as $fn$
  with words as (
    select distinct regexp_replace(w, '(ies)$', 'y') as w0, w as raw, ord, src
    from (
      select w, ord, 'sub' as src from regexp_split_to_table(lower(coalesce(p_sub_niche, '')), '[^a-z]+') with ordinality as t(w, ord)
      union all
      select w, ord + 100, 'niche' from regexp_split_to_table(lower(coalesce(p_niche, '')), '[^a-z]+') with ordinality as t(w, ord)
    ) x
    where length(w) >= 4 and w <> all (array[
      'natural','clean','home','handmade','handcrafted','aesthetic','artisan','personal','lifestyle','storytelling',
      'making','make','crafts','craft','crafting','process','small','business','content','creator','tips','style',
      'daily','life','easy','best','using','with','from','your','their','about','products','product','brand','based',
      'focused','sharing','diyer','diys','video','videos','ideas','guide','beginner','beginners','simple','quick',
      'everyday','modern','luxury','cozy','sustainable','eco','friendly','women','mens','womens','owner','owners'])
  ),
  core as (select distinct case when w0 ~ '[^s]s$' and length(w0) > 4 then left(w0, -1) else w0 end as w, ord, src from words),
  head as (select w from core where src = 'sub' order by ord desc limit 1),
  others as (select w from core where w <> coalesce((select w from head), '')),
  vids as (
    select g, coalesce(c.language, '') ~* '^en' or coalesce(c.language, '') = '' as english, ' ' || regexp_replace(lower(coalesce(c.sub_niche, '') || ' ' || coalesce(c.topic, '') || ' ' || coalesce(g.title, '')), '[^a-z]+', ' ', 'g') || ' ' as t
    from public.corpus_reads c
    join public.gallery_items g on g.id = c.gallery_item_id
    where c.status = 'read' and (g.visibility = 'public' or g.owner_id = auth.uid())
  ),
  scored as (
    select g, english,
           exists (select 1 from head h where v.t ~ ('\m' || h.w)) as has_head,
           (select count(*) from others o where v.t ~ ('\m' || o.w))::int as n_others
    from vids v
  ),
  ranked as (
    select distinct on ((g).url) g, has_head, n_others,
           -- Her own language first: an Albanian caption is not a format she can read and remake.
           ((case when has_head then 2 else 0 end) + 0.5 * least(n_others, 4) + case when english then 0.75 else 0 end)::real as score
    from scored
    where has_head or n_others > 0
    order by (g).url, has_head desc, n_others desc
  )
  select to_jsonb(g) as item,
         case when has_head then 'sub_niche' else 'niche' end as match,
         score
  from ranked
  order by score desc,
           coalesce(nullif(regexp_replace((g).reach, '[^0-9.]', '', 'g'), ''), '0')::numeric
             * case when (g).reach ~* 'm' then 1e6 when (g).reach ~* 'k' then 1e3 else 1 end desc
  limit greatest(1, least(p_limit, 300));
$fn$;
revoke all on function public.gallery_for_me(text, text, text, int) from public, anon;
grant execute on function public.gallery_for_me(text, text, text, int) to authenticated;

-- A CARD IS ONE VIDEO. A CREATOR BROWSING A NICHE SHOULD SEE IT ONCE.
--
-- ⚠️ MEASURED 2026-09-12, BEFORE THIS RAN. 17,044 gallery rows carry only 6,138
-- distinct (url, niche) pairs: 2,100 pairs are duplicated, 10,906 rows are
-- redundant, and the worst single video appears 62 times in ONE niche. On the
-- morning of the measurement 343 rows were inserted and 305 of them -- 89% --
-- already existed as the same pair.
--
-- ⚖️ AND IT IS NOT ONLY A COSMETIC FAULT. The ranking layer reads this table --
-- hook shapes, relative performance, cohort selection -- and a video counted
-- twice carries twice the weight. A duplicate-heavy corpus does not merely look
-- uncurated; it BIASES every shape recommendation toward whatever happens to be
-- duplicated.
--
-- ⚖️ THE CONSTRAINT IS ON THE PAIR, NOT THE URL, AND THAT DISTINCTION IS LOAD
-- BEARING. The same video in two different niches is legitimate: a
-- business-advice video genuinely belongs to both `business` and `creator`.
-- Only 154 of 5,951 urls carry a second niche today, and that number is low
-- BECAUSE the scraper de-duplicated on the url alone -- the same line that let
-- duplicates in across runs was refusing legitimate placements within one.
--
-- ⚠️ THE INDEX ALONE WOULD HAVE MASKED THE CAUSE, SO THE CAUSE WAS MEASURED
-- FIRST. Of the 2,100 duplicated pairs, 2,096 span MORE THAN ONE run and only 4
-- occur twice inside a single one. So no single scrape produced them: they
-- accumulate because each run re-inserts what earlier runs already stored. That
-- is a real fix rather than a mask -- but it is only a fix once the scraper
-- stops generating them, which is why `discovery/run.py` changes in the same
-- commit and why its insert now tolerates a conflict. An index landing alone
-- would convert every duplicate into a unique violation and take the daily run
-- down.
--
-- ⚖️ THE EARLIEST ROW SURVIVES, because its `created_at` is the honest date the
-- video entered the gallery; a later copy would claim the video was found on a
-- day it was merely re-found.
--
-- ⚠️ BUT THE EARLIEST ROW DOES NOT NECESSARILY CARRY THE ANALYSIS, AND KEEPING
-- IT BLINDLY WOULD DELETE WORK. `caption_shape` is written later, by the visual
-- pass, onto whichever row that pass happened to see. Measured: 224 duplicate
-- groups carry a shape on a row that is NOT the earliest, and in ONE of them the
-- earliest row has no shape at all -- so a naive "keep the earliest" would
-- silently destroy that analysis. One is not zero, and the ranking layer is
-- exactly what reads it. The survivor therefore INHERITS the newest shape in its
-- group before the rest are removed.
--
-- ⚠️ SAFE TO DELETE AT ALL ONLY BECAUSE NOTHING POINTS HERE: zero foreign keys
-- reference gallery_items, checked before this was written. Every row is a
-- system row (owner_id is null) and neither `url` nor `niche` is ever null, so
-- the pair index covers the whole table rather than silently exempting NULLs,
-- which a unique index would otherwise treat as distinct.
--
-- ⚠️ GUARDED ON to_regclass, THE SAME IDIOM 0176 USES FOR THE SAME REASON:
-- staging is a purpose-built fixture that never ran migration 0008 and has no
-- gallery tables, so a bare statement would abort the staging run entirely.
do $do$
begin
  if to_regclass('public.gallery_items') is null then
    return;
  end if;

  -- 1. THE SURVIVOR INHERITS THE ANALYSIS. Newest shape in the group wins,
  --    because the visual pass improves over time and the latest reading is the
  --    one its own version field describes.
  with ranked as (
    select id, url, niche, caption_shape, caption_shape_basis, caption_shape_reason,
           caption_shape_version, caption_shape_at,
           row_number() over (partition by url, niche order by created_at, id) rn
    from public.gallery_items
  ),
  survivor as (select id, url, niche from ranked where rn = 1),
  donor as (
    select distinct on (url, niche) url, niche, caption_shape, caption_shape_basis,
           caption_shape_reason, caption_shape_version, caption_shape_at
    from ranked
    where rn > 1 and caption_shape is not null
    order by url, niche, caption_shape_at desc nulls last, id desc
  )
  update public.gallery_items g
     set caption_shape = d.caption_shape,
         caption_shape_basis = d.caption_shape_basis,
         caption_shape_reason = d.caption_shape_reason,
         caption_shape_version = d.caption_shape_version,
         caption_shape_at = d.caption_shape_at
    from survivor s
    join donor d on d.url = s.url and d.niche = s.niche
   where g.id = s.id and g.caption_shape is null;

  -- 2. THE REDUNDANT ROWS GO.
  delete from public.gallery_items g
   using (
     select id, row_number() over (partition by url, niche order by created_at, id) rn
     from public.gallery_items
   ) r
   where r.id = g.id and r.rn > 1;

  -- 3. AND IT CANNOT RECUR. This is the half that makes the clean-up permanent
  --    rather than a one-off tidy that the next run undoes.
  create unique index if not exists gallery_items_url_niche_uniq
    on public.gallery_items (url, niche);
end
$do$;

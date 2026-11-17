-- GALLERY ROWS ARE WRITTEN BY THE SERVER ONLY (security audit #7).
-- The "gallery own insert" policy (0032) still let any signed-in user insert
-- gallery_items rows straight from the anon key, and every insert fires
-- trg_gallery_curation_visual_analysis (0176), which queues a paid analysis job
-- with no credit or rate-limit check: 1,000 rows = 1,000 paid jobs on URLs the
-- caller picks. The app only READS gallery_items from the browser; the worker
-- writes it with the service role, which this does not touch.
--
-- Guarded on to_regclass like 0176: staging has no gallery_items table.
-- Files only; applied by hand like the other migrations.
do $do$
begin
  if to_regclass('public.gallery_items') is not null then
    execute 'drop policy if exists "gallery own insert" on public.gallery_items';
    execute 'revoke insert on public.gallery_items from anon, authenticated';
  end if;
end
$do$;

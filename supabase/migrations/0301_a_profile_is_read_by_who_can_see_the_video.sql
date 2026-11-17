-- REFERENCE PROFILES ARE READ ONLY BY WHO CAN SEE THE VIDEO (security audit #4).
-- reference_content_profiles_read (0142) was `using (true)`: any signed-in user
-- could download every analysed URL, including each creator's own top posts
-- from scraped_posts, with performance data. A row is now visible only when the
-- caller can already see that URL through one of the app's own reads:
--   gallery_items  - gallery cards (public items, or her own)
--   scraped_posts  - her scanned posts
--   generations    - a reference on her (or her workspace's) script
--   jobs           - a reference she just asked to ingest (V2Building waits on it
--                    before any generation exists)
-- Each subquery runs under that table's own RLS, so "can see" means exactly
-- what it means everywhere else. Service-role readers are unaffected.
-- Files only; applied by hand like the other migrations.
drop policy if exists reference_content_profiles_read on public.reference_content_profiles;
create policy reference_content_profiles_read
  on public.reference_content_profiles
  for select
  to authenticated
  using (
    exists (select 1 from public.gallery_items g where g.url = reference_content_profiles.url)
    or exists (select 1 from public.scraped_posts p where p.url = reference_content_profiles.url)
    or exists (select 1 from public.generations x where x.reference_url = reference_content_profiles.url)
    or exists (select 1 from public.jobs j
               where j.owner_id = auth.uid() and j.type = 'ingest' and j.payload->>'url' = reference_content_profiles.url)
  );

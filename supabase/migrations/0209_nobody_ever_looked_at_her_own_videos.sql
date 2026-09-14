-- NOBODY HAS EVER MEASURED A VIDEO THIS CREATOR MADE.
--
-- ⚠️ MEASURED 2026-09-14. `reference_content_profiles` holds 891 finished visual
-- profiles, so the visual pass WORKS -- 2,949 of 4,089 `assess_reference` jobs
-- requested `frames: true` and 2,887 completed. But of those 891 profiles:
--
--   from `gallery_items` (what we scraped) ........... 891
--   from PASTED REFERENCES (what she chose) ............ 0
--   from HER OWN POSTS ................................. 0
--
-- The machine is not broken. The aim is. `enqueue_gallery_visual_analysis`
-- (0176 -> 0199 -> 0205 -> 0206) is the only thing that has ever asked for a
-- frames pass, and it fires on `gallery_items` and nothing else.
--
-- ⚖️ HER OWN POSTS FIRST, AND NOT BECAUSE THEY ARE EASIER. A cohort of
-- strangers' references is data any tool in this market could buy. Her account
-- is the one signal no competitor holds. And the question worth asking of it is
-- not "what does she post" but "what is different about the ones that worked".
--
-- ⚖️ TWENTY PASSES, NOT HER CATALOGUE. Top ten by performance against ten at
-- her median answers that question exactly as well as fifty against fifty, at a
-- fifth of the cost, with the comparison structurally built in. A hundred
-- passes per creator is spend with no extra signal.
--
-- ⚠️ PERFORMANCE IS RELATIVE TO HER OWN MEDIAN, NEVER AN ABSOLUTE VIEW COUNT.
-- A 1,000-follower creator's best video and a 500,000-follower creator's worst
-- can carry the same plays. `ownPerformance.ts` already draws this line for the
-- dashboard card; this mirrors its arithmetic, not its code, because a trigger
-- cannot import TypeScript.
--
-- ⚠️ THIS IS A FUNCTION, NOT A ROW TRIGGER, AND THAT IS FORCED. The gallery
-- rule can fire per row because "is this a video" is answerable from the row
-- alone. A median is not: the row being inserted cannot know it. So the worker
-- calls this once the scan's posts are stored -- one upsert, one statement, the
-- whole catalogue present -- and `her-own-posts-were-never-looked-at.test.ts`
-- asserts that call exists, because a function nothing calls is this
-- repository's most common defect.

create or replace function public.enqueue_own_post_visual_analysis(p_voice_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_median numeric;
  v_queued integer := 0;
  v_url text;
  v_platform text;
begin
  if p_voice_id is null then return 0; end if;

  -- ⚠️ NULL WHEN NOBODY COUNTED, AND THEN NOTHING IS QUEUED. A median over zero
  -- measured posts is not zero; it is unknown, and ranking against an unknown
  -- baseline would pick ten arbitrary videos and call them her best.
  select percentile_cont(0.5) within group (order by plays)
    into v_median
  from public.scraped_posts
  where voice_id = p_voice_id and plays is not null and plays > 0;

  if v_median is null or v_median <= 0 then return 0; end if;

  for v_url, v_platform in
    -- ⚖️ TWO SETS, ONE QUERY, AND THE UNION IS DELIBERATE. Ten furthest above
    -- her median and ten nearest it. `union` (not `union all`) because a small
    -- catalogue can put the same video in both sets, and paying twice for one
    -- video to appear in two halves of a comparison is the cost this cap exists
    -- to avoid.
    (
      select url, platform from (
        select url, platform from public.scraped_posts
        where voice_id = p_voice_id and plays is not null and plays > 0
        order by (plays / v_median) desc
        limit 10
      ) top_ten
      union
      select url, platform from (
        select url, platform from public.scraped_posts
        where voice_id = p_voice_id and plays is not null and plays > 0
        order by abs((plays / v_median) - 1) asc
        limit 10
      ) median_ten
    )
  loop
    -- ⚠️ THE SAME FOUR GUARDS AS THE GALLERY RULE, IN THE SAME ORDER AND FOR THE
    -- SAME REASONS. Mirrored deliberately rather than shared: a second function
    -- calling the first would make the gallery rule's row-shaped signature
    -- (`new.url`) a dependency of this one, and the two fire on different
    -- tables at different times.

    -- Not a video. First, because every other check assumes one.
    if v_url is null
       or position('/explore/tags/' in lower(v_url)) > 0
       or position('/explore/' in lower(v_url)) > 0
       or lower(v_url) !~ '^https?://'
    then
      continue;
    end if;

    -- Already has a finished pass for this exact video.
    if exists (
      select 1 from public.reference_content_profiles rcp
      where rcp.url = v_url and rcp.visual_profile is not null
    ) then
      continue;
    end if;

    -- Already in flight. Do not double-queue.
    if exists (
      select 1 from public.jobs j
      where j.type = 'assess_reference'
        and j.payload ->> 'url' = v_url
        and j.status in ('queued', 'running')
    ) then
      continue;
    end if;

    -- Failed recently. 0205's phrasing: an error in the RESULT, which is where
    -- `assess_reference` puts it, not `status = 'failed'`, which matched 0 of
    -- 425 real failures.
    if exists (
      select 1 from public.jobs j
      where j.type = 'assess_reference'
        and j.payload ->> 'url' = v_url
        and j.created_at > now() - interval '7 days'
        and (j.status = 'failed' or j.result ->> 'error' is not null)
    ) then
      continue;
    end if;

    insert into public.jobs (type, payload)
    values (
      'assess_reference',
      jsonb_build_object('url', v_url, 'platform', v_platform, 'frames', true)
    );
    v_queued := v_queued + 1;
  end loop;

  return v_queued;
end
$fn$;

-- ⚖️ THE WORKER CALLS THIS, AND ONLY THE WORKER. No client needs it, and a
-- creator-triggerable frames pass is a second download anybody could spend.
revoke all on function public.enqueue_own_post_visual_analysis(uuid) from public;
revoke all on function public.enqueue_own_post_visual_analysis(uuid) from anon;
revoke all on function public.enqueue_own_post_visual_analysis(uuid) from authenticated;
grant execute on function public.enqueue_own_post_visual_analysis(uuid) to service_role;

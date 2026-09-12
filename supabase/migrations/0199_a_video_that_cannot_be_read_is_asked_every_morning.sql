-- A VIDEO THAT CANNOT BE READ IS ASKED AGAIN EVERY MORNING.
--
-- ⚠️ MEASURED IN PRODUCTION, 2026-09-12. 248 videos sit in a permanent retry
-- loop: 455 `assess_reference` jobs, 1,498 model attempts, ZERO successes, and
-- it repeats daily. The clearest single case is one YouTube URL enqueued every
-- morning since 2026-09-06 -- 7 jobs, 35 attempts, never once succeeding, and
-- nothing in the system would ever have stopped it.
--
-- ── THE CHAIN, EACH LINK MEASURED ───────────────────────────────────────────
--
-- 1. The discovery scraper re-inserts `gallery_items` rows for videos it has
--    already curated. 2,100 of 6,138 (url, niche) pairs carry duplicates --
--    10,906 redundant rows, worst case 62 copies of ONE video in ONE niche.
--    That is the upstream cause and it is NOT fixed here: it lives in the
--    scraper, it affects what creators browse as well as what we spend, and
--    de-duplicating a gallery is a product decision, not a trigger's business.
--
-- 2. Every insert fires `enqueue_gallery_visual_analysis` (0176). That is BY
--    DESIGN -- 0176's own comment says one video curates up to 38 times -- and
--    it is why the idempotence checks exist rather than being an afterthought.
--
-- 3. ⚠️ AND THE TWO CHECKS COVER `done` AND `in flight`, NOT `failed`.
--    `visual_profile IS NOT NULL` catches a video that SUCCEEDED; a
--    queued/running job catches one IN PROGRESS. A video that permanently
--    fails is caught by NEITHER: by the next morning its last job has already
--    dead-lettered, so it is neither finished nor in flight, and the trigger
--    enqueues it again. The guard was written against the states a WORKING
--    video passes through, which is the shape this codebase keeps finding --
--    a constraint that has only ever seen the population it was written for.
--
-- ⚖️ SO THE THIRD STATE GETS A CHECK, AND IT IS A COOLDOWN, NOT A BLACKLIST.
-- "This URL failed once, never try again" would be the wrong fix and a costly
-- one: 119 of the known fetch failures are TikTok IP blocks and 9 are
-- extractor faults, every one of which a later fix could clear. A video that
-- cannot be read TODAY may be readable next week, and a permanent refusal
-- would silently outlive the bug that caused it -- UNKNOWN is never a default
-- in either direction. A window expires on its own, so a genuine fix is picked
-- up within it by the very duplicate inserts that cause this waste, with no
-- backfill, no list to maintain and nothing to remember to undo.
--
-- ⚖️ SEVEN DAYS, AND THE NUMBER IS THE MEASUREMENT'S. The scraper re-curates
-- daily, so a 7-day window turns 7 doomed jobs per stuck video per week into
-- 1 -- the waste drops ~85% while every URL is still retried on a schedule.
-- Shorter buys less; longer delays the recovery of a video we have since
-- taught ourselves to read.
--
-- ⚠️ THE FAILED JOB IS EVIDENCE ONLY WHILE NOTHING HAS SUCCEEDED SINCE. The
-- cooldown is deliberately subordinate to check 1: a URL that has acquired a
-- `visual_profile` returns at the first check and never reaches this one, so a
-- historical failure can never suppress a video that now works.
create or replace function public.enqueue_gallery_visual_analysis()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Already has a finished visual pass for this exact video — skip.
  if exists (
    select 1 from public.reference_content_profiles rcp
    where rcp.url = new.url and rcp.visual_profile is not null
  ) then
    return new;
  end if;

  -- Already has a pass in flight for this exact video — skip, do not double-queue.
  if exists (
    select 1 from public.jobs j
    where j.type = 'assess_reference'
      and j.payload ->> 'url' = new.url
      and j.status in ('queued', 'running')
  ) then
    return new;
  end if;

  -- ⚠️ THE THIRD STATE: it already exhausted its retries recently. Asking again
  -- today would spend the same five model calls to learn the same thing. The
  -- window is closed, not the door — see the header.
  if exists (
    select 1 from public.jobs j
    where j.type = 'assess_reference'
      and j.payload ->> 'url' = new.url
      and j.status = 'failed'
      and j.created_at > now() - interval '7 days'
  ) then
    return new;
  end if;

  insert into public.jobs (type, payload)
  values (
    'assess_reference',
    jsonb_build_object('url', new.url, 'platform', new.platform, 'frames', true)
  );

  return new;
end
$fn$;

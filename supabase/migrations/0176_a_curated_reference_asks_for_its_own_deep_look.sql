-- FIX 13 (Tier 1) — CURATING A GALLERY REFERENCE ASKS FOR ITS OWN VISUAL PASS.
--
-- ⚠️ ROOT CAUSE. `assess_reference` (worker/src/jobs/assessReference.ts) is the
-- ONLY writer of `reference_content_profiles.visual_profile`, and until now the
-- ONLY thing that ever enqueued it with `frames: true` was the pilot
-- (`pilotStart.ts`, ten references, cost-ceilinged, force:true) or a human
-- running `scripts/assess-references.mjs` by hand — transcript-only, never
-- frames. `gallery_items` is populated by the discovery scraper (service role,
-- `discovery/run.py`) inserting new rows; nothing on that path has ever asked
-- for a visual pass. So the cache FIX 13 depends on — "curated items get the 9
-- visual dimensions analysed ONCE" — stayed empty outside the pilot's ten rows,
-- no matter how large the gallery grew.
--
-- ⚖️ SO A NEWLY CURATED REFERENCE ASKS FOR ITS OWN PASS, ONCE, HERE — AT THE
-- ROW'S BIRTH. `gallery_items` is where a reference is curated in this schema
-- (the discovery scraper today; a future client submit path tomorrow, per the
-- NOTE in packages/shared/src/api.ts) — not a page view, not a remix, which
-- would re-fire on every one of a video's up to 38 niche placements. AFTER
-- INSERT on the row is curation, once, no matter how the row got there.
--
-- ⚠️ TIER 1 ONLY. This enqueues the exact `assess_reference` job type the pilot
-- already uses, with `frames: true` and NOTHING ELSE — no `force`, no credit
-- spend, no pricing table, no owner-reserved Tier 2 surface touched. `force`
-- is deliberately absent: the pilot's `force: true` exists to pay for a FRESH
-- download+re-transcription on top of the frames pull (pilotStart.ts,
-- DOWNLOADS_PER_REFERENCE = 2, under a hard cost ceiling) and an ungated
-- trigger on every gallery row must never reproduce that unbounded spend. A
-- reference whose transcript is already cached costs only the frames pull;
-- one whose transcript is not yet cached is assessed for the first time,
-- exactly as `assess-references.mjs` already does today for free.
--
-- ⚖️ TWO IDEMPOTENCE CHECKS, NOT ONE, BECAUSE ONE VIDEO CURATES UP TO 38 TIMES.
-- `reference_content_profiles.visual_profile IS NOT NULL` catches the case the
-- job has already finished; a queued/running job of this type for the same
-- URL catches the case it is still in flight. Absent triggers a job; present —
-- either as a finished profile or a job already working on one — skips. This
-- migration never re-derives or overwrites anything; the worker-side skip in
-- `shouldSkipAlreadyAssessed` (worker/src/jobs/assessReference.ts) is the
-- second, independent backstop if both checks below ever race.
--
-- ⚠️ NOT REUSABLE AS-IS FOR TIER 2. Tier 2 is a paid, on-demand deep-analyze on
-- a PASTED LINK, priced as a credit action — a different trigger (a button, not
-- a row insert), a different payload (no gallery curation involved), and
-- credit-gated. Nothing here enqueues on a paste, spends a credit, or reads a
-- pricing table; that surface is untouched, per the owner's reservation.
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

  insert into public.jobs (type, payload)
  values (
    'assess_reference',
    jsonb_build_object('url', new.url, 'platform', new.platform, 'frames', true)
  );

  return new;
end
$fn$;

drop trigger if exists trg_gallery_curation_visual_analysis on public.gallery_items;
create trigger trg_gallery_curation_visual_analysis
  after insert on public.gallery_items
  for each row execute function public.enqueue_gallery_visual_analysis();

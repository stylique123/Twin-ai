-- 0194 — THE GALLERY BACKFILL HAS NEVER BEEN RUNNABLE.
--
-- ⚠️ 0106 ADDED `requires_filming_objects` AND `requires_screen_recording`, and
-- 16,044 gallery cards carry NULL in both — 100%, measured 2026-09-09. The
-- backfill that would fill them has existed for weeks in
-- `scripts/qa/gallery-requirements-backfill.mjs`, and its `--decide` mode emits
-- writes shaped like this:
--
--   { id, requires_filming_objects, requires_screen_recording,
--     requirements_source, evidence }
--
-- `gallery_items` has no `evidence` column. Every write would have failed with
-- "column does not exist". The item was filed as "built, not wired"; it was
-- built against a schema that does not exist, which is why nobody ever got it
-- to run.
--
-- ── WHY THE COLUMN, RATHER THAN DROPPING THE FIELD ───────────────────────
--
-- ⚠️⚠️ BECAUSE THIS WRITE IS PERMANENT IN PRACTICE. The candidate filter is
-- `where requirements_source is null`, so a card this backfill answers is never
-- offered to the assessment again. A false positive does not get corrected
-- later — it closes the file.
--
-- ⚖️ AND THE NEAR-MISS IS MEASURED, NOT IMAGINED. Re-run today against the
-- shipped vocabulary: 485 cards match an object marker, and 182 of them are the
-- virtual-try-on cluster — videos that genuinely contain the word "haul" and
-- contain no physical product. Without `OBJECT_DISQUALIFIERS` (#772) this
-- backfill would have written 182 permanent wrong answers out of 485, 37.5%.
--
-- `referenceAssessment.ts` states the purpose of the field exactly: "The exact
-- markers matched, so a wrong answer can be argued with." Dropping it to make
-- the script run would remove the one thing that makes a permanent write
-- reviewable, on the write whose known failure mode is a false positive.
--
-- ⚠️ NULLABLE, AND NULL MEANS "NOT RECORDED", NEVER "NO EVIDENCE". The rows
-- 0106 will eventually get from a vision pass have evidence of a different kind;
-- an empty array would claim this text pass looked and found nothing.
alter table public.gallery_items
  add column if not exists evidence jsonb;

comment on column public.gallery_items.evidence is
  'The exact marker strings that produced requires_filming_objects / '
  'requires_screen_recording, so a wrong answer can be argued with. The '
  'candidate filter is `requirements_source is null`, so an answer here is '
  'never revisited -- this column is what makes that permanence reviewable. '
  'NULL means not recorded, never "looked and found nothing".';

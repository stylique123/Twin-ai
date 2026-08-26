-- "NOBODY ANSWERS" AND "NOBODY WAS ASKED" LOOK IDENTICAL TODAY.
--
-- ── WHAT WAS MEASURED ─────────────────────────────────────────────────────
--
-- On 2026-08-26, production held:
--
--   creator_questions_put          0 rows
--   creator_knowledge source='asked'   0 rows
--   onboarded creators            23
--   creators who generated a script  22   (41 generations)
--
-- The obvious reading is "the card never renders". It is not supportable.
-- 0128 writes this table on ANSWER or SKIP only, so a creator who sees the card
-- and simply scrolls past writes nothing at all. Zero rows is EQUALLY consistent
-- with "shown to all 22 and ignored by every one" and with "never rendered
-- once", and nothing in this system can currently tell those apart.
--
-- ⚠️ THAT IS THE DEFECT, NOT THE ANSWER RATE. Every fix for a question nobody
-- answers -- move it, reword it, ask fewer -- is a guess until the two cases are
-- separable. `screenCaptureConversion.ts` already states the principle this
-- follows: the count is what makes the next decision evidential.
--
-- ── WHY A THIRD OUTCOME AND NOT A SECOND TABLE ────────────────────────────
--
-- 0128 anticipated this in as many words: outcome is text and not an enum
-- precisely so that "asked, dismissed the card without choosing" could be
-- counted without a migration. This is that migration, and it only widens the
-- CHECK the original author left room for.
--
-- ⚖️ AND THE UNIQUE INDEX IS WHY THIS WORKS. One row per creator per question
-- means 'shown' is later OVERWRITTEN by 'answered' or 'skipped' through the same
-- upsert path 0128 already allows an UPDATE policy for. A row that says 'shown'
-- is therefore exactly "seen, and not acted on" -- which is the number nobody
-- has today.
alter table public.creator_questions_put
  drop constraint if exists creator_questions_put_outcome_valid;

alter table public.creator_questions_put
  add constraint creator_questions_put_outcome_valid
  check (outcome in ('answered', 'skipped', 'shown'));

-- ⚠️ THE READER MUST NOW FILTER, AND ITS TEST SAYS SO. `nextQuestion` retires
-- every id in the list it is given, so a 'shown' row reaching it would retire the
-- question the instant it was displayed -- the feature would ask each creator
-- exactly one question, once, forever. The web reader excludes 'shown' and
-- apps/web/src/lib/creatorAnswerWiring.test.ts fails if that filter is removed.

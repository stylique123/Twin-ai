-- `default` MEANT "THE PAGE LOADED", AND WE READ IT AS "THEY WERE HAPPY WITH IT".
--
-- 0134 fixed the first half of this. `Result.tsx` had been writing the
-- recommended hook into `selected_hook` on load, so the column was non-empty
-- with lines nobody picked; 0134 added `hook_choice` so a reader could ask for
-- choices and get choices, and 14 of 23 rows turned out to be that write.
--
-- ⚠️ WHAT IT LEFT BEHIND. The write happens in the LOAD EFFECT — before the
-- creator has had time to read anything — so `default` records that a browser
-- fetched a row. It is a fact about our client, not about a person. Two
-- completely different creators land in it and cannot be separated:
--
--     they read five options and were happy with ours    → agreement
--     they opened the page, glanced, and never came back → nothing at all
--
-- ── ⚖️ WHY THE FIX IS A FOURTH SOURCE AND NOT AN IMPRESSION TABLE ─────────
--
-- The alternatives are NOT hidden. All five options render in one always-visible
-- grid on `Result` — no toggle, no accordion — so "did they see the others" was
-- never the missing fact. What was missing is whether they reached a moment
-- where keeping ours cost them something.
--
-- Entering the teleprompter is that moment, and it is the same seam 0182 stamps
-- for the same reason: a creator who opens the recorder has stopped arguing with
-- the script. Arriving there with our recommendation still in place is
-- AGREEMENT — five lines were on screen and they took ours to camera.
--
-- ⚠️ A ROW THAT STAYS `default` IS NOW THE FINDING, NOT A GAP. It is a creator
-- who never shot it. That case used to be indistinguishable from agreement, and
-- separating them is the entire purpose of this migration.
--
-- ⚠️ AND `default_taken` IS NOT A PREFERENCE. Taking the recommendation is
-- weaker evidence than choosing against it: the creator had a reason to move and
-- did not. A ranking model that counted it as a pick would relearn the exact lie
-- 0134 exists to prevent — that everyone prefers option[0] — one release later
-- and much harder to see. `isPreference` stays narrow; `isAgreement` is a
-- separate question in packages/shared/src/hookChoice.ts.

-- ⚖️ WIDENS THE CHECK AND CHANGES NOTHING ELSE. Every value 0134 allowed is
-- still allowed, and the index rule is copied byte-for-byte rather than
-- rewritten: `default_taken` carries the position of the option that was kept,
-- exactly as `default` does, because WHICH line they were happy with is half the
-- fact. Only `freeform` may have a null index.
alter table public.generations
  drop constraint if exists generations_hook_choice_shape;
alter table public.generations
  add constraint generations_hook_choice_shape check (
    hook_choice is null or (
      jsonb_typeof(hook_choice) = 'object'
      and hook_choice ->> 'source' in ('creator', 'default', 'default_taken', 'freeform')
      -- A creator pick names WHICH option. A freeform entry matches none, so its
      -- index is null; requiring one would force a lie.
      and (
        (hook_choice ->> 'source' = 'freeform' and hook_choice -> 'index' = 'null'::jsonb)
        or (hook_choice ->> 'index' ~ '^[0-9]+$' and (hook_choice ->> 'index')::int < 20)
      )
    )
  );

-- ⚠️ NOTHING IS BACKFILLED, AND THAT IS DELIBERATE. An existing `default` row
-- cannot be told from a `default_taken` one after the fact — that is the very
-- ambiguity this exists to end, and inventing agreement for rows that predate
-- the measurement would poison the corpus with the reading we are trying to stop
-- making. 0134 made the same call about its own 14 rows and said so: the loss is
-- permanent, and pretending otherwise is worse than the loss.

comment on column public.generations.hook_choice is
  'How selected_hook got its value: {"source":"creator"|"default"|"default_taken"|"freeform","index":int|null}. '
  '`creator` is the only PREFERENCE — they picked this line over the others. '
  '`default_taken` is AGREEMENT: they entered the teleprompter with the recommended line '
  'still selected, having had every option on screen. `default` is the recommendation '
  'captured on page load and means only that the page loaded — it is NOT agreement, and a '
  'row that never becomes default_taken is a creator who never shot it. NULL means the row '
  'predates 0134 and is unreadable, which is not the same as nothing being chosen.';

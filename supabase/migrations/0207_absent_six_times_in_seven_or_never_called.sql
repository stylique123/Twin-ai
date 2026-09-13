-- 0207 — "THE BLOCK WAS ABSENT" AND "THE BLOCK WAS NEVER COMPUTED" PRODUCE THE
-- SAME PROMPT AND MEAN OPPOSITE THINGS.
--
-- ⚠️⚠️ THE ASSEMBLER IS WIRED AND NOTHING RECORDS WHETHER IT RAN. `shapeBlock`'s
-- rule is called at `generate-blueprint` and its output interpolated into the
-- prompt as `${shapeSection}`. When it returns null the section is an empty
-- string -- correctly, because a hedged shape is still a shape in the model's
-- context. But an empty string is also what a prompt carries if the call never
-- happened at all, and until now nothing on the generation row could tell those
-- apart.
--
-- ⚠️ AND "ABSENT" IS THE EXPECTED ANSWER, WHICH IS EXACTLY WHY IT MUST BE
-- RECORDED. Measured 2026-09-13 against the live cohort key (niche BUCKETS, the
-- key the assembler actually uses):
--
--     buckets clearing MIN_COHORT 20 with 2-sigma separation   1 of 7
--       entertainment   46 vs 6    sigma 5.55   EMITS
--       business        91 vs 66   sigma 2.00   silent (the bar is a strict >)
--       tech            45 vs 30   sigma 1.73   silent
--       beauty_fashion   9 vs 6    sigma 0.77   silent
--       food            12 vs 9    sigma 0.65   silent
--       health           9 vs 9    sigma 0.00   silent
--       creator          1 vs 1    sigma 0.00   silent
--
-- So `no_block` should be the answer roughly six generations in seven. A reader
-- who sees "assembler live, scripts unchanged" would otherwise conclude it is
-- broken and go hunting a bug that does not exist. This column is what turns
-- that into a number.
--
-- ── THE FOUR STATES, AND WHY NONE OF THEM COLLAPSES INTO ANOTHER ────────────
--
--   emitted        a block reached the prompt. `shape_block_n` carries its n.
--   no_block       computed, and the gate said no. THE EXPECTED ANSWER.
--   corpus_unread  the corpus read failed or was truncated, so the question was
--                  never really asked. Emits an identical empty prompt section
--                  and is a DEFECT, not a gate. Folding it into `no_block` would
--                  hide a broken read inside an expected silence forever.
--   not_reached    the rescue path: the generation never got to the prompt
--                  builder. Recording `no_block` there would enter a decision
--                  nobody made.
--
-- ⚠️ NULL IS A FIFTH THING AND IT IS NOT A STATE: it means the row predates this
-- column. Absent is not zero, and it is not `no_block` either.
alter table public.generation_outcomes
  add column if not exists shape_block text;

-- ⚠️ THE COHORT COUNT, AND ONLY WHEN A BLOCK WAS ACTUALLY EMITTED. Never 0: a
-- block that did not emit has no n, and a 0 would average in as though it did.
alter table public.generation_outcomes
  add column if not exists shape_block_n integer;

alter table public.generation_outcomes
  drop constraint if exists generation_outcomes_shape_block_known;
alter table public.generation_outcomes
  add constraint generation_outcomes_shape_block_known check (
    shape_block is null
    or shape_block in ('emitted', 'no_block', 'corpus_unread', 'not_reached')
  );

-- ⚖️ THE TWO COLUMNS MUST AGREE. An n without an emitted block is a count of
-- nothing; an emitted block without an n loses the only number it carried.
alter table public.generation_outcomes
  drop constraint if exists generation_outcomes_shape_block_n_agrees;
alter table public.generation_outcomes
  add constraint generation_outcomes_shape_block_n_agrees check (
    (shape_block = 'emitted' and shape_block_n is not null and shape_block_n > 0)
    or (shape_block is distinct from 'emitted' and shape_block_n is null)
  );

comment on column public.generation_outcomes.shape_block is
  'Whether the corpus SHAPE block reached this generation''s prompt: emitted, '
  'no_block (computed, gate said no -- the EXPECTED answer, 1 of 7 buckets '
  'clears it), corpus_unread (the read failed or truncated -- a DEFECT that '
  'produces an identical empty prompt), or not_reached (rescue path, never '
  'asked). NULL means the row predates this column, which is none of the four.';

comment on column public.generation_outcomes.shape_block_n is
  'The cohort count behind an emitted SHAPE block. NULL whenever no block was '
  'emitted -- never 0, which would aggregate as though a block had emitted.';

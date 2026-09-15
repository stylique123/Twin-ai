-- 0213 — THE FOUR SHAPES THE MISSES NAMED, AND THE THREE REFUSALS A MODEL READ
-- CAN PRODUCE.
--
-- ⚠️ MEASURED ON PRODUCTION 2026-09-14, BEFORE ANY SHAPE WAS INVENTED. Of 6,276
-- gallery_items, only 596 ever carried a caption_shape. 4,112 are recorded
-- `no_pattern_match`. Sampling THOSE rather than imagining a taxonomy:
--
--     3+ hashtag/handle marks in the first clause ....... 1,811
--     majority hashtag by length ........................ 1,451
--     non-latin script .................................. 1,003
--     pipe/dash YouTube-style titles .................... 491
--     ---------------------------------------------------------
--     "clean residue" after all of that ................. 2,491
--
-- And a hand-read of 70 of that clean residue found ~54% STILL not a hook:
-- bare labels ("Portugal 🇵🇹 beautiful view"), CTA-only ("Check my profile"),
-- disclaimers ("This video is for educational purposes only"), and
-- latin-script German, Polish and Indonesian the `not_english` gate missed.
--
-- ⚖️⚖️ SO NULL IS THE MAJORITY ANSWER, NOT THE EDGE CASE, and that is the
-- single most important fact about this taxonomy. A classifier scored on
-- "how many did you label?" would be rewarded for force-fitting. The reasons
-- below exist so that declining is RECORDED rather than looking like absence.
--
-- ── THE FOUR SHAPES, EACH WITH OBSERVED INSTANCES ────────────────────────────
--
-- ⚠️ DERIVED TWICE, INDEPENDENTLY, FROM TWO DIFFERENT POPULATIONS. captionShape
-- .ts already recorded, from the 70 hooks production has SHIPPED, that its
-- remaining misses "are dominated by forms no pattern here covers at all —
-- first-person confession, a flat verdict, 'most people ...'". That was measured
-- on generated hooks; the sample above was measured on scraped captions. The two
-- agree, which is why these four are taken as real and not as my invention.
--
--   flat_declarative_claim  "A Plan Is Not a Strategy"
--                           "Most people are not missing information"
--                           "Tommy Hilfiger are Filthy Scammers"
--   personal_result         "Two lines that changed my mindset forever"
--                           "Day 5 at Meta as a software engineer"
--   relatable_moment        "Hate when this happens"
--                           "The Second You Walk Into a Room She Just Cleaned"
--   topic_announcement      "On dating white people"
--                           "Finding a Lifestyle of Health — Not another diet"
--
-- ⚖️ AND A FIFTH WAS CONSIDERED AND DROPPED. `imperative_to_audience`
-- ("Someone Needs to Copy This Business") appeared twice in seventy and overlaps
-- `direct_address`, which already covers an instruction aimed at the viewer.
-- Four buckets with several instances each beat five where one is a guess: hand
-- a model a bucket that does not fit and it force-fits, and a forced label is a
-- lie with `basis: inferred` stamped on it.
--
-- ── THE THREE REFUSALS ───────────────────────────────────────────────────────
--
--   not_a_hook           the pre-filter declined to SPEND on this row: a tag
--                        pile, a bare label, a CTA, a disclaimer. Distinct from
--                        `no_pattern_match`, which means a model was never asked.
--   model_found_no_shape a model READ it and said none. This is the honest
--                        unknown, and it must be tellable from every other
--                        silence or the yield figure is a biased sample.
--   model_unavailable    the call did not complete. ⚠️ ABSENT IS NOT ZERO: a
--                        failed read recorded as "no shape" would quietly become
--                        evidence that the corpus has no shape here.
--   model_reply_unreadable  the call completed and the answer did not parse.
--
-- ⚖️ THE LAST TWO ARE SEPARATE BECAUSE THEY NEED OPPOSITE FIXES. An unreadable
-- reply is OUR bug -- a prompt or a parser -- and a failed call is an outage or
-- a quota. Pooling them would produce one number that motivates neither fix,
-- the same argument that keeps quality and disclosure refusals apart on the
-- owner console.
--
-- ⚖️ `caption_shape_basis` IS UNCHANGED AND STAYS 'inferred'-ONLY. A model
-- reading a caption is still inferring the video's hook from an artefact written
-- for a different purpose, often after the fact. Adding a stronger basis for a
-- model read would let a reader promote an inference to an observation, which is
-- the defect captionShape.ts was named to avoid.
--
-- ⚠️ THIS MIGRATION IS MANDATORY AND NOT COSMETIC. These five CHECKs are LIVE.
-- Shipping the new shapes in code without it means every write is REJECTED --
-- which is exactly the defect 0208 left in production for a day, where the
-- rejection was swallowed by a `.then(() => {}, () => {})` and the row simply
-- never landed.

alter table public.gallery_items
  drop constraint if exists gallery_items_caption_shape_known;
alter table public.gallery_items
  add constraint gallery_items_caption_shape_known check (
    caption_shape is null
    or caption_shape in (
      -- reachable by the pattern set (captionShape.ts CAPTION_SHAPES)
      'negative_command', 'number_promise', 'contrarian_claim', 'direct_question',
      'myth_bust', 'curiosity_gap', 'direct_address', 'how_to',
      -- reachable only by a model read (MODEL_ONLY_SHAPES)
      'flat_declarative_claim', 'personal_result', 'relatable_moment',
      'topic_announcement'
    )
  );

alter table public.gallery_items
  drop constraint if exists gallery_items_caption_shape_reason_known;
alter table public.gallery_items
  add constraint gallery_items_caption_shape_reason_known check (
    caption_shape_reason is null
    or caption_shape_reason in (
      'no_title', 'empty_after_strip', 'too_short', 'not_english',
      'no_pattern_match',
      'not_a_hook', 'model_found_no_shape', 'model_unavailable',
      'model_reply_unreadable'
    )
  );

comment on column public.gallery_items.caption_shape is
  'The shape of this card''s caption. NEVER the hook: a caption is a different '
  'artefact, so caption_shape_basis is ''inferred'' and only ever that. Eight '
  'values are reachable by the pattern set; four more (flat_declarative_claim, '
  'personal_result, relatable_moment, topic_announcement) were derived from the '
  '4,112 no_pattern_match rows and are reachable only by a model read.';

comment on column public.gallery_items.caption_shape_reason is
  'Why there is no shape. Eight values, and they are NOT interchangeable: '
  '''no_pattern_match'' means no model was ever asked, ''not_a_hook'' means a '
  'pre-filter declined to spend on it, ''model_found_no_shape'' means a model '
  'read it and honestly found none, ''model_unavailable'' means the read never '
  'happened, and ''model_reply_unreadable'' means it happened and did not parse. '
  'Collapsing these would turn a failed call, or our own prompt bug, into '
  'evidence that the corpus has no shape here.';

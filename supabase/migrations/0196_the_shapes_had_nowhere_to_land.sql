-- THE CLASSIFIER RAN, AND THERE WAS NOWHERE TO PUT THE ANSWER.
--
-- `packages/shared/src/corpus/captionShape.ts` classifies a caption into one of
-- eight hook shapes. It has been merged, tested against real rows, and has NO
-- production reader and no column to write to — the dominant defect class in
-- this codebase, and 0194 is the previous instance by name: "the backfill wrote
-- a column that did not exist".
--
-- ⚠️ MEASURED ON PRODUCTION BEFORE WRITING THIS, over the newest 3,000 of
-- 16,343 gallery_items, by running the real module rather than estimating:
--
--     classified                  511   17.0%
--     no pattern matched        2,061   68.7%
--     empty after stripping       172    5.7%   urls/hashtags/mentions only
--     not English (non-Latin)     145    4.8%
--     no title at all             111    3.7%
--
-- ⚖️ SO "NO SHAPE" IS THREE DIFFERENT FACTS, AND STORING ONE NULL FOR ALL OF
-- THEM WOULD DESTROY THE DIFFERENCE. A row with no caption, a row in German and
-- a row whose caption is a real English hook the pattern set does not recognise
-- are not the same observation, and a single NULL makes them identical to every
-- future reader. That is the "absent is not zero" failure this project keeps
-- paying for, so the REASON is a column, not a comment.
--
-- ⚠️ AND THE SHAPE DISTRIBUTION IS THE PART THAT CONSTRAINS THE CONSUMER:
--
--     how_to            220      negative_command   18
--     number_promise    183      contrarian_claim    3
--     direct_question    86      myth_bust           1
--     curiosity_gap       0      direct_address      0
--
-- Two of the eight shapes never fire at all in 3,000 real rows. `cohort.ts`
-- requires the LEADING shape's own n to clear MIN_COHORT (20) inside a cohort,
-- so on this distribution only how_to, number_promise and direct_question can
-- ever be decisive. Nothing here widens the pattern set to chase that — the
-- measurement is recorded so the consumer is designed against the real
-- distribution instead of the eight-shape vocabulary.
--
-- ⚠️ NO BACKFILL IN THIS FILE. The columns land here; the classifier runs in a
-- job that can be re-run when the pattern set changes. A backfill embedded in a
-- migration runs exactly once, on a schema that has no way to say which version
-- of the classifier produced a value — which is how a corpus quietly mixes two
-- vocabularies.
--
-- STAGING NOTE: staging's APPLIED list starts at 0090, so `gallery_items` does
-- not exist there and 0194 is a DECLARED EXCLUSION in
-- check_staging_migration_coverage.mjs for exactly that reason. This migration
-- touches the same table and needs the same treatment.

alter table public.gallery_items
  add column if not exists caption_shape text,
  add column if not exists caption_shape_basis text,
  add column if not exists caption_shape_reason text,
  add column if not exists caption_shape_version integer,
  add column if not exists caption_shape_at timestamptz;

-- ⚠️ THE VOCABULARY IS PINNED IN THE DATABASE, not only in TypeScript. A shape
-- the code stops producing must not be storable, and a typo in a job must fail
-- the write rather than become a ninth shape nobody defined. These eight are
-- CAPTION_SHAPES verbatim; `confession` and `stakes_first` are deliberately
-- absent there and so absent here.
alter table public.gallery_items
  drop constraint if exists gallery_items_caption_shape_known;
alter table public.gallery_items
  add constraint gallery_items_caption_shape_known
  check (caption_shape is null or caption_shape in (
    'negative_command', 'number_promise', 'contrarian_claim', 'direct_question',
    'myth_bust', 'curiosity_gap', 'direct_address', 'how_to'
  ));

-- ⚖️ EVERY STORED SHAPE IS `inferred`, AND THE SCHEMA SAYS SO. `captionShape`
-- returns basis 'inferred' on every path — it reads a pattern off text a creator
-- wrote for a different purpose, and it never observed the video. A column that
-- allowed 'observed' would invite a future writer to claim it.
alter table public.gallery_items
  drop constraint if exists gallery_items_caption_shape_basis_known;
alter table public.gallery_items
  add constraint gallery_items_caption_shape_basis_known
  check (caption_shape_basis is null or caption_shape_basis = 'inferred');

alter table public.gallery_items
  drop constraint if exists gallery_items_caption_shape_reason_known;
alter table public.gallery_items
  add constraint gallery_items_caption_shape_reason_known
  check (caption_shape_reason is null or caption_shape_reason in (
    'no_title', 'empty_after_strip', 'not_english', 'no_pattern_match'
  ));

-- ⚠️ A SHAPE AND A REASON ARE MUTUALLY EXCLUSIVE, and this is a constraint
-- rather than a convention because the alternative is a row that carries both
-- and two readers that disagree about which one is true.
alter table public.gallery_items
  drop constraint if exists gallery_items_caption_shape_xor_reason;
alter table public.gallery_items
  add constraint gallery_items_caption_shape_xor_reason
  check (caption_shape is null or caption_shape_reason is null);

-- ⚖️ A CLASSIFIED ROW MUST CARRY ITS BASIS, ITS VERSION AND ITS TIMESTAMP.
-- Without the version a re-run cannot tell which rows predate a pattern change,
-- and the corpus mixes two vocabularies with no way to separate them again.
alter table public.gallery_items
  drop constraint if exists gallery_items_caption_shape_is_attributed;
alter table public.gallery_items
  add constraint gallery_items_caption_shape_is_attributed
  check (
    caption_shape is null
    or (caption_shape_basis is not null and caption_shape_version is not null and caption_shape_at is not null)
  );

-- Partial: the reader always asks for rows that HAVE a shape, and 83% of the
-- table does not.
create index if not exists gallery_items_caption_shape_idx
  on public.gallery_items (niche, caption_shape)
  where caption_shape is not null;

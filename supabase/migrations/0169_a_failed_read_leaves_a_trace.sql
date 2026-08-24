-- A FAILED EXTRACTION WROTE NOTHING, SO IT LOOKED LIKE ONE THAT NEVER RAN.
--
-- ⚠️ THE DEFECT, MEASURED AT SOURCE. worker/src/jobs/extractProduct.ts writes
-- `knowledge: []` when a page has nothing readable on it, and writes NOTHING AT
-- ALL when the read fails -- the handler throws and the row is untouched. So a
-- product whose page could not be fetched is byte-identical, on the row, to one
-- whose extraction was never attempted: knowledge null, knowledge_extracted_at
-- null.
--
-- ⚖️ WHICH THE CREATOR READS AS "Twin is reading the page", FOREVER. That is the
-- "Added, but we could not start reading that page" report: the card cannot tell
-- them the truth because the row does not carry it.
--
-- ⚠️ AND THE ALTERNATIVE WAS REJECTED ON PURPOSE. Guessing from elapsed time --
-- "null for more than ten minutes means failed" -- reports a slow queue as a
-- failure and a fast failure as progress, and does so silently. The attempt
-- outcome has to be recorded, not inferred, which is why this is a column and
-- not a cleverer derivation.
--
-- ⚖️ TWO COLUMNS, NOT A STATUS ENUM. A status field would be a second source of
-- truth about knowledge that can disagree with the knowledge itself, which is a
-- bug this repo already has elsewhere. These record only what happened to the
-- ATTEMPT; what was learned still lives in `knowledge`, and the state is derived
-- from both by `productLifecycle`.
--
-- ⚠️ `knowledge_failed_at` IS CLEARED ON EVERY SUCCESS, and the worker does that
-- in the same update that stores the facts. Without it a product that failed
-- once and then read fine would keep reporting a failure it had recovered from
-- -- absent is not zero, and stale is not absent.
--
-- ⚖️ RE-RUNNABLE: `add column if not exists` on both, and the comment is
-- idempotent. Applying this twice changes nothing the second time.

alter table public.product_entities
  add column if not exists knowledge_failed_at timestamptz;

alter table public.product_entities
  add column if not exists knowledge_error text;

comment on column public.product_entities.knowledge_failed_at is
  'When the last extraction ATTEMPT failed. NULL means the last attempt did not fail -- which includes never having attempted one. Cleared on success.';

comment on column public.product_entities.knowledge_error is
  'Why the last attempt failed, in words safe to show a creator. NULL whenever knowledge_failed_at is NULL.';

-- ⚠️ THE TWO MUST AGREE, because a reason with no time and a time with no reason
-- are both half-written failures, and the card would render one of them as a
-- state nobody can act on.
alter table public.product_entities
  drop constraint if exists product_entities_knowledge_failure_is_complete;

alter table public.product_entities
  add constraint product_entities_knowledge_failure_is_complete
  check ((knowledge_failed_at is null) = (knowledge_error is null));

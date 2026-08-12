-- WHAT TWIN LEARNED ABOUT A PRODUCT, WITH ITS PROVENANCE ATTACHED.
--
-- ⚠️ EXTRACTION INTRODUCES THE FIRST SOURCE THAT IS NOT THE CREATOR. Everything
-- else in this system is the creator speaking (transcript), the creator
-- answering (user), or something they published (caption). A pasted product URL
-- is SOMEONE ELSE'S MARKETING COPY, and marketing copy is written to be believed
-- rather than to be true. So the store cannot be a bag of strings: each fact has
-- to carry where it came from and whether anyone has checked it.
--
-- ⚖️ ONE JSONB COLUMN RATHER THAN A `product_facts` TABLE, AND THE REASON IS
-- READ SHAPE. Facts are only ever fetched as a whole profile for one entity —
-- there is no query that wants "every price across all products" — so a table
-- would buy joins nobody needs and cost a migration for every new field kind.
-- `creator_knowledge` earned its own table because it is queried ACROSS
-- entities, ranked, deduped and merged. This is not that.
--
-- ⚠️ NULL MEANS NEVER EXTRACTED, AND `[]` MEANS EXTRACTED AND FOUND NOTHING.
-- Those are different facts about a product and the UI says different things
-- about them — "add a link so Twin can learn this" versus "we read the page and
-- it told us nothing usable". Collapsing them to one empty state is the same
-- `unset ≠ false` mistake this schema keeps having to avoid.
--
-- Shape, enforced in `productExtraction.ts` rather than by a CHECK, because a
-- constraint over an array of objects would be unreadable and would need a
-- migration every time a field kind is added:
--
--   [{ field, value, source, sourceUrl, trust, extractedAt }]
--
--   trust: 'usable'              identity/capability from an authoritative page
--          'needs_confirmation'  anything with a number or an outcome in it, or
--                                anything at all from marketing copy
--
-- ⚖️ `trust` IS STORED RATHER THAN RECOMPUTED ON READ so that a later change to
-- the classifier cannot silently promote facts a creator already reviewed. If
-- the rules tighten, old rows keep the grade they were given and are re-graded
-- deliberately, not as a side effect of a deploy.

alter table public.product_entities
  add column if not exists knowledge jsonb;

alter table public.product_entities
  add column if not exists knowledge_extracted_at timestamptz;

-- The source Twin read. Kept separate from `product_url` because they are
-- different facts: the product's page, versus the page we happened to extract
-- from — which for a marketplace listing or a docs site is not the same URL.
alter table public.product_entities
  add column if not exists knowledge_source_url text;

comment on column public.product_entities.knowledge is
  'Facts extracted from a product page, each with source and a stored `trust` '
  'grade. NULL = never extracted; [] = extracted and nothing usable found. '
  'Grades are stored, not recomputed, so tightening the classifier cannot '
  'silently promote facts a creator already reviewed.';

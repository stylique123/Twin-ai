-- A CREATOR'S OWN ONE-LINE DESCRIPTION, KEPT FOR WHEN THE PAGE CANNOT BE READ.
--
-- ⚠️ THE ADD FORM ASKED FOR A NAME AND OFFERED NOTHING ELSE OF THE CREATOR'S OWN
-- WORDS. When the pasted link could not be read -- the same "half-created
-- product" failure migration 0169 gave a trace to -- the entity was left with
-- nothing to fall back on but a name, and IMPORT_FAILED had no content of any
-- kind to offer a script.
--
-- ⚖️ SO THE FORM NOW ASKS ONE MORE THING, IN THE CREATOR'S OWN WORDS: what the
-- product is and who it is for. It is short by design -- a sentence, not a
-- description -- because it exists to be a floor under a failed scrape, not a
-- replacement for one that succeeds.
--
-- ⚠️ STORED SEPARATELY FROM `knowledge`, NOT MIXED IN AT WRITE TIME. `knowledge`
-- is what Twin extracted and graded; conflating a creator's own sentence with
-- extracted facts would misattribute authorship the moment anyone asked where a
-- fact came from. The extractor reads this column and, only where extraction
-- itself produced nothing, turns it into a `user_confirmed` fact -- see
-- `worker/src/jobs/extractProduct.ts`.
--
-- ⚖️ RE-RUNNABLE: `add column if not exists`, idempotent comment.

alter table public.product_entities
  add column if not exists creator_summary text;

comment on column public.product_entities.creator_summary is
  'The creator''s own one-line answer to "what is it and who is it for?", kept as a fallback for when the page could not be read. Not extracted knowledge -- the creator''s own words, always source=user_confirmed if it ever becomes a fact.';

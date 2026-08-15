-- A BELIEF IS ONE FACT THE CREATOR HAS WORDED SEVERAL WAYS.
--
-- ⚠️ G9. The extractor re-reads transcripts on every scan and writes the same
-- fact in different words. 0123 made exact repeats merge; #370 made near-repeats
-- merge by rewriting the incoming text to the stored one. That rewrite works, and
-- `canonicaliseRepeats` admits what it costs in its own comment: "The newer
-- wording is often slightly richer, and that is a real if small loss — accepted."
--
-- ⚖️ THIS IS WHERE THE ACCEPTED LOSS GOES. The stored `text` stays the canonical
-- wording — it is the key the unique index and `times_seen` hang off, and
-- churning it every scan would orphan that history. What was being thrown away is
-- the phrasing the creator actually used this time.
--
-- ⚠️ IDENTITY IS THE ROW, NOT A HASH, AND THERE IS DELIBERATELY NO
-- `canonical_key`. A paraphrase does not collide with its original under any
-- deterministic key — that is what makes it a paraphrase. Matching is what
-- resolves identity; this column is the memory that makes matching better.
--
-- ⚖️ AND IT HAS A READER ON DAY ONE: the next scan's matcher, which compares an
-- incoming row against every KNOWN wording rather than only the canonical one.
--
-- ⚠️ THE COMPOUNDING-DRIFT ARGUMENT FOR THIS WAS TRIED AND COULD NOT BE
-- REPRODUCED. "A drifts to B drifts to C, and C no longer matches A" does not
-- occur at threshold 0.6 in the chains tested: pairs close enough to merge stay
-- close enough that the third phrasing still matches the first. Written down
-- rather than quietly dropped, because the honest justification is narrower —
-- more known wordings can only ever match MORE repeats, never fewer, and the
-- richer phrasing the creator used is no longer discarded.
alter table public.creator_knowledge
  add column if not exists surface_forms jsonb not null default '[]'::jsonb;

alter table public.creator_knowledge
  drop constraint if exists creator_knowledge_surface_forms_is_array;
alter table public.creator_knowledge
  add constraint creator_knowledge_surface_forms_is_array
  check (jsonb_typeof(surface_forms) = 'array');

-- ⚠️ BOUNDED, BECAUSE IT GROWS ONCE PER RESCAN PER BELIEF. Twelve wordings is
-- far more than matching needs and far less than a runaway. The application
-- trims; this is the backstop that keeps a bug from turning one row into a log.
alter table public.creator_knowledge
  drop constraint if exists creator_knowledge_surface_forms_bounded;
alter table public.creator_knowledge
  add constraint creator_knowledge_surface_forms_bounded
  check (jsonb_array_length(surface_forms) <= 12);

comment on column public.creator_knowledge.surface_forms is
  'Other wordings of this same belief, observed on later scans. The canonical '
  'wording stays in `text` because the unique index and times_seen hang off it. '
  'Read by the next scan''s matcher so drift cannot split one belief into three. '
  'Empty array means no rescan has re-worded it — not that none exists.';

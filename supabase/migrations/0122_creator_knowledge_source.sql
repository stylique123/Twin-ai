-- WHERE DID THIS KNOWLEDGE COME FROM?
--
-- ⚠️ THE QUESTION THE TABLE COULD NOT ANSWER. `creator_knowledge` records WHAT
-- we know (`kind`) and HOW STRONGLY it is attested (`basis`), but not WHICH
-- PIPELINE produced it. That gap made the single most important deployment
-- question unanswerable after the fact:
--
--     do transcript-derived profiles ground creator-state claims at a much
--     higher rate than caption-only ones?
--
-- `basis` is a lossy proxy for it. Caption extraction is clamped to
-- `demonstrated`, so `stated` implies speech today — but that is a coincidence
-- of the current clamp, not a recorded fact, and it silently breaks the moment
-- another source is added or the clamp changes.
--
-- ⚖️ NULLABLE, WITH NO DEFAULT VALUE. An existing row was written before this
-- column existed, and its source is genuinely UNKNOWN. Backfilling it to
-- 'caption' would invent provenance for ~479 rows and pollute the exact metric
-- this column exists to produce. NULL means "not recorded", which is a
-- different and honest answer — the same three-state discipline `basis`,
-- `source_expiry` and `productFacts` already follow here.
alter table public.creator_knowledge
  add column if not exists source text;

-- Closed set, enforced in the schema rather than in the application, so a new
-- pipeline cannot quietly invent a fifth provenance nobody decided on.
--   caption          a title/description — proves a video was made, not what it concluded
--   transcript       spoken words — the ONLY source that can carry a stated position
--   user             the creator answered directly; the highest authority there is
--   previous_video   carried forward from an earlier generation of their own
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'creator_knowledge_source_check'
  ) then
    alter table public.creator_knowledge
      add constraint creator_knowledge_source_check
      check (source is null or source in ('caption', 'transcript', 'user', 'previous_video'));
  end if;
end $$;

-- The deployment question is "grounding rate BY SOURCE", so the index that
-- matters is source alongside the owner whose profile is being measured.
create index if not exists creator_knowledge_owner_source_idx
  on public.creator_knowledge (owner_id, source);

comment on column public.creator_knowledge.source is
  'Which pipeline produced this item: caption | transcript | user | previous_video. NULL = written before the column existed; never backfilled, because inventing provenance would corrupt the grounding-by-source metric this column exists to produce.';

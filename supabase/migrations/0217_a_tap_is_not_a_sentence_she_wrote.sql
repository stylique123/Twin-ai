-- SHE APPROVED OUR SENTENCE, OR SHE WROTE HER OWN. THOSE ARE NOT THE SAME FACT.
--
-- ⚠️ WHY THIS EXISTS NOW. The story screen offers back what the scan heard her
-- say, and a confirmed suggestion is put into the SAME field a typed answer
-- occupies — `StoryInterview`'s own comment says `submit()` "cannot tell the two
-- apart". That was the right call while there was one write path and no reader.
-- It stops being right the moment the writer is allowed to put an `asked` row in
-- her mouth: approving a sentence somebody else composed is weaker evidence that
-- these are HER words than typing them, and the store had no way to say so.
--
-- ⚖️ IT IS A SEPARATE COLUMN AND NOT A NEW `source` VALUE, DELIBERATELY. 0189
-- records what the alternative costs: `source` carries a CHECK, `asked` was
-- missing from it, and TWELVE real answers from FOUR creators were marked
-- answered and stored nowhere while the insert failed on that constraint. A new
-- source value would also fork the ladder in `merge_creator_knowledge`, where
-- `source` only ever strengthens — and "confirmed" is not stronger or weaker
-- than "asked", it is a different question about the same row.
--
-- ⚖️ NULLABLE, AND NULL MEANS "NOBODY RECORDED HOW". Every existing `asked` row
-- keeps NULL rather than being backfilled to `typed`: at the time they were
-- written the distinction did not exist, and asserting they were typed would be
-- inventing provenance — the one thing this column exists to stop.
alter table public.creator_knowledge
  add column if not exists answer_mode text;

alter table public.creator_knowledge
  drop constraint if exists creator_knowledge_answer_mode_check;
alter table public.creator_knowledge
  add constraint creator_knowledge_answer_mode_check
  check (answer_mode is null or answer_mode in ('typed', 'confirmed'));

comment on column public.creator_knowledge.answer_mode is
  'How an answered row was given: typed (she wrote it) or confirmed (she approved a sentence we proposed from her own scan). NULL means nobody recorded how, never that it was typed. Only meaningful where source = ''asked''.';

-- ⚠️ THE CLIENT WRITES THIS, so it needs the column grant its neighbours have.
-- 0141's note applies: a grant without a policy is not access, and a policy
-- without a grant is not either.
grant insert (answer_mode) on public.creator_knowledge to authenticated;
grant update (answer_mode) on public.creator_knowledge to authenticated;

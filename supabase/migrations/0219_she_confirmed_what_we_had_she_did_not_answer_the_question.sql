-- SHE CONFIRMED WHAT WE ALREADY HAD. THAT IS NOT AN ANSWER TO THE QUESTION.
--
-- ⚠️⚠️ THE DEFECT THIS EXISTS TO PREVENT IS A RUNWAY DEFECT, AND IT IS SUBTLE
-- ENOUGH THAT A FIRST IMPLEMENTATION OF THE STORY SCREEN HAD IT. The screen
-- offers back what the scan already heard her say, so she can recognise rather
-- than recall. If confirming one of those COUNTS AS ANSWERING the question, the
-- product gains nothing at all: the row already exists in `creator_knowledge`,
-- so the confirmation adds no material — and because the question is then marked
-- answered, `creator_questions_put` guarantees she is NEVER ASKED AGAIN. One tap
-- would permanently trade a story we do not have for a re-label of one we do.
--
-- ⚖️ SO CONFIRMING AND ANSWERING ARE DIFFERENT ACTIONS ON DIFFERENT ROWS, and
-- this column is what makes them different:
--
--   confirming  →  marks THIS row creator-verified. No new row, and the question
--                  stays open. What it buys is trust: a claim she has personally
--                  vouched for is stronger than one a model distilled from her
--                  speech, and `basis` alone cannot say that.
--   answering   →  a NEW row, `source = 'asked'`, exactly as before. This is the
--                  only action that adds supply, and it is the one the three
--                  questions exist for.
--
-- ⚖️ WHICH ALSO MAKES THE SHOWN SUGGESTION WORTH MORE, NOT LESS. It stops being
-- an answer to accept and becomes two useful things at once: a memory aid, and a
-- statement of what NOT to repeat. "We already have this one — what is another?"
-- is a better question than the blank box it replaces, and it is the only
-- version of this screen that can still grow the store.
--
-- ⚠️ NULLABLE, AND NULL MEANS "SHE HAS NOT BEEN ASKED ABOUT THIS ROW". It is not
-- "she denied it" — a denial is a different and louder fact, and nothing records
-- one yet. Do not read an absent confirmation as doubt.
alter table public.creator_knowledge
  add column if not exists creator_confirmed_at timestamptz;

comment on column public.creator_knowledge.creator_confirmed_at is
  'When the creator personally confirmed this extracted row is right. NULL means never shown or never acted on, NEVER that she denied it. Confirming does NOT answer the question the row was offered against: only a new source=''asked'' row adds supply.';

-- The story screen reads "rows this creator has already verified" per owner.
create index if not exists creator_knowledge_confirmed_idx
  on public.creator_knowledge (owner_id, creator_confirmed_at);

-- ⚠️ THE CLIENT WRITES THIS, so it needs the column grant. 0141's rule: a grant
-- without a policy is not access, and a policy without a grant is not either —
-- the owner-scoped UPDATE policy from 0121 already covers the row.
grant update (creator_confirmed_at) on public.creator_knowledge to authenticated;

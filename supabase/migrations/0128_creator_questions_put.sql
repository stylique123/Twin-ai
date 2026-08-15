-- WHICH QUESTIONS HAVE ALREADY BEEN PUT TO THIS CREATOR.
--
-- ⚠️ WITHOUT THIS TABLE THE FEATURE IS A NAG. Belief questions are asked one at a
-- time inside normal use, so the only thing standing between "a helpful prompt
-- after a good script" and "the same question every single time" is a durable
-- record of what has been put to whom. `nextQuestion` refuses to return anything
-- in here.
--
-- ⚖️ A SKIP IS RECORDED AS FIRMLY AS AN ANSWER, AND THAT IS THE WHOLE DESIGN.
-- Declining to answer is a decision. Storing only answers would re-ask every
-- skipped question forever — the creator would experience the product as unable
-- to take no for an answer, which is exactly how an optional prompt gets
-- switched off for good.
--
-- ⚖️ AND THE ANSWER ITSELF DOES NOT LIVE HERE. It becomes a row in
-- `creator_knowledge` with basis 'stated' and source 'asked', because it is
-- knowledge and belongs where the writer already looks. This table records only
-- that the question was put, so it can never disagree with the store about what
-- the creator said.
create table if not exists public.creator_questions_put (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- The stable question id from `CREATOR_QUESTIONS`, never its wording.
  question_id text not null,
  -- 'answered' | 'skipped'. Not an enum: a third outcome ("asked, dismissed the
  -- card without choosing") would otherwise need a migration before it could be
  -- counted, and counting is what this table is for.
  outcome text not null,
  created_at timestamptz not null default now(),
  constraint creator_questions_put_outcome_valid check (outcome in ('answered', 'skipped')),
  constraint creator_questions_put_question_short check (length(btrim(question_id)) between 1 and 80)
);

-- ⚠️ ONE ROW PER CREATOR PER QUESTION, ENFORCED IN THE SCHEMA. The "never ask
-- twice" rule is the feature's only defence against being annoying, and a rule
-- that lives solely in application code is one lost race away from a duplicate.
create unique index if not exists creator_questions_put_one_per_question
  on public.creator_questions_put (owner_id, question_id);

create index if not exists creator_questions_put_owner
  on public.creator_questions_put (owner_id, created_at desc);

alter table public.creator_questions_put enable row level security;

drop policy if exists creator_questions_put_select_own on public.creator_questions_put;
create policy creator_questions_put_select_own on public.creator_questions_put
  for select using (auth.uid() = owner_id);

drop policy if exists creator_questions_put_insert_own on public.creator_questions_put;
create policy creator_questions_put_insert_own on public.creator_questions_put
  for insert with check (auth.uid() = owner_id);

-- ⚖️ UPDATE IS ALLOWED HERE, UNLIKE `script_edits`, AND FOR ONE NARROW REASON:
-- a creator who skipped a question may later answer it, and that transition must
-- be storable without a second row fighting the unique index above. Nothing else
-- about the row is meant to change.
drop policy if exists creator_questions_put_update_own on public.creator_questions_put;
create policy creator_questions_put_update_own on public.creator_questions_put
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

comment on table public.creator_questions_put is
  'Which belief questions have been put to a creator, and whether they answered '
  'or skipped. A skip is recorded as durably as an answer so nothing is ever '
  'asked twice. The answers themselves live in creator_knowledge as stated rows.';

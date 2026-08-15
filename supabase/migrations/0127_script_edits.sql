-- WHAT THE CREATOR CHANGED, KEPT.
--
-- ⚠️ THE PRODUCT GENERATES THIS SIGNAL CONTINUOUSLY AND HAS NEVER WRITTEN IT
-- DOWN. `applyDialogueEdit` holds the old line and the new one in the same
-- expression, compares them, and returns only the new script. So a creator
-- rewriting "this dramatically improves productivity" into "this saves me doing
-- the same edit six times" leaves behind the second sentence and no trace that
-- the first was rejected — which is the half that carries the information.
--
-- ⚖️ MEASURED: THE SYSTEM HOLDS 13 REAL CREATOR DECISIONS, all of them hook
-- picks. Every judge, reranker and calibration idea downstream waits on
-- preference data this table is the natural home for.
--
-- ⚠️ APPEND-ONLY, AND THAT IS THE POINT. An edit log that can be updated is a
-- log whose history can be destroyed by the UI that gathers it — the exact
-- defect found in `posts.views`, where every save overwrote the previous
-- reading. There is no UPDATE policy here on purpose.
create table if not exists public.script_edits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid references public.generations(id) on delete set null,
  -- 'hook' | 'dialogue'. Not an enum: a third editable thing would otherwise be
  -- a migration before it can be measured, and this table exists to measure.
  target text not null,
  scene_number integer,
  -- ⚠️ BOTH HALVES OR NEITHER. `before` is the column with the information in
  -- it; storing only `after` would reproduce the loss this table exists to end.
  before_text text not null,
  after_text text not null,
  -- Decidable facts, computed at write time by `describeEditFacts`. Judgement
  -- ("generic → concrete") is deliberately NOT stored: interpretation frozen at
  -- capture time cannot be revised when it turns out to be wrong, and this
  -- session produced four broken metrics that would each have been baked in.
  facts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists script_edits_owner_created
  on public.script_edits (owner_id, created_at desc);
create index if not exists script_edits_generation
  on public.script_edits (generation_id);

alter table public.script_edits enable row level security;

-- A creator reads and writes only their own edits. No UPDATE and no DELETE
-- policy: append-only is enforced by the absence of a policy, not by convention.
drop policy if exists script_edits_select_own on public.script_edits;
create policy script_edits_select_own on public.script_edits
  for select using (auth.uid() = owner_id);

drop policy if exists script_edits_insert_own on public.script_edits;
create policy script_edits_insert_own on public.script_edits
  for insert with check (auth.uid() = owner_id);

comment on table public.script_edits is
  'Append-only record of script lines a creator rewrote before filming. Both the '
  'rejected text and the replacement are kept: the rejected half is the one that '
  'carries the signal. Judgement about the KIND of edit is deliberately not '
  'stored — only facts decidable from the two strings.';

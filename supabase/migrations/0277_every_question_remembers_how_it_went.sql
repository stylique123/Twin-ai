-- 0277 — EVERY QUESTION REMEMBERS HOW IT WENT (owner, 2026-10-04).
--
-- Questions are generated per option from a spec (packages/shared/src/script/
-- questionSpecs.ts). Each one shown is logged with its option, slot, product
-- or brand, exact wording and how it went (shown / answered / skipped /
-- filler), so the next question never repeats it, a skipped slot rests, and
-- weak slots can be cut after a few weeks. Answers themselves are facts in
-- creator_knowledge (source_ref = 'asked:spec:<entity>:<option>:<slot>').

create table if not exists public.question_asks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_key text not null default 'none',
  option_id text not null,
  slot_id text not null,
  angle text not null default 'first',
  wording text not null,
  outcome text not null default 'shown' check (outcome in ('shown', 'answered', 'skipped', 'filler')),
  run integer not null default 1,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  -- The script this question led to: null when she left before generating
  -- (drop-off), and the join for scores after an answer vs after a skip.
  generation_id uuid
);
create index if not exists question_asks_owner_option on public.question_asks (owner_id, entity_key, option_id, created_at desc);
alter table public.question_asks enable row level security;
drop policy if exists question_asks_own_read on public.question_asks;
create policy question_asks_own_read on public.question_asks for select to authenticated using (owner_id = auth.uid());
alter table public.question_asks add column if not exists generation_id uuid;

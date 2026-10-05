-- "Nothing like that happened" is an answer, not a skip (owner 2026-10-05):
-- the slot is not asked again and does not count toward resting.
alter table public.question_asks drop constraint if exists question_asks_outcome_check;
alter table public.question_asks add constraint question_asks_outcome_check check (outcome in ('shown', 'answered', 'skipped', 'filler', 'nothing'));

-- THE ONE DEFECT NOBODY REPORTS AND EVERYBODY FIXES BY HAND.
--
-- ⚠️ A CREATOR WHO REWRITES A LINE BEFORE SAYING IT HAS TOLD US NOTHING. There
-- is no complaint, no refund, no event — they retype the sentence, film the
-- video, and Twin records a success. The rewrite IS the failure, and it is
-- currently invisible, so "are our scripts speakable?" has never had an answer
-- from production traffic.
--
-- ⚖️ ONE COLUMN, WRITTEN IN OBSERVE MODE. `speechIssues` and `speakableShare`
-- already run in `packages/shared` against fixtures; this is where their reading
-- of a REAL generated script lands. Nothing is blocked or rewritten on it — the
-- thresholds were derived from one worked example, and enforcing a threshold on
-- traffic it has never been measured against is how a guard starts refusing good
-- work.
--
-- ⚠️ AND IT IS DURABLE ON PURPOSE. The three previous counters in this codebase
-- that measured nothing all measured it into edge logs, which expire within
-- days, so a month of traffic left nothing to count.
alter table public.generations
  add column if not exists speech_audit jsonb;

comment on column public.generations.speech_audit is
  'Observe-only speakability reading of the shipped script: {share, sentences, issues[], hard_long}. Never gates a generation.';

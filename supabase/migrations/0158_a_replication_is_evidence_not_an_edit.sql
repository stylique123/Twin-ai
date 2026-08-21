-- A REPLICATION IS EVIDENCE, AND EVIDENCE DOES NOT REWRITE ITSELF.
--
-- ⚠️ #66 RECORDED THREE ARM-A TIMEOUTS and could not say whether they were
-- transient service latency or reproducible Pro behaviour. Answering that needs
-- the same model asked the same question about the same bytes, several times.
--
-- ⚖️ AND IT MUST NOT TOUCH THE TRIAL IT REPLICATES. Re-running the parity job
-- would have upserted straight over the rows that record the timeouts — the
-- primary evidence destroyed by the investigation into it. So replications live
-- in their own table, INSERT ONLY, and the worker never writes to
-- extraction_parity_trials from this path at all.
--
-- ⚠️ INSERT ONLY, NOT UPSERT. The unique key exists to REFUSE a second write of
-- the same attempt, not to overwrite one. Attempt 2 disagreeing with attempt 1
-- is the finding; a table that let attempt 2 quietly replace attempt 1 would
-- turn a reliability measurement into a report of whatever ran last.
create table if not exists public.extraction_parity_replications (
  id uuid primary key default gen_random_uuid(),

  -- ⚖️ THE TRIAL BEING REPLICATED, BY IDENTITY not by url. A url can carry more
  -- than one trial (different model pairs, symmetric and asymmetric); a
  -- replication answers a question about exactly one of them.
  source_trial_id uuid not null references public.extraction_parity_trials(id) on delete cascade,
  url text not null,

  model text not null,
  -- 1-based, and part of the uniqueness key. Three repeats are attempts 1, 2, 3.
  attempt_number integer not null check (attempt_number >= 1),

  -- ⚠️ THE DIGESTS ARE THE WHOLE POINT. A replication that ran against a
  -- different transcript, prompt or schema is a new experiment wearing the name
  -- of an old one. These are copied from the source trial's manifest and the
  -- worker refuses to run when any of them disagrees, so a stored row is a
  -- claim that the question was identical.
  transcript_sha256 text not null,
  system_digest text not null,
  vocab_digest text not null,
  schema_digest text not null,

  -- Reused from the source manifest, never chosen fresh. `thinking_budget` is
  -- the RESOLVED number: absent means 2048 in gemini.ts, and recording the
  -- absence rather than the value would lose the only thing worth comparing.
  thinking_budget integer not null,
  timeout_ms integer not null,

  started_at timestamptz not null,
  completed_at timestamptz not null,
  -- ⚖️ STORED, NOT DERIVED AT READ TIME. The question is "how long did Pro take",
  -- and a latency that has to be recomputed from two timestamps by every reader
  -- is a latency somebody eventually recomputes differently.
  latency_ms integer not null check (latency_ms >= 0),

  -- ⚠️ `timeout` IS ITS OWN OUTCOME, not an error subtype. That distinction is
  -- the entire question this table exists to answer, and folding it into
  -- `error` would erase it on the first read.
  outcome text not null check (outcome in ('ok', 'timeout', 'error')),
  -- Present only when the outcome is not ok. Coarse on purpose: the exact
  -- message belongs in the log, the CLASS is what a rate is computed over.
  error_class text,
  fields_accepted integer,

  created_at timestamptz not null default now(),

  -- An ok run accepted some fields; a timeout accepted none. Neither state is
  -- allowed to claim the other's shape.
  constraint replication_ok_has_fields check (
    (outcome = 'ok' and fields_accepted is not null and error_class is null)
    or (outcome <> 'ok' and fields_accepted is null and error_class is not null)
  )
);

-- ⚠️ THE REFUSAL, NOT A DEDUPE HINT. Combined with insert-only writes, a second
-- attempt 2 for the same trial and model fails loudly rather than replacing the
-- first one.
create unique index if not exists extraction_parity_replications_one_per_attempt
  on public.extraction_parity_replications (source_trial_id, model, attempt_number);

create index if not exists extraction_parity_replications_trial_idx
  on public.extraction_parity_replications (source_trial_id);

-- ⚖️ NO CLIENT MAY READ OR WRITE THIS. Same posture as extraction_parity_trials
-- and reference_transcripts: an internal experiment record is not a product
-- surface, and a grant nobody needs is a grant somebody eventually uses.
alter table public.extraction_parity_replications enable row level security;
revoke all on public.extraction_parity_replications from anon, authenticated;

comment on table public.extraction_parity_replications is
  'Repeat runs of ONE model against the exact cached transcript of one parity '
  'trial, to tell transient latency from reproducible behaviour. Insert only; '
  'never modifies extraction_parity_trials.';

-- WHAT HAPPENED WHEN A SCRIPT WAS GENERATED, INCLUDING WHEN IT DID NOT WORK.
--
-- ⚠️ TODAY A FAILED GENERATION LEAVES NO ROW ANYWHERE. `generate-blueprint`
-- inserts into `generations` only AFTER the model call succeeds, so a timeout, a
-- MAX_TOKENS truncation, invalid JSON or a non-2xx produces a refund, a
-- console.error, and nothing durable. Edge logs expire within days. The one
-- lasting record is an `ops_events` row written when the REFUND fails — we
-- durably record the failure of the failure handler and not the failure.
--
-- ⚖️ SO THE ROW IS WRITTEN BEFORE THE CALL, WHICH IS THE ENTIRE POINT. A row
-- only written on success cannot describe a failure. This mirrors
-- `edit_director_calls`, the one state machine in this system that has ever
-- answered "how often has that failed, ever" with a number instead of a guess.
--
-- ⚖️ AND IT STORES THE CAUSE, NOT ONLY THE CODE — the one defect in
-- `edit_director_calls` deliberately not repeated. A 429 (our quota), a 503
-- (Google's problem) and a 400 (our malformed request) are indistinguishable
-- under a shared code, and they call for three different responses.
create table if not exists public.script_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- ⚠️ NULL IS THE NORMAL STATE AT INSERT TIME, NOT A MISSING LINK. The row is
  -- written before the model call and the generation does not exist yet; it is
  -- filled in on success. A row that never gets one is a run that never produced
  -- a script, which is exactly what this table exists to make visible.
  generation_id uuid references public.generations(id) on delete set null,
  -- Groups the attempts of one ladder. Two attempts of the same run share it, so
  -- "how many generations failed" is countable without treating a recovered
  -- retry as a second generation.
  run_id uuid not null,
  -- 0 = the primary (quality) attempt, 1 = the fast fallback.
  attempt_index integer not null,
  -- ⚠️ THE MODEL ACTUALLY USED, not the configured default. GEMINI_MODEL is an
  -- env override; recording the config rather than the call would report what we
  -- meant to run instead of what ran.
  model text not null,
  outcome text not null default 'started',
  failure_code text,
  failure_detail text,
  started_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint script_attempts_outcome_valid check (
    outcome in ('started', 'succeeded', 'incomplete', 'failed')),
  -- ⚖️ A FAILURE WITHOUT A CODE IS THE STATE THIS TABLE EXISTS TO PREVENT, so it
  -- is unrepresentable rather than discouraged.
  constraint script_attempts_failure_has_code check (
    outcome <> 'failed' or failure_code is not null),
  constraint script_attempts_attempt_index_sane check (attempt_index >= 0 and attempt_index < 10),
  constraint script_attempts_detail_short check (
    failure_detail is null or length(failure_detail) <= 300)
);

create unique index if not exists script_attempts_one_per_attempt
  on public.script_attempts (run_id, attempt_index);
create index if not exists script_attempts_owner_started
  on public.script_attempts (owner_id, started_at desc);
-- Answering "what does it fail on" is a scan over failures, so give it an index
-- that does not drag the successes along.
create index if not exists script_attempts_failures
  on public.script_attempts (failure_code, started_at desc) where outcome = 'failed';

alter table public.script_attempts enable row level security;

-- ⚠️ NO INSERT OR UPDATE POLICY, AND THAT IS DELIBERATE. Only the edge function's
-- service role writes here. A creator able to insert could assert a failure that
-- never happened, and this table is meant to be evidence.
drop policy if exists script_attempts_select_own on public.script_attempts;
create policy script_attempts_select_own on public.script_attempts
  for select using (auth.uid() = owner_id);

comment on table public.script_attempts is
  'One row per model attempt in a script generation ladder, written BEFORE the '
  'call and settled after. Records the model actually used, the attempt index, a '
  'typed failure code and the provider''s own message. A row with no '
  'generation_id is a run that never produced a script.';

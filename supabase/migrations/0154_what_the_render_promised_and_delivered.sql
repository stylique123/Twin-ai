-- THE NUMBER THE RENDERER ALREADY COMPUTES, KEPT INSTEAD OF DISCARDED.
--
-- ⚠️ THE VALIDATOR HAS ALWAYS KNOWN THE ANSWER FOR A FEW MILLISECONDS AND THEN
-- FORGOTTEN IT. `editorValidateOutput.ts` computes `durationDeltaMs` — the gap
-- between what the compiler PROMISED the output would run and what the encoder
-- actually delivered — and returns it. Nothing persisted it. On success it
-- evaporated; on failure it survived only inside an interpolated error string.
--
-- ⚠️ AND THAT COST A 40-MINUTE RERUN TO LEARN NOTHING. On 2026-08-20 a staging
-- render failed with `output_duration_mismatch: 5867ms vs 6170ms (delta -303ms,
-- tolerance ±250ms)`. Was that a one-off, or had deltas been creeping toward the
-- boundary for weeks? Unanswerable — so the only available move was to re-run the
-- matrix and see. A measurement that exists for the length of one function call
-- cannot settle an argument about a trend.
--
-- ⚖️ FAILED ATTEMPTS ARE RECORDED TOO, AND THAT IS THE POINT. The interesting
-- observation is precisely the one currently trapped inside the thrown error, so
-- the write happens BEFORE the tolerance check throws. A table of successes only
-- would omit every row anybody wants to look at.
--
-- ⚠️ THIS TABLE PROVES NOTHING ON ITS OWN, AND MUST NOT BE READ AS IF IT DOES.
-- It exists to make a hypothesis testable, not to assert one. The current guess
-- is frame quantisation: each concatenated segment can lose up to one frame, so
-- the deficit would grow with the cut count and cluster on frame-sized steps.
-- Other candidates the same rows can distinguish: concat timestamp
-- normalisation, encoder delay, segment boundary rounding, audio/video duration
-- reconciliation. A rising correlation with applied_cuts is NOT the mechanism;
-- the mechanism is sum(per-cut rounding error) ≈ observed delta, holding across
-- several renders.
create table if not exists public.render_attempts (
  id uuid primary key default gen_random_uuid(),

  -- WHICH RENDER. The job id is the render's identity for this attempt; the
  -- project is what a human recognises.
  render_job_id uuid not null,
  edit_project_id uuid not null,

  -- ⚠️ PROMISED VERSUS DELIVERED, AS TWO COLUMNS RATHER THAN ONE DIFFERENCE.
  -- The delta is stored too because it is what the validator compared, but a
  -- delta alone cannot answer "are short videos worse than long ones".
  predicted_duration_ms integer not null,
  actual_duration_ms integer not null,
  duration_delta_ms integer not null,
  duration_tolerance_ms integer not null,

  -- ⚖️ THE FRAME GRID, AS A RATIONAL AND NOT A FLOAT. 30000/1001 is a real frame
  -- rate and 29.97 is not the same number. The whole quantisation hypothesis is
  -- arithmetic about frame durations, so storing a rounded decimal here would
  -- corrupt the evidence in exactly the dimension being tested.
  output_fps_num integer not null,
  output_fps_den integer not null,

  -- ⚠️ NULL MEANS UNRECORDED, NEVER ZERO. `applied_cuts` comes from the
  -- compiling stage's own cutStats — the same number `cuts_measured` reports —
  -- and a job RESUMED straight into rendering never ran that stage, so it
  -- genuinely does not know. Writing 0 there would invent a cut-free render and
  -- drag the correlation this table exists to measure toward zero.
  applied_cuts integer,
  segment_count integer,

  -- What the DURATION check decided. Deliberately narrow: a render recorded
  -- `within_tolerance` may still have failed afterwards on loudness, geometry or
  -- captions. This column answers one question and does not pretend to answer
  -- the others.
  validator_outcome text not null,

  created_at timestamptz not null default now(),

  constraint render_attempts_outcome_known check (
    validator_outcome in ('within_tolerance', 'duration_mismatch')
  ),
  constraint render_attempts_fps_sane check (output_fps_num > 0 and output_fps_den > 0),
  constraint render_attempts_durations_sane check (
    predicted_duration_ms >= 0 and actual_duration_ms >= 0 and duration_tolerance_ms >= 0
  ),
  -- ⚖️ THE DELTA MUST BE THE SUBTRACTION IT CLAIMS TO BE. A row whose delta does
  -- not equal actual - predicted is a row that would quietly poison every later
  -- query, and the database is the cheapest place to make that impossible.
  constraint render_attempts_delta_is_the_difference check (
    duration_delta_ms = actual_duration_ms - predicted_duration_ms
  ),
  constraint render_attempts_counts_nonneg check (
    (applied_cuts is null or applied_cuts >= 0) and (segment_count is null or segment_count >= 0)
  )
);

-- "Have deltas been drifting?" is the question this table exists for, and it is
-- asked in time order.
create index if not exists render_attempts_created_idx
  on public.render_attempts (created_at desc);

-- ── ACCESS ───────────────────────────────────────────────────────────────
--
-- ⚠️ SYSTEM-OWNED. Written only by the worker under the service role. Supabase
-- grants ALL on new public tables by default, so leaving this alone would hand
-- anon and authenticated INSERT, UPDATE, DELETE and TRUNCATE over the evidence —
-- and 0140 exists because row security does not gate TRUNCATE.
alter table public.render_attempts enable row level security;

revoke all on table public.render_attempts from anon, authenticated;

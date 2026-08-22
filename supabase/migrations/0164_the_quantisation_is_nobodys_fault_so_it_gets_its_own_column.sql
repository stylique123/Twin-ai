-- THE PART OF THE DELTA NOBODY COULD HAVE AVOIDED, KEPT SEPARATE FROM THE PART
-- SOMEBODY COULD.
--
-- ⚠️ 0154 RECORDED ONE DELTA AND IT WAS TWO NUMBERS ADDED TOGETHER.
-- `predicted_duration_ms` was `plan.output.durationMs` — what the Director
-- asked for. A renderer emits whole frames, so that duration is reachable only
-- when it happens to land on the frame grid. Every render was therefore charged
-- for a quantisation error in a single direction, mixed into the same column as
-- genuine encoder drift. Fifteen runs went by with a systematic −125 ms bias
-- that looked like noise because the two effects were summed before storage.
--
-- `predicted_duration_ms` now means THE FRAME-GRID DURATION THE RENDERER CAN
-- ACTUALLY EMIT, and the gap between that and the request is its own column.
-- Rows written before this migration keep their old meaning; the new columns
-- are null there, which is what makes the change legible rather than silent.
--
-- ⚠️ THIS IS NOT A WIDENED TOLERANCE. `duration_tolerance_ms` is untouched. The
-- target moved onto a number the renderer can hit; the tolerance around it did
-- not grow by a millisecond.
alter table public.render_attempts
  -- Negative when the request sits above the reachable frame, positive below.
  -- NULL means "recorded before this column existed", never zero.
  add column if not exists plan_quantisation_delta_ms integer,
  -- The frame count the timeline resolves to. The whole seam-loss investigation
  -- is arithmetic about frame counts, and a duration in milliseconds cannot
  -- distinguish 184 frames from 183 at 30000/1001.
  add column if not exists target_frame_count integer,
  -- ⚠️ THE COLUMN THE CORRELATION ACTUALLY NEEDED. The one failing attempt in
  -- the 2026-08-20 matrix differed from the fifteen passing ones by exactly one
  -- thing: it had 2 zooms and they had 1. That was invisible because nothing
  -- stored it. NULL means unrecorded, never zero — a plan with no zooms records
  -- 0, and the two must stay distinguishable.
  add column if not exists zoom_count integer;

-- ⚠️ RE-RUNNABLE, BECAUSE POSTGRES HAS NO `ADD CONSTRAINT IF NOT EXISTS`.
--
-- The columns above are idempotent and this was not, so the SECOND application
-- of this file failed with "constraint already exists". That reaches far beyond
-- this migration: the staging matrix applies every listed migration BYTE-EXACT
-- on every run, so one non-re-runnable file breaks every subsequent staging run
-- — for every PR, not just the one that introduced it.
--
-- ⚖️ FOUND BY RE-RUNNING A MATRIX ON AN UNCHANGED HEAD, which is the only thing
-- that exercises second application. A first run applies a new migration
-- against a schema that has never seen it and cannot reveal this.
--
-- Drop-then-add, matching 0162 next door. Preferred over the `pg_constraint`
-- do-block of 0030/0094 because it also survives a CHANGED definition: the
-- guard form would silently keep the old constraint while the file claims the
-- new one.
alter table public.render_attempts
  drop constraint if exists render_attempts_frame_counts_sane;
alter table public.render_attempts
  add constraint render_attempts_frame_counts_sane check (
    (target_frame_count is null or target_frame_count > 0)
    and (zoom_count is null or zoom_count >= 0)
  );

-- THE SPEECH COHORT COULD NEVER HAVE BEEN STARTED.
--
-- ⚠️ THE OWNER PRESSED START AND GOT: "could not freeze the pilot sample: new
-- row for relation visual_pilot_references violates check constraint
-- visual_pilot_references_stratum_check". Nothing began — the freeze is the
-- first write, so no video was downloaded, no frame was analysed and nothing
-- was spent.
--
-- ⚠️ THE CAUSE IS A CONSTRAINT THAT NEVER LEARNED THE SECOND POPULATION. 0163
-- wrote `check (stratum in ('chars_zero', 'chars_tiny'))` when there was one
-- cohort. #475 added the with-speech cohort, whose bands are `speech_short` and
-- `speech_long` (COHORT_BANDS in scripts/pilot-core.mjs), and every other piece
-- moved with it — the selection version, the band function, the start screen —
-- except this line. The first row of the first speech run is rejected.
--
-- ⚖️ SO THE NO-SPEECH RUN WORKED AND HID IT. Run 7204de6f froze 8 references
-- with strata the constraint happened to list. A check that only ever saw the
-- population it was written for looks like a passing check.
--
-- ⚠️ THIS IS THE SAME DEFECT AS 0167's `jump`, ONE DAY APART: a value the code
-- has always produced, forbidden by a constraint nobody widened when the code
-- grew. Both are now covered by the cross-file guard in
-- packages/shared/src/pilot/__tests__/frictionLogWritesRealColumns.test.ts,
-- which reads the enum the code can emit and the constraint that admits it and
-- fails when they disagree.
--
-- ⚖️ RE-RUNNABLE: the constraint is dropped by name before it is recreated.

alter table public.visual_pilot_references
  drop constraint if exists visual_pilot_references_stratum_check;

alter table public.visual_pilot_references
  add constraint visual_pilot_references_stratum_check
  check (stratum in (
    -- the no-speech cohort, from 0163
    'chars_zero', 'chars_tiny',
    -- the with-speech cohort, from #475 — never added until now
    'speech_short', 'speech_long'
  ));

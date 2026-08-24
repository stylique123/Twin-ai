-- THE FRICTION LOG HAS NEVER RECORDED A SINGLE ROW, AND HERE IS WHY.
--
-- ⚠️ TWO SEPARATE DEFECTS, EITHER OF WHICH ALONE WOULD HAVE EMPTIED THE TABLE.
--
-- 1. THE ENDPOINT WRITES COLUMNS THAT DO NOT EXIST. pilot-review's `event`
--    action inserts { pilot_run_id, reviewer, kind, detail }. 0163 created the
--    table with { id, pilot_run_id, kind, claim_id, via, created_at }. There is
--    no `reviewer` and no `detail`, so PostgREST rejected EVERY insert, the
--    handler returned 500, and the browser's `.catch(() => {})` swallowed it.
--
-- 2. THE CLIENT SENDS A KIND THE CONSTRAINT FORBIDS. PilotVisualReview logs
--    'jump' when the reviewer uses the claim picker. The check constraint lists
--    session_start, label, relabel, skip, frame_change, nav and key — not jump.
--    Even with the columns fixed, that one would still have failed.
--
-- ⚠️ THIS IS WHY A TWO-HOUR OUTAGE COULD NOT BE DIAGNOSED. On 2026-08-23,
-- Finish & Lock was broken for every reviewer for two hours and there was no
-- record of what anyone had clicked, because this table was empty and looked
-- exactly the same as a table nobody had used. "Fire-and-forget" was blamed;
-- fire-and-forget only explains why nobody NOTICED. It never explained why the
-- write failed, and reading the two definitions side by side does.
--
-- ⚖️ THE COLUMNS ARE ADDED RATHER THAN THE ENDPOINT NARROWED. `finish` already
-- reads `e.detail` and spreads it into the friction analysis, so dropping the
-- payload to match the table would silently keep the friction report empty —
-- fixing the error and keeping the defect.
--
-- ⚖️ AND `via` AND `claim_id` STAY. They are written by nothing today, but the
-- analysis reads both out of the spread detail, so they are the shape this table
-- is meant to grow into rather than dead weight to remove in the same pass as a
-- bug fix.

alter table public.visual_pilot_events
  add column if not exists reviewer uuid references auth.users(id) on delete set null;

alter table public.visual_pilot_events
  add column if not exists detail jsonb;

-- ⚠️ RE-RUNNABLE, per the ratchet: migrations here must survive being applied
-- twice, so the constraint is dropped by name before it is recreated rather
-- than assumed absent.
alter table public.visual_pilot_events
  drop constraint if exists visual_pilot_events_kind_check;

alter table public.visual_pilot_events
  add constraint visual_pilot_events_kind_check
  check (kind in (
    'session_start', 'label', 'relabel', 'skip', 'frame_change', 'nav', 'key',
    -- ⚠️ 'jump' IS NOT NEW BEHAVIOUR. The client has always sent it; the
    -- constraint simply never listed it, so those rows were rejected too.
    'jump'
  ));

create index if not exists visual_pilot_events_reviewer_idx
  on public.visual_pilot_events (reviewer, created_at desc);

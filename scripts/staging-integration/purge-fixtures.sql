-- Delete the staging fixture rows that CAN be deleted, and report the ones that
-- cannot.
--
-- ⚠️⚠️ THE FIRST VERSION OF THIS FILE TRIED TO DELETE auth.users AND FAILED IN
-- CI, AND THE FAILURE WAS RIGHT. `edit_plans` carries an append-only trigger
-- that raises 'rows are immutable — DELETE is refused for every role', and the
-- ON DELETE CASCADE from auth.users walks straight into it. Measured on run
-- 34470777072: the doomed set built (11,448 users), jobs/rate_events/ops_events
-- deleted, and then the whole transaction aborted on that RAISE. Nothing was
-- lost, because it was one transaction — but nothing was reclaimed either.
--
-- ⚖️ THE GUARD IS NOT THE PROBLEM AND MUST NOT BE TOUCHED. 0094 states the
-- reason at the trigger: "APPEND-ONLY. Not 'no UPDATE to the important
-- columns' — there is no unimportant column on a hashed, cited record, and A
-- RULE WITH AN EXCEPTION LIST IS A RULE SOMEONE WILL EXTEND." The migration
-- anticipated this exact request. Disabling the trigger, adding a role
-- exemption, or a session flag would all be weakening an integrity boundary so
-- that a cleanup script could be shorter.
--
-- ⚠️ NINE TABLES REFUSE DELETE, found by asking pg_trigger rather than by
-- discovering them one CI failure at a time: edit_plans, edit_outputs,
-- edit_events, media_analyses, edit_director_calls, edit_director_decisions,
-- source_capture_intents, source_capture_manifests, source_script_snapshots.
--
-- SO WHAT THIS CAN AND CANNOT DO, MEASURED, NOT ESTIMATED (staging, 845 MB):
--
--     deletable here (no trigger)          91 MB   jobs, rate_events, ops_events
--     refused, append-only                409 MB
--     blocked behind them by cascade      202 MB   users, media_assets,
--                                                  edit_projects, generations
--
-- ⚠️ 11%, NOT 90%. An earlier dry run of this file reported ~90% reclaim. That
-- number was wrong and it was wrong in an instructive way: it counted the rows
-- the cascade would SELECT and never asked whether the cascade was PERMITTED.
-- Measuring the selection is not measuring the delete.
--
-- ⚖️ THE REMAINING 611 MB NEEDS A DECISION, NOT A LONGER SCRIPT. The only
-- mechanism that removes append-only rows without touching their guard is
-- TRUNCATE, which does not fire row triggers — and whether staging's
-- disposability outranks an append-only invariant is a judgement for the owner,
-- not something to slip into a cleanup step at 12:20. NOT DONE HERE.
--
-- ⚠️ STORAGE OBJECTS ARE ALSO NOT PURGED HERE. Deleting a storage.objects row
-- does not delete the bytes, it orphans them beyond the reach of any API.
-- Verified in pg_constraint that storage.objects has no FK to auth.users, so
-- nothing here can cascade into it. 47,900 objects are a separate job through
-- the storage endpoint.

\set ON_ERROR_STOP on

BEGIN;

-- Which run's fixtures are in scope. Fixed once, up front: recomputing per
-- statement would let a signup landing mid-purge be caught by one statement and
-- missed by another.
--
-- ⚠️ THESE USERS ARE NOT DELETED. They cannot be, per the header. The set
-- exists to scope the three deletes below to one run's rows instead of every
-- fixture row in the database.
CREATE TEMP TABLE swept ON COMMIT DROP AS
SELECT id, email
FROM auth.users
WHERE email LIKE :'run_pattern'
   OR (email LIKE '%@staging.test' AND created_at < now() - (:'max_age_days' || ' days')::interval);

CREATE INDEX ON swept (id);

SELECT count(*) AS users_in_scope FROM swept;

-- ⚠️ THESE THREE ARE THE ONLY TABLES THIS CAN REACH, and it is not a
-- coincidence: each has an owner_id/user_id and NO foreign key to auth.users
-- (verified in pg_constraint), so no cascade reaches them and no append-only
-- trigger protects them. They are also 91 MB of the 845, which is the entire
-- reclaimable share.
DELETE FROM public.jobs        WHERE owner_id IN (SELECT id FROM swept);
DELETE FROM public.rate_events WHERE user_id  IN (SELECT id FROM swept);
DELETE FROM public.ops_events  WHERE user_id  IN (SELECT id FROM swept);

COMMIT;

-- What is left, so the step's log is a measurement and not a claim. The
-- append-only counts are printed precisely BECAUSE this script cannot move
-- them: a number that only ever appears in a comment stops being checked.
SELECT
  pg_size_pretty(pg_database_size(current_database()))                AS db_size_after,
  (SELECT count(*) FROM public.jobs)                                  AS jobs_left,
  (SELECT count(*) FROM public.rate_events)                           AS rate_events_left,
  (SELECT count(*) FROM public.ops_events)                            AS ops_events_left,
  (SELECT count(*) FROM auth.users)                                   AS users_NOT_deletable,
  (SELECT count(*) FROM public.edit_events)                           AS edit_events_APPEND_ONLY,
  (SELECT count(*) FROM public.media_analyses)                        AS media_analyses_APPEND_ONLY,
  (SELECT count(*) FROM storage.objects)                              AS storage_objects_NOT_purged_here;

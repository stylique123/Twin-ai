-- Delete what the staging matrix created, and what earlier runs abandoned.
--
-- MEASURED BEFORE WRITING THIS (staging, 2026-09-10): 842 MB of database,
-- 12,482 auth users of which ZERO are real, 397,723 edit_events, 103,529
-- media_analyses, 85,662 jobs. The oldest user is dated the day the project
-- was created. Nothing has ever been deleted. See fixtureIdentity.mjs for why
-- that costs IO rather than merely disk.
--
-- TWO SCOPES, AND THEY ARE DIFFERENT ON PURPOSE:
--
--   :run_pattern     the users THIS run created. Passed as a pattern that
--                    matches nothing when the run FAILED — a failed run's rows
--                    are the only evidence of why it failed, and deleting them
--                    to save disk would be trading the diagnosis for bytes.
--   :max_age_days    every fixture user older than this, whatever run made it.
--                    ⚠️ THIS IS THE ONLY THING THAT EVER RECLAIMS A CRASHED
--                    RUN'S ROWS. A purge that ran only on the happy path would
--                    leak exactly the runs worth investigating, forever, which
--                    is a slower version of today.
--
-- ⚠️ STORAGE IS DELIBERATELY NOT TOUCHED HERE. storage.objects has no foreign
-- key to auth.users (verified: only bucket_id and multipart parents), so this
-- delete cannot cascade into it — and it must not be extended to. Deleting a
-- storage.objects ROW does not delete the underlying object; it orphans the
-- bytes and makes them unreclaimable through any API. The 47,900 staging
-- objects are a separate job that has to go through the storage endpoint.
-- NOT DONE HERE, AND NOT SILENTLY: the counts below report it.

\set ON_ERROR_STOP on

BEGIN;

-- Fixed once, up front. Recomputing the set per statement would let a signup
-- landing mid-purge be caught by a later statement and missed by an earlier
-- one, leaving a user whose children are half gone.
CREATE TEMP TABLE doomed ON COMMIT DROP AS
SELECT id, email
FROM auth.users
WHERE email LIKE :'run_pattern'
   OR (email LIKE '%@staging.test' AND created_at < now() - (:'max_age_days' || ' days')::interval);

CREATE INDEX ON doomed (id);

SELECT count(*) AS users_to_delete FROM doomed;

-- ⚠️ THESE THREE HAVE AN owner_id/user_id COLUMN AND NO FOREIGN KEY, so the
-- cascade below does not reach them. Verified against pg_constraint: jobs,
-- rate_events and ops_events reference nothing. They are 72 MB, 16 MB and
-- 2 MB, and without these statements they would survive every purge and grow
-- without bound while the tables around them shrank.
DELETE FROM public.jobs        WHERE owner_id IN (SELECT id FROM doomed);
DELETE FROM public.rate_events WHERE user_id  IN (SELECT id FROM doomed);
DELETE FROM public.ops_events  WHERE user_id  IN (SELECT id FROM doomed);

-- Everything else hangs off auth.users with ON DELETE CASCADE: media_assets,
-- media_analyses, edit_projects (and edit_events, edit_plans, edit_outputs,
-- edit_director_calls/decisions beneath it), generations,
-- source_capture_intents and source_capture_manifests.
DELETE FROM auth.users WHERE id IN (SELECT id FROM doomed);

COMMIT;

-- What is left, so the step's log is a measurement and not a claim.
SELECT
  pg_size_pretty(pg_database_size(current_database()))                                    AS db_size_after,
  (SELECT count(*) FROM auth.users)                                                       AS users_left,
  (SELECT count(*) FROM auth.users WHERE email LIKE '%@staging.test')                      AS fixture_users_left,
  (SELECT count(*) FROM public.edit_events)                                               AS edit_events_left,
  (SELECT count(*) FROM public.media_analyses)                                            AS media_analyses_left,
  (SELECT count(*) FROM public.jobs)                                                      AS jobs_left,
  (SELECT count(*) FROM storage.objects)                                                  AS storage_objects_NOT_purged_here;

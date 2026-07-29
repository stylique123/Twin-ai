-- STAGING ONLY — NOT A MIGRATION. Never applied to production.
--
-- Lives OUTSIDE supabase/migrations/ so no migration runner can pick it up.
-- Production has these buckets from 0065_create_storage_buckets.sql (raised to
-- 600MB by 0069_raise_storage_caps.sql) and needs nothing from here.
--
-- WHY THIS EXISTS
--
-- The staging project is a purpose-built EDITOR-ONLY test bed, and the matrix
-- deliberately applies only the editor migrations (0090-0097). 0065 is a core
-- migration, so staging never got it, so staging has no `edits` bucket — the
-- one the renderer publishes finished videos and covers into.
--
-- Phases 1-7 never noticed. They upload SOURCES, which go to `takes`, and that
-- bucket exists because source capture predates the editor test bed. Nothing
-- before Phase 8 ever wrote an OUTPUT, so nothing ever needed the other bucket.
--
-- HOW IT WAS FOUND, AND WHY THAT MATTERS
--
-- Not by a render failing. By the schema assertion added in the same change that
-- fixed the output bucket name:
--
--   ERROR: missing storage bucket edits (0065) — the renderer has nowhere to
--          publish
--
-- The worker's `EDITOR_OUTPUT_BUCKET` had defaulted to 'media', a bucket that
-- exists nowhere. Correcting the default to 'edits' was necessary and would NOT
-- have been sufficient: the render would still have encoded, validated, and
-- 404'd on upload, just against a different name. The assertion exists because a
-- name is not a bucket, and it earned that on its first run.
--
-- WHAT IS MIRRORED, AND WHY ONLY THIS
--
-- The two bucket rows from 0065 and the cap from 0069, and nothing else. No
-- policies: 0006/0057 grant direct client reads on objects whose FIRST path
-- segment is the owner id, and editor outputs are served by an authorizing edge
-- function that signs with the service role instead. Adding policies here would
-- give staging a permission surface production does not have, which is the
-- opposite of what a test bed is for.
--
-- Idempotent, so re-running the matrix is a no-op.

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('takes', 'takes', false, 629145600),
  ('edits', 'edits', false, 629145600)
on conflict (id) do nothing;

-- 0069 raised both caps to 600MB to match WORKER_MAX_DOWNLOAD_BYTES. A bucket
-- that already existed at 0065's 50MB cap keeps it through the insert above, so
-- the update is the half that actually applies on staging.
update storage.buckets
   set file_size_limit = 629145600
 where id in ('takes', 'edits')
   and (file_size_limit is null or file_size_limit < 629145600);

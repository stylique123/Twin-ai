-- 0202 — THE FIX FOR A TRUNCATED DIAGNOSIS LANDED ON TWO LAYERS OF THREE, AND
-- THE THIRD NOW REJECTS THE WHOLE ROW.
--
-- ⚠️ MEASURED IN PRODUCTION 2026-09-13. Three layers state one bound and they
-- do not agree:
--
--   packages/shared/src/editor/uploadAttemptReport.ts  FAILURE_CODE_MAX_CHARS = 1000
--   supabase/functions/source-asset/index.ts           .slice(0, 1000)
--   media_upload_attempts_failure_code_bounded         char_length(...) <= 200
--
-- 0149 set 200. #(the client fix) raised the client and the edge to 1000 with the
-- measurement that justified it — the only record of why the last real take
-- failed stops mid-word at exactly 200 characters, one word before the response
-- BODY, the single field that names the cause. The migration was never written.
--
-- ⚠️⚠️ SO THE REPAIR MADE IT WORSE, AND THAT IS THE POINT. The edge now sends up
-- to 1000 characters into a column that refuses more than 200, so the INSERT
-- fails and NO row is written at all. Before, a failure recorded a truncated
-- reason. Now a failure with a long message records nothing. Every tus error
-- observed here is longer than 200 characters, so this is the common case, not
-- the edge one.
--
-- ⚖️ THIS IS THE COST OF THE RECORDING FUNNEL BEING BLIND. Production has FIVE
-- recordings in the product's lifetime: one reached `ready`, four stuck in
-- `uploading`, zero reached an edit project. Two of the four carry a stored
-- cause — a 62.7MB take refused with "The object exceeded the maximum allowed
-- size" (the `takes` bucket limit is 600MB, so that is NOT the bucket), and a
-- tus 400 while CREATING the resumable upload. That table is the only instrument
-- pointed at the most broken funnel in the product, and the bound was switching
-- it off.
alter table public.media_upload_attempts
  drop constraint if exists media_upload_attempts_failure_code_bounded;

-- ⚖️ STILL BOUNDED, JUST ABOVE THE THING BEING DIAGNOSED. An unbounded string
-- from a browser error turns a diagnostic column into a free-text channel, which
-- is why 0149's limit existed and is still right in kind. 1000 is the number the
-- client and the edge already enforce, so this makes three layers agree rather
-- than inventing a fourth opinion.
alter table public.media_upload_attempts
  add constraint media_upload_attempts_failure_code_bounded
    check (failure_code is null or char_length(failure_code) <= 1000);

comment on column public.media_upload_attempts.failure_code is
  'The thrown text from the client, trimmed and bounded at 1000 characters -- '
  'the same bound FAILURE_CODE_MAX_CHARS and source-asset enforce. 0149 set 200 '
  'and that cut the tus response body off one word before the cause; raising the '
  'client without this constraint made the INSERT fail outright instead.';

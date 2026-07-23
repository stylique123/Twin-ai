\set ON_ERROR_STOP off
\pset pager off
-- Seed owner + generation.
truncate public.source_capture_manifests, public.source_capture_intents, public.media_assets, public.generations cascade;
insert into public.generations (id, user_id) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- upload input intent (camelCase, client-authority fields only)
\set inp '{"schemaVersion":1,"origin":"upload","generationId":"11111111-1111-1111-1111-111111111111","recordingScriptSha256":null,"clientAttemptId":"33333333-3333-3333-3333-333333333333","recorderClock":"none","acceptedSegments":[]}'

\echo == T1: first create -> exactly one asset + one intent, marker stamped, created=true ==
select created, status, (asset_id is not null) as has_id from public.editor_create_source_asset(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
  :'inp'::jsonb,'takes','video/webm','webm',1048576,5,21474836480);
select count(*) as assets from public.media_assets;
select count(*) as intents from public.source_capture_intents;
select capture_contract_version from public.media_assets;

\echo == T2: identical retry -> idempotent, created=false, still exactly one asset+intent ==
select created from public.editor_create_source_asset(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
  :'inp'::jsonb,'takes','video/webm','webm',1048576,5,21474836480);
select count(*) as assets, (select count(*) from public.source_capture_intents) as intents from public.media_assets;

\echo == T3: divergent retry (teleprompter payload, same attempt) -> capture_intent_conflict ==
select public.editor_create_source_asset(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',
  '{"schemaVersion":1,"origin":"teleprompter","generationId":"11111111-1111-1111-1111-111111111111","recordingScriptSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","clientAttemptId":"33333333-3333-3333-3333-333333333333","recorderClock":"mediarecorder-active-time-ms","acceptedSegments":[{"sceneNumber":1,"startMs":0,"endMs":2000,"intendedDialogueSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]}'::jsonb,
  'takes','video/webm','webm',1048576,5,21474836480);

\echo == T4: ownership mismatch -> source_generation_not_owned, zero new rows ==
select public.editor_create_source_asset(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444444',
  :'inp'::jsonb,'takes','video/webm','webm',1048576,5,21474836480);
select count(*) as assets_after_ownership_fail from public.media_assets;

\echo == T5: quota exceeded on a NEW attempt -> source_quota_exceeded, no orphan ==
select public.editor_create_source_asset(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555',
  '{"schemaVersion":1,"origin":"upload","generationId":"11111111-1111-1111-1111-111111111111","recordingScriptSha256":null,"clientAttemptId":"55555555-5555-5555-5555-555555555555","recorderClock":"none","acceptedSegments":[]}'::jsonb,
  'takes','video/webm','webm',999999999999,5,1000);
select count(*) as assets_after_quota_fail from public.media_assets;

\echo == T6: attempt/generation mismatch in embedded input -> stable mismatch ==
select public.editor_create_source_asset(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','66666666-6666-6666-6666-666666666666',
  '{"schemaVersion":1,"origin":"upload","generationId":"11111111-1111-1111-1111-111111111111","recordingScriptSha256":null,"clientAttemptId":"33333333-3333-3333-3333-333333333333","recorderClock":"none","acceptedSegments":[]}'::jsonb,
  'takes','video/webm','webm',1048576,5,21474836480);

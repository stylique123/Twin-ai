\set ON_ERROR_STOP on
\pset pager off

-- ---- assertion helpers (fail-closed: any failure RAISES → psql aborts nonzero)
create or replace function pg_temp.expect_code(p_sql text, p_code text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if strpos(SQLERRM, p_code) = 1 then return; end if;
    raise exception 'ASSERT_FAIL: expected "%", got "%"', p_code, SQLERRM;
  end;
  raise exception 'ASSERT_FAIL: expected "%", but statement succeeded', p_code;
end; $$;
create or replace function pg_temp.expect_true(p boolean, label text) returns void language plpgsql as $$
begin if p is distinct from true then raise exception 'ASSERT_FAIL: % (expected true)', label; end if; end; $$;

-- ---- fixtures
truncate public.source_capture_manifests, public.source_capture_intents, public.media_assets, public.generations cascade;
insert into public.generations (id, user_id) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- valid client inputs (camelCase; no server fields)
create temp view v as select
  '{"schemaVersion":1,"origin":"upload","generationId":"11111111-1111-1111-1111-111111111111","recordingScriptSha256":null,"clientAttemptId":"33333333-3333-3333-3333-333333333333","recorderClock":"none","acceptedSegments":[]}'::jsonb as up,
  '{"schemaVersion":1,"origin":"teleprompter","generationId":"11111111-1111-1111-1111-111111111111","recordingScriptSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","clientAttemptId":"33333333-3333-3333-3333-333333333333","recorderClock":"mediarecorder-active-time-ms","acceptedSegments":[{"sceneNumber":1,"startMs":0,"endMs":2000,"intendedDialogueSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]}'::jsonb as tel;

\echo == positive path: first create / idempotent / divergent ==
do $$
declare r record; c int; up jsonb; tel jsonb; sha1 text;
begin
  select v.up, v.tel into up, tel from v;
  -- T1 first create
  select * into r from public.editor_create_source_asset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333', up,'takes','video/webm',1048576);
  perform pg_temp.expect_true(r.created, 'T1 created=true');
  perform pg_temp.expect_true(r.status='uploading', 'T1 status');
  perform pg_temp.expect_true(r.intent_sha256 ~ '^[0-9a-f]{64}$', 'T1 sha 64hex');
  perform pg_temp.expect_true(r.storage_path = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/11111111-1111-1111-1111-111111111111/'||r.asset_id::text||'.webm', 'T1 path');
  sha1 := r.intent_sha256;
  select count(*) into c from public.media_assets; perform pg_temp.expect_true(c=1, 'T1 one asset');
  select count(*) into c from public.source_capture_intents; perform pg_temp.expect_true(c=1, 'T1 one intent');
  select capture_contract_version into c from public.media_assets; perform pg_temp.expect_true(c=1, 'T1 marker=1');
  -- stored intent embeds resolved asset id + recordedAt, and its sha recomputes
  perform pg_temp.expect_true((select intent->>'sourceAssetId' from public.source_capture_intents) = r.asset_id::text, 'T1 stored sourceAssetId');
  perform pg_temp.expect_true((select intent->>'recordedAt' from public.source_capture_intents) ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$', 'T1 recordedAt fmt');
  perform pg_temp.expect_true((select public.editor_capture_intent_sha256(intent) from public.source_capture_intents) = sha1, 'T1 stored sha recomputes');

  -- T2 identical retry → idempotent
  select * into r from public.editor_create_source_asset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333', up,'takes','video/webm',1048576);
  perform pg_temp.expect_true(not r.created, 'T2 created=false');
  perform pg_temp.expect_true(r.intent_sha256 = sha1, 'T2 same sha');
  select count(*) into c from public.media_assets; perform pg_temp.expect_true(c=1, 'T2 still one asset');
  select count(*) into c from public.source_capture_intents; perform pg_temp.expect_true(c=1, 'T2 still one intent');
end $$;

-- T3 divergent retry (teleprompter payload, same attempt) → conflict, no new rows
select pg_temp.expect_code(
  $q$select public.editor_create_source_asset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333', (select tel from v),'takes','video/webm',1048576)$q$,
  'capture_intent_conflict');
do $$ declare c int; begin select count(*) into c from public.source_capture_intents; perform pg_temp.expect_true(c=1,'T3 no extra intent'); end $$;

\echo == policy + ownership + caps (fail-closed, no orphan) ==
select pg_temp.expect_code($q$select public.editor_create_source_asset('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444444', (select up from v),'takes','video/webm',1048576)$q$, 'source_generation_not_owned');
select pg_temp.expect_code($q$select public.editor_create_source_asset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444444', (select up from v),'renders','video/webm',1048576)$q$, 'source_policy_bucket');
select pg_temp.expect_code($q$select public.editor_create_source_asset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444444', (select up from v),'takes','image/png',1048576)$q$, 'source_policy_mime');
select pg_temp.expect_code($q$select public.editor_create_source_asset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444444', (select up from v),'takes','video/webm',10)$q$, 'source_policy_size');
-- attempt mismatch: embedded clientAttemptId != p_attempt
select pg_temp.expect_code($q$select public.editor_create_source_asset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','66666666-6666-6666-6666-666666666666', (select up from v),'takes','video/webm',1048576)$q$, 'capture_intent_attempt_mismatch');
-- caps use SERVER policy (20 GB / 5 open, not caller-supplied); pre-seed usage.
do $$
declare c int;
begin
  select count(*) into c from public.media_assets; perform pg_temp.expect_true(c=1, 'no orphan after policy/ownership failures');
  -- QUOTA: load the owner over the 20 GB cap, then a fresh create fails closed.
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (gen_random_uuid(),'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',gen_random_uuid(),'source','takes','x','video/webm',21474836480,'uploading',1);
  perform pg_temp.expect_code(
    $q$select public.editor_create_source_asset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555','{"schemaVersion":1,"origin":"upload","generationId":"11111111-1111-1111-1111-111111111111","recordingScriptSha256":null,"clientAttemptId":"55555555-5555-5555-5555-555555555555","recorderClock":"none","acceptedSegments":[]}'::jsonb,'takes','video/webm',1048576)$q$,
    'source_quota_exceeded');
  -- OPEN: a SEPARATE owner (intents are append-only, so we never delete) with
  -- five open source assets → the 6th create for that owner fails closed.
  insert into public.generations (id, user_id) values ('22222222-2222-2222-2222-222222222222','cccccccc-cccc-cccc-cccc-cccccccccccc');
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    select gen_random_uuid(),'cccccccc-cccc-cccc-cccc-cccccccccccc','22222222-2222-2222-2222-222222222222',gen_random_uuid(),'source','takes','x','video/webm',1024,'uploading',1 from generate_series(1,5);
  perform pg_temp.expect_code(
    $q$select public.editor_create_source_asset('cccccccc-cccc-cccc-cccc-cccccccccccc','22222222-2222-2222-2222-222222222222','99999999-9999-9999-9999-999999999999','{"schemaVersion":1,"origin":"upload","generationId":"22222222-2222-2222-2222-222222222222","recordingScriptSha256":null,"clientAttemptId":"99999999-9999-9999-9999-999999999999","recorderClock":"none","acceptedSegments":[]}'::jsonb,'takes','video/webm',1048576)$q$,
    'source_too_many_open');
end $$;

\echo == FULL hostile SourceCaptureIntentInputV1 contract matrix ==
do $$
declare base jsonb := (select tel from v);
begin
  perform pg_temp.expect_code($q$select public.editor_validate_capture_input('[]'::jsonb)$q$, 'capture_intent_not_object');
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||'{"schemaVersion":2}')::text), 'capture_intent_schema');
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||'{"origin":"nope"}')::text), 'capture_intent_bad_origin');
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||'{"generationId":"not-a-uuid"}')::text), 'capture_intent_bad_id');
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||'{"clientAttemptId":"not-a-uuid"}')::text), 'capture_intent_bad_id');
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||'{"recordingScriptSha256":"short"}')::text), 'capture_intent_bad_script_sha');
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||'{"recorderClock":"wrong"}')::text), 'capture_intent_bad_clock');
  -- upload shape: script sha present / clock not none / segments non-empty
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, ((select up from v)||'{"recordingScriptSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}')::text), 'capture_intent_upload_shape');
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, ((select up from v)||'{"recorderClock":"mediarecorder-active-time-ms"}')::text), 'capture_intent_upload_shape');
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, ((select up from v)||'{"acceptedSegments":[{"sceneNumber":1,"startMs":0,"endMs":2000,"intendedDialogueSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]}')::text), 'capture_intent_upload_shape');
  -- segments not an array
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||'{"acceptedSegments":{}}')::text), 'capture_intent_bad_segments');
  -- empty teleprompter
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||'{"acceptedSegments":[]}')::text), 'capture_intent_no_segments');
  -- >200 segments
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$,
    (base||jsonb_build_object('acceptedSegments', (select jsonb_agg(jsonb_build_object('sceneNumber',g,'startMs',g*300,'endMs',g*300+250,'intendedDialogueSha256',repeat('b',64))) from generate_series(1,201) g)))::text), 'capture_intent_too_many');
  -- duplicate scene
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$,
    (base||'{"acceptedSegments":[{"sceneNumber":1,"startMs":0,"endMs":2000,"intendedDialogueSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},{"sceneNumber":1,"startMs":2000,"endMs":4000,"intendedDialogueSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]}')::text), 'capture_intent_dup_scene');
  -- bad scene (<1)
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||'{"acceptedSegments":[{"sceneNumber":0,"startMs":0,"endMs":2000,"intendedDialogueSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]}')::text), 'capture_intent_bad_scene');
  -- bad time (negative start)
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||'{"acceptedSegments":[{"sceneNumber":1,"startMs":-1,"endMs":2000,"intendedDialogueSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]}')::text), 'capture_intent_bad_time');
  -- short segment (<250)
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||'{"acceptedSegments":[{"sceneNumber":1,"startMs":0,"endMs":100,"intendedDialogueSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]}')::text), 'capture_intent_short_segment');
  -- overlap
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||'{"acceptedSegments":[{"sceneNumber":1,"startMs":0,"endMs":3000,"intendedDialogueSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},{"sceneNumber":2,"startMs":2000,"endMs":5000,"intendedDialogueSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]}')::text), 'capture_intent_overlap');
  -- bad dialogue sha
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||'{"acceptedSegments":[{"sceneNumber":1,"startMs":0,"endMs":2000,"intendedDialogueSha256":"nothex"}]}')::text), 'capture_intent_bad_dialogue_sha');
  -- a fully-valid teleprompter input passes
  perform public.editor_validate_capture_input(base);
end $$;

\echo == grant posture (service_role only; anon/authenticated denied) ==
do $$
declare fns text[] := array[
  'public.editor_capture_intent_canonical(jsonb)',
  'public.editor_capture_intent_sha256(jsonb)',
  'public.editor_validate_capture_input(jsonb, uuid, uuid)',
  'public.editor_build_stored_intent(jsonb, uuid, uuid, uuid, text)',
  'public.editor_create_source_asset(uuid, uuid, uuid, jsonb, text, text, bigint)'];
  f text;
begin
  foreach f in array fns loop
    perform pg_temp.expect_true(has_function_privilege('service_role', f, 'EXECUTE'), 'service_role can execute '||f);
    perform pg_temp.expect_true(not has_function_privilege('anon', f, 'EXECUTE'), 'anon denied '||f);
    perform pg_temp.expect_true(not has_function_privilege('authenticated', f, 'EXECUTE'), 'authenticated denied '||f);
  end loop;
end $$;

\echo ALL-ASSERTIONS-PASSED

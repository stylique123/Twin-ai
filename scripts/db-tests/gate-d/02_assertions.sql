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
-- Build a stored capture-intent JSON exactly as the create RPC would, so backfill
-- fixtures carry SELF-CONSISTENT intents (hash recomputes, JSON matches columns). The
-- `p_json_asset` override lets a hostile fixture deliberately store a JSON sourceAssetId
-- that disagrees with the relational source_asset_id column.
create or replace function pg_temp.mk_intent(p_asset uuid, p_gen uuid, p_attempt uuid, p_origin text, p_script_sha text, p_json_asset uuid default null)
returns jsonb language sql as $$
  select public.editor_build_stored_intent(
    jsonb_build_object('origin',p_origin,'recordingScriptSha256',p_script_sha,
                       'recorderClock', case when p_origin='teleprompter' then 'mediarecorder-active-time-ms' else 'none' end,
                       'acceptedSegments','[]'::jsonb),
    coalesce(p_json_asset, p_asset), p_gen, p_attempt, '2026-01-01T00:00:00.000Z')
$$;

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

\echo == round-2: numeric contract, missing-key, input byte cap ==
do $$
declare base jsonb := (select tel from v);
  seg jsonb := '{"sceneNumber":1,"startMs":0,"endMs":2000,"intendedDialogueSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'::jsonb;
begin
  -- integral float (1.0 / 2000.0) is ACCEPTED (parity with Number.isSafeInteger)
  perform public.editor_validate_capture_input(base || jsonb_build_object('acceptedSegments', jsonb_build_array(seg || '{"startMs":0.0,"endMs":2000.0}'::jsonb)));
  -- fractional / negative / >2^53-1 / non-number REJECTED with stable codes
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||jsonb_build_object('acceptedSegments',jsonb_build_array(seg||'{"endMs":2000.5}'::jsonb)))::text), 'capture_intent_bad_time');
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||jsonb_build_object('acceptedSegments',jsonb_build_array(seg||'{"startMs":-1}'::jsonb)))::text), 'capture_intent_bad_time');
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||jsonb_build_object('acceptedSegments',jsonb_build_array(seg||'{"endMs":9007199254740992}'::jsonb)))::text), 'capture_intent_bad_time');
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||jsonb_build_object('acceptedSegments',jsonb_build_array(seg||'{"startMs":"0"}'::jsonb)))::text), 'capture_intent_bad_time');
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||jsonb_build_object('acceptedSegments',jsonb_build_array(seg||'{"sceneNumber":1.5}'::jsonb)))::text), 'capture_intent_bad_scene');
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||jsonb_build_object('acceptedSegments',jsonb_build_array(seg||'{"sceneNumber":9007199254740992}'::jsonb)))::text), 'capture_intent_bad_scene');
  -- upload MISSING recordingScriptSha256 key → upload_shape; teleprompter missing → bad_script_sha
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, ((select up from v) - 'recordingScriptSha256')::text), 'capture_intent_upload_shape');
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base - 'recordingScriptSha256')::text), 'capture_intent_bad_script_sha');
  -- input byte cap is a REAL computation (not the old NULL no-op): well under cap
  -- for a max input, and > cap detectable on an oversized (600-segment) doc.
  perform pg_temp.expect_true(octet_length(convert_to(public.editor_capture_intent_input_canonical(base),'UTF8')) <= 65536, 'input canonical under cap');
  perform pg_temp.expect_true(octet_length(convert_to(public.editor_capture_intent_input_canonical(
    base || jsonb_build_object('acceptedSegments', (select jsonb_agg(jsonb_build_object('sceneNumber',g,'startMs',g*400,'endMs',g*400+300,'intendedDialogueSha256',repeat('b',64))) from generate_series(1,600) g))),'UTF8')) > 65536, 'oversized input canonical > cap');
end $$;

\echo == round-2: existing-attempt descriptor binding + marker matrix + corrupted row ==
do $$
declare r record; up jsonb := (select up from v);
begin
  truncate public.source_capture_intents, public.media_assets cascade;
  -- fresh create for a descriptor-binding attempt
  select * into r from public.editor_create_source_asset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333', up,'takes','video/webm',1048576);
  -- divergent descriptor retries all fail closed (bucket already policy-checked; test mime/size)
  perform pg_temp.expect_code($q$select public.editor_create_source_asset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333', (select up from v),'takes','video/mp4',1048576)$q$, 'source_attempt_conflict');
  perform pg_temp.expect_code($q$select public.editor_create_source_asset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333', (select up from v),'takes','video/webm',2097152)$q$, 'source_attempt_conflict');
  -- identical descriptor still idempotent
  select * into r from public.editor_create_source_asset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333', up,'takes','video/webm',1048576);
  perform pg_temp.expect_true(not r.created, 'identical descriptor idempotent');

  -- MARKER MATRIX: an in-flight legacy row (marker NULL, uploading) is UPGRADED
  -- to marker=1 with a verified intent on create; a settled legacy row is not.
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','a1a1a1a1-0000-0000-0000-000000000001','source','takes','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001.webm','video/webm',1048576,'uploading',null);
  select * into r from public.editor_create_source_asset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','a1a1a1a1-0000-0000-0000-000000000001',
    '{"schemaVersion":1,"origin":"upload","generationId":"11111111-1111-1111-1111-111111111111","recordingScriptSha256":null,"clientAttemptId":"a1a1a1a1-0000-0000-0000-000000000001","recorderClock":"none","acceptedSegments":[]}'::jsonb,'takes','video/webm',1048576);
  perform pg_temp.expect_true((select capture_contract_version from public.media_assets where id='aaaaaaaa-0000-0000-0000-000000000001')=1, 'in-flight legacy upgraded to marker=1');
  perform pg_temp.expect_true((select count(*) from public.source_capture_intents where source_asset_id='aaaaaaaa-0000-0000-0000-000000000001')=1, 'upgraded row has one intent');

  -- settled legacy row (ready, marker NULL) cannot be upgraded → fail closed
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values ('aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','a2a2a2a2-0000-0000-0000-000000000002','source','takes','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000002.webm','video/webm',1048576,'ready',null);
  perform pg_temp.expect_code($q$select public.editor_create_source_asset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','a2a2a2a2-0000-0000-0000-000000000002','{"schemaVersion":1,"origin":"upload","generationId":"11111111-1111-1111-1111-111111111111","recordingScriptSha256":null,"clientAttemptId":"a2a2a2a2-0000-0000-0000-000000000002","recorderClock":"none","acceptedSegments":[]}'::jsonb,'takes','video/webm',1048576)$q$, 'source_attempt_conflict');
end $$;

-- CORRUPTED ROW: a stored intent whose intent_sha256 is CORRECT but whose JSON is
-- tampered (extra key) must still fail closed — the retry compares the immutable
-- JSON, not only the hash.
do $$
declare aid uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  att uuid := 'a3a3a3a3-0000-0000-0000-000000000003';
  inp jsonb := '{"schemaVersion":1,"origin":"upload","generationId":"11111111-1111-1111-1111-111111111111","recordingScriptSha256":null,"clientAttemptId":"a3a3a3a3-0000-0000-0000-000000000003","recorderClock":"none","acceptedSegments":[]}'::jsonb;
  good jsonb; goodsha text;
begin
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (aid,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',att,'source','takes','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/11111111-1111-1111-1111-111111111111/'||aid::text||'.webm','video/webm',1048576,'uploading',1);
  good := public.editor_build_stored_intent(inp, aid, '11111111-1111-1111-1111-111111111111', att, '2026-07-23T11:00:00.000Z');
  goodsha := public.editor_capture_intent_sha256(good);
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at)
    values (aid,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','upload',null,att, good || '{"junk":1}'::jsonb, goodsha, '2026-07-23T11:00:00.000Z'::timestamptz);
  perform pg_temp.expect_code(format($q$select public.editor_create_source_asset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','%s',%L::jsonb,'takes','video/webm',1048576)$q$, att, inp::text), 'capture_intent_conflict');
end $$;

\echo == round-3: unknown keys (input + stored) fail closed ==
do $$
declare base jsonb := (select tel from v); up jsonb := (select up from v); stored jsonb;
begin
  -- unknown TOP-LEVEL key rejected by the input validator
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||'{"evil":1}')::text), 'capture_intent_unknown_key');
  -- unknown SEGMENT key rejected
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb)$q$, (base||'{"acceptedSegments":[{"sceneNumber":1,"startMs":0,"endMs":2000,"intendedDialogueSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","evil":1}]}')::text), 'capture_intent_unknown_segment_key');
  -- unknown key rejected THROUGH the create RPC (fail-closed before any write)
  perform pg_temp.expect_code(format($q$select public.editor_create_source_asset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',%L::jsonb,'takes','video/webm',1048576)$q$, (up||'{"evil":1}')::text), 'capture_intent_unknown_key');
  -- STORED form: server keys allowed, but any OTHER unknown key still rejected
  stored := public.editor_build_stored_intent(up, gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', '2026-07-23T11:00:00.000Z');
  perform public.editor_validate_capture_input(stored, null, null, true); -- baseline passes (sourceAssetId/recordedAt allowed)
  perform pg_temp.expect_code(format($q$select public.editor_validate_capture_input(%L::jsonb, null, null, true)$q$, (stored||'{"evil":1}')::text), 'capture_intent_unknown_key');
end $$;

\echo == round-3: marker v2 rejected + exact-path binding (not a suffix match) ==
do $$
declare marker_att uuid := 'b1b1b1b1-0000-0000-0000-000000000001';
  marker_aid uuid := 'b3b3b3b3-0000-0000-0000-000000000003';
  path_att uuid := 'b2b2b2b2-0000-0000-0000-000000000002';
  path_aid uuid := 'bbbb0000-0000-0000-0000-000000000002';
  up jsonb := (select up from v);
begin
  truncate public.source_capture_intents, public.media_assets cascade;
  -- MARKER v2: an unsupported capture_contract_version fails closed. The live
  -- CHECK forbids inserting one, so drop it, seed a marker=2 row, prove the RPC
  -- rejects it, clean up, and RESTORE the CHECK (the invariant still holds). The
  -- seeded row has an OTHERWISE-VALID descriptor (correct derived path/mime/size)
  -- so the MARKER guard is the sole thing that can reject — this lets the negative
  -- control (mutation of just the marker guard) isolate it.
  alter table public.media_assets drop constraint media_assets_capture_contract_version_check;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (marker_aid,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',marker_att,'source','takes','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/11111111-1111-1111-1111-111111111111/'||marker_aid::text||'.webm','video/webm',1048576,'uploading',2);
  perform pg_temp.expect_code(format($q$select public.editor_create_source_asset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','%s',%L::jsonb,'takes','video/webm',1048576)$q$,
    marker_att, (up||jsonb_build_object('clientAttemptId', marker_att::text))::text), 'source_attempt_conflict');
  delete from public.media_assets where recording_attempt_id = marker_att;
  alter table public.media_assets add constraint media_assets_capture_contract_version_check check (capture_contract_version is null or capture_contract_version = 1);

  -- EXACT-PATH BINDING: an in-flight marker=1 row whose storage_path has the
  -- correct `.webm` SUFFIX but a WRONG body (id) is NOT reused — a naive suffix
  -- match would wrongly accept it; the RPC compares the FULL derived path.
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (path_aid,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',path_att,'source','takes','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/11111111-1111-1111-1111-111111111111/DIFFERENT.webm','video/webm',1048576,'uploading',1);
  perform pg_temp.expect_code(format($q$select public.editor_create_source_asset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','%s',%L::jsonb,'takes','video/webm',1048576)$q$,
    path_att, (up||jsonb_build_object('clientAttemptId', path_att::text))::text), 'source_attempt_conflict');
end $$;

\echo == round-3: source-bound recording-script snapshot (verify + persist) ==
do $$
declare
  own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  g uuid := 'c0c0c0c0-0000-0000-0000-0000000000c0';
  att uuid := 'c1c1c1c1-0000-0000-0000-000000000001';
  tl jsonb := '{"hook":"Hey there","scenes":[{"scene_number":1,"scene_type":"talking_head","dialogue":"Hello world","show_in_teleprompter":true},{"scene_number":2,"scene_type":"b_roll","dialogue":null,"show_in_teleprompter":false}]}'::jsonb;
  ssha text; dsha text; r record; persisted text; inp jsonb;
begin
  truncate public.source_capture_intents, public.media_assets cascade;
  -- selected_hook differs from the timeline hook on purpose: the snapshot prefers
  -- the timeline hook, so the persisted sha must bind to "Hey there", not the column.
  insert into public.generations(id, user_id, selected_hook, scene_timeline) values (g, own, 'column hook', tl);
  ssha := public.editor_recording_script_sha256(g, tl, 'column hook');
  dsha := encode(digest(convert_to(normalize('Hello world', NFC), 'UTF8'), 'sha256'), 'hex');

  -- CORRECT teleprompter input: asserted script sha + dialogue sha match the script.
  inp := jsonb_build_object('schemaVersion',1,'origin','teleprompter','generationId',g::text,
    'recordingScriptSha256',ssha,'clientAttemptId',att::text,'recorderClock','mediarecorder-active-time-ms',
    'acceptedSegments', jsonb_build_array(jsonb_build_object('sceneNumber',1,'startMs',0,'endMs',2000,'intendedDialogueSha256',dsha)));
  select * into r from public.editor_create_source_asset(own,g,att,inp,'takes','video/webm',1048576);
  perform pg_temp.expect_true(r.created, 'script: teleprompter create ok');
  -- snapshot persisted, source-bound, sha == the server-recomputed canonical.
  select snapshot_sha into persisted from public.source_script_snapshots where source_asset_id = r.asset_id;
  perform pg_temp.expect_true(persisted = ssha, 'script: persisted snapshot sha == canonical');
  perform pg_temp.expect_true((select snapshot->>'hook' from public.source_script_snapshots where source_asset_id=r.asset_id) = 'Hey there', 'script: snapshot hook from timeline');
  -- idempotent retry re-uses the same asset + snapshot (no second snapshot row).
  select * into r from public.editor_create_source_asset(own,g,att,inp,'takes','video/webm',1048576);
  perform pg_temp.expect_true(not r.created, 'script: idempotent retry');
  perform pg_temp.expect_true((select count(*) from public.source_script_snapshots)=1, 'script: one snapshot');

  -- WRONG script sha → capture_script_sha_mismatch (fresh attempt, no orphan).
  perform pg_temp.expect_code(format($q$select public.editor_create_source_asset('%s','%s','c2c2c2c2-0000-0000-0000-000000000002',%L::jsonb,'takes','video/webm',1048576)$q$,
    own, g, jsonb_build_object('schemaVersion',1,'origin','teleprompter','generationId',g::text,'recordingScriptSha256',repeat('a',64),'clientAttemptId','c2c2c2c2-0000-0000-0000-000000000002','recorderClock','mediarecorder-active-time-ms','acceptedSegments',jsonb_build_array(jsonb_build_object('sceneNumber',1,'startMs',0,'endMs',2000,'intendedDialogueSha256',dsha)))::text),
    'capture_script_sha_mismatch');
  -- WRONG dialogue sha (script sha correct) → capture_dialogue_sha_mismatch.
  perform pg_temp.expect_code(format($q$select public.editor_create_source_asset('%s','%s','c3c3c3c3-0000-0000-0000-000000000003',%L::jsonb,'takes','video/webm',1048576)$q$,
    own, g, jsonb_build_object('schemaVersion',1,'origin','teleprompter','generationId',g::text,'recordingScriptSha256',ssha,'clientAttemptId','c3c3c3c3-0000-0000-0000-000000000003','recorderClock','mediarecorder-active-time-ms','acceptedSegments',jsonb_build_array(jsonb_build_object('sceneNumber',1,'startMs',0,'endMs',2000,'intendedDialogueSha256',repeat('b',64))))::text),
    'capture_dialogue_sha_mismatch');
  -- segment for a scene NOT in the teleprompter script → fail closed.
  perform pg_temp.expect_code(format($q$select public.editor_create_source_asset('%s','%s','c4c4c4c4-0000-0000-0000-000000000004',%L::jsonb,'takes','video/webm',1048576)$q$,
    own, g, jsonb_build_object('schemaVersion',1,'origin','teleprompter','generationId',g::text,'recordingScriptSha256',ssha,'clientAttemptId','c4c4c4c4-0000-0000-0000-000000000004','recorderClock','mediarecorder-active-time-ms','acceptedSegments',jsonb_build_array(jsonb_build_object('sceneNumber',9,'startMs',0,'endMs',2000,'intendedDialogueSha256',dsha)))::text),
    'capture_segment_not_teleprompter');
  -- the three rejected attempts left NO orphan (only the one good asset remains).
  perform pg_temp.expect_true((select count(*) from public.media_assets where generation_id=g)=1, 'script: rejects left no orphan');
  perform pg_temp.expect_true((select count(*) from public.source_script_snapshots)=1, 'script: rejects persisted no snapshot');
end $$;

\echo == round-4: script-binding hostile matrix (teleprompter policy + upload no-row) ==
do $$
declare
  own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  g uuid := 'd0d0d0d0-0000-0000-0000-0000000000d0';
  -- two teleprompter scenes (1,3) + a hidden scene 2. noncontiguous, ordered.
  tl jsonb := '{"hook":"H","scenes":[{"scene_number":1,"scene_type":"talking_head","dialogue":"one","show_in_teleprompter":true},{"scene_number":2,"scene_type":"b_roll","dialogue":null,"show_in_teleprompter":false},{"scene_number":3,"scene_type":"talking_head","dialogue":"three","show_in_teleprompter":true}]}'::jsonb;
  ssha text; d1 text; d3 text; r record; att uuid;
begin
  truncate public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id, user_id, selected_hook, scene_timeline) values (g, own, 'h', tl);
  ssha := public.editor_recording_script_sha256(g, tl, 'h');
  d1 := encode(digest(convert_to(normalize('one', NFC),'UTF8'),'sha256'),'hex');
  d3 := encode(digest(convert_to(normalize('three', NFC),'UTF8'),'sha256'),'hex');

  -- VALID ordered subset [1,3] (gap over hidden scene 2 is fine).
  att := 'd1d1d1d1-0000-0000-0000-000000000001';
  select * into r from public.editor_create_source_asset(own,g,att,
    jsonb_build_object('schemaVersion',1,'origin','teleprompter','generationId',g::text,'recordingScriptSha256',ssha,'clientAttemptId',att::text,'recorderClock','mediarecorder-active-time-ms',
      'acceptedSegments',jsonb_build_array(
        jsonb_build_object('sceneNumber',1,'startMs',0,'endMs',2000,'intendedDialogueSha256',d1),
        jsonb_build_object('sceneNumber',3,'startMs',2000,'endMs',4000,'intendedDialogueSha256',d3))),
    'takes','video/webm',1048576);
  perform pg_temp.expect_true(r.created, 'r4: valid ordered subset [1,3] ok');

  -- HIDDEN scene accepted (scene 2 is not teleprompter) → not_teleprompter.
  perform pg_temp.expect_code(format($q$select public.editor_create_source_asset('%s','%s','d2d2d2d2-0000-0000-0000-000000000002',%L::jsonb,'takes','video/webm',1048576)$q$,
    own, g, jsonb_build_object('schemaVersion',1,'origin','teleprompter','generationId',g::text,'recordingScriptSha256',ssha,'clientAttemptId','d2d2d2d2-0000-0000-0000-000000000002','recorderClock','mediarecorder-active-time-ms',
      'acceptedSegments',jsonb_build_array(jsonb_build_object('sceneNumber',2,'startMs',0,'endMs',2000,'intendedDialogueSha256',d1)))::text),
    'capture_segment_not_teleprompter');

  -- OUT-OF-ORDER accepted [3,1] → capture_segment_order.
  perform pg_temp.expect_code(format($q$select public.editor_create_source_asset('%s','%s','d3d3d3d3-0000-0000-0000-000000000003',%L::jsonb,'takes','video/webm',1048576)$q$,
    own, g, jsonb_build_object('schemaVersion',1,'origin','teleprompter','generationId',g::text,'recordingScriptSha256',ssha,'clientAttemptId','d3d3d3d3-0000-0000-0000-000000000003','recorderClock','mediarecorder-active-time-ms',
      'acceptedSegments',jsonb_build_array(
        jsonb_build_object('sceneNumber',3,'startMs',0,'endMs',2000,'intendedDialogueSha256',d3),
        jsonb_build_object('sceneNumber',1,'startMs',2000,'endMs',4000,'intendedDialogueSha256',d1)))::text),
    'capture_segment_order');

  -- DUPLICATE teleprompter scene numbers in the generation script → ambiguous.
  update public.generations set scene_timeline =
    '{"hook":"H","scenes":[{"scene_number":1,"scene_type":"talking_head","dialogue":"one","show_in_teleprompter":true},{"scene_number":1,"scene_type":"talking_head","dialogue":"dup","show_in_teleprompter":true}]}'::jsonb
    where id = g;
  perform pg_temp.expect_code(format($q$select public.editor_create_source_asset('%s','%s','d4d4d4d4-0000-0000-0000-000000000004',%L::jsonb,'takes','video/webm',1048576)$q$,
    own, g, jsonb_build_object('schemaVersion',1,'origin','teleprompter','generationId',g::text,'recordingScriptSha256',public.editor_recording_script_sha256(g,(select scene_timeline from public.generations where id=g),'h'),'clientAttemptId','d4d4d4d4-0000-0000-0000-000000000004','recorderClock','mediarecorder-active-time-ms',
      'acceptedSegments',jsonb_build_array(jsonb_build_object('sceneNumber',1,'startMs',0,'endMs',2000,'intendedDialogueSha256',d1)))::text),
    'capture_script_ambiguous_scene');

  -- UPLOAD create persists NO source_script_snapshots row (not recorded-against-script).
  perform pg_temp.expect_true((select count(*) from public.source_script_snapshots where generation_id=g)=1, 'r4: only the valid teleprompter row so far');
  insert into public.generations(id, user_id) values ('d5d5d5d5-0000-0000-0000-0000000000d5','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  select * into r from public.editor_create_source_asset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','d5d5d5d5-0000-0000-0000-0000000000d5','d6d6d6d6-0000-0000-0000-000000000006',
    '{"schemaVersion":1,"origin":"upload","generationId":"d5d5d5d5-0000-0000-0000-0000000000d5","recordingScriptSha256":null,"clientAttemptId":"d6d6d6d6-0000-0000-0000-000000000006","recorderClock":"none","acceptedSegments":[]}'::jsonb,'takes','video/webm',1048576);
  perform pg_temp.expect_true(r.created, 'r4: upload create ok');
  perform pg_temp.expect_true((select count(*) from public.source_script_snapshots where source_asset_id=r.asset_id)=0, 'r4: upload has NO script binding row');

  -- APPEND-ONLY: a source_script_snapshots row cannot be updated or deleted directly.
  perform pg_temp.expect_code(format($q$update public.source_script_snapshots set snapshot_sha=%L where source_asset_id=%L$q$, repeat('0',64), (select source_asset_id from public.source_script_snapshots limit 1)::text), 'capture_row_immutable');
  perform pg_temp.expect_code(format($q$delete from public.source_script_snapshots where source_asset_id=%L$q$, (select source_asset_id from public.source_script_snapshots limit 1)::text), 'capture_row_immutable');
end $$;

\echo == round-4-closure: GLOBAL scene identity (hidden+tele duplicate) ==
do $$
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'f0f0f0f0-0000-0000-0000-0000000000f0';
  tl jsonb; ssha text;
begin
  truncate public.source_capture_intents, public.media_assets cascade;
  -- hidden scene 1 + teleprompter scene 1 → a duplicate scene_number ACROSS the full
  -- array (the reproduced auditor control). Must fail capture_script_ambiguous_scene.
  tl := '{"hook":"H","scenes":[{"scene_number":1,"scene_type":"b_roll","dialogue":null,"show_in_teleprompter":false},{"scene_number":1,"scene_type":"talking_head","dialogue":"one","show_in_teleprompter":true}]}'::jsonb;
  insert into public.generations(id,user_id,selected_hook,scene_timeline) values (g,own,'h',tl);
  ssha := public.editor_recording_script_sha256(g, tl, 'h');
  perform pg_temp.expect_code(format($q$select public.editor_create_source_asset('%s','%s','f1f1f1f1-0000-0000-0000-000000000001',%L::jsonb,'takes','video/webm',1048576)$q$,
    own, g, jsonb_build_object('schemaVersion',1,'origin','teleprompter','generationId',g::text,'recordingScriptSha256',ssha,'clientAttemptId','f1f1f1f1-0000-0000-0000-000000000001','recorderClock','mediarecorder-active-time-ms',
      'acceptedSegments',jsonb_build_array(jsonb_build_object('sceneNumber',1,'startMs',0,'endMs',2000,'intendedDialogueSha256',encode(digest(convert_to(normalize('one',NFC),'UTF8'),'sha256'),'hex'))))::text),
    'capture_script_ambiguous_scene');
end $$;

\echo == round-4-closure: append-only + sanctioned parent-cascade retention ==
do $$
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'f2f2f2f2-0000-0000-0000-0000000000f2';
  att uuid := 'f3f3f3f3-0000-0000-0000-000000000003'; tl jsonb; ssha text; dsha text; r record;
begin
  truncate public.source_capture_intents, public.media_assets cascade;
  tl := '{"hook":"H","scenes":[{"scene_number":1,"scene_type":"talking_head","dialogue":"one","show_in_teleprompter":true}]}'::jsonb;
  insert into public.generations(id,user_id,selected_hook,scene_timeline) values (g,own,'h',tl);
  ssha := public.editor_recording_script_sha256(g, tl, 'h');
  dsha := encode(digest(convert_to(normalize('one',NFC),'UTF8'),'sha256'),'hex');
  select * into r from public.editor_create_source_asset(own,g,att,
    jsonb_build_object('schemaVersion',1,'origin','teleprompter','generationId',g::text,'recordingScriptSha256',ssha,'clientAttemptId',att::text,'recorderClock','mediarecorder-active-time-ms',
      'acceptedSegments',jsonb_build_array(jsonb_build_object('sceneNumber',1,'startMs',0,'endMs',2000,'intendedDialogueSha256',dsha))),
    'takes','video/webm',1048576);
  -- DIRECT update/delete on the INTENT (reproduced auditor control) → immutable.
  perform pg_temp.expect_code(format($q$delete from public.source_capture_intents where source_asset_id=%L$q$, r.asset_id::text), 'capture_row_immutable');
  perform pg_temp.expect_code(format($q$update public.source_capture_intents set origin='upload' where source_asset_id=%L$q$, r.asset_id::text), 'capture_row_immutable');
  -- SANCTIONED parent-cascade retention: deleting the media_assets parent cascades to
  -- intent + script snapshot (no direct-delete block), leaving NO orphan rows.
  perform pg_temp.expect_true((select count(*) from public.source_capture_intents where source_asset_id=r.asset_id)=1, 'retention: intent present pre-delete');
  perform pg_temp.expect_true((select count(*) from public.source_script_snapshots where source_asset_id=r.asset_id)=1, 'retention: binding present pre-delete');
  delete from public.media_assets where id = r.asset_id; -- parent delete → cascade
  perform pg_temp.expect_true((select count(*) from public.source_capture_intents where source_asset_id=r.asset_id)=0, 'retention: intent cascaded, no orphan');
  perform pg_temp.expect_true((select count(*) from public.source_script_snapshots where source_asset_id=r.asset_id)=0, 'retention: binding cascaded, no orphan');
end $$;

\echo == round-4-closure: conflict-verify script binding (no blind do-nothing) ==
do $$
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'f4f4f4f4-0000-0000-0000-0000000000f4';
  aid uuid := 'f5f5f5f5-0000-0000-0000-000000000005'; att uuid := 'f6f6f6f6-0000-0000-0000-000000000006';
  tl jsonb; ssha text; dsha text; inp jsonb;
begin
  truncate public.source_capture_intents, public.media_assets cascade;
  tl := '{"hook":"H","scenes":[{"scene_number":1,"scene_type":"talking_head","dialogue":"one","show_in_teleprompter":true}]}'::jsonb;
  insert into public.generations(id,user_id,selected_hook,scene_timeline) values (g,own,'h',tl);
  ssha := public.editor_recording_script_sha256(g, tl, 'h');
  dsha := encode(digest(convert_to(normalize('one',NFC),'UTF8'),'sha256'),'hex');
  -- Seed an IN-FLIGHT asset + a DIVERGENT pre-existing binding row (same sha, tampered
  -- JSON). The create's no-intent recovery path must conflict-verify and fail closed.
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (aid,own,g,att,'source','takes',own::text||'/'||g::text||'/'||aid::text||'.webm','video/webm',1048576,'uploading',1);
  insert into public.source_script_snapshots(source_asset_id,owner_id,generation_id,snapshot,snapshot_sha)
    values (aid,own,g, (public.editor_recording_script_canonical(g,tl,'h')::jsonb) || '{"junk":1}'::jsonb, ssha);
  inp := jsonb_build_object('schemaVersion',1,'origin','teleprompter','generationId',g::text,'recordingScriptSha256',ssha,'clientAttemptId',att::text,'recorderClock','mediarecorder-active-time-ms',
    'acceptedSegments',jsonb_build_array(jsonb_build_object('sceneNumber',1,'startMs',0,'endMs',2000,'intendedDialogueSha256',dsha)));
  perform pg_temp.expect_code(format($q$select public.editor_create_source_asset('%s','%s','%s',%L::jsonb,'takes','video/webm',1048576)$q$, own, g, att, inp::text), 'script_binding_conflict');
end $$;

\echo == round-4-closure: 0090→0091 backfill classification ==
do $$
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'f7f7f7f7-0000-0000-0000-0000000000f7';
  a_tele uuid := 'f8000000-0000-0000-0000-000000000001'; a_up uuid := 'f8000000-0000-0000-0000-000000000002';
  a_legacy uuid := 'f8000000-0000-0000-0000-000000000003'; a_bad uuid := 'f8000000-0000-0000-0000-000000000004';
  att_t uuid := gen_random_uuid(); att_u uuid := gen_random_uuid(); att_b uuid := gen_random_uuid();
  script_sha text := repeat('a',64); i_tele jsonb; i_up jsonb; sha_t text; sha_u text;
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  -- Pre-0091 rows (marker NULL). Valid teleprompter (intent+manifest+matching snapshot,
  -- ready) → marker 1; valid upload (intent, uploading, no snapshot) → marker 1; true
  -- legacy (no intent) → stays NULL. Intents are built self-consistently so the new
  -- hash/relational/manifest/snapshot invariants all hold on the VALID rows.
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version) values
    (a_tele,own,g,att_t,'source','takes','x','video/webm',1024,'ready',null),
    (a_up,own,g,att_u,'source','takes','y','video/webm',1024,'uploading',null),
    (a_legacy,own,g,gen_random_uuid(),'source','takes','z','video/webm',1024,'uploading',null);
  i_tele := pg_temp.mk_intent(a_tele,g,att_t,'teleprompter',script_sha); sha_t := public.editor_capture_intent_sha256(i_tele);
  i_up := pg_temp.mk_intent(a_up,g,att_u,'upload',null);               sha_u := public.editor_capture_intent_sha256(i_up);
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at) values
    (a_tele,own,g,'teleprompter',script_sha,att_t,i_tele,sha_t,now()),
    (a_up,own,g,'upload',null,att_u,i_up,sha_u,now());
  -- Manifest agrees with the teleprompter intent (same origin + same intent hash).
  insert into public.source_capture_manifests(source_asset_id,owner_id,origin,intent_sha256,manifest,manifest_sha256,normalization_version) values
    (a_tele,own,'teleprompter',sha_t,'{}'::jsonb,repeat('a',64),'v1');
  -- Teleprompter source-bound snapshot whose SHA equals the intent's script SHA.
  insert into public.source_script_snapshots(source_asset_id,owner_id,generation_id,snapshot,snapshot_sha) values
    (a_tele,own,g,'{}'::jsonb,script_sha);
  perform public.editor_backfill_capture_marker();
  perform pg_temp.expect_true((select capture_contract_version from public.media_assets where id=a_tele)=1, 'backfill: valid teleprompter → 1');
  perform pg_temp.expect_true((select capture_contract_version from public.media_assets where id=a_up)=1, 'backfill: valid upload → 1');
  perform pg_temp.expect_true((select capture_contract_version from public.media_assets where id=a_legacy) is null, 'backfill: true legacy stays NULL');
  -- Idempotent: a second run changes nothing.
  perform public.editor_backfill_capture_marker();
  perform pg_temp.expect_true((select count(*) from public.media_assets where capture_contract_version=1)=2, 'backfill: idempotent');
  -- INCONSISTENT: a ready source with a (self-consistent) intent but NO manifest → fails
  -- migration closed. The intent is built consistently so this trips ONLY the
  -- ready-no-manifest guard (keeping the (k) mutation control isolated).
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version) values
    (a_bad,own,g,att_b,'source','takes','w','video/webm',1024,'ready',null);
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at) values
    (a_bad,own,g,'upload',null,att_b,pg_temp.mk_intent(a_bad,g,att_b,'upload',null),public.editor_capture_intent_sha256(pg_temp.mk_intent(a_bad,g,att_b,'upload',null)),now());
  perform pg_temp.expect_code($q$select public.editor_backfill_capture_marker()$q$, 'capture_backfill_inconsistent');
end $$;

\echo == round-4-closure: backfill rejects EVERY inconsistency class ==
-- Each block sets up exactly ONE inconsistency (all other classes clean) so the
-- classifier is proven to reject that specific class, not just fail generically.
do $$  -- (1) manifest WITHOUT an intent
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'f9000000-0000-0000-0000-0000000000f9';
  a uuid := 'f9000000-0000-0000-0000-000000000011';
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,gen_random_uuid(),'source','takes','x','video/webm',1024,'uploading',null);
  insert into public.source_capture_manifests(source_asset_id,owner_id,origin,intent_sha256,manifest,manifest_sha256,normalization_version)
    values (a,own,'teleprompter',repeat('a',64),'{}'::jsonb,repeat('a',64),'v1');
  perform pg_temp.expect_code($q$select public.editor_backfill_capture_marker()$q$, 'capture_backfill_inconsistent');
end $$;
do $$  -- (2) script binding WITHOUT an intent
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'f9000000-0000-0000-0000-0000000000f9';
  a uuid := 'f9000000-0000-0000-0000-000000000012';
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,gen_random_uuid(),'source','takes','x','video/webm',1024,'uploading',null);
  insert into public.source_script_snapshots(source_asset_id,owner_id,generation_id,snapshot,snapshot_sha)
    values (a,own,g,'{}'::jsonb,repeat('a',64));
  perform pg_temp.expect_code($q$select public.editor_backfill_capture_marker()$q$, 'capture_backfill_inconsistent');
end $$;
do $$  -- (3) intent attached to a NON-source asset
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'f9000000-0000-0000-0000-0000000000f9';
  a uuid := 'f9000000-0000-0000-0000-000000000013'; att uuid := gen_random_uuid(); j jsonb;
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,null,'music','takes','x','audio/mpeg',1024,'uploading',null);
  j := pg_temp.mk_intent(a,g,att,'upload',null);
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at)
    values (a,own,g,'upload',null,att,j,public.editor_capture_intent_sha256(j),now());
  perform pg_temp.expect_code($q$select public.editor_backfill_capture_marker()$q$, 'capture_backfill_inconsistent');
end $$;
do $$  -- (4) intent owner/generation linkage mismatch (owner column ≠ asset owner)
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'f9000000-0000-0000-0000-0000000000f9';
  a uuid := 'f9000000-0000-0000-0000-000000000014'; att uuid := gen_random_uuid(); j jsonb;
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,gen_random_uuid(),'source','takes','x','video/webm',1024,'uploading',null);
  -- owner_id is NOT part of the stored intent JSON, so the JSON stays self-consistent
  -- while the relational owner_id column diverges from the asset owner.
  j := pg_temp.mk_intent(a,g,att,'upload',null);
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at)
    values (a,'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',g,'upload',null,att,j,public.editor_capture_intent_sha256(j),now());
  perform pg_temp.expect_code($q$select public.editor_backfill_capture_marker()$q$, 'capture_backfill_inconsistent');
end $$;
do $$  -- (5) manifest owner linkage mismatch (upload path: no snapshot required)
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'f9000000-0000-0000-0000-0000000000f9';
  a uuid := 'f9000000-0000-0000-0000-000000000015'; att uuid := gen_random_uuid(); j jsonb; s text;
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,gen_random_uuid(),'source','takes','x','video/webm',1024,'uploading',null);
  j := pg_temp.mk_intent(a,g,att,'upload',null); s := public.editor_capture_intent_sha256(j);
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at)
    values (a,own,g,'upload',null,att,j,s,now());
  -- Manifest agrees with the intent on origin AND hash; only its owner_id diverges.
  insert into public.source_capture_manifests(source_asset_id,owner_id,origin,intent_sha256,manifest,manifest_sha256,normalization_version)
    values (a,'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','upload',s,'{}'::jsonb,repeat('a',64),'v1');
  perform pg_temp.expect_code($q$select public.editor_backfill_capture_marker()$q$, 'capture_backfill_inconsistent');
end $$;
do $$  -- (6) binding owner/generation linkage mismatch (snapshot SHA matches; generation diverges)
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'f9000000-0000-0000-0000-0000000000f9';
  a uuid := 'f9000000-0000-0000-0000-000000000016'; att uuid := gen_random_uuid(); j jsonb; sc text := repeat('a',64);
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,gen_random_uuid(),'source','takes','x','video/webm',1024,'uploading',null);
  j := pg_temp.mk_intent(a,g,att,'teleprompter',sc);
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at)
    values (a,own,g,'teleprompter',sc,att,j,public.editor_capture_intent_sha256(j),now());
  -- snapshot SHA matches the intent script SHA (so the teleprompter-snapshot guard is
  -- satisfied); only its generation_id diverges → isolates the binding-linkage guard.
  insert into public.source_script_snapshots(source_asset_id,owner_id,generation_id,snapshot,snapshot_sha)
    values (a,own,'f9000000-0000-0000-0000-0000000000ff','{}'::jsonb,sc);
  perform pg_temp.expect_code($q$select public.editor_backfill_capture_marker()$q$, 'capture_backfill_inconsistent');
end $$;

\echo == backup-7: backfill rejects intent/manifest/snapshot provenance corruption ==
-- Each block builds a fully SELF-CONSISTENT source+intent and perturbs exactly ONE new
-- invariant, so it must trip precisely that guard (all other classes clean).
do $$  -- (7) manifest ORIGIN differs from its intent
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'fa000000-0000-0000-0000-0000000000fa';
  a uuid := 'fa000000-0000-0000-0000-000000000071'; att uuid := gen_random_uuid(); j jsonb; s text;
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,att,'source','takes','x','video/webm',1024,'uploading',null);
  j := pg_temp.mk_intent(a,g,att,'upload',null); s := public.editor_capture_intent_sha256(j);
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at)
    values (a,own,g,'upload',null,att,j,s,now());
  insert into public.source_capture_manifests(source_asset_id,owner_id,origin,intent_sha256,manifest,manifest_sha256,normalization_version)
    values (a,own,'teleprompter',s,'{}'::jsonb,repeat('a',64),'v1');  -- origin ≠ intent 'upload'
  perform pg_temp.expect_code($q$select public.editor_backfill_capture_marker()$q$, 'capture_backfill_inconsistent');
end $$;
do $$  -- (8) manifest INTENT HASH differs from its intent
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'fa000000-0000-0000-0000-0000000000fa';
  a uuid := 'fa000000-0000-0000-0000-000000000082'; att uuid := gen_random_uuid(); j jsonb; s text;
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,att,'source','takes','x','video/webm',1024,'uploading',null);
  j := pg_temp.mk_intent(a,g,att,'upload',null); s := public.editor_capture_intent_sha256(j);
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at)
    values (a,own,g,'upload',null,att,j,s,now());
  insert into public.source_capture_manifests(source_asset_id,owner_id,origin,intent_sha256,manifest,manifest_sha256,normalization_version)
    values (a,own,'upload',repeat('0',64),'{}'::jsonb,repeat('a',64),'v1');  -- intent_sha256 ≠ intent's
  perform pg_temp.expect_code($q$select public.editor_backfill_capture_marker()$q$, 'capture_backfill_inconsistent');
end $$;
do $$  -- (9) teleprompter intent WITHOUT a matching script snapshot (none present)
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'fa000000-0000-0000-0000-0000000000fa';
  a uuid := 'fa000000-0000-0000-0000-000000000093'; att uuid := gen_random_uuid(); j jsonb; s text; sc text := repeat('a',64);
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,att,'source','takes','x','video/webm',1024,'uploading',null);
  j := pg_temp.mk_intent(a,g,att,'teleprompter',sc); s := public.editor_capture_intent_sha256(j);
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at)
    values (a,own,g,'teleprompter',sc,att,j,s,now());  -- NO source_script_snapshots row
  perform pg_temp.expect_code($q$select public.editor_backfill_capture_marker()$q$, 'capture_backfill_inconsistent');
end $$;
do $$  -- (9b) teleprompter intent WITH a snapshot whose SHA differs from recording_script_sha256
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'fa000000-0000-0000-0000-0000000000fa';
  a uuid := 'fa000000-0000-0000-0000-00000000009b'; att uuid := gen_random_uuid(); j jsonb; s text; sc text := repeat('a',64);
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,att,'source','takes','x','video/webm',1024,'uploading',null);
  j := pg_temp.mk_intent(a,g,att,'teleprompter',sc); s := public.editor_capture_intent_sha256(j);
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at)
    values (a,own,g,'teleprompter',sc,att,j,s,now());
  insert into public.source_script_snapshots(source_asset_id,owner_id,generation_id,snapshot,snapshot_sha)
    values (a,own,g,'{}'::jsonb,repeat('9',64));  -- snapshot SHA ≠ recording_script_sha256
  perform pg_temp.expect_code($q$select public.editor_backfill_capture_marker()$q$, 'capture_backfill_inconsistent');
end $$;
do $$  -- (10) UPLOAD intent carrying a script snapshot
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'fa000000-0000-0000-0000-0000000000fa';
  a uuid := 'fa000000-0000-0000-0000-000000000104'; att uuid := gen_random_uuid(); j jsonb; s text;
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,att,'source','takes','x','video/webm',1024,'uploading',null);
  j := pg_temp.mk_intent(a,g,att,'upload',null); s := public.editor_capture_intent_sha256(j);
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at)
    values (a,own,g,'upload',null,att,j,s,now());
  insert into public.source_script_snapshots(source_asset_id,owner_id,generation_id,snapshot,snapshot_sha)
    values (a,own,g,'{}'::jsonb,repeat('a',64));  -- upload must have NO snapshot
  perform pg_temp.expect_code($q$select public.editor_backfill_capture_marker()$q$, 'capture_backfill_inconsistent');
end $$;
do $$  -- (11) stored intent HASH does not recompute
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'fa000000-0000-0000-0000-0000000000fa';
  a uuid := 'fa000000-0000-0000-0000-000000000115'; att uuid := gen_random_uuid(); j jsonb;
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,att,'source','takes','x','video/webm',1024,'uploading',null);
  j := pg_temp.mk_intent(a,g,att,'upload',null);  -- correct JSON, but stored with a WRONG sha
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at)
    values (a,own,g,'upload',null,att,j,repeat('0',64),now());
  perform pg_temp.expect_code($q$select public.editor_backfill_capture_marker()$q$, 'capture_backfill_inconsistent');
end $$;
do $$  -- (12) stored intent JSON disagrees with relational columns (JSON sourceAssetId ≠ column)
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'fa000000-0000-0000-0000-0000000000fa';
  a uuid := 'fa000000-0000-0000-0000-000000000126'; att uuid := gen_random_uuid(); j jsonb; s text;
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,att,'source','takes','x','video/webm',1024,'uploading',null);
  -- JSON built against a DIFFERENT asset id; hash recomputes (so the hash check passes)
  -- but the relational sourceAssetId disagrees → relational guard must fire.
  j := pg_temp.mk_intent(a,g,att,'upload',null,'fa000000-0000-0000-0000-0000000000ee'); s := public.editor_capture_intent_sha256(j);
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at)
    values (a,own,g,'upload',null,att,j,s,now());
  perform pg_temp.expect_code($q$select public.editor_backfill_capture_marker()$q$, 'capture_backfill_inconsistent');
end $$;

\echo == backup-8: D2 manifest writer (editor_write_capture_manifest) hostile matrix ==
do $$  -- A/B/C: validating write, idempotent recovery, divergent conflict
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'fb000000-0000-0000-0000-0000000000fb';
  a uuid := 'fb000000-0000-0000-0000-000000000001'; ish text := repeat('a',64); msha text := repeat('c',64); mid uuid; mid2 uuid;
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,gen_random_uuid(),'source','takes','x','video/webm',1024,'validating',1);
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at)
    values (a,own,g,'upload',null,gen_random_uuid(),'{}'::jsonb,ish,now());
  mid := public.editor_write_capture_manifest(a,'upload',ish,'{"n":1}'::jsonb,msha,'v1');
  perform pg_temp.expect_true(mid is not null, 'manifest A: write returns id');
  perform pg_temp.expect_true((select count(*) from public.source_capture_manifests where source_asset_id=a)=1, 'manifest A: exactly one row');
  mid2 := public.editor_write_capture_manifest(a,'upload',ish,'{"n":1}'::jsonb,msha,'v1');
  perform pg_temp.expect_true(mid2 = mid, 'manifest B: idempotent identical → same id');
  perform pg_temp.expect_true((select count(*) from public.source_capture_manifests where source_asset_id=a)=1, 'manifest B: still one row');
  perform pg_temp.expect_code(format($q$select public.editor_write_capture_manifest('%s','upload','%s','{"n":2}'::jsonb,'%s','v1')$q$, a, ish, msha), 'capture_manifest_conflict');
end $$;
do $$  -- D: no capture intent → fails closed
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'fb000000-0000-0000-0000-0000000000fb'; a uuid := 'fb000000-0000-0000-0000-000000000002';
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,gen_random_uuid(),'source','takes','x','video/webm',1024,'validating',1);
  perform pg_temp.expect_code(format($q$select public.editor_write_capture_manifest('%s','upload','%s','{}'::jsonb,'%s','v1')$q$, a, repeat('a',64), repeat('c',64)), 'capture_manifest_no_intent');
end $$;
do $$  -- E/F: origin mismatch, then intent-hash mismatch
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'fb000000-0000-0000-0000-0000000000fb'; a uuid := 'fb000000-0000-0000-0000-000000000003'; ish text := repeat('a',64);
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,gen_random_uuid(),'source','takes','x','video/webm',1024,'validating',1);
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at)
    values (a,own,g,'upload',null,gen_random_uuid(),'{}'::jsonb,ish,now());
  perform pg_temp.expect_code(format($q$select public.editor_write_capture_manifest('%s','teleprompter','%s','{}'::jsonb,'%s','v1')$q$, a, ish, repeat('c',64)), 'capture_manifest_origin_mismatch');
  perform pg_temp.expect_code(format($q$select public.editor_write_capture_manifest('%s','upload','%s','{}'::jsonb,'%s','v1')$q$, a, repeat('0',64), repeat('c',64)), 'capture_manifest_intent_mismatch');
end $$;
do $$  -- G: intent owner ≠ asset owner → owner mismatch
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'fb000000-0000-0000-0000-0000000000fb'; a uuid := 'fb000000-0000-0000-0000-000000000004'; ish text := repeat('a',64);
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,gen_random_uuid(),'source','takes','x','video/webm',1024,'validating',1);
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at)
    values (a,'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',g,'upload',null,gen_random_uuid(),'{}'::jsonb,ish,now());
  perform pg_temp.expect_code(format($q$select public.editor_write_capture_manifest('%s','upload','%s','{}'::jsonb,'%s','v1')$q$, a, ish, repeat('c',64)), 'capture_manifest_owner_mismatch');
end $$;
do $$  -- H/I: SETTLED asset → lost-race null; settled + divergent existing → conflict
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'fb000000-0000-0000-0000-0000000000fb';
  a uuid := 'fb000000-0000-0000-0000-000000000005'; b uuid := 'fb000000-0000-0000-0000-000000000006'; ish text := repeat('a',64); msha text := repeat('c',64); r uuid;
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  -- H: settled (ready) with NO manifest → lost race → null (INSERT bypasses ready guard).
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,gen_random_uuid(),'source','takes','x','video/webm',1024,'ready',1);
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at)
    values (a,own,g,'upload',null,gen_random_uuid(),'{}'::jsonb,ish,now());
  r := public.editor_write_capture_manifest(a,'upload',ish,'{"n":1}'::jsonb,msha,'v1');
  perform pg_temp.expect_true(r is null, 'manifest H: settled + no manifest → null (lost race)');
  -- I: settled (ready) with a DIVERGENT existing manifest → conflict.
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (b,own,g,gen_random_uuid(),'source','takes','y','video/webm',1024,'ready',1);
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at)
    values (b,own,g,'upload',null,gen_random_uuid(),'{}'::jsonb,ish,now());
  insert into public.source_capture_manifests(source_asset_id,owner_id,origin,intent_sha256,manifest,manifest_sha256,normalization_version)
    values (b,own,'upload',ish,'{"n":1}'::jsonb,msha,'v1');
  perform pg_temp.expect_code(format($q$select public.editor_write_capture_manifest('%s','upload','%s','{"n":9}'::jsonb,'%s','v1')$q$, b, ish, msha), 'capture_manifest_conflict');
end $$;
do $$  -- J: unknown asset → asset missing
begin
  perform pg_temp.expect_code(format($q$select public.editor_write_capture_manifest('%s','upload','%s','{}'::jsonb,'%s','v1')$q$, gen_random_uuid(), repeat('a',64), repeat('c',64)), 'capture_manifest_asset_missing');
end $$;

\echo == backup-8: D2 ready-flip guard (marker-1 needs manifest; legacy exempt) ==
do $$  -- K: marker-1 + manifest → validating→ready succeeds
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'fc000000-0000-0000-0000-0000000000fc'; a uuid := 'fc000000-0000-0000-0000-000000000001'; ish text := repeat('a',64);
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,gen_random_uuid(),'source','takes','x','video/webm',1024,'validating',1);
  insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256,recorded_at)
    values (a,own,g,'upload',null,gen_random_uuid(),'{}'::jsonb,ish,now());
  insert into public.source_capture_manifests(source_asset_id,owner_id,origin,intent_sha256,manifest,manifest_sha256,normalization_version)
    values (a,own,'upload',ish,'{}'::jsonb,repeat('c',64),'v1');
  update public.media_assets set status='ready' where id=a;
  perform pg_temp.expect_true((select status from public.media_assets where id=a)='ready', 'ready-guard K: marker-1 + manifest → ready');
end $$;
do $$  -- L: marker-1 + NO manifest → ready flip fails closed
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'fc000000-0000-0000-0000-0000000000fc'; a uuid := 'fc000000-0000-0000-0000-000000000002';
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,gen_random_uuid(),'source','takes','x','video/webm',1024,'validating',1);
  perform pg_temp.expect_code(format($q$update public.media_assets set status='ready' where id='%s'$q$, a), 'capture_manifest_required');
end $$;
do $$  -- M: LEGACY (marker null) + no manifest → ready flip allowed (guard is new-era only)
declare own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; g uuid := 'fc000000-0000-0000-0000-0000000000fc'; a uuid := 'fc000000-0000-0000-0000-000000000003';
begin
  truncate public.source_script_snapshots, public.source_capture_manifests, public.source_capture_intents, public.media_assets cascade;
  insert into public.generations(id,user_id) values (g,own) on conflict do nothing;
  insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
    values (a,own,g,gen_random_uuid(),'source','takes','x','video/webm',1024,'validating',null);
  update public.media_assets set status='ready' where id=a;
  perform pg_temp.expect_true((select status from public.media_assets where id=a)='ready', 'ready-guard M: legacy → ready without manifest');
end $$;

\echo == round-4: oversize recording script fails closed (byte cap) ==
do $$
declare
  own uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  gb uuid := 'e0e0e0e0-0000-0000-0000-0000000000e0';
  big jsonb;
begin
  -- ~700 scenes × 200-char dialogue → canonical well over the 65536-byte cap.
  big := jsonb_build_object('hook','H','scenes',
    (select jsonb_agg(jsonb_build_object('scene_number',gs,'scene_type','talking_head','dialogue',repeat('x',200),'show_in_teleprompter',true))
     from generate_series(1,700) gs));
  insert into public.generations(id, user_id, selected_hook, scene_timeline) values (gb, own, 'h', big);
  -- The create reaches editor_persist_script_binding, whose FIRST guard is the byte cap
  -- → script_snapshot_too_large (before any sha/dialogue check). A dummy 64-hex sha
  -- passes input validation; the size guard fires first.
  perform pg_temp.expect_code(format($q$select public.editor_create_source_asset('%s','%s','e1e1e1e1-0000-0000-0000-000000000001',%L::jsonb,'takes','video/webm',1048576)$q$,
    own, gb, jsonb_build_object('schemaVersion',1,'origin','teleprompter','generationId',gb::text,'recordingScriptSha256',repeat('a',64),'clientAttemptId','e1e1e1e1-0000-0000-0000-000000000001','recorderClock','mediarecorder-active-time-ms',
      'acceptedSegments',jsonb_build_array(jsonb_build_object('sceneNumber',1,'startMs',0,'endMs',2000,'intendedDialogueSha256',repeat('b',64))))::text),
    'script_snapshot_too_large');
  perform pg_temp.expect_true((select count(*) from public.media_assets where generation_id=gb)=0, 'oversize: no orphan');
end $$;

\echo == round-4: script-binding grant posture (anon/authenticated cannot write) ==
do $$
begin
  perform pg_temp.expect_true(not has_table_privilege('anon','public.source_script_snapshots','INSERT'), 'anon no insert');
  perform pg_temp.expect_true(not has_table_privilege('anon','public.source_script_snapshots','UPDATE'), 'anon no update');
  perform pg_temp.expect_true(not has_table_privilege('anon','public.source_script_snapshots','DELETE'), 'anon no delete');
  perform pg_temp.expect_true(not has_table_privilege('authenticated','public.source_script_snapshots','INSERT'), 'authenticated no insert');
  perform pg_temp.expect_true(not has_table_privilege('authenticated','public.source_script_snapshots','UPDATE'), 'authenticated no update');
  perform pg_temp.expect_true(not has_table_privilege('authenticated','public.source_script_snapshots','DELETE'), 'authenticated no delete');
end $$;

\echo == grant posture (service_role only; anon/authenticated denied) ==
do $$
declare fns text[] := array[
  'public.editor_capture_segments_canonical(jsonb)',
  'public.editor_capture_intent_input_canonical(jsonb)',
  'public.editor_capture_intent_canonical(jsonb)',
  'public.editor_capture_intent_sha256(jsonb)',
  'public.editor_validate_capture_input(jsonb, uuid, uuid, boolean)',
  'public.editor_build_stored_intent(jsonb, uuid, uuid, uuid, text)',
  'public.editor_snapshot_normalize(text)',
  'public.editor_recording_script_canonical(uuid, jsonb, text)',
  'public.editor_recording_script_sha256(uuid, jsonb, text)',
  'public.editor_verify_capture_dialogue_shas(jsonb, jsonb)',
  'public.editor_persist_script_binding(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb)',
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

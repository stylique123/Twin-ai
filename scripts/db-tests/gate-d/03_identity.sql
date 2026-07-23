-- Item 1/2/6: REAL identity matrix for ALL THREE capture tables (intents, manifests,
-- script snapshots) under SET ROLE (owner / peer / outsider / anon / service_role),
-- proving RLS reads + write denial + the trusted-server write path. Run as its own psql
-- session (separate from the mutation-controlled 02_assertions). Any PostgreSQL WARNING
-- or IDENTITY_FAIL fails the gate (enforced by run.sh, which captures stdout+stderr).
\set ON_ERROR_STOP on
\pset pager off

truncate public.source_capture_intents, public.source_capture_manifests,
         public.source_script_snapshots, public.media_assets, public.generations cascade;

-- Owner A's fully-provisioned source: one row in every capture table.
insert into public.generations(id, user_id)
  values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
  values ('a1a1a1a1-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',gen_random_uuid(),'source','takes','x','video/webm',1024,'uploading',1);
insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256)
  values ('a1a1a1a1-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','teleprompter',repeat('a',64),gen_random_uuid(),'{}'::jsonb, repeat('a',64));
insert into public.source_capture_manifests(source_asset_id,owner_id,origin,intent_sha256,manifest,manifest_sha256,normalization_version)
  values ('a1a1a1a1-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','teleprompter',repeat('a',64),'{}'::jsonb, repeat('a',64),'v1');
insert into public.source_script_snapshots(source_asset_id,owner_id,generation_id,snapshot,snapshot_sha)
  values ('a1a1a1a1-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','{}'::jsonb, repeat('a',64));

-- Owner B's PARENT rows (generation + media asset) seeded here as the superuser; the
-- three capture rows are written LATER by service_role itself (the trusted-server write
-- path under test). The parent tables are outside the capture-table posture under test,
-- so they are pre-seeded rather than granted to service_role.
insert into public.generations(id, user_id)
  values ('22222222-2222-2222-2222-222222222222','dddddddd-dddd-dddd-dddd-dddddddddddd');
insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
  values ('a2a2a2a2-2222-2222-2222-222222222222','dddddddd-dddd-dddd-dddd-dddddddddddd','22222222-2222-2222-2222-222222222222',gen_random_uuid(),'source','takes','y','video/webm',1024,'uploading',1);

-- Count rows of ANY capture table VISIBLE to an identity (role + auth.uid() + peer).
create or replace function pg_temp.visible(p_table text, p_role text, p_sub text, p_peer text) returns int language plpgsql as $$
declare c int;
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub,''), true);
  perform set_config('test.workspace_peer', coalesce(p_peer,''), true);
  execute format('select count(*) from public.%I', p_table) into c;
  reset role;
  return c;
end $$;
-- True iff running `sql` as `p_role` (owner identity) is DENIED (any error). SET LOCAL
-- ROLE inside a plpgsql function is transaction-scoped and takes real effect (unlike a
-- bare top-level SET LOCAL, which PostgreSQL ignores with a WARNING).
create or replace function pg_temp.denied(p_role text, sql text) returns boolean language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  begin execute sql; exception when others then reset role; return true; end;
  reset role; return false;
end $$;
create or replace function pg_temp.ok(p boolean, label text) returns void language plpgsql as $$
begin if p is distinct from true then raise exception 'IDENTITY_FAIL: %', label; end if; end $$;

-- TRUSTED-SERVER WRITE PATH (service_role). Runs INSIDE a plpgsql function, so the
-- role switch is a genuine transaction-scoped SET LOCAL ROLE — not the broken bare
-- top-level form. We PROVE the switch took effect (current_role) AND that the writer
-- is NOT a superuser (is_superuser='off'), so no superuser can masquerade as
-- service_role; only then is the write executed. Returns the row count it wrote.
create or replace function pg_temp.service_write(sql text) returns void language plpgsql as $$
begin
  set local role service_role;
  if current_role <> 'service_role' then
    raise exception 'IDENTITY_FAIL: service_role SET LOCAL ROLE did not take effect (current_role=%)', current_role;
  end if;
  if current_setting('is_superuser') <> 'off' then
    raise exception 'IDENTITY_FAIL: service_role write path is running as a superuser (masquerade)';
  end if;
  execute sql;
  reset role;
end $$;

do $$
begin
  -- READS across ALL THREE tables: owner sees its row; an outsider sees none; a
  -- workspace peer sees it; service_role (bypassrls, trusted server) always sees it.
  perform pg_temp.ok(pg_temp.visible('source_capture_intents','authenticated','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null) = 1, 'owner reads intents');
  perform pg_temp.ok(pg_temp.visible('source_capture_intents','authenticated','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null) = 0, 'outsider sees no intents');
  perform pg_temp.ok(pg_temp.visible('source_capture_intents','authenticated','cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 1, 'peer reads intents');
  perform pg_temp.ok(pg_temp.visible('source_capture_intents','service_role', null, null) = 1, 'service_role reads intents');

  perform pg_temp.ok(pg_temp.visible('source_capture_manifests','authenticated','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null) = 1, 'owner reads manifests');
  perform pg_temp.ok(pg_temp.visible('source_capture_manifests','authenticated','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null) = 0, 'outsider sees no manifests');
  perform pg_temp.ok(pg_temp.visible('source_capture_manifests','authenticated','cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 1, 'peer reads manifests');
  perform pg_temp.ok(pg_temp.visible('source_capture_manifests','service_role', null, null) = 1, 'service_role reads manifests');

  perform pg_temp.ok(pg_temp.visible('source_script_snapshots','authenticated','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null) = 1, 'owner reads snapshots');
  perform pg_temp.ok(pg_temp.visible('source_script_snapshots','authenticated','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null) = 0, 'outsider sees no snapshots');
  perform pg_temp.ok(pg_temp.visible('source_script_snapshots','authenticated','cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 1, 'peer reads snapshots');
  perform pg_temp.ok(pg_temp.visible('source_script_snapshots','service_role', null, null) = 1, 'service_role reads snapshots');

  -- WRITE DENIAL: authenticated cannot insert/update/delete ANY capture table; anon
  -- cannot even read. (UPDATE/DELETE are additionally blocked by the append-only
  -- trigger, but the grant posture alone must already deny the write.)
  -- INSERT denials reference the pre-seeded but not-yet-occupied a2a2 source asset, so
  -- the FK/unique constraints are satisfied and the ONLY thing that can deny the write
  -- is the privilege/RLS posture (else these would be denied by a FK violation, masking
  -- whether the privilege guard actually has teeth).
  perform pg_temp.ok(pg_temp.denied('authenticated',
    $q$insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256) values ('a2a2a2a2-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','teleprompter',repeat('0',64),gen_random_uuid(),'{}'::jsonb,repeat('0',64))$q$), 'authenticated INSERT intents denied');
  perform pg_temp.ok(pg_temp.denied('authenticated', $q$update public.source_capture_intents set intent_sha256=repeat('0',64)$q$), 'authenticated UPDATE intents denied');
  perform pg_temp.ok(pg_temp.denied('authenticated', $q$delete from public.source_capture_intents$q$), 'authenticated DELETE intents denied');
  perform pg_temp.ok(pg_temp.denied('anon', $q$select 1 from public.source_capture_intents$q$), 'anon SELECT intents denied');

  perform pg_temp.ok(pg_temp.denied('authenticated',
    $q$insert into public.source_capture_manifests(source_asset_id,owner_id,origin,intent_sha256,manifest,manifest_sha256,normalization_version) values ('a2a2a2a2-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','teleprompter',repeat('0',64),'{}'::jsonb,repeat('0',64),'v1')$q$), 'authenticated INSERT manifests denied');
  perform pg_temp.ok(pg_temp.denied('authenticated', $q$update public.source_capture_manifests set manifest_sha256=repeat('0',64)$q$), 'authenticated UPDATE manifests denied');
  perform pg_temp.ok(pg_temp.denied('authenticated', $q$delete from public.source_capture_manifests$q$), 'authenticated DELETE manifests denied');
  perform pg_temp.ok(pg_temp.denied('anon', $q$select 1 from public.source_capture_manifests$q$), 'anon SELECT manifests denied');

  perform pg_temp.ok(pg_temp.denied('authenticated',
    $q$insert into public.source_script_snapshots(source_asset_id,owner_id,generation_id,snapshot,snapshot_sha) values ('a2a2a2a2-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','{}'::jsonb,repeat('0',64))$q$), 'authenticated INSERT snapshots denied');
  perform pg_temp.ok(pg_temp.denied('authenticated', $q$update public.source_script_snapshots set snapshot_sha=repeat('0',64)$q$), 'authenticated UPDATE snapshots denied');
  perform pg_temp.ok(pg_temp.denied('authenticated', $q$delete from public.source_script_snapshots$q$), 'authenticated DELETE snapshots denied');
  perform pg_temp.ok(pg_temp.denied('anon', $q$select 1 from public.source_script_snapshots$q$), 'anon SELECT snapshots denied');

  -- authenticated MAY still SELECT each table (grant present; RLS filters rows).
  perform pg_temp.ok(pg_temp.denied('authenticated', $q$select 1 from public.source_capture_intents where false$q$) = false, 'authenticated may SELECT intents');
  perform pg_temp.ok(pg_temp.denied('authenticated', $q$select 1 from public.source_capture_manifests where false$q$) = false, 'authenticated may SELECT manifests');
  perform pg_temp.ok(pg_temp.denied('authenticated', $q$select 1 from public.source_script_snapshots where false$q$) = false, 'authenticated may SELECT snapshots');

  -- POSITIVE TRUSTED WRITE: service_role CAN insert into each capture table — proven to
  -- run under a genuine, non-superuser service_role (no masquerade) via service_write().
  -- Owner B's parent rows are pre-seeded (above); service_role writes the capture rows.
  perform pg_temp.service_write($q$insert into public.source_capture_intents(source_asset_id,owner_id,generation_id,origin,recording_script_sha256,client_attempt_id,intent,intent_sha256) values ('a2a2a2a2-2222-2222-2222-222222222222','dddddddd-dddd-dddd-dddd-dddddddddddd','22222222-2222-2222-2222-222222222222','teleprompter',repeat('b',64),gen_random_uuid(),'{}'::jsonb,repeat('b',64))$q$);
  perform pg_temp.service_write($q$insert into public.source_capture_manifests(source_asset_id,owner_id,origin,intent_sha256,manifest,manifest_sha256,normalization_version) values ('a2a2a2a2-2222-2222-2222-222222222222','dddddddd-dddd-dddd-dddd-dddddddddddd','teleprompter',repeat('b',64),'{}'::jsonb,repeat('b',64),'v1')$q$);
  perform pg_temp.service_write($q$insert into public.source_script_snapshots(source_asset_id,owner_id,generation_id,snapshot,snapshot_sha) values ('a2a2a2a2-2222-2222-2222-222222222222','dddddddd-dddd-dddd-dddd-dddddddddddd','22222222-2222-2222-2222-222222222222','{}'::jsonb,repeat('b',64))$q$);

  -- The trusted writes landed: service_role now sees TWO rows in each capture table.
  perform pg_temp.ok(pg_temp.visible('source_capture_intents','service_role', null, null) = 2, 'service_role wrote intents');
  perform pg_temp.ok(pg_temp.visible('source_capture_manifests','service_role', null, null) = 2, 'service_role wrote manifests');
  perform pg_temp.ok(pg_temp.visible('source_script_snapshots','service_role', null, null) = 2, 'service_role wrote snapshots');
end $$;

\echo IDENTITY-MATRIX-PASSED

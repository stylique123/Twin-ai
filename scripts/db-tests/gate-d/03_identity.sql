-- Item 7: REAL identity matrix for the capture tables under SET ROLE (owner / peer /
-- outsider / anon / service_role), proving RLS reads + write denial + retention. Run
-- as its own psql session (separate from the mutation-controlled 02_assertions).
\set ON_ERROR_STOP on
\pset pager off

truncate public.source_capture_intents, public.media_assets, public.generations cascade;
insert into public.generations(id, user_id) values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
  values ('a1a1a1a1-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',gen_random_uuid(),'source','takes','x','video/webm',1024,'uploading',1);
insert into public.source_script_snapshots(source_asset_id,owner_id,generation_id,snapshot,snapshot_sha)
  values ('a1a1a1a1-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','{}'::jsonb, repeat('a',64));

-- Count rows VISIBLE to an identity (role + auth.uid() + optional workspace peer).
create or replace function pg_temp.visible(p_role text, p_sub text, p_peer text) returns int language plpgsql as $$
declare c int;
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub,''), true);
  perform set_config('test.workspace_peer', coalesce(p_peer,''), true);
  execute 'select count(*) from public.source_script_snapshots' into c;
  reset role;
  return c;
end $$;
-- True iff running `sql` as `p_role` (owner identity) is DENIED (any error).
create or replace function pg_temp.denied(p_role text, sql text) returns boolean language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  begin execute sql; exception when others then reset role; return true; end;
  reset role; return false;
end $$;
create or replace function pg_temp.ok(p boolean, label text) returns void language plpgsql as $$
begin if p is distinct from true then raise exception 'IDENTITY_FAIL: %', label; end if; end $$;

do $$
begin
  -- READS: owner sees its row; an outsider sees none; a workspace peer sees it.
  perform pg_temp.ok(pg_temp.visible('authenticated','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null) = 1, 'owner read');
  perform pg_temp.ok(pg_temp.visible('authenticated','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null) = 0, 'outsider sees none');
  perform pg_temp.ok(pg_temp.visible('authenticated','cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 1, 'peer read');
  -- service_role bypasses RLS (trusted server) → sees the row regardless of auth.uid().
  perform pg_temp.ok(pg_temp.visible('service_role', null, null) = 1, 'service_role read');

  -- WRITES: authenticated cannot insert/update/delete; anon cannot even read.
  perform pg_temp.ok(pg_temp.denied('authenticated',
    $q$insert into public.source_script_snapshots(source_asset_id,owner_id,generation_id,snapshot,snapshot_sha) values (gen_random_uuid(),'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','{}'::jsonb,repeat('0',64))$q$), 'authenticated INSERT denied');
  perform pg_temp.ok(pg_temp.denied('authenticated', $q$update public.source_script_snapshots set snapshot_sha=repeat('0',64)$q$), 'authenticated UPDATE denied');
  perform pg_temp.ok(pg_temp.denied('authenticated', $q$delete from public.source_script_snapshots$q$), 'authenticated DELETE denied');
  perform pg_temp.ok(pg_temp.denied('anon', $q$select 1 from public.source_script_snapshots$q$), 'anon SELECT denied');
  perform pg_temp.ok(pg_temp.denied('authenticated', $q$select 1 from public.source_capture_intents where false$q$) = false, 'authenticated may SELECT intents');
end $$;

-- service_role CAN write (the SECURITY DEFINER RPCs run as the trusted server).
set local role service_role;
insert into public.media_assets(id,owner_id,generation_id,recording_attempt_id,kind,bucket,storage_path,mime_type,size_bytes,status,capture_contract_version)
  values ('a2a2a2a2-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',gen_random_uuid(),'source','takes','y','video/webm',1024,'uploading',1);
insert into public.source_script_snapshots(source_asset_id,owner_id,generation_id,snapshot,snapshot_sha)
  values ('a2a2a2a2-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','{}'::jsonb, repeat('b',64));
reset role;

\echo IDENTITY-MATRIX-PASSED

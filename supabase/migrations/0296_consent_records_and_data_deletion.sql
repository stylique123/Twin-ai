-- CONSENT RECORD AND USER DATA DELETION (Task D item 8, docs/legal/consent-and-deletion.md).
-- FILE ONLY: NOT APPLIED. Apply by hand after counsel signs off on the notice text.
-- The web side is behind VITE_PRIVACY_NOTICE (default OFF); nothing calls these
-- objects until both the migration is applied and the flag is set.
--
-- 1. consent_records: one row per notice a user accepted or withdrew. Kept after
--    the user's data is deleted (it is the proof of what they agreed to), so it
--    has no foreign key to auth.users and holds no content, only a version.
-- 2. data_deletion_requests: a user asks; a person (service role) processes.
--    Nothing is deleted at request time.
-- 3. process_data_deletion(): service role only. Deletes every row keyed to the
--    user in public tables with an owner_id or user_id column, except the
--    retained tables below, and records per-table counts (no content).

create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  kind text not null check (kind in ('privacy_notice', 'third_party_sources', 'eval_participation')),
  notice_version text not null check (notice_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$'),
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  check (withdrawn_at is null or withdrawn_at >= granted_at)
);
create index if not exists consent_records_owner_idx on public.consent_records (owner_id, kind, granted_at desc);
alter table public.consent_records enable row level security;
revoke all on public.consent_records from anon;
drop policy if exists consent_records_own_select on public.consent_records;
create policy consent_records_own_select on public.consent_records
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists consent_records_own_insert on public.consent_records;
create policy consent_records_own_insert on public.consent_records
  for insert to authenticated with check (owner_id = auth.uid() and withdrawn_at is null);
-- Withdrawal is an update of withdrawn_at only, on one's own row.
drop policy if exists consent_records_own_withdraw on public.consent_records;
create policy consent_records_own_withdraw on public.consent_records
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke update on public.consent_records from authenticated;
grant select, insert on public.consent_records to authenticated;
grant update (withdrawn_at) on public.consent_records to authenticated;

create table if not exists public.data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'done', 'failed', 'cancelled')),
  processed_at timestamptz,
  -- {"table": rows_deleted, ...}; counts only.
  deleted_counts jsonb,
  failure text
);
create unique index if not exists data_deletion_one_pending
  on public.data_deletion_requests (owner_id) where status = 'pending';
alter table public.data_deletion_requests enable row level security;
revoke all on public.data_deletion_requests from anon, authenticated;
drop policy if exists data_deletion_own_select on public.data_deletion_requests;
create policy data_deletion_own_select on public.data_deletion_requests
  for select to authenticated using (owner_id = auth.uid());
grant select on public.data_deletion_requests to authenticated;

-- The user's own request. Idempotent: a second call returns the pending one.
create or replace function public.request_data_deletion()
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into v_id from public.data_deletion_requests where owner_id = auth.uid() and status = 'pending';
  if v_id is not null then return v_id; end if;
  insert into public.data_deletion_requests (owner_id) values (auth.uid()) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.request_data_deletion() from public, anon;
grant execute on function public.request_data_deletion() to authenticated;

-- Tables kept on deletion: billing and tax records, spend ledgers (no content),
-- admin roles, the consent proof and the request log itself.
create or replace function public.data_deletion_retained_tables()
returns text[] language sql immutable as $$
  select array['billing_events', 'subscriptions', 'credit_events', 'ai_usage_ledger',
               'apify_spend_ledger', 'platform_admins', 'consent_records', 'data_deletion_requests']
$$;

-- Service role only. Covers tables added later automatically (owner_id/user_id).
create or replace function public.process_data_deletion(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid; v_status text; r record; n bigint; counts jsonb := '{}'::jsonb;
begin
  select owner_id, status into v_owner, v_status from public.data_deletion_requests where id = p_request_id for update;
  if v_owner is null then raise exception 'no such request'; end if;
  if v_status <> 'pending' then raise exception 'request is %', v_status; end if;
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name in ('owner_id', 'user_id')
      and c.table_name <> all (public.data_deletion_retained_tables())
    order by c.table_name
  loop
    execute format('delete from public.%I where %I = $1', r.table_name, r.column_name) using v_owner;
    get diagnostics n = row_count;
    counts := counts || jsonb_build_object(r.table_name, n);
  end loop;
  update public.data_deletion_requests
     set status = 'done', processed_at = now(), deleted_counts = counts
   where id = p_request_id;
  return counts;
exception when others then
  update public.data_deletion_requests set status = 'failed', processed_at = now(), failure = sqlstate
   where id = p_request_id;
  -- The block's deletes are rolled back; the failed status is kept.
  return jsonb_build_object('failed', sqlstate);
end $$;
revoke all on function public.process_data_deletion(uuid) from public, anon, authenticated;
-- Storage objects and the auth user are removed by the operator after this
-- (enqueue_media_purge, then auth admin delete); see the runbook.

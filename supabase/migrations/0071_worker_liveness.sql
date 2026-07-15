-- Production-readiness (Phase 4) — make a dead worker VISIBLE.
--
-- The async plane is a single VPS; when the worker dies, jobs silently pile up in
-- 'queued' with nothing to alert on (0066 exposed queue depth but nothing watched
-- it). This adds a heartbeat the worker writes every ~15s, surfaces its freshness in
-- system_health(), and runs a 1-min cron that raises a throttled ops_events alert
-- when the worker is stale AND work is waiting — so "worker down" is caught, not
-- discovered hours later.

create table if not exists public.worker_heartbeat (
  worker_id    text primary key,
  last_seen_at timestamptz not null default now()
);
alter table public.worker_heartbeat enable row level security;
revoke all on public.worker_heartbeat from anon, authenticated;
-- service_role (the worker) writes; RLS-enabled with no policies means anon/auth get
-- nothing. system_health()/checks read it as security-definer.

-- Extend the health rollup with worker liveness (newest heartbeat age + online flag).
create or replace function public.system_health()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'failed_jobs',    (select count(*) from public.jobs where status = 'failed'),
    'queued_depth',   (select count(*) from public.jobs where status = 'queued'),
    'oldest_queued_secs', (select coalesce(extract(epoch from now() - min(created_at))::bigint, 0)
                             from public.jobs where status = 'queued'),
    'stuck_building', (select count(*) from public.brand_voices where status = 'building' and updated_at < now() - interval '15 min'),
    'worker_last_seen_secs', (select coalesce(extract(epoch from now() - max(last_seen_at))::bigint, -1)
                                from public.worker_heartbeat),
    'worker_online',  (select exists (select 1 from public.worker_heartbeat where last_seen_at > now() - interval '3 min')),
    'ops_24h',        (select count(*) from public.ops_events where created_at > now() - interval '24 hours'),
    'recent_ops',     (select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
                         from (select kind, severity, created_at from public.ops_events order by created_at desc limit 10) t)
  );
$$;
revoke all on function public.system_health() from public, anon, authenticated;
grant execute on function public.system_health() to service_role;

-- Raise a throttled alert when no worker has beaten recently AND jobs are waiting.
create or replace function public.check_worker_liveness(p_stale_secs integer default 180)
returns void language plpgsql security definer set search_path = public as $$
declare v_last timestamptz; v_queued integer;
begin
  select max(last_seen_at) into v_last from public.worker_heartbeat;
  select count(*) into v_queued from public.jobs where status = 'queued';
  if v_queued > 0 and (v_last is null or v_last < now() - make_interval(secs => p_stale_secs)) then
    -- One alert per 15 min so a prolonged outage doesn't spam ops_events.
    if not exists (select 1 from public.ops_events where kind = 'worker_down' and created_at > now() - interval '15 min') then
      insert into public.ops_events (kind, severity, detail)
        values ('worker_down', 'critical', jsonb_build_object('queued_depth', v_queued, 'last_seen', v_last));
    end if;
  end if;
end;
$$;
revoke all on function public.check_worker_liveness(integer) from public, anon, authenticated;

create extension if not exists pg_cron;
do $$ begin
  if exists (select 1 from cron.job where jobname = 'check-worker-liveness') then
    perform cron.unschedule('check-worker-liveness');
  end if;
end $$;
select cron.schedule('check-worker-liveness', '* * * * *', $$select public.check_worker_liveness(180)$$);

-- 0066: premortem fixes — make "Priority render" real, make the queue visible,
-- and stop unbounded telemetry growth.

-- 1) Priority render (Studio/Agency plans SELL this; claim was strict FIFO).
alter table public.jobs add column if not exists priority integer not null default 0;

create or replace function public.claim_job(
  p_worker text, p_types text[], p_visibility_secs integer default 600
)
returns setof public.jobs
language plpgsql
security definer set search_path = public
as $$
begin
  return query
  update public.jobs j
     set status     = 'running',
         attempts   = j.attempts + 1,
         locked_at  = now(),
         locked_by  = p_worker,
         updated_at = now()
   where j.id = (
     select id from public.jobs
      where type = any(p_types)
        and run_after <= now()
        and (
          status = 'queued'
          or (status = 'running' and locked_at < now() - make_interval(secs => p_visibility_secs))
        )
      -- Paid-plan priority first, then FIFO within a tier.
      order by priority desc, created_at
      for update skip locked
      limit 1
   )
  returning j.*;
end;
$$;

-- 2) Queue visibility: a dead/backlogged worker was invisible — system_health
--    reported failures but not depth or age of the queue.
create or replace function public.system_health()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'failed_jobs',    (select count(*) from public.jobs where status = 'failed'),
    'queued_depth',   (select count(*) from public.jobs where status = 'queued'),
    'oldest_queued_secs', (select coalesce(extract(epoch from now() - min(created_at))::bigint, 0)
                             from public.jobs where status = 'queued'),
    'stuck_building', (select count(*) from public.brand_voices where status = 'building' and updated_at < now() - interval '15 min'),
    'ops_24h',        (select count(*) from public.ops_events where created_at > now() - interval '24 hours'),
    'recent_ops',     (select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
                         from (select kind, severity, created_at from public.ops_events order by created_at desc limit 10) t)
  );
$$;

revoke all on function public.system_health() from public, anon, authenticated;
grant execute on function public.system_health() to service_role;

-- 3) Telemetry retention: analytics_events / notifications / info-level ops_events
--    grew forever (only rate_events self-cleaned). Trim daily via pg_cron when
--    available (same pattern as 0062); no-op otherwise.
do $outer$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'twinai-telemetry-trim';
    perform cron.schedule(
      'twinai-telemetry-trim',
      '17 4 * * *',
      $cron$
        delete from public.analytics_events where created_at < now() - interval '90 days';
        delete from public.notifications    where created_at < now() - interval '90 days';
        delete from public.ops_events       where created_at < now() - interval '30 days' and severity = 'info';
      $cron$
    );
  end if;
end
$outer$;

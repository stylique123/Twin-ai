-- Observability (Infra #6): capture critical backend events (money-losing or
-- stuck states) somewhere you can SEE them, not just in ephemeral function logs.
-- Admin-read only; written by the service role.

create table if not exists public.ops_events (
  id         bigint generated always as identity primary key,
  kind       text not null,                  -- refund_failed, job_dead_letter, ...
  severity   text not null default 'error',  -- info | warn | error | critical
  user_id    uuid,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ops_events_idx on public.ops_events (created_at desc);

alter table public.ops_events enable row level security;
revoke all on public.ops_events from anon, authenticated;
create policy "admin ops read" on public.ops_events for select using (public.is_platform_admin(auth.uid()));

-- System-health rollup for the /metrics dashboard.
create or replace function public.system_health()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'failed_jobs',    (select count(*) from public.jobs where status = 'failed'),
    'stuck_building', (select count(*) from public.brand_voices where status = 'building' and updated_at < now() - interval '15 min'),
    'ops_24h',        (select count(*) from public.ops_events where created_at > now() - interval '24 hours'),
    'recent_ops',     (select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
                         from (select kind, severity, created_at from public.ops_events order by created_at desc limit 10) t)
  );
$$;

revoke all on function public.system_health() from public, anon, authenticated;
grant execute on function public.system_health() to service_role;

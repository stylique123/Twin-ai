-- Founder / investor metrics: the chart set VCs gate a seed on — weekly cohort
-- retention (W1/W4/W8 by signup week), WoW active-creator growth, the second-video
-- "comes back" rate, and $/video signal from the render_cost ops events.
-- Service-role only; surfaced through the admin-gated admin-metrics edge function.

create or replace function public.founder_metrics()
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
with signups as (
  select id, date_trunc('week', created_at) as cohort, created_at from public.profiles
),
acts as (
  select user_id, created_at from public.analytics_events
),
cohort_ret as (
  select s.cohort,
    count(distinct s.id) as size,
    count(distinct s.id) filter (where exists (select 1 from acts a where a.user_id = s.id and a.created_at >= s.created_at + interval '7 days'  and a.created_at < s.created_at + interval '14 days')) as w1,
    count(distinct s.id) filter (where exists (select 1 from acts a where a.user_id = s.id and a.created_at >= s.created_at + interval '28 days' and a.created_at < s.created_at + interval '35 days')) as w4,
    count(distinct s.id) filter (where exists (select 1 from acts a where a.user_id = s.id and a.created_at >= s.created_at + interval '56 days' and a.created_at < s.created_at + interval '63 days')) as w8
  from signups s
  group by s.cohort
),
wow as (
  select date_trunc('week', created_at) as week, count(distinct user_id) as active
  from public.analytics_events
  where event = 'edit_rendered' and created_at >= now() - interval '8 weeks'
  group by 1
),
made as (
  select user_id, count(*) as n from public.analytics_events where event = 'edit_rendered' group by user_id
),
cost as (
  select count(*) as renders, round(avg((detail->>'render_ms')::numeric)) as avg_render_ms
  from public.ops_events where kind = 'render_cost'
)
select jsonb_build_object(
  'cohorts', (select coalesce(jsonb_agg(jsonb_build_object('week', to_char(cohort, 'YYYY-MM-DD'), 'size', size, 'w1', w1, 'w4', w4, 'w8', w8) order by cohort), '[]'::jsonb) from cohort_ret),
  'wow', (select coalesce(jsonb_agg(jsonb_build_object('week', to_char(week, 'YYYY-MM-DD'), 'active', active) order by week), '[]'::jsonb) from wow),
  'second_video', jsonb_build_object('made_1', (select count(*) from made where n >= 1), 'made_2plus', (select count(*) from made where n >= 2)),
  'cost', (select jsonb_build_object('renders', coalesce(renders, 0), 'avg_render_ms', coalesce(avg_render_ms, 0)) from cost)
);
$$;

revoke all on function public.founder_metrics() from public, anon, authenticated;
grant execute on function public.founder_metrics() to service_role;

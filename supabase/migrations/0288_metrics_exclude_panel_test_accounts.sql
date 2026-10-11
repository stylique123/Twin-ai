-- THE FICTIONAL PANEL STAYS OUT OF THE NUMBERS (owner, panel conditions).
--
-- scripts/ops/seedFictionalPanel.mjs creates six made-up auth users tagged
-- `app_metadata.twin_test_account = 'fictional_panel'` (service-role admin API;
-- a user cannot write their own app_metadata). Their generations already carry
-- `is_heartbeat`, but the data-room rollups below count users, voices, events
-- and referrals by user and knew nothing about test accounts. This excludes any
-- auth user carrying the tag from every count admin-metrics reads.
--
-- ⚠️ HAND-APPLIED like the migrations before it. Until it is applied the
-- functions keep their old definitions (and admin-metrics treats a missing
-- `test_account_ids()` as "nothing to exclude", never as an error).

create or replace function public.is_test_account(p_user uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_user and coalesce(u.raw_app_meta_data->>'twin_test_account', '') <> ''
  );
$$;
revoke all on function public.is_test_account(uuid) from public, anon, authenticated;
grant execute on function public.is_test_account(uuid) to service_role;

-- Ids only, for the admin-metrics worklist filter (service role only).
create or replace function public.test_account_ids()
returns setof uuid language sql stable security definer set search_path = public, auth as $$
  select u.id from auth.users u where coalesce(u.raw_app_meta_data->>'twin_test_account', '') <> '';
$$;
revoke all on function public.test_account_ids() from public, anon, authenticated;
grant execute on function public.test_account_ids() to service_role;

create or replace view public.metrics_overview as
select
  (select count(*) from public.profiles p where not public.is_test_account(p.id))                                  as total_users,
  (select count(*) from public.profiles p where p.onboarded and not public.is_test_account(p.id))                  as onboarded_users,
  (select count(*) from public.brand_voices v where v.status = 'ready' and not public.is_test_account(v.owner_id)) as voices_built,
  (select count(*) from public.generations g where not g.is_heartbeat)                                              as blueprints_generated,
  (select count(*) from public.jobs j where j.type = 'autoedit' and j.status = 'done' and not public.is_test_account(j.owner_id)) as edits_rendered,
  (select count(*) from public.posts o where o.status = 'posted' and not public.is_test_account(o.owner_id))      as posts_logged,
  (select count(*) from public.referrals r where not public.is_test_account(r.referrer_id) and not public.is_test_account(r.invitee_id)) as referrals_redeemed,
  round((select coalesce(sum(time_saved_minutes), 0) from public.analytics_events e where not public.is_test_account(e.user_id)) / 60.0, 1) as total_hours_saved,
  (select count(distinct user_id) from public.analytics_events e where e.created_at > now() - interval '7 days'  and not public.is_test_account(e.user_id)) as wau,
  (select count(distinct user_id) from public.analytics_events e where e.created_at > now() - interval '30 days' and not public.is_test_account(e.user_id)) as mau;

revoke all on public.metrics_overview from anon, authenticated;

create or replace function public.activation_funnel()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'signup',    count(distinct user_id) filter (where event = 'signup'),
    'onboarded', count(distinct user_id) filter (where event = 'onboarding_completed'),
    'voice',     count(distinct user_id) filter (where event = 'voice_built'),
    'blueprint', count(distinct user_id) filter (where event = 'blueprint_generated'),
    'edit',      count(distinct user_id) filter (where event = 'edit_rendered'),
    'post',      count(distinct user_id) filter (where event = 'post_logged')
  )
  from public.analytics_events
  where not public.is_test_account(user_id);
$$;

create or replace function public.retention_curve()
returns jsonb language sql security definer set search_path = public as $$
  with first_seen as (
    select user_id, min(created_at) as t0
    from public.analytics_events
    where user_id is not null and not public.is_test_account(user_id)
    group by user_id
  ),
  d as (
    select fs.t0,
      exists (select 1 from public.analytics_events e where e.user_id = fs.user_id and e.created_at >= fs.t0 + interval '1 day')  as r1,
      exists (select 1 from public.analytics_events e where e.user_id = fs.user_id and e.created_at >= fs.t0 + interval '7 day')  as r7,
      exists (select 1 from public.analytics_events e where e.user_id = fs.user_id and e.created_at >= fs.t0 + interval '30 day') as r30
    from first_seen fs
  )
  select jsonb_build_object(
    'd1',  jsonb_build_object('eligible', count(*) filter (where t0 <= now() - interval '1 day'),  'retained', count(*) filter (where t0 <= now() - interval '1 day'  and r1)),
    'd7',  jsonb_build_object('eligible', count(*) filter (where t0 <= now() - interval '7 day'),  'retained', count(*) filter (where t0 <= now() - interval '7 day'  and r7)),
    'd30', jsonb_build_object('eligible', count(*) filter (where t0 <= now() - interval '30 day'), 'retained', count(*) filter (where t0 <= now() - interval '30 day' and r30))
  )
  from d;
$$;

revoke all on function public.activation_funnel() from public, anon, authenticated;
revoke all on function public.retention_curve()   from public, anon, authenticated;
grant execute on function public.activation_funnel() to service_role;
grant execute on function public.retention_curve()   to service_role;

create or replace function public.founder_metrics()
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
with signups as (
  select id, date_trunc('week', created_at) as cohort, created_at from public.profiles
  where not public.is_test_account(id)
),
acts as (
  select user_id, created_at from public.analytics_events where not public.is_test_account(user_id)
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
  where event = 'edit_rendered' and created_at >= now() - interval '8 weeks' and not public.is_test_account(user_id)
  group by 1
),
made as (
  select user_id, count(*) as n from public.analytics_events
  where event = 'edit_rendered' and not public.is_test_account(user_id) group by user_id
),
cost as (
  select count(*) as renders, round(avg((detail->>'render_ms')::numeric)) as avg_render_ms
  from public.ops_events where kind = 'render_cost' and not public.is_test_account(user_id)
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

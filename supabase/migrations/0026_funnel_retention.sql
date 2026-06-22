-- Activation funnel + simple retention for the data room, computed from the
-- analytics_events stream. Distinct users per funnel step (drop-off) and Dn
-- retention (% of eligible users active >= N days after their first event).

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
  from public.analytics_events;
$$;

create or replace function public.retention_curve()
returns jsonb language sql security definer set search_path = public as $$
  with first_seen as (
    select user_id, min(created_at) as t0
    from public.analytics_events where user_id is not null group by user_id
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

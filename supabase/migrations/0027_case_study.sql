-- Per-user case study: roll up one creator's analytics into the numbers that make
-- a slide — videos shipped, hours saved, activity span — for investor case studies.

create or replace function public.user_case_study(p_user uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'blueprints',  count(*) filter (where event = 'blueprint_generated'),
    'edits',       count(*) filter (where event = 'edit_rendered'),
    'posts',       count(*) filter (where event = 'post_logged'),
    'voices',      count(*) filter (where event = 'voice_built'),
    'remixes',     count(*) filter (where event = 'gallery_remix'),
    'hours_saved', round(coalesce(sum(time_saved_minutes), 0) / 60.0, 1),
    'first_seen',  min(created_at),
    'last_seen',   max(created_at),
    'active_days', count(distinct ((created_at at time zone 'UTC')::date))
  )
  from public.analytics_events where user_id = p_user;
$$;

revoke all on function public.user_case_study(uuid) from public, anon, authenticated;
grant execute on function public.user_case_study(uuid) to service_role;

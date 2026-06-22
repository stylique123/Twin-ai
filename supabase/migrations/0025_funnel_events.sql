-- Top-of-funnel analytics, logged SERVER-SIDE (via triggers) so they can never be
-- missed by a client that closed the tab: signup (a profile is created) and
-- onboarding_completed (onboarded flips false -> true). Completes the activation
-- funnel: signup -> voice_built -> blueprint_generated -> edit_rendered -> post_logged.

create or replace function public.log_signup_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.analytics_events (user_id, event, props)
  values (new.id, 'signup', jsonb_build_object('plan', new.plan));
  return new;
end $$;

drop trigger if exists trg_log_signup on public.profiles;
create trigger trg_log_signup after insert on public.profiles
  for each row execute function public.log_signup_event();

create or replace function public.log_onboarded_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.onboarded and not coalesce(old.onboarded, false) then
    insert into public.analytics_events (user_id, event, props)
    values (new.id, 'onboarding_completed', '{}'::jsonb);
  end if;
  return new;
end $$;

drop trigger if exists trg_log_onboarded on public.profiles;
create trigger trg_log_onboarded after update on public.profiles
  for each row execute function public.log_onboarded_event();

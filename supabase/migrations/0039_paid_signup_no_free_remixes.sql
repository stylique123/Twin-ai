-- Free remixes are for FREE signups only.
--
-- Direct direction: "when I make account through agency or pro, it should not give
-- me free [remixes]." Previously every new profile got the table default of 30
-- credits (3 free remixes), regardless of which plan they signed up for. So someone
-- who chose Pro/Agency on the pricing page still landed with 3 free remixes before
-- paying.
--
-- We now read the plan the user picked at signup — stamped into auth metadata as
-- `intended_plan` by the signup form — inside the profile-creation trigger (the
-- authoritative, un-spoofable place). A paid-intent signup starts with 0 credits
-- (they unlock their allowance by paying); a free / unspecified signup keeps the 3
-- free remixes. Plan stays 'free' until a real payment activates it, so nobody gets
-- a paid plan for free — they just don't get the free remixes either.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_intended text := nullif(new.raw_user_meta_data ->> 'intended_plan', '');
  v_credits  integer;
begin
  -- Paid-intent signups get NO free remixes; free / unknown keep the default grant.
  if v_intended in ('aspiring', 'professional', 'agency') then
    v_credits := 0;
  else
    v_credits := 30; -- 3 free remixes (matches the Free plan default)
  end if;

  insert into public.profiles (id, email, credits)
  values (new.id, new.email, v_credits)
  on conflict (id) do nothing;
  return new;
end;
$$;

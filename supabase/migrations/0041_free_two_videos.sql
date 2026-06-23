-- Free tier is now 2 videos (20 credits), down from 3. "Enough to show value."
-- Update both the table default and the signup trigger so free/unspecified
-- signups get 20 credits; paid-intent signups still get 0 (activate by paying).

alter table public.profiles alter column credits set default 20;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_intended text := nullif(new.raw_user_meta_data ->> 'intended_plan', '');
  v_credits  integer;
begin
  if v_intended in ('aspiring','professional','studio','agency') then
    v_credits := 0; -- paid-intent: no free videos, unlock by paying
  else
    v_credits := 20; -- Free: 2 videos
  end if;
  insert into public.profiles (id, email, credits)
  values (new.id, new.email, v_credits)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Free tier back to 3 remixes (30 credits) — paid checkout is "Coming soon" for
-- now, so the free signup is the funnel. Default + trigger updated to 30; paid
-- intent still gets 0 (unchanged).
alter table public.profiles alter column credits set default 30;

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
    v_credits := 0;
  else
    v_credits := 30; -- 3 free remixes
  end if;
  insert into public.profiles (id, email, credits)
  values (new.id, new.email, v_credits)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Every signup gets 3 free remixes (30 credits) — REGARDLESS of intended plan.
--
-- Paid checkout is "Coming soon", so the old gate that zeroed credits for anyone
-- who signed up "for" a paid plan (aspiring/professional/studio/agency) left
-- those flows — including Agency — with 0 remixes and nothing to try. The free
-- signup IS the launch funnel: no matter which CTA a visitor clicks, their first
-- run must work. So grant 30 to everyone now.
--
-- When payments go live again, restore the intended_plan gate (see 0044/0039).
alter table public.profiles alter column credits set default 30;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, credits)
  values (new.id, new.email, 30) -- 3 free remixes for every flow
  on conflict (id) do nothing;
  return new;
end;
$$;

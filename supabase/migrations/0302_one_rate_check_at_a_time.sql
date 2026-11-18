-- ONE RATE CHECK AT A TIME PER USER AND ACTION (security audit #6).
-- check_rate_limit (0003) counted recent rows, then inserted the new one, with
-- nothing in between. Requests sent at the same moment all counted "under the
-- limit": with a limit of 5, 50 simultaneous calls let 40-50 through on a local
-- database (pgbench -c 50). Each paid scrape or AI job behind this cap started.
-- A transaction-scoped advisory lock on (user, action) makes concurrent calls
-- for the same pair wait their turn; the lock is released at commit.
-- Body is 0003's with only the lock added. Files only; applied by hand.
create or replace function public.check_rate_limit(
  p_user uuid, p_action text, p_max integer, p_window_secs integer
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare cnt integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text || ':' || p_action));

  -- Opportunistic cleanup of this user/action's stale rows keeps the table small.
  delete from public.rate_events
   where user_id = p_user and action = p_action
     and created_at < now() - make_interval(secs => p_window_secs);

  select count(*) into cnt from public.rate_events
   where user_id = p_user and action = p_action
     and created_at > now() - make_interval(secs => p_window_secs);

  if cnt >= p_max then return false; end if;

  insert into public.rate_events (user_id, action) values (p_user, p_action);
  return true;
end;
$$;
revoke all on function public.check_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(uuid, text, integer, integer) to service_role;

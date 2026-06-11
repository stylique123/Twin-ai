-- TwinAI Phase: Security hardening + platform admin (from the security panel).
--
-- Adds: (1) a super-admin / support role model that is NOT self-grantable and is
-- fully audited; (2) cross-tenant READ policies for admins (support/moderation)
-- while every normal user stays isolated to their own rows; (3) a generic,
-- DB-enforced rate limiter to defend the cost-incurring endpoints (Apify scrapes,
-- Gemini calls) against abuse / DoS / runaway-cost attacks.
--
-- Tenant isolation note: every business table already has RLS with own-row
-- policies (profiles/generations/brand_voices/jobs/credit_events). The admin
-- policies below are PERMISSIVE and additive — they ONLY widen access for users
-- present in platform_admins; they never loosen isolation for normal users.

-- ===========================================================================
-- 1. Platform admins (super-admin / support). NOT self-grantable.
--    Seed the first admin out-of-band via the service role / SQL console:
--      insert into public.platform_admins (user_id, role) values ('<uuid>','superadmin');
-- ===========================================================================
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'admin' check (role in ('admin', 'superadmin', 'support')),
  granted_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- Is this user a platform admin? SECURITY DEFINER so RLS policies can call it
-- without recursing into platform_admins' own RLS.
create or replace function public.is_platform_admin(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = p_user);
$$;
grant execute on function public.is_platform_admin(uuid) to authenticated, service_role;

-- Has this user a specific role (or higher)? superadmin implies admin implies support.
create or replace function public.is_superadmin(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = p_user and role = 'superadmin');
$$;
grant execute on function public.is_superadmin(uuid) to authenticated, service_role;

-- Admins may read the roster; only superadmins may change it. Writes by normal
-- users are impossible (RLS on, no insert/update/delete policy for them).
create policy "admins read roster" on public.platform_admins
  for select using (public.is_platform_admin(auth.uid()));
create policy "superadmins manage roster" on public.platform_admins
  for all using (public.is_superadmin(auth.uid())) with check (public.is_superadmin(auth.uid()));

-- ===========================================================================
-- 2. Admin audit log — EVERY privileged/cross-tenant action is recorded.
-- ===========================================================================
create table if not exists public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references auth.users (id),
  action      text not null,
  target_user uuid references auth.users (id),
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists admin_audit_idx on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
create policy "admins read audit" on public.admin_audit_log
  for select using (public.is_platform_admin(auth.uid()));
-- Inserts come only from SECURITY DEFINER RPCs below (service role) — never the client.

-- ===========================================================================
-- 3. Cross-tenant READ for admins (support/moderation). Additive & PERMISSIVE:
--    normal users keep seeing ONLY their own rows; admins additionally see all.
-- ===========================================================================
create policy "admin read profiles"      on public.profiles      for select using (public.is_platform_admin(auth.uid()));
create policy "admin read generations"   on public.generations   for select using (public.is_platform_admin(auth.uid()));
create policy "admin read brand_voices"  on public.brand_voices  for select using (public.is_platform_admin(auth.uid()));
create policy "admin read jobs"          on public.jobs          for select using (public.is_platform_admin(auth.uid()));
create policy "admin read credit_events" on public.credit_events for select using (public.is_platform_admin(auth.uid()));

-- Admin WRITES never go through RLS — they go through the audited RPCs below.

-- ===========================================================================
-- 4. Audited admin actions (service role only; verify admin INSIDE the RPC).
-- ===========================================================================
-- Grant or deduct credits for a user (support). Always logged.
create or replace function public.admin_grant_credits(
  p_admin uuid, p_user uuid, p_delta integer, p_reason text
)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare remaining integer;
begin
  if not public.is_platform_admin(p_admin) then raise exception 'NOT_ADMIN'; end if;
  if p_delta = 0 then raise exception 'INVALID_AMOUNT'; end if;

  update public.profiles
     set credits = greatest(0, credits + p_delta)
   where id = p_user
   returning credits into remaining;
  if remaining is null then raise exception 'NO_SUCH_USER'; end if;

  insert into public.credit_events (user_id, delta, reason)
    values (p_user, p_delta, 'admin:' || coalesce(p_reason, 'adjust'));
  insert into public.admin_audit_log (admin_id, action, target_user, detail)
    values (p_admin, 'grant_credits', p_user, jsonb_build_object('delta', p_delta, 'reason', p_reason));

  return remaining;
end;
$$;
revoke all on function public.admin_grant_credits(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.admin_grant_credits(uuid, uuid, integer, text) to service_role;

-- Record any other admin action (e.g. a support read/impersonation) for the trail.
create or replace function public.admin_log(
  p_admin uuid, p_action text, p_target uuid, p_detail jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_platform_admin(p_admin) then raise exception 'NOT_ADMIN'; end if;
  insert into public.admin_audit_log (admin_id, action, target_user, detail)
    values (p_admin, p_action, p_target, coalesce(p_detail, '{}'::jsonb));
end;
$$;
revoke all on function public.admin_log(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_log(uuid, text, uuid, jsonb) to service_role;

-- ===========================================================================
-- 5. Rate limiter — DB-enforced sliding window, defends cost-incurring calls
--    (Apify scrapes, Gemini generations) from abuse / DoS / runaway cost.
--    Service-role only; edge functions call it BEFORE spending money.
-- ===========================================================================
create table if not exists public.rate_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  action     text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_events_lookup on public.rate_events (user_id, action, created_at desc);
alter table public.rate_events enable row level security; -- no policies → service role only

-- Returns true if the action is allowed (and records it), false if over the cap.
create or replace function public.check_rate_limit(
  p_user uuid, p_action text, p_max integer, p_window_secs integer
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare cnt integer;
begin
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

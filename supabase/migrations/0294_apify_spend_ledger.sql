-- APIFY SPEND LEDGER WITH HARD STOPS (owner, 23 Oct: ~98 Reddit runs at $0.38).
-- Every Apify run RESERVES its per-run cap (maxTotalChargeUsd) here BEFORE it
-- starts; apify_reserve refuses when today's or this month's reserved dollars
-- plus the new reservation would pass the caller's limits. Reserving the cap
-- (not the actual) makes the stop conservative: a run can never cost more than
-- it reserved, so spend can never pass the limit. Service role only.
-- FILE ONLY: not applied. Apply by hand BEFORE deploying the worker/edge that
-- calls apify_reserve: until it exists every Apify call fails closed (no spend).
create table if not exists public.apify_spend_ledger (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  feature text not null,
  actor text not null,
  owner_id uuid,
  reserved_usd numeric(10,4) not null check (reserved_usd >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'done', 'failed'))
);
create index if not exists apify_spend_ledger_created_at on public.apify_spend_ledger (created_at);
alter table public.apify_spend_ledger enable row level security;
revoke all on public.apify_spend_ledger from anon, authenticated;

create or replace function public.apify_reserve(
  p_feature text, p_actor text, p_owner uuid, p_usd numeric, p_daily_usd numeric, p_monthly_usd numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_day numeric; v_month numeric; v_id bigint;
begin
  -- One reservation at a time, so two workers cannot both fit under the limit.
  perform pg_advisory_xact_lock(hashtext('apify_reserve'));
  select coalesce(sum(reserved_usd) filter (where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'), 0),
         coalesce(sum(reserved_usd), 0)
    into v_day, v_month
    from public.apify_spend_ledger
   where created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  if v_day + p_usd > p_daily_usd then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit', 'day_usd', v_day, 'month_usd', v_month);
  end if;
  if v_month + p_usd > p_monthly_usd then
    return jsonb_build_object('ok', false, 'reason', 'monthly_limit', 'day_usd', v_day, 'month_usd', v_month);
  end if;
  insert into public.apify_spend_ledger (feature, actor, owner_id, reserved_usd)
    values (left(p_feature, 80), left(p_actor, 120), p_owner, p_usd) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'day_usd', v_day + p_usd, 'month_usd', v_month + p_usd);
end $$;
revoke all on function public.apify_reserve(text, text, uuid, numeric, numeric, numeric) from public, anon, authenticated;

-- Apify dollars beside AI calls, per day (the cost report).
create or replace view public.apify_cost_report with (security_invoker = true) as
select d.day, d.apify_runs, d.apify_usd, coalesce(a.ai_calls, 0) as ai_calls
  from (select date(created_at) as day, count(*) as apify_runs, sum(reserved_usd) as apify_usd
          from public.apify_spend_ledger group by 1) d
  left join (select date(created_at) as day, sum(calls) as ai_calls
               from public.ai_usage_ledger where model not like 'apify:%' group by 1) a using (day);
revoke all on public.apify_cost_report from anon, authenticated;

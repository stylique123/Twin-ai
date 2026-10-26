-- APIFY v6.4 (plan §30): TWO TIERS, ONE LEDGER, A 22nd→22nd BILLING CYCLE.
-- 0294 is applied in prod and is NOT edited; this file only adds beside it.
--   creator : a creator's own onboarding / profile read. RECORD-ONLY: the run is
--             written to the ledger and never refused, whatever the spend.
--   batch   : background jobs (Reddit scan, comment mining, any scheduled
--             refresh). HARD daily + per-cycle caps, counted over batch rows
--             only, plus the anomaly breaker: today > p_breaker_x (3) x the trailing
--             7-day average pauses batch runs. Never creator reads.
-- Every answer carries today's total and the trailing 7-day daily average so
-- the worker can alert when today > 3x the average.
-- FILE ONLY: apply by hand. Until it exists the worker records creator reads
-- through 0294 apify_reserve (unlimited limits) and refuses batch runs.
alter table public.apify_spend_ledger
  add column if not exists tier text not null default 'creator';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'apify_spend_ledger_tier_check') then
    alter table public.apify_spend_ledger
      add constraint apify_spend_ledger_tier_check check (tier in ('creator', 'batch'));
  end if;
end $$;

-- Start of the billing cycle containing p_at: the most recent 22nd, 00:00 UTC.
create or replace function public.apify_cycle_start(p_at timestamptz default now())
returns timestamptz language sql stable set search_path = public as $$
  select case
    when extract(day from (p_at at time zone 'utc')) >= 22
      then (date_trunc('month', p_at at time zone 'utc') + interval '21 days') at time zone 'utc'
    else (date_trunc('month', p_at at time zone 'utc') - interval '1 month' + interval '21 days') at time zone 'utc'
  end
$$;
revoke all on function public.apify_cycle_start(timestamptz) from public, anon, authenticated;

create or replace function public.apify_reserve_tiered(
  p_feature text, p_actor text, p_owner uuid, p_usd numeric, p_tier text,
  p_daily_usd numeric, p_cycle_usd numeric, p_breaker_x numeric default 3
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_day0 timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  v_cycle0 timestamptz := public.apify_cycle_start(now());
  v_today numeric; v_avg numeric; v_bday numeric; v_bcycle numeric; v_id bigint;
begin
  if p_tier not in ('creator', 'batch') then
    return jsonb_build_object('ok', false, 'reason', 'bad_tier');
  end if;
  perform pg_advisory_xact_lock(hashtext('apify_reserve'));
  select coalesce(sum(reserved_usd) filter (where created_at >= v_day0), 0),
         coalesce(sum(reserved_usd) filter (where created_at < v_day0), 0) / 7.0,
         coalesce(sum(reserved_usd) filter (where tier = 'batch' and created_at >= v_day0), 0)
    into v_today, v_avg, v_bday
    from public.apify_spend_ledger
   where created_at >= v_day0 - interval '7 days';
  select coalesce(sum(reserved_usd), 0) into v_bcycle
    from public.apify_spend_ledger where tier = 'batch' and created_at >= v_cycle0;
  if p_tier = 'batch' then
    -- Anomaly breaker: batch only. A creator read is never paused.
    if v_avg > 0 and v_today > p_breaker_x * v_avg then
      return jsonb_build_object('ok', false, 'reason', 'anomaly_paused', 'today_usd', v_today, 'avg_usd', v_avg);
    end if;
    if v_bday + p_usd > p_daily_usd then
      return jsonb_build_object('ok', false, 'reason', 'daily_limit', 'today_usd', v_today, 'avg_usd', v_avg);
    end if;
    if v_bcycle + p_usd > p_cycle_usd then
      return jsonb_build_object('ok', false, 'reason', 'cycle_limit', 'today_usd', v_today, 'avg_usd', v_avg, 'cycle_usd', v_bcycle);
    end if;
  end if;
  insert into public.apify_spend_ledger (feature, actor, owner_id, reserved_usd, tier)
    values (left(p_feature, 80), left(p_actor, 120), p_owner, p_usd, p_tier) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'today_usd', v_today + p_usd, 'avg_usd', v_avg,
    'cycle_usd', case when p_tier = 'batch' then v_bcycle + p_usd else null end, 'cycle_start', v_cycle0);
end $$;
revoke all on function public.apify_reserve_tiered(text, text, uuid, numeric, text, numeric, numeric, numeric)
  from public, anon, authenticated;

-- Apify dollars per billing cycle (22nd→22nd), split by tier.
create or replace view public.apify_cycle_report with (security_invoker = true) as
select public.apify_cycle_start(created_at) as cycle_start, tier,
       count(*) as apify_runs, sum(reserved_usd) as apify_usd
  from public.apify_spend_ledger group by 1, 2;
revoke all on public.apify_cycle_report from anon, authenticated;

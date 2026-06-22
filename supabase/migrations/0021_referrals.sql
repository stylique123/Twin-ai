-- Wave 3.5 (#7) — two-sided referral rewards.
--
-- Each user gets a shareable referral code. When a NEW user signs up through a
-- referral link and redeems the code, BOTH sides get bonus credits. The reward
-- AMOUNT is NOT hardcoded here — the `referral` edge function passes it in from
-- the REFERRAL_REWARD_CREDITS env (default 20 = 2 remixes), so it stays tunable
-- without a migration. This migration owns the schema + the atomic, abuse-safe
-- grant.

-- 1. Shareable code per profile (allocated lazily by ensure_referral_code).
alter table public.profiles add column if not exists referral_code text unique;

-- Short uppercase alphanumeric code from random bytes.
-- search_path includes `extensions` because gen_random_bytes (pgcrypto) lives in
-- the extensions schema on Supabase, not public — without it the function can't
-- resolve the call at creation time.
create or replace function public.gen_referral_code()
returns text
language sql volatile set search_path = public, extensions
as $$
  select upper(substr(replace(replace(replace(encode(gen_random_bytes(8), 'base64'), '+', ''), '/', ''), '=', ''), 1, 8));
$$;

-- Allocate a code for a user if they don't have one yet (retry on the rare
-- collision). Service-role only — called by the referral edge function.
create or replace function public.ensure_referral_code(p_user uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_existing text; v_code text;
begin
  select referral_code into v_existing from public.profiles where id = p_user;
  if v_existing is not null then return v_existing; end if;
  for _i in 1..5 loop
    v_code := public.gen_referral_code();
    begin
      update public.profiles set referral_code = v_code where id = p_user;
      return v_code;
    exception when unique_violation then
      -- collision, try another
    end;
  end loop;
  raise exception 'could not allocate referral code';
end;
$$;

-- 2. Redemption ledger. unique(invitee_id) = an invitee can be referred at most
-- once, ever — the core anti-abuse guard.
create table if not exists public.referrals (
  id             uuid primary key default gen_random_uuid(),
  referrer_id    uuid not null references auth.users (id) on delete cascade,
  invitee_id     uuid not null references auth.users (id) on delete cascade,
  code           text not null,
  reward_credits integer not null,
  created_at     timestamptz not null default now(),
  unique (invitee_id)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id, created_at desc);

alter table public.referrals enable row level security;
create policy "own referrals read" on public.referrals
  for select using (auth.uid() = referrer_id or auth.uid() = invitee_id);
-- Writes are service-role only (via redeem_referral); no client insert policy.

-- 3. Atomic redeem: validate + grant both sides in one transaction.
create or replace function public.redeem_referral(p_invitee uuid, p_code text, p_reward integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_referrer uuid; v_created timestamptz;
begin
  if p_reward is null or p_reward <= 0 then raise exception 'INVALID_REWARD'; end if;

  select id into v_referrer from public.profiles where referral_code = upper(btrim(p_code));
  if v_referrer is null then return jsonb_build_object('ok', false, 'reason', 'invalid_code'); end if;
  if v_referrer = p_invitee then return jsonb_build_object('ok', false, 'reason', 'self'); end if;

  -- The bonus is for NEW users redeeming at signup, never retroactive farming.
  select created_at into v_created from public.profiles where id = p_invitee;
  if v_created is null or v_created < now() - interval '14 days' then
    return jsonb_build_object('ok', false, 'reason', 'not_eligible');
  end if;

  begin
    insert into public.referrals (referrer_id, invitee_id, code, reward_credits)
    values (v_referrer, p_invitee, upper(btrim(p_code)), p_reward);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_redeemed');
  end;

  update public.profiles set credits = credits + p_reward where id = v_referrer;
  update public.profiles set credits = credits + p_reward where id = p_invitee;
  insert into public.credit_events (user_id, delta, reason) values
    (v_referrer, p_reward, 'referral_bonus'),
    (p_invitee, p_reward, 'referral_bonus');

  return jsonb_build_object('ok', true, 'reward', p_reward);
end;
$$;

revoke all on function public.ensure_referral_code(uuid) from public, anon, authenticated;
revoke all on function public.redeem_referral(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.ensure_referral_code(uuid)            to service_role;
grant execute on function public.redeem_referral(uuid, text, integer)  to service_role;

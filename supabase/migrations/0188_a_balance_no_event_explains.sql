-- EVERY CREDIT BALANCE IN PRODUCTION DISAGREES WITH ITS OWN LEDGER.
--
-- ⚠️ MEASURED 2026-09-07, all 50 profiles:
--
--     balance = sum(credit_events.delta) ......  0 of 50
--     balance - sum(delta) = exactly 30 ....... 49 of 50
--     balance - sum(delta) = 70 ...............  1 of 50
--     any NEGATIVE gap ........................  0 of 50
--
-- ⚖️ AND THAT IS BETTER NEWS THAN "50 OF 50 DISAGREE" SOUNDS. Every gap is
-- POSITIVE and 49 are the SAME number, which is the current signup grant. No
-- credit was ever spent without an event and none was invented: every spend,
-- refund and admin grant since signup reconciles exactly. What the ledger has
-- never had is an OPENING BALANCE.
--
-- ⚠️ THE CAUSE IS STRUCTURAL, NOT A MISSED CALL. `handle_new_user` (0045)
-- inserts the starter credits as a COLUMN VALUE:
--
--     insert into public.profiles (id, email, credits) values (new.id, ..., 30)
--
-- A column default and a direct insert cannot write a `credit_events` row. The
-- grant was never "forgotten" at a call site — there was no call site.
--
-- ⚠️ THE ONE 70 IS NOT EXPLAINED, AND IS NOT GUESSED AT HERE. The signup grant
-- has only ever been 30 (0001), 50 (0033) and 30 again (0037/0045). 70 is none
-- of them. That account's every event reconciles; only its opening balance is
-- larger than any default this repo has ever set. The backfill below records
-- what the balance actually implies and LABELS it as reconstructed, rather than
-- asserting a grant nobody can point to.

-- ── 1. THE OPENING BALANCE BECOMES AN EVENT, FOR EVERY EXISTING PROFILE ──────
--
-- ⚖️ IDEMPOTENT, because a migration must survive being applied twice. The
-- `not exists` guard is on the reason, so a second run writes nothing — and the
-- delta is computed from the CURRENT gap, so a re-run after new activity still
-- cannot double-count.
insert into public.credit_events (user_id, delta, reason, created_at)
select p.id,
       p.credits - coalesce(e.ev, 0),
       'opening_balance_backfill',
       coalesce(p.created_at, now())
from public.profiles p
left join (
  select user_id, sum(delta) as ev from public.credit_events group by 1
) e on e.user_id = p.id
where p.credits - coalesce(e.ev, 0) <> 0
  and not exists (
    select 1 from public.credit_events c
    where c.user_id = p.id and c.reason = 'opening_balance_backfill'
  )
  -- ⚠️ THE FK IS TO auth.users, SO A PROFILE WITHOUT ONE WOULD FAIL THE INSERT
  -- AND TAKE THE WHOLE MIGRATION WITH IT. Skip rather than abort: a reconciler
  -- that refuses to run is worse than one that reconciles what it can.
  and exists (select 1 from auth.users u where u.id = p.id);

-- ── 2. AND EVERY FUTURE SIGNUP WRITES ITS OWN ───────────────────────────────
--
-- ⚖️ SAME GRANT, SAME PLACE, ONE EXTRA ROW. This does not change what anybody
-- receives — 30 credits, every flow, exactly as 0045 set it. It changes only
-- whether the ledger can explain them.
--
-- ⚠️ THE EVENT IS WRITTEN ONLY WHEN THE PROFILE INSERT ACTUALLY HAPPENED.
-- `on conflict do nothing` means a re-fired trigger inserts no profile, and
-- writing the event unconditionally would credit a ledger for a grant that was
-- not made. RETURNING is what tells those two cases apart.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_inserted uuid;
begin
  insert into public.profiles (id, email, credits)
  values (new.id, new.email, 30) -- 3 free remixes for every flow (0045)
  on conflict (id) do nothing
  returning id into v_inserted;

  if v_inserted is not null then
    insert into public.credit_events (user_id, delta, reason)
    values (new.id, 30, 'signup_allocation');
  end if;

  return new;
end;
$$;

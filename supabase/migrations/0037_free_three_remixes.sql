-- Per direct direction: revert the free tier to 3 remixes (the panel-driven bump to
-- 5 is rolled back for now; referral adds +2). New signups only; existing balances
-- are left untouched.
alter table public.profiles alter column credits set default 30;

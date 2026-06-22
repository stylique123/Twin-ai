-- Security hardening from the launch gap-audit.

-- [CRITICAL money] Free auto-edits via RLS bypass.
-- 0006 granted authenticated users a direct INSERT on jobs for type='autoedit',
-- but the credit charge lives ONLY in the enqueue-autoedit edge function. A user
-- with the anon key could insert an autoedit job straight from the browser and get
-- a free render forever. The legit path (api.autoEditTake → enqueue-autoedit) inserts
-- via the SERVICE ROLE, which bypasses RLS — so removing this policy breaks nothing
-- legitimate and closes the leak. enqueue-autoedit is now the ONLY writer of jobs.
drop policy if exists "user enqueue autoedit" on public.jobs;

-- [data integrity] A hard floor so the credit ledger can never go negative even if a
-- future code path forgets the atomic guard. spend_credits already prevents it.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_credits_nonneg') then
    alter table public.profiles add constraint profiles_credits_nonneg check (credits >= 0);
  end if;
end $$;

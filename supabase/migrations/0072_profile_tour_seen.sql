-- First-run product tour: persist "seen" on the ACCOUNT, not in localStorage.
-- The client-side flag replayed the tour on every new browser/device sign-in;
-- this column makes it exactly once per user, everywhere.
alter table public.profiles add column if not exists tour_seen_at timestamptz;

-- Column-level grant, matching the 0001 pattern (dna/display_name/onboarded):
-- the user may flip their own tour flag, nothing else widens.
grant update (tour_seen_at) on public.profiles to authenticated;

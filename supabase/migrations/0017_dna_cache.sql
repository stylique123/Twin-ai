-- Wave 1 (#2) — move the handle cache into a service-role-only table.
--
-- BEFORE: start-dna's "handle cache" reused ANOTHER user's
-- `brand_voices.profile` for the same handle+platform. But that column is
-- USER-WRITABLE (`grant update (profile, ...) to authenticated` in 0002): a user
-- could hand-edit their own profile to anything — garbage, a competitor's voice,
-- a prompt-injection payload — and every later person who scanned that handle
-- silently inherited the tampered profile. It also re-opened the private-account
-- bug by a side door (a handle public last week, private today, still served).
--
-- AFTER: cached syntheses live in `dna_cache`, which only the service role can
-- write (edge functions + worker). A cached profile is therefore always a real
-- synthesis output, never user-tampered. Cross-user cost savings are preserved.

create table if not exists public.dna_cache (
  handle     text not null,
  platform   text not null,
  profile    jsonb not null,
  created_at timestamptz not null default now(),
  primary key (handle, platform)
);

-- RLS on + no policies => anon/authenticated can neither read nor write. The
-- service role bypasses RLS. The explicit revoke is belt-and-suspenders.
alter table public.dna_cache enable row level security;
revoke all on public.dna_cache from anon, authenticated;

-- NICHE BRAIN step 3b — WHAT THE WORLD IS TALKING ABOUT, per niche, daily.
--
-- ⚠️ WHY THIS EXISTS: measured 2026-09-24, corpus-wide "moments" (title words
-- many creators suddenly used) tracked OUR scraper's search seeds, not the
-- world. Real moments — a World Cup, a holiday, a news story, a viral format —
-- come from outside. The worker asks Google (grounded search) once a day per
-- niche bucket and keeps ONLY answers backed by pages Google actually fetched.
--
-- ⚖️ ADDITIVE. One table, written by the worker, read by generate-blueprint.
create table if not exists public.brain_moments (
  bucket     text not null,
  day        date not null,
  moments    jsonb not null default '[]'::jsonb,   -- [{name, when, angle}]
  sources    jsonb not null default '[]'::jsonb,   -- [{title, url}] Google retrieved
  queries    jsonb not null default '[]'::jsonb,
  model      text,
  created_at timestamptz not null default now(),
  primary key (bucket, day)
);
alter table public.brain_moments enable row level security;
drop policy if exists brain_moments_read on public.brain_moments;
create policy brain_moments_read on public.brain_moments for select to authenticated using (true);

-- A SCAN THAT COSTS MONEY MUST LEAVE A TRACE THAT OUTLIVES THE HOUR.
--
-- ⚠️ MEASURED BEFORE BUILDING: `rate_events` holds ZERO rows in production, and
-- that is correct behaviour rather than a bug -- `check_rate_limit` DELETES every
-- row older than its window on each call, by design, to keep the table small. So
-- the only existing limiter on voice scans is 8-per-hour, and the evidence it
-- runs on is destroyed within the hour.
--
-- ⚠️ WHAT THAT LEAVES OPEN: 8/hour is ~5,760 scans a month for one account. Each
-- one spends real money -- Apify for YouTube and Instagram, Gemini for the
-- extraction. There is no ceiling per account anywhere, only a ceiling per hour,
-- so a single account can burn an unbounded budget slowly and never trip a limit.
-- The whole production estate holds 40 brand voices; the abuse capacity is two
-- orders of magnitude above legitimate use.
--
-- ⚖️ APPEND-ONLY, AND NOTHING MAY DELETE FROM IT. A quota whose evidence can be
-- cleaned up is not a quota. This table is deliberately NOT the rate_events
-- pattern: rows accumulate, and the monthly count is a question anyone can ask
-- of the database months later. That is also what makes the ceiling auditable
-- when a creator disputes it.
create table if not exists public.scan_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- ⚖️ WHAT WAS SCANNED, so a support question ("why did this count?") has an
  -- answer. Never the creator's tokens or cookies -- only the public handle.
  handle text,
  platform text,
  -- ⚠️ WHETHER THIS SCAN COULD SPEND MONEY, RECORDED AT THE MOMENT IT RAN rather
  -- than re-derived later from a platform list that will drift. A manual setup
  -- spends nothing and must never consume somebody's ceiling.
  billable boolean not null default true,
  created_at timestamptz not null default now()
);

-- The one query the ceiling asks, made fast: "how many billable scans has this
-- user run since the start of the month".
create index if not exists scan_events_user_created_idx
  on public.scan_events (user_id, created_at desc)
  where billable;

alter table public.scan_events enable row level security;

-- ⚖️ THE CREATOR MAY READ THEIR OWN, AND NOBODY MAY WRITE FROM A BROWSER. The
-- count is shown to them when they hit the ceiling, so hiding it would make the
-- refusal unarguable. Writing is service-role only: a client that could insert
-- its own scan events could also insert zero of them.
drop policy if exists scan_events_owner_read on public.scan_events;
create policy scan_events_owner_read on public.scan_events
  for select using (auth.uid() = user_id);

revoke insert, update, delete on public.scan_events from anon, authenticated;

-- ⚠️ NO DELETE POLICY AND NO UPDATE POLICY EXIST ON PURPOSE. An append-only
-- ledger with an UPDATE path is an append-only ledger in name only.

-- NOTHING WAS USING THE PRODUCT ON A SCHEDULE, SO NOTHING NOTICED.
--
-- ⚠️ THE OUTAGE THIS EXISTS FOR LASTED TWO DAYS. `generate-blueprint` could not
-- boot from 2026-09-06 20:01 — zero scripts in 48 hours. The deploy reported
-- success. Every CI check was green. The first report came from a person
-- trying to use the product. Every guard we had asked a question about the
-- CODE; none asked whether the thing still works.
--
-- ⚖️ THE ACCOUNT IS SYNTHETIC AND ITS STORE IS FROZEN, AND THAT IS THE WHOLE
-- DESIGN. A real creator's store changes — a new transcript, an answered
-- question, a scan refresh — and then a strange script is as likely to be
-- their data moving as Twin breaking. A monitor whose failures have two
-- possible explanations is a monitor nobody trusts at 3am.

-- ── 1. THE FLAG, AND IT HAS READERS ───────────────────────────────────────
--
-- ⚠️ TWENTY-FOUR GENERATIONS A DAY QUIETLY BECOME A THIRD OF THE LEARNING
-- DATA. Two variants an hour is 48 rows a day against a corpus the QA readers
-- sample 2000 rows deep. Left unflagged, the heartbeat would teach Twin its
-- own synthetic voice — and the flag would be discovered as a bias months
-- later, in the outputs, which is the most expensive place to find it.
--
-- ⚖️ ON `generations`, NOT DERIVED FROM THE ACCOUNT AT READ TIME. The corpus
-- readers are two standalone scripts pulling flat rows; a join they must each
-- remember to write is a join one of them eventually forgets. The column is
-- what they can actually filter on, and `check_heartbeat_excluded_from_corpus`
-- fails the build if either stops filtering.
alter table public.generations
  add column if not exists is_heartbeat boolean not null default false;

-- Partial, because the interesting set is the tiny one. A full index here
-- would be almost entirely `false` rows and earn nothing.
create index if not exists generations_is_heartbeat_idx
  on public.generations (created_at desc) where is_heartbeat;

-- ── 2. THE PAGER'S MEMORY ─────────────────────────────────────────────────
--
-- ⚠️ WITHOUT DURABLE STATE THE POLICY CANNOT BE "PAGE ONCE". A run that cannot
-- remember it already paged pages every time, and 48 pages a day is how a
-- pager gets muted. A muted pager is worse than none: it is the same silence,
-- with the belief that somebody is watching.
create table if not exists public.heartbeat_page_state (
  -- One row, enforced. Two rows would mean two independent opinions about
  -- whether we are currently broken, and the quieter one would win by racing.
  id boolean primary key default true check (id),
  failing boolean not null default false,
  -- NULL means "never paged", which is NOT the same as "paged long ago" — the
  -- policy pages on null rather than staying silent on missing state.
  last_paged_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.heartbeat_page_state enable row level security;
revoke all on public.heartbeat_page_state from anon, authenticated;

-- ── 3. WHAT THE DIGEST READS ──────────────────────────────────────────────
--
-- Append-only. A finding that can be updated is a finding that can be quietly
-- softened, and the daily digest's whole value is that it says what happened
-- rather than what somebody later decided it meant.
create table if not exists public.heartbeat_findings (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  mode text not null check (mode in ('reference', 'idea')),
  kind text not null check (kind in (
    'length_outside_band',
    'claim_restriction_violated',
    'wrong_voice',
    'sponsored_product_spoken_as_lived',
    'duration_not_measured'
  )),
  detail text not null,
  generation_id uuid
);

create index if not exists heartbeat_findings_at_idx on public.heartbeat_findings (at desc);

alter table public.heartbeat_findings enable row level security;
revoke all on public.heartbeat_findings from anon, authenticated;

-- 0105 — PERFORMANCE FEEDBACK: the log §7b says to start now.
--
-- "START LOGGING NOW, even though the feature is late. Video → outcome rows
--  must be written from the first render onward. You cannot recover history you
--  did not record, and this is the only real moat in the document."
--
-- ── WHY A LOG, WHEN `posts` ALREADY HAS views/likes/comments ──────────────
--
-- Those three are SCALARS, and updating one destroys the previous value. That
-- is not a storage detail:
--
--   views at 24h and views at 30d are different facts about the same video, and
--   the difference between them is most of the signal.
--
-- A single mutable number answers "how many views does this have?" and can
-- never answer "how fast did it get them?", "did it keep going?" or "was this
-- read before or after the creator cross-posted it?". Those columns stay where
-- they are — plenty of UI reads them — but they are a CACHE of the latest
-- reading, and this table is the record.
--
-- APPEND-ONLY, ENFORCED. A measurement that can be rewritten is not a
-- measurement, and the same reasoning already governs `edit_director_decisions`
-- and the review overlay: evidence that can be edited afterwards is not
-- evidence.
--
-- ── FIVE CLAIM TYPES, AND THE ONE RULE MADE STRUCTURAL ────────────────────
--
-- §7b's absolute rule is "never conclude 'this hook caused performance' from
-- one successful video", and it calls that failure the same as
-- "Attention Score 9.6" wearing a different costume. A rule like that never
-- ships broken as a DECISION — it ships as an absent check on a hurried
-- Tuesday. So it is a CHECK constraint: a `correlation` row without a sample
-- size, or with n=1, cannot be inserted at all.
--
-- The floor is 2, and that is the ONLY number this migration is entitled to
-- assert: it is the point below which the word "correlation" is definitionally
-- wrong. §7b says "≥N videos, stated N" and does not fix N, because the honest
-- N depends on the effect being claimed and nobody has the data to choose it
-- yet. Inventing a bigger one here would be the confident-number-from-nothing
-- this section exists to prevent.

-- ---------------------------------------------------------------------------
-- 1. The observation log
-- ---------------------------------------------------------------------------
create table if not exists public.post_outcome_observations (
  id bigserial primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  -- A CLOSED list. A free-text metric name is how "engagement" appears and
  -- stops being comparable to anything — including to itself, six months on.
  metric text not null check (metric in (
    'views', 'likes', 'comments', 'shares', 'saves', 'watch_time_ms', 'retention_pct_milli',
    'clicks', 'leads', 'sales', 'revenue_minor'
  )),
  -- Integer, in the units the metric's own NAME declares (`_ms`, `_milli`,
  -- `_minor`) — the same rule every other quantity in this system follows, so
  -- no float formatting can differ between two processes.
  value bigint not null check (value >= 0),
  -- WHEN THE NUMBER WAS TRUE, not when the row was written. A backfilled
  -- reading of last week is last week's fact, and ordering by `created_at`
  -- would silently reorder it.
  observed_at timestamptz not null,
  -- How it arrived. A creator typing what they saw is not an API read, and a
  -- consumer is entitled to decline to build a correlation out of one.
  source text not null check (source in ('platform_api', 'manual', 'import')),
  created_at timestamptz not null default now()
);

-- The query this table exists to serve: one video's readings, in time order.
create index if not exists post_outcome_observations_post_idx
  on public.post_outcome_observations (post_id, metric, observed_at);
create index if not exists post_outcome_observations_owner_idx
  on public.post_outcome_observations (owner_id, observed_at desc);

-- Re-reading the same metric at the same instant from the same source is a
-- duplicate write, not a second fact. Two readings a minute apart are two
-- facts, and both are kept.
create unique index if not exists post_outcome_observations_dedup
  on public.post_outcome_observations (post_id, metric, observed_at, source);

create or replace function public.post_outcome_observations_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'post_outcome_observations is append-only — a measurement that can be rewritten is not a measurement';
end;
$$;
drop trigger if exists trg_post_outcome_observations_append_only on public.post_outcome_observations;
create trigger trg_post_outcome_observations_append_only
  before update or delete on public.post_outcome_observations
  for each row execute function public.post_outcome_observations_append_only();
revoke all on function public.post_outcome_observations_append_only() from public, anon, authenticated;

alter table public.post_outcome_observations enable row level security;
drop policy if exists post_outcome_observations_read on public.post_outcome_observations;
create policy post_outcome_observations_read on public.post_outcome_observations
  for select to authenticated using (owner_id in (select public.workspace_peers()));
drop policy if exists post_outcome_observations_insert on public.post_outcome_observations;
create policy post_outcome_observations_insert on public.post_outcome_observations
  for insert to authenticated with check (owner_id = (select auth.uid()));

revoke all on public.post_outcome_observations from public, anon;
grant select, insert on public.post_outcome_observations to authenticated;
grant usage on sequence public.post_outcome_observations_id_seq to authenticated;
grant all on public.post_outcome_observations to service_role;

-- ---------------------------------------------------------------------------
-- 2. Claims, which are NOT observations
-- ---------------------------------------------------------------------------
-- Kept apart on purpose. An observation is a number a platform reported; a
-- claim is something the product says to a person. Storing them in one table
-- with optional columns is how they end up rendered in one sentence, and
-- "list-format videos average higher watch time (n=6)" and "the hook may be
-- contributing" are not the same kind of statement however similar they look.
create table if not exists public.dna_claims (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  claim_type text not null check (claim_type in (
    'correlation', 'hypothesis', 'confirmed_preference', 'business_outcome', 'platform_outcome'
  )),
  statement text not null check (length(btrim(statement)) between 1 and 500),
  -- How many videos the claim was drawn from. NULL is meaningful: it means the
  -- claim is not the kind that has one.
  sample_size integer check (sample_size is null or sample_size >= 0),
  -- What a business outcome is attributed BY — a UTM, a promo code, a CRM id.
  attribution text,
  created_at timestamptz not null default now(),

  -- THE ABSOLUTE RULE, AS A CONSTRAINT. n=1 is never a correlation, and the N
  -- is always stated. This is the line §7b spends a paragraph on, and the only
  -- form of it that survives a hurried Tuesday.
  constraint dna_claims_correlation_needs_sample check (
    claim_type <> 'correlation' or (sample_size is not null and sample_size >= 2)
  ),
  -- A hypothesis is UNTESTED by definition. A sample size on one would let it
  -- render beside a correlation with the same furniture, and the reader would
  -- have no way to tell which was evidence.
  constraint dna_claims_hypothesis_is_untested check (
    claim_type <> 'hypothesis' or sample_size is null
  ),
  -- Attributed, never inferred. An unattributed sale next to a video is a
  -- coincidence with a timestamp.
  constraint dna_claims_business_needs_attribution check (
    claim_type <> 'business_outcome' or length(btrim(coalesce(attribution, ''))) > 0
  )
);

create index if not exists dna_claims_owner_idx
  on public.dna_claims (owner_id, created_at desc);

alter table public.dna_claims enable row level security;
drop policy if exists dna_claims_read on public.dna_claims;
create policy dna_claims_read on public.dna_claims
  for select to authenticated using (owner_id in (select public.workspace_peers()));

-- NO client INSERT/UPDATE/DELETE. A claim is something the PRODUCT says about a
-- creator's videos; a client that could write one could put a sentence in the
-- product's mouth. Writers are service-role only.
revoke all on public.dna_claims from public, anon;
grant select on public.dna_claims to authenticated;
grant all on public.dna_claims to service_role;

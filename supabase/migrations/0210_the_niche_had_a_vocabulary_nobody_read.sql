-- THE NICHE HAD A VOCABULARY AND NOBODY READ IT.
--
-- ⚠️ `nicheVocabularies` HAS BEEN BUILT, TESTED AND CALLED BY NOTHING.
-- `check_symbol_readers` registers it as knowingly-unread and names the exact
-- condition: "The consumer is the prompt assembler ... WHAT WOULD CHANGE THIS:
-- the prompt assembler calling nicheVocabularies. DELETE this entry then; if it
-- never lands, delete the module." This table is what lets that land.
--
-- ⚠️ THE YIELD WAS MEASURED BEFORE ANY OF THIS WAS WRITTEN, because a cache for
-- an empty answer is a table nobody needs. Terms clearing BOTH gates
-- (>= 10 distinct creators, present in exactly ONE bucket), per bucket, on the
-- live corpus 2026-09-14:
--
--   business        35   (969 creators)
--   food            16   (304)
--   entertainment   13   (659)
--   tech             9   (499)
--   beauty_fashion   7   (442)
--   creator          0   (8)
--   health           0   (82)
--
-- ⚠️⚠️ AND THE GROUPING IS THE WHOLE FINDING. Grouped by the raw `niche` TEXT,
-- business yields ZERO and several niches pass the distinctiveness gate for a
-- spurious reason — a term looks unique to one niche because only one creator's
-- bespoke free-text label contains those words. Bucketed, business goes 0 -> 35.
-- The facet vector was not a nicety; it was the prerequisite, exactly as the
-- registry entry recorded.
--
-- ⚖️ A CACHE, BECAUSE DISTINCTIVENESS IS NOT A PER-CREATOR QUESTION.
-- A term is terminology because it is distinctive, and distinctiveness is a
-- fact about the OTHER buckets — so the answer cannot be computed from one
-- creator's cohort, and computing it corpus-wide on every generation would put
-- a ~6,000-row read in front of a creator who is waiting for a script.
--
-- ⚖️ WEEKLY, WHICH IS THE LIFETIME THE STANDARD ASSIGNS. Cohort rankings are
-- weekly; this is the same kind of artefact and gets the same expiry. Staleness
-- is judged from `computed_at` by the reader, so a row that stops refreshing
-- goes quiet rather than going wrong.
--
-- ⚖️ AND ZERO TERMS IS A ROW, NOT A MISSING ROW. `creator` and `health` yield
-- nothing today. Storing that as an empty list records "we looked and there was
-- nothing"; leaving the row out would be indistinguishable from "the refresh
-- never ran", and those need opposite responses.

create table if not exists public.niche_vocabulary (
  -- The coarse bucket, not the creator's free-text niche. Seven values today;
  -- deliberately not an enum, because a new bucket must not need a migration.
  bucket text primary key,
  -- ⚠️ THE TERMS AND THEIR STRENGTH TOGETHER. `creators` is the discriminator
  -- the gate used (frequency cannot tell a term from a name: vogue 91 cards vs
  -- garlic 97, while creator counts are 4 against 23). A consumer that renders
  -- the term and drops the count turns evidence back into an instruction.
  terms jsonb not null default '[]'::jsonb,
  -- How many distinct creators the bucket held when this was computed. Lets a
  -- reader say "35 terms from 969 creators" rather than asserting a bare list.
  creators_in_bucket integer not null default 0,
  computed_at timestamptz not null default now(),
  constraint niche_vocabulary_terms_is_array check (jsonb_typeof(terms) = 'array'),
  constraint niche_vocabulary_creators_nonneg check (creators_in_bucket >= 0)
);

comment on table public.niche_vocabulary is
  'Per-bucket niche terminology, refreshed weekly. Written by the worker''s '
  'scrape_dna pass, read by generate-blueprint. An empty terms array means '
  '"we looked and nothing cleared the gates", which is not the same as a '
  'missing row meaning "the refresh never ran".';

-- ⚠️ SERVICE ROLE ONLY. This is corpus-derived terminology about OTHER
-- creators; a creator has no business reading another bucket's vocabulary, and
-- nothing in the client needs it. The prompt assembler runs as service_role.
revoke all on public.niche_vocabulary from public;
revoke all on public.niche_vocabulary from anon;
revoke all on public.niche_vocabulary from authenticated;
grant select, insert, update on public.niche_vocabulary to service_role;

alter table public.niche_vocabulary enable row level security;
-- No policies: RLS on with no policy denies every non-service caller outright,
-- which is the intent. service_role bypasses RLS.

-- WHAT CAME OFF THE FILE, KEPT APART FROM WHAT THE MODEL SAID.
--
-- ⚠️ SEPARATE COLUMNS, NOT A MERGE INTO `visual_profile`. 0152 split the visual
-- pass from the content pass so a card could say whether a claim came from
-- someone SAYING so or a frame SHOWING so. This is a third provenance and the
-- same argument applies with more force: `visual_profile` is a MODEL'S READING
-- of eight stills, and these are ARITHMETIC over every frame in the file. A
-- surface that says "this reference cuts every 1.8 seconds" must be able to say
-- which of those two produced the number, because only one of them can be wrong
-- about what it saw.
--
-- ⚖️ WHY IT EXISTS: THE ONLY VISUAL READER WE HAD WAS QUOTA-BOUND. Measured
-- 2026-09-01 — of 52 failed `assess_reference` jobs in 24h, 52 were
-- RESOURCE_EXHAUSTED on Gemini's daily per-model quota, across BOTH TikTok and
-- YouTube, while 239 other jobs on the same platforms finished fine. The
-- download worked; the reading budget ran out. These numbers cannot be
-- rate-limited, so on the next such day a creator still learns something true.

alter table public.reference_content_profiles
  -- The whole TierZeroProfile as one document. Every field is nullable and null
  -- means NOT MEASURED, never zero — a reference with no cuts and a reference
  -- nobody scanned are opposite facts, and a `0` meaning both is how a surface
  -- starts claiming a static video where it has no evidence at all.
  add column if not exists tier_zero_profile jsonb,
  -- ⚠️ NOT DERIVABLE FROM `tier_zero_profile IS NULL`, for exactly the reason
  -- 0152 gives about `visual_pass_ran`. "opencv is not installed on this box",
  -- "ffprobe could not read the container" and "the bridge ran and found
  -- nothing" are three different findings, and the first two are facts about
  -- US while the third is a fact about the VIDEO. Collapsing them into one null
  -- would let an infrastructure outage be reported as a property of the library.
  add column if not exists tier_zero_failure_code text,
  -- Stamped ONLY when a reading was produced. A later run selects on its
  -- absence, so stamping it on a failure would retire a reference that has
  -- never actually been measured — the same trap `visual_assessed_at` documents.
  add column if not exists tier_zero_measured_at timestamptz;

-- ⚖️ A CLOSED VOCABULARY, CHECKED. A typo'd code silently creates a category
-- that every later group-by reports as its own cohort — which is how "why do
-- Tier 0 readings fail" becomes unanswerable from the table that recorded them.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reference_content_profiles_tier_zero_failure_known'
  ) then
    alter table public.reference_content_profiles
      add constraint reference_content_profiles_tier_zero_failure_known
      check (tier_zero_failure_code is null
             or tier_zero_failure_code in (
               'CAPABILITIES_UNAVAILABLE',
               'PROBE_FAILED',
               'BRIDGE_FAILED',
               'TIMED_OUT',
               'NO_SIGNAL'));
  end if;
end $$;

-- ⚠️ A READING AND A FAILURE ARE MUTUALLY EXCLUSIVE, AND THE DATABASE SAYS SO.
-- The worker returns exactly one of them; a row carrying both would mean the
-- write, not the pass, was wrong — and that is precisely the bug a later reader
-- would resolve by silently preferring one field over the other.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reference_content_profiles_tier_zero_coherent'
  ) then
    alter table public.reference_content_profiles
      add constraint reference_content_profiles_tier_zero_coherent
      check (tier_zero_profile is null or tier_zero_failure_code is null);
  end if;
end $$;

-- ⚠️ AND A STAMP WITHOUT A READING IS A LIE ABOUT HAVING LOOKED. `measured_at`
-- is what a later run trusts to skip a reference; allowing it beside a failure
-- would permanently retire references nobody ever successfully measured.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reference_content_profiles_tier_zero_stamp_earned'
  ) then
    alter table public.reference_content_profiles
      add constraint reference_content_profiles_tier_zero_stamp_earned
      check (tier_zero_measured_at is null or tier_zero_profile is not null);
  end if;
end $$;

-- "Which references have real numbers, and which still need a pass." Partial,
-- because the answer for nearly every row today is "not yet" and an index over
-- thousands of nulls earns nothing.
create index if not exists reference_content_profiles_tier_zero_measured_idx
  on public.reference_content_profiles (tier_zero_measured_at)
  where tier_zero_measured_at is not null;

comment on column public.reference_content_profiles.tier_zero_profile is
  'TierZeroProfile: cuts, cutsPerMinute, medianShotSec, faceCoveragePct, speechPct — measured off the FILE by editor_visual.py, no model involved. Every field nullable; null means NOT MEASURED, never zero. speechPct is currently always null: the VAD runs in the transcript pass, against audio this pass never holds.';
comment on column public.reference_content_profiles.tier_zero_failure_code is
  'Why no reading was produced. CAPABILITIES_UNAVAILABLE and PROBE_FAILED are facts about our box; NO_SIGNAL is a fact about the video. Never collapse them.';
comment on column public.reference_content_profiles.tier_zero_measured_at is
  'Stamped ONLY when a reading was produced, so a later run can select on its absence and retry.';

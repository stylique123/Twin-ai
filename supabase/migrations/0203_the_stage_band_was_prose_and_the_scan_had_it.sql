-- 0203 — ONE OF THE FOUR MISSING OUTCOME DIMENSIONS BECOMES A VALUE.
--
-- ⚠️ 0191 NAMED THE GAP PRECISELY AND DECLINED TO GUESS AT IT. Its header lists
-- `door`, `hook_shape`, `angle_type` and `creator_stage_band` as existing "only
-- as prose inside the prompt text", and refuses to add columns nothing writes:
-- "a column nobody writes is the same defect as a field nobody reads, pointed
-- the other way."
--
-- ⚖️ SO THIS ADDS EXACTLY ONE, THE ONE THAT NEEDS NOTHING NEW. 0191 said
-- `creator_stage_band` "needs a follower count at generation time. The scan has
-- one; it is not carried into the request." That framing assumed the client
-- must send it. It does not: `generate-blueprint` already loads the creator's
-- `brand_voices` row to build the prompt, and the follower count is on it. The
-- fact was in the handler's hands the whole time.
--
-- ⚠️ AND THE OTHER THREE STAY OUT, FOR THE REASONS 0191 GAVE:
--   door        the client genuinely does not send it. `readEntryDoor` exists
--               with a mutation-tested clamp, so this is a request-shape change
--               across web + edge, not a read the handler can already do.
--   hook_shape  nothing classifies a WRITTEN hook. The caption classifier is
--               explicitly not a hook classifier -- its own header refuses that
--               name -- and pointing it at a spoken opening line would put an
--               inference where a reader expects an observation.
--   angle_type  no taxonomy exists. Inventing one here freezes a guess into
--               months of rows, which is the one thing a frozen-context table
--               must never do.
--
-- ⚠️ MEASURED COVERAGE BEFORE BUILDING, 2026-09-13: of 53 brand_voices, 41
-- carry a `followers` key and only 20 carry a non-zero value. So this column
-- will be NULL on roughly three generations in five, and that is the honest
-- outcome rather than a defect -- null means the scan never produced a follower
-- count, which is a different fact from "a small account".
alter table public.generation_outcomes
  add column if not exists creator_stage_band text;

-- ⚠️ THE BANDS ARE THE ONES `stageBandOf` ALREADY CUTS, and the CHECK exists so
-- a fifth band cannot arrive from a drifting mirror without a migration saying
-- so. NULL stays legal and means "not known" -- never a band.
alter table public.generation_outcomes
  drop constraint if exists generation_outcomes_stage_band_known;
alter table public.generation_outcomes
  add constraint generation_outcomes_stage_band_known check (
    creator_stage_band is null
    or creator_stage_band in ('under_1k', '1k_10k', '10k_100k', 'over_100k')
  );

comment on column public.generation_outcomes.creator_stage_band is
  'The creator''s follower band at generation time, cut by stageBandOf from the '
  'brand_voices follower count. NULL means the scan never produced a follower '
  'count -- which is a different fact from a small account, and must not be '
  'aggregated as one. Measured 2026-09-13: 20 of 53 voices carry a usable count.';

-- A ZERO IS THE CHEAPEST SIGNAL WE HAVE, AND THE ONE WE WERE BLIND TO.
--
-- ⚠️ WHY THIS FILE EXISTS. On 2026-08-30 five separate defects were found in one
-- night, and every one of them fell to the same move: asking "how many?" instead
-- of reading a description.
--
--   · `download_route` had THREE enum values and one of them had never once been
--     written. The residential-proxy rung was fully built -- argv, sticky
--     session, an enum entry in 0150 -- and had run 0 times in 780 references,
--     while 48 of those references died on the exact failure it defeats.
--   · A failed fetch was recorded as a SUCCESSFUL job. `count(*) where
--     status = 'failed'` reported 227 when the truth was 381.
--   · Three code comments described systems that did not exist: an accordion
--     built once out of eleven times, a population measured six days earlier,
--     and a column loaded everywhere and read nowhere.
--
-- None of those needed cleverness. They needed somebody to type a COUNT. The
-- problem was never difficulty -- it was that nobody thought to ask, because a
-- confident sentence sat where a number should have been.
--
-- ⚖️ SO THIS IS ONE PASTE, NOT A HABIT. CI cannot run it: the build has no
-- production credentials, and giving it any would be a worse trade than the
-- blindness. What it CAN be is a single query that answers every "how many"
-- question at once, so the check costs one command instead of an act of
-- memory. Run it through the Supabase MCP, or psql, and read the verdict column.
--
-- ⚖️ A ZERO IS NOT AUTOMATICALLY A BUG, AND THIS FILE MUST NOT PRETEND
-- OTHERWISE. Several rows below are EXPECTED to be zero right now, for reasons
-- named in `why`. The verdict distinguishes them: LOOK means a zero that has no
-- innocent explanation left. Marking a row `expected_zero` is a DEBT in the same
-- sense the counter registry uses the word -- it is a claim someone made, and it
-- should be revisited when the stated precondition changes.

with

-- ── STRUCTURAL ZEROS: a value space where some value has never been written ──

download_routes as (
  select
    'download_route: residential_proxy' as check_name,
    (select count(*) from public.reference_content_profiles where download_route = 'residential_proxy') as observed,
    'was 0 of 780 for the life of the feature; #620 made escalation possible' as why,
    -- ⚖️ NOT "LOOK" UNTIL SOMETHING HAS RUN. A rung that is never REACHED cannot
    -- report a value, so a zero here means nothing until assess_reference has
    -- processed a job under the post-#620 worker. The traffic row below is what
    -- makes this row readable at all -- check it first.
    'expected_zero_until_traffic' as expectation
),

-- ── TRAFFIC: without this, every zero below is uninterpretable ──────────────
--
-- ⚠️ READ THIS ROW FIRST. On 2026-08-31 the newest assess_reference job was
-- SEVEN DAYS OLD. Every downstream zero looked alarming and meant nothing: the
-- pipeline had no input. A zero with no traffic behind it is not evidence of
-- breakage, and reporting it as such is the same error as the sentences this
-- file exists to replace, pointing the other way.
traffic as (
  select
    'assess_reference jobs in the last 24h' as check_name,
    (select count(*) from public.jobs where type = 'assess_reference' and created_at > now() - interval '24 hours') as observed,
    'gates the interpretation of every other row; 0 means nothing downstream is readable' as why,
    'informational' as expectation
),

outcome_field as (
  select
    'assess_reference results carrying an outcome discriminator' as check_name,
    (select count(*) from public.jobs where type = 'assess_reference' and result ? 'outcome') as observed,
    '#619 added it to all four exits; 0 means no job has run under the new code' as why,
    'expected_zero_until_traffic' as expectation
),

priced_lessons as (
  select
    'creator_knowledge rows carrying a cost' as check_name,
    (select count(*) from public.creator_knowledge where cost is not null) as observed,
    '#614 asks for it; whether the model FILLS it is the unmeasured extractor yield' as why,
    'expected_zero_until_traffic' as expectation
),

named_consensus as (
  select
    'creator_knowledge rows naming a consensus' as check_name,
    (select count(*) from public.creator_knowledge where consensus is not null) as observed,
    'same call as cost; both come from the same extraction pass' as why,
    'expected_zero_until_traffic' as expectation
),

affiliate_addresses as (
  select
    'product_entities carrying an affiliate_url' as check_name,
    (select count(*) from public.product_entities where affiliate_url is not null) as observed,
    '#621 shipped the box that writes it; the writer-side READER is still open' as why,
    'expected_zero_until_traffic' as expectation
),

-- ── POPULATION GATES: a threshold somebody wrote down, re-asked ─────────────
--
-- ⚖️ THE POINT IS THE RE-ASKING. `CLAIM_STOP_MIN_POPULATION = 25` was weighed
-- against a six-day-old count of ONE. The number had not changed much; that it
-- had not been RE-CHECKED is the defect this row closes.
claim_stop as (
  select
    'product_entities live rows (claim stop needs 25)' as check_name,
    (select count(*) from public.product_entities where archived_at is null) as observed,
    'below 25, mayGenerateClaims stays unwired; 100% of a tiny n is not a rate' as why,
    'threshold_25' as expectation
),

-- ── RECONCILIATION: two counts that must agree, or the gap is the finding ───

visible_failures as (
  select
    'assess_reference failures VISIBLE at the queue level' as check_name,
    (select count(*) from public.jobs where type = 'assess_reference' and status = 'failed') as observed,
    'the number a naive dashboard reports' as why,
    'informational' as expectation
),

invisible_failures as (
  select
    'assess_reference failures INVISIBLE at the queue level' as check_name,
    (select count(*) from public.jobs
      where type = 'assess_reference' and status = 'done' and result->>'error' is not null) as observed,
    -- ⚠️ THE DEFECT #619 CLOSED. These are `status = done` with an error inside
    -- the result. Nonzero here is CORRECT and expected -- the swallow is
    -- deliberate, because a deleted video is a property of the library rather
    -- than a transient job failure. What was wrong was that nothing could COUNT
    -- them: 227 was reported where 381 was true, understating by 40%.
    'nonzero is fine and expected; the bug was that this number was unreachable' as why,
    'informational' as expectation
),

orphan_profiles as (
  select
    'assess_reference jobs whose URL has NO profile row' as check_name,
    (select count(distinct j.result->>'url') from public.jobs j
      where j.type = 'assess_reference' and j.status = 'done' and j.result->>'url' is not null
        and not exists (
          select 1 from public.reference_content_profiles p where p.url = j.result->>'url')) as observed,
    -- Measured 2026-08-30 at 780 jobs / 780 rows / 0 orphans, which RETIRED a
    -- standing note claiming one row had silently failed to persist. Kept as a
    -- row because "not reproducible once" is weaker than "checked again".
    'must be 0; a gap means a job reported success and stored nothing' as why,
    'must_be_zero' as expectation
),

all_checks as (
  select * from traffic
  union all select * from download_routes
  union all select * from outcome_field
  union all select * from priced_lessons
  union all select * from named_consensus
  union all select * from affiliate_addresses
  union all select * from claim_stop
  union all select * from visible_failures
  union all select * from invisible_failures
  union all select * from orphan_profiles
)

select
  check_name,
  observed,
  case
    when expectation = 'must_be_zero'   and observed > 0 then 'LOOK'
    -- ⚖️ A PASSING HARD CHECK MUST SAY SO. The first version of this CASE fell
    -- through to `informational` here, which made a requirement that was
    -- actually MET indistinguishable from a row with no bar at all -- the same
    -- flattening of meaning this whole file exists to undo.
    when expectation = 'must_be_zero'   then 'zero, as required'
    when expectation = 'threshold_25'   and observed >= 25 then 'THRESHOLD REACHED'
    when expectation = 'threshold_25'   then 'below threshold, correctly gated'
    -- ⚖️ THE ONE THAT TURNS INTO A REAL SIGNAL. A zero here is innocent only
    -- while nothing has run. Once traffic exists, an unwritten value means a
    -- path that is reached and never taken -- exactly #620's defect.
    when expectation = 'expected_zero_until_traffic' and observed = 0
         and (select observed from traffic) = 0 then 'no traffic yet, uninterpretable'
    when expectation = 'expected_zero_until_traffic' and observed = 0 then 'LOOK — traffic exists and this never fired'
    when expectation = 'expected_zero_until_traffic' then 'observed at least once'
    else 'informational'
  end as verdict,
  why
from all_checks;

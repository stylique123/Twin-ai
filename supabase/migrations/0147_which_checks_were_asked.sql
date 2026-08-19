-- WHICH CHECKS PASSED, AND WHICH COULD NOT BE ASKED.
--
-- ⚠️ NINE DECIDABLE CHECKS EXIST AND SEVEN OF THEM CAN RUN HERE. The other two —
-- `all_slots_filled` and `no_unsupported_claim` — compare the script against the
-- content resolved for each beat, and `generate-blueprint` has no such record:
-- it hands the container's beats to the model as prose and lets it fill them
-- from a knowledge block.
--
-- ⚖️ SO THE COLUMN STORES `not_run` FOR THOSE TWO RATHER THAN OMITTING THEM. A
-- check that vanished from a report is indistinguishable from one that passed,
-- and the founding defect of this product is a script that reads beautifully and
-- says nothing — precisely what those two checks exist to catch. Recording the
-- gap is what makes it a worklist instead of an oversight.
--
-- ⚠️ OBSERVE ONLY, LIKE 0145 BESIDE IT. Nothing is blocked or refunded on this.
-- The checks have never been measured against production traffic, and a gate
-- built on an unmeasured rule refuses good work — which is the more expensive
-- error when a creator has already paid and waited.
alter table public.generations
  add column if not exists script_report jsonb;

comment on column public.generations.script_report is
  'Observe-only decidable-check report on the shipped script: {failed[], not_run[], passed}. not_run names checks this caller cannot ask, never a pass. Never gates a generation.';

-- A FRAMES PASS THAT FAILED MUST SAY SO WHERE THE REFERENCE LIVES.
--
-- ⚠️ TODAY IT SAYS SO NOWHERE DURABLE. runVisualPass returns a failure_code --
-- IP_BLOCKED, NO_FRAMES_SAMPLED, FFMPEG_MISSING, VISUAL_MODEL_FAILED -- and
-- assessReference writes the visual columns ONLY when the pass ran. So a pass
-- that tried and could not leaves frames_sampled null, which is the same row a
-- reference nobody looked at has. The code survives only in the job's result
-- JSON, keyed by job rather than by reference.
--
-- ⚖️ WHICH MAKES THE PILOT'S ATTRITION TABLE UNREADABLE, and the attrition table
-- is the pilot's output. Eight references coming back with nothing would report
-- looked_at 0 / produced_claims 0 -- identical whether ffmpeg was missing, the
-- downloads were blocked, or the jobs never ran at all. Those have three
-- different next actions, and the decision they feed is whether to spend the
-- other 332.
--
-- ⚠️ THREE STATES, AND THE COLUMN EXISTS TO KEEP THEM THREE:
--   visual_failure_code null AND frames_sampled null  -> nobody looked
--   visual_failure_code set                           -> looked, could not see
--   frames_sampled set                                -> looked, saw something
-- A row can never be both: the check below refuses the contradiction rather
-- than trusting every future writer to avoid it.

alter table public.reference_content_profiles
  add column if not exists visual_failure_code text;

-- ⚖️ A SUCCESS AND A FAILURE ARE NOT BOTH TRUE. Without this, a re-run that
-- succeeded after an earlier failure could leave the old code beside the new
-- frames and every later count would have to guess which one to believe.
alter table public.reference_content_profiles
  drop constraint if exists reference_content_profiles_visual_outcome_is_one_thing;
alter table public.reference_content_profiles
  add constraint reference_content_profiles_visual_outcome_is_one_thing
  check (visual_failure_code is null or frames_sampled is null);

create index if not exists reference_content_profiles_visual_failure_idx
  on public.reference_content_profiles (visual_failure_code)
  where visual_failure_code is not null;

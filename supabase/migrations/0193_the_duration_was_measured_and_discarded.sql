-- 0193 — PACING NEEDED A DURATION, AND THE DURATION WAS BEING MEASURED AND
-- THROWN AWAY ON EVERY ASSESSMENT.
--
-- ⚠️ MEASURED BEFORE BUILDING, 2026-09-09. `pacing_band` is the one Layer C
-- field of the six that exists nowhere — the other five are all extracted and
-- `observed` on ~1,000 references. Before adding a column for it, the question
-- was whether pacing could be COMPUTED from what is already stored. It cannot:
--
--   · `transcripts` holds 395 rows with `duration_sec`, and joins to
--     `reference_content_profiles` on ZERO rows. Checked on `source_url`, on
--     `url_key`, and on both normalised for scheme and `www.` — the assessed
--     corpus and the transcribed corpus are disjoint sets of videos.
--   · Beat timings are partial: of 5,238 stored beats, 2,524 carry `startSec`
--     (48%) and 989 carry `endSec` (19%). The median `max(endSec)` per
--     reference is 22 seconds, which is not a video length — it is where the
--     timing stopped being recorded. Dividing by it would overstate pacing on
--     every row and do so invisibly.
--   · Inter-beat spacing IS computable where every beat is timed, and that is
--     134 references — 7.6% of the corpus — with an eleven-fold spread from
--     1.5 beats/min at p10 to 16.5 at p90. A band drawn from that would be a
--     confident sentence over noise.
--
-- ⚖️ SO THIS ADDS THE INPUT, NOT THE ANSWER. `probeDurationSec` already runs
-- inside `sampleFrames` on every visual pass, to build the frame schedule, and
-- its result died in that function. 701 references went through that pass and
-- had their length measured and discarded. Keeping it costs one column and
-- makes pacing computable for every assessment from here on.
--
-- ⚠️ AND IT BACKFILLS NOTHING, WHICH IS THE HONEST OUTCOME. The 1,773 rows
-- already assessed keep a NULL duration forever: the video was measured on a
-- machine that has since deleted the file, and re-probing means re-downloading
-- a corpus whose TikTok half is 77% of all known download failures. A column
-- that is null for the past and true for the future is worth more than one
-- filled with a reconstruction.
alter table public.reference_content_profiles
  add column if not exists duration_sec numeric;

comment on column public.reference_content_profiles.duration_sec is
  'The video length in seconds, as ffprobe measured it during the visual pass. '
  'NULL means nobody measured -- never zero, which would be a claim that the '
  'video has no length. Written only when the visual pass ran; the 1,773 rows '
  'assessed before 0193 keep NULL permanently and are not backfilled.';

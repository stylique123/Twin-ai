-- WHAT THE FRAMES SHOWED, KEPT APART FROM WHAT THE TRANSCRIPT SAID.
--
-- ⚠️ A SEPARATE SET OF COLUMNS, NOT A MERGE INTO `profile`. The content pass
-- answers "is there a worthwhile version of this for me?" from speech; the
-- visual pass answers "how would I physically shoot it?" from stills. Folding
-- the second into the first would make a claim's PROVENANCE unrecoverable —
-- and provenance is the whole reason the visual schema carries frame citations.
-- A gallery card that says "you need a second person" must be able to say
-- whether that came from someone SAYING so or from a frame SHOWING so.
--
-- ⚖️ AND `visual_pass_ran` IS NOT DERIVABLE FROM `visual_profile IS NOT NULL`.
-- A pass that ran on four frames and could read nothing writes a profile full
-- of nulls, which is a real and useful finding — "we looked, and this video
-- does not answer these questions". A pass that never ran writes nothing. Those
-- are different sentences on a card, and 97% of the library is currently the
-- second one.

alter table public.reference_content_profiles
  -- The whole ReferenceVisualProfile, evidence included. Stored as one document
  -- because every field carries its own frame citation and splitting them into
  -- columns would separate a claim from its proof — the exact arrangement
  -- visualExtraction.ts refuses in memory.
  add column if not exists visual_profile jsonb,
  -- ⚠️ REJECTIONS ARE EVIDENCE ABOUT THE PROMPT, not noise. "which fields does
  -- the model struggle to answer from frames" is the question the pilot exists
  -- to answer, and it is unanswerable from a profile that only kept what passed.
  add column if not exists visual_rejections jsonb,
  -- ⚠️ WHAT LANDED, NOT WHAT WAS REQUESTED. Citations are range-checked against
  -- this number; recording the request instead would legalise a citation to a
  -- frame nobody sent.
  add column if not exists frames_sampled integer,
  -- Where the timestamps came from: the content pass's beats, or uniform
  -- interior midpoints. The two are not equally good evidence for a claim about
  -- the video's shape, and the pilot cannot compare them if the row is silent.
  add column if not exists frame_schedule_basis text,
  add column if not exists visual_assessed_at timestamptz;

-- ⚖️ THE BASIS IS A CLOSED VOCABULARY, CHECKED. A typo'd basis would silently
-- create a third category that every later group-by reports as its own cohort.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reference_content_profiles_frame_schedule_basis_known'
  ) then
    alter table public.reference_content_profiles
      add constraint reference_content_profiles_frame_schedule_basis_known
      check (frame_schedule_basis is null
             or frame_schedule_basis in ('content_beats', 'uniform'));
  end if;
end $$;

-- ⚠️ A COUNT CANNOT BE NEGATIVE, AND IT CANNOT BE ABSENT WHILE THE PASS RAN.
-- The second half is not expressible here without reading the jsonb, so the
-- weaker half is enforced and the stronger one lives in the worker's tests.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reference_content_profiles_frames_sampled_sane'
  ) then
    alter table public.reference_content_profiles
      add constraint reference_content_profiles_frames_sampled_sane
      check (frames_sampled is null or (frames_sampled >= 0 and frames_sampled <= 64));
  end if;
end $$;

-- The pilot's read: "which references have been looked at, and how well did the
-- looking go". Partial, because the answer for most rows is "not yet" and an
-- index over 4,000 nulls earns nothing.
create index if not exists reference_content_profiles_visual_assessed_idx
  on public.reference_content_profiles (visual_assessed_at)
  where visual_assessed_at is not null;

comment on column public.reference_content_profiles.visual_profile is
  'ReferenceVisualProfile: every field is an observation with a frame citation, or null meaning no knowledge. Never false-by-default.';
comment on column public.reference_content_profiles.frames_sampled is
  'How many frames the model was ACTUALLY shown. Citations are range-checked 1..this.';
comment on column public.reference_content_profiles.frame_schedule_basis is
  'content_beats = sampled at the content pass hook/rehook/payoff; uniform = interior midpoints because no beats were available.';

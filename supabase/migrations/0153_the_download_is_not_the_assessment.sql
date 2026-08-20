-- A MODEL THAT FAILED IS NOT A REASON TO DOWNLOAD THE VIDEO AGAIN.
--
-- ⚠️ 145 FAILED JOBS, EACH RETRIED UP TO FIVE TIMES, EVERY ATTEMPT STARTING AT
-- THE DOWNLOAD. `handleAssessReference` does acquisition (download → whisper)
-- and assessment (one Gemini call) in a single function, and the retry is the
-- whole function. When Gemini refuses — and on a 250-request daily quota it
-- refuses in bulk — the retry re-downloads a video we already have and
-- re-transcribes audio we already read, to arrive back at the same wall. That is
-- four extra downloads per failed reference, paid in bandwidth, in whisper CPU,
-- and in TikTok's patience with our IP.
--
-- ⚖️ SO THE TRANSCRIPT GETS ITS OWN ROW, IN ITS OWN TABLE. Acquisition produces
-- a fact about the video that does not change: this is what was said. Assessment
-- produces an opinion about that fact, and opinions are what get retried. Keeping
-- them in one table would mean every cache write passing through
-- `reference_assessment_merge`, which would file it in
-- `reference_assessment_attempts` as an assessment that never happened — the
-- 0146 failure exactly: a bookkeeping write recorded as a result.
--
-- ⚠️ AND IT IS NOT A CACHE WITH A LIFETIME. A video's audio does not change, so
-- there is nothing to expire. `force` on the job payload is the escape hatch for
-- "the acquisition itself was wrong", and it bypasses this table entirely.
create table if not exists public.reference_transcripts (
  url text primary key,

  -- The whole Transcript object as the worker produced it: text, words,
  -- segments, language, duration. Stored whole rather than shredded because the
  -- consumer is the same code that made it, and a lossy cache would quietly
  -- change what a retry assesses.
  transcript jsonb not null,

  -- ⚠️ DENORMALISED SO "WHAT DID ACQUISITION COST" IS ANSWERABLE WITHOUT
  -- UNPACKING JSON FOR EVERY ROW. These mirror the columns on
  -- reference_content_profiles and carry the same meaning: absent means
  -- unrecorded, never free.
  chars integer not null,
  source text,
  paid_because text,
  download_route text,

  captured_at timestamptz not null default now(),

  constraint reference_transcripts_chars_nonneg check (chars >= 0),
  constraint reference_transcripts_source_known check (
    source is null or source in (
      'youtube_captions_free', 'youtube_captions_paid', 'instagram_paid', 'local_whisper'
    )
  ),
  constraint reference_transcripts_paid_because_known check (
    paid_because is null or paid_because in ('no_captions', 'free_path_failed')
  )
);

-- ── ACCESS ───────────────────────────────────────────────────────────────
--
-- ⚠️ SERVICE ROLE ONLY, AND UNLIKE THE PROFILES TABLE THERE IS NO READ GRANT.
-- A profile is a product surface; a raw transcript of somebody else's video is
-- not, and granting `authenticated` select on it would publish the full text of
-- 4,000 creators' videos to every signed-in account for no feature's sake.
-- Supabase grants ALL on new public tables by default, so this must be revoked
-- explicitly rather than left to 0141's sweep.
alter table public.reference_transcripts enable row level security;

revoke all on table public.reference_transcripts from anon, authenticated;

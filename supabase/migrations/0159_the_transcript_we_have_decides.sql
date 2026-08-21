-- THE TRANSCRIPT WE ACTUALLY HAVE DECIDES, NOT THE NUMBER WE REMEMBER.
--
-- ⚠️ STORED transcript_chars DOES NOT PREDICT A FRESH ACQUISITION. The #66 eval
-- proved it at cost: a reference stored as 133 characters came back as 5, and a
-- reference stored as "substantial" (>=400) also fell below the 120-character
-- floor. 7 of 40 references in a stratified sample were selected on stored
-- metadata, paid for a download, and produced no data point at all.
--
-- ⚖️ SO THE AUTHORITY MOVES. Stored chars become an ORDERING AND STRATIFICATION
-- HINT — still useful for deciding what to look at first. The durable cached
-- transcript becomes the TRUTH for eligibility. Nothing may route a reference on
-- the strength of a number nobody has re-checked.
--
-- ⚠️ AND THE DISAGREEMENT IS RECORDED RATHER THAN SWALLOWED. If we only fixed
-- the routing, we would stop being wrong and also stop being able to say HOW
-- wrong we had been. Every measurement writes a row, whether it agrees or not.
create table if not exists public.transcript_routing_decisions (
  id uuid primary key default gen_random_uuid(),
  url text not null,

  -- ⚠️ THREE AXES, DELIBERATELY NOT TWO. It is tempting to fold these together
  -- and they answer different questions:
  --   platform       WHAT the media is        tiktok, youtube, instagram
  --   download_route HOW Twin fetched it      local_impersonated, residential_proxy, apify_actor
  --   source         HOW the text was made    local_whisper, youtube_captions_free/paid, instagram_paid
  -- local_whisper spans every platform, so a single merged bucket could not tell
  -- a Whisper problem from a TikTok problem. Collapsing any pair destroys the
  -- only question this table exists to answer.
  platform text,
  download_route text,
  source text,

  -- What the old metadata claimed. NULL means the reference had no stored count,
  -- which is different from a stored zero.
  stored_chars integer,
  -- What the durable cached transcript actually contains, after the SAME
  -- normalisation production applies before the eligibility test. Never null:
  -- a decision was made, so a measurement exists.
  actual_chars integer not null,
  -- ⚖️ STORED, NOT DERIVED AT READ TIME. A delta every reader recomputes is one
  -- somebody eventually recomputes differently. NULL only when stored_chars is.
  delta_chars integer,
  -- actual/stored. NULL when stored_chars is null or zero — a ratio against zero
  -- is not "infinite drift", it is an undefined question.
  ratio numeric(10,4),

  -- ⚠️ THE DECISION THIS ROW JUSTIFIES, in the vocabulary the router uses.
  --   speech_extraction  enough speech: the model gets the transcript
  --   visual_route       too little speech: goes to the frames pass (#56)
  -- `visual_route` is deliberately NOT called `skipped`. The #66 attrition and
  -- the 332 known no-speech references are a POPULATION, not a graveyard, and a
  -- name that said "skipped" would keep them one.
  routing_decision text not null check (routing_decision in ('speech_extraction', 'visual_route')),
  -- The floor in force when this decision was taken. Recorded so a later change
  -- to the threshold does not silently reinterpret old rows.
  threshold_chars integer not null,

  measured_at timestamptz not null default now(),

  constraint routing_actual_chars_nonneg check (actual_chars >= 0),
  constraint routing_stored_chars_nonneg check (stored_chars is null or stored_chars >= 0),
  -- The delta IS the subtraction it claims to be. Same discipline as 0154's
  -- render_attempts_delta_is_the_difference: a delta that is not the difference
  -- poisons every later query about drift and looks perfectly plausible.
  constraint routing_delta_is_the_difference check (
    (stored_chars is null and delta_chars is null)
    or (stored_chars is not null and delta_chars = actual_chars - stored_chars)
  ),
  -- The decision must agree with the measurement that justified it.
  constraint routing_decision_follows_the_measurement check (
    (routing_decision = 'speech_extraction' and actual_chars >= threshold_chars)
    or (routing_decision = 'visual_route' and actual_chars < threshold_chars)
  )
);

-- ⚖️ ONE ROW PER MEASUREMENT, NOT ONE PER URL. Re-measuring the same reference
-- later is a new fact about drift over time, not a correction of the old one.
create index if not exists transcript_routing_decisions_url_idx
  on public.transcript_routing_decisions (url, measured_at desc);
create index if not exists transcript_routing_decisions_route_idx
  on public.transcript_routing_decisions (routing_decision);

alter table public.transcript_routing_decisions enable row level security;
revoke all on public.transcript_routing_decisions from anon, authenticated;

comment on table public.transcript_routing_decisions is
  'Why a reference went to the speech path or the visual path, decided from the '
  'durable cached transcript rather than stored metadata, with the disagreement '
  'between the two recorded. platform, download_route and source are three '
  'separate axes and must not be merged.';

-- WHERE THE TRANSCRIPT PASS PUTS WHAT IT LEARNED.
--
-- ⚠️ KEYED BY THE VIDEO, NOT BY THE GALLERY ROW, AND THAT IS A MEASUREMENT
-- RATHER THAN A PREFERENCE. `gallery_items` holds 9,504 rows over 4,211 distinct
-- URLs — one row per NICHE PLACEMENT, with a single video appearing up to 38
-- times and 93 videos filed under more than one niche. Keyed by row, the batch
-- would transcribe the same video 38 times and could store 38 disagreeing
-- answers about one piece of content. Keyed by URL it is assessed once, and
-- every placement reads the same profile — which is also the truth: a video's
-- container does not change because somebody filed it under Beauty as well as
-- Skincare.
--
-- ⚖️ AND THE SAVING IS REAL: 3,946 transcribable videos rather than 9,504 calls,
-- before a single row is enriched.
--
-- ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────
--
-- ⚠️ NO FRESHNESS, NO PERFORMANCE, NO VISUAL COLUMNS. The visual pass gets its
-- own table when it is built, because merging "what we heard" with "what we saw"
-- is what turns a half-assessed card into one that reads fully assessed. And
-- there is no publication date anywhere in the scraped source, so a recency
-- column here would be one nothing could ever fill honestly.

create table if not exists public.reference_content_profiles (
  -- The video. `gallery_items.url` is the join, and it is not unique there.
  url text primary key,
  platform text not null,

  -- ⚠️ VERSIONED, BECAUSE THE PILOT EXISTS TO CHANGE THIS SHAPE. Rows written
  -- against an older schema must be identifiable rather than silently mixed with
  -- newer ones — the whole point of proving the schema on 400 before spending
  -- 3,946 is that version 1 is expected to be wrong somewhere.
  schema_version integer not null default 1,

  -- The validated `ReferenceContentProfile`. Every field inside carries its own
  -- basis and evidence; nothing in here is a bare value.
  profile jsonb not null,

  -- ⚖️ THE REJECTIONS ARE STORED, NOT JUST COUNTED. "Which fields does the model
  -- struggle with" is the pilot's actual output, and it cannot be recovered
  -- later from a profile that simply lacks them.
  rejections jsonb not null default '[]'::jsonb,
  fields_accepted integer not null default 0,

  -- ⚠️ HOW THE TRANSCRIPT WAS OBTAINED, BECAUSE ONE OF THESE COSTS MONEY.
  -- `youtube_captions_free` and `local_whisper` are free; `youtube_captions_paid`
  -- and `instagram_paid` are billed per video. Recording it per row is what makes
  -- "what would the remaining 3,546 cost" answerable from the pilot instead of
  -- estimated.
  transcript_source text,
  paid_because text,
  transcript_chars integer,

  -- ⚖️ A FAILED ASSESSMENT IS A ROW, NOT A GAP. Without this, a video that could
  -- not be transcribed is indistinguishable from one never attempted, and every
  -- later run pays to rediscover it.
  error text,

  assessed_at timestamptz not null default now(),

  constraint reference_content_profiles_source_known check (
    transcript_source is null or transcript_source in (
      'youtube_captions_free', 'youtube_captions_paid', 'instagram_paid', 'local_whisper'
    )
  ),
  constraint reference_content_profiles_paid_because_known check (
    paid_because is null or paid_because in ('no_captions', 'free_path_failed')
  )
);

-- The gallery reads these by platform when ranking a mixed feed.
create index if not exists reference_content_profiles_platform_idx
  on public.reference_content_profiles (platform);

-- ⚠️ "WHAT IS LEFT TO DO" MUST BE A CHEAP QUESTION. The batch resumes by asking
-- for videos with no row and for rows that errored, and a sequential scan of
-- 3,946 rows on every resume is how a driver ends up keeping its worklist in
-- memory instead — which is what makes a crashed batch restart from zero.
create index if not exists reference_content_profiles_unfinished_idx
  on public.reference_content_profiles (assessed_at)
  where error is not null;

-- ── ACCESS ───────────────────────────────────────────────────────────────
--
-- ⚠️ SYSTEM-OWNED, SO CLIENT WRITE GRANTS MUST EQUAL ∅. This table is written
-- ONLY by the worker under the service role. Supabase grants ALL on new public
-- tables by default, so leaving it alone would hand `anon` and `authenticated`
-- INSERT, UPDATE, DELETE and TRUNCATE on the entire assessment corpus — and 0140
-- exists because row security does not gate TRUNCATE, meaning the grant WOULD be
-- the whole permission there.
--
-- ⚖️ REVOKED EXPLICITLY RATHER THAN LEFT TO 0141'S SWEEP. That migration derives
-- what to revoke from what has no policy, so it would catch this table on its
-- next run — but "a later migration will clean it up" is not the same as never
-- having granted it, and the window between the two is real.
alter table public.reference_content_profiles enable row level security;

revoke all on table public.reference_content_profiles from anon, authenticated;

-- Read-only, and only for signed-in users: the gallery is a product surface, not
-- a public dataset.
grant select on table public.reference_content_profiles to authenticated;

drop policy if exists reference_content_profiles_read on public.reference_content_profiles;
create policy reference_content_profiles_read
  on public.reference_content_profiles
  for select
  to authenticated
  using (true);

-- 0201 — A PASTED REFERENCE IS THE ONE SAMPLE NOBODY CAN SCRAPE, AND WE THREW
-- AWAY THE ONLY PART OF IT THAT SAYS WHETHER THE VIDEO WAS ANY GOOD.
--
-- ⚠️ MEASURED BEFORE BUILDING, 2026-09-12. `transcripts` holds 422 rows, 125 of
-- them references (89 marked `subject='reference'`, 36 written before 0135 gave
-- the column a meaning). Every one carries the transcript, the duration and, for
-- 105 of them, the derived structure. NOT ONE carries a view count, an audience
-- size, or an uploader. `relativePerformance` — written, tested and unused since
-- the day it landed — has never been computed anywhere in this product.
--
-- ⚖️ THE UNIT IS THE MULTIPLE, NOT THE COUNT, which is why three columns are
-- needed and not one. 50,000 views from a 2,000-follower account is a far
-- stronger signal than 500,000 from a five-million one; a ranking on
-- `views` alone orders references by the size of somebody else's audience.
--
-- ⚠️ AND THE LIFT IS STORED RATHER THAN DERIVED LATER, WHICH IS UNUSUAL HERE AND
-- DELIBERATE. It rests on the uploader's OTHER videos, and those are read once,
-- at ingest, from a source that will not return the same list next month. There
-- is nothing to recompute it from afterwards — so either the number is kept with
-- the count it rests on, or it is lost.
alter table public.transcripts
  add column if not exists views bigint,
  add column if not exists creator_audience bigint,
  add column if not exists creator_handle text,
  add column if not exists relative_lift numeric,
  add column if not exists relative_basis integer;

-- ⚠️⚠️ ZERO IS BANNED, BECAUSE ZERO IS HOW THIS CORPUS SPELLS "UNREAD". 945
-- gallery rows carry reach "0" from a scrape that captured nothing, 940 of them
-- belonging to one junk creator, and reading those as zero-view videos would
-- drag every median they touch toward zero and make ordinary videos look like
-- breakout hits. A NULL here says nobody read it. A 0 would say the video was
-- watched by nobody, which is a measurement nobody made.
alter table public.transcripts
  drop constraint if exists transcripts_counts_are_unread_or_positive;
alter table public.transcripts
  add constraint transcripts_counts_are_unread_or_positive check (
    (views is null or views > 0)
    and (creator_audience is null or creator_audience > 0)
    and (relative_lift is null or relative_lift > 0)
    and (relative_basis is null or relative_basis > 0)
  );

-- ⚖️ A LIFT TRAVELS WITH ITS BASIS OR IT DOES NOT TRAVEL. "3.4× their normal"
-- and "3.4× their normal, across five videos" are different claims and only the
-- second can be argued with. Enforced in the database rather than trusted to the
-- writer, because a half-written pair is exactly what a partial failure produces.
--
-- ⚠️ AND A LIFT NEEDS AN UPLOADER. The median is only the right median if we know
-- whose videos it came from; a multiple computed against unattributable videos
-- would be a confident statement about the wrong creator's normal — the worst
-- outcome available here, because it looks correct.
alter table public.transcripts
  drop constraint if exists transcripts_lift_carries_its_evidence;
alter table public.transcripts
  add constraint transcripts_lift_carries_its_evidence check (
    (relative_lift is null and relative_basis is null)
    or (relative_lift is not null and relative_basis is not null and creator_handle is not null)
  );

comment on column public.transcripts.views is
  'Views on THIS video when it was ingested, as the source reported them. NULL '
  'means nobody read it -- never 0, which the CHECK refuses, because 0 is how '
  'the scraped corpus spells "captured nothing".';
comment on column public.transcripts.creator_audience is
  'The uploader''s follower count, when the source stated one. NULL means '
  'unstated; yt-dlp omits it on many accounts.';
comment on column public.transcripts.creator_handle is
  'Whose videos the median below was taken from. Stored without a leading @. '
  'Required whenever a lift is present, so a multiple can never be read as '
  'belonging to a creator we could not name.';
comment on column public.transcripts.relative_lift is
  'This video''s views divided by the uploader''s own median, computed once at '
  'ingest by relativePerformance(). Not recomputable later: the sibling view '
  'counts it rests on are read once and not stored.';
comment on column public.transcripts.relative_basis is
  'How many of the uploader''s videos that median rests on -- at least '
  'MIN_VIDEOS_FOR_BASELINE (5). Present exactly when relative_lift is.';

-- ⚖️ NO BACKFILL, AND THAT IS THE HONEST OUTCOME. The 125 references already
-- ingested keep NULL forever: re-reading them means re-fetching 125 third-party
-- pages for videos whose view counts have since moved, and a column filled with
-- today's number under yesterday's date is worse than an empty one. True for the
-- future, null for the past.
--
-- ⚠️ AND NO NEW GRANTS. Writes to `transcripts` are service-role only (0004
-- deliberately declined to write an insert or update policy); these columns
-- inherit that. The existing owner-read policy already covers reading them back,
-- which is what the ranking needs.

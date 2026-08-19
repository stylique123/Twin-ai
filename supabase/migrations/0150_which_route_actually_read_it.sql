-- "IT WORKED" IS NOT AN ANSWER TO "WHAT DOES IT COST".
--
-- ⚠️ TIKTOK ACQUISITION IS BECOMING A LADDER: yt-dlp impersonating a browser
-- from our own IP (free), then yt-dlp through a residential proxy (paid per GB,
-- keeps the local pipeline), then an Apify Actor per video (paid per video, and
-- it replaces the pipeline entirely). Each rung costs more than the last.
--
-- ⚖️ SO THE RUNG THAT SUCCEEDED IS RECORDED, NOT INFERRED. Without this column
-- a fallback chain reports a single fact — the video was read — and destroys the
-- only one that matters for a 4,297-URL gallery: what FRACTION needed paying
-- for. 95% clearing locally and 80% needing residential routing are the same
-- success rate and completely different businesses, and nothing after the fact
-- can tell them apart.
--
-- ⚠️ NULL MEANS UNRECORDED, NOT FREE. The 165 rows already assessed were read
-- before the ladder existed, and stamping them `local_impersonated` would be
-- inventing a measurement — they ran without `--impersonate` at all. They stay
-- null, and any cost estimate has to say how many rows it could not see.
--
-- ⚖️ TIKTOK ONLY. YouTube and Instagram have their own routes for their own
-- reasons and are deliberately not folded in here.

alter table public.reference_content_profiles
  add column if not exists download_route text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reference_content_profiles_download_route_known'
  ) then
    alter table public.reference_content_profiles
      add constraint reference_content_profiles_download_route_known
      check (download_route is null or download_route in
        ('local_impersonated', 'residential_proxy', 'apify_actor'));
  end if;
end $$;

create index if not exists reference_content_profiles_route_idx
  on public.reference_content_profiles (download_route)
  where download_route is not null;

-- ⚠️ RLS DOES NOT GATE `TRUNCATE`, and 0140 covered only the tables that existed
-- when it ran — 0149 is the row that proved it. This table predates both, so the
-- revoke is already in place; asserted here rather than assumed, because the
-- cost of being wrong is an evidence table a client can empty.
revoke truncate on table public.reference_content_profiles from anon, authenticated;

comment on column public.reference_content_profiles.download_route is
  'Which rung of the TikTok acquisition ladder actually read this video. NULL = unrecorded (assessed before the ladder existed), never "free". See worker/src/media.ts DOWNLOAD_ROUTES.';

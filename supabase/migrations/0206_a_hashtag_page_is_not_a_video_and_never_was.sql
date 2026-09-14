-- 0206 — A URL THAT IS NOT A VIDEO IS ASKED ANYWAY, AND THE GUARD ALREADY EXISTS.
--
-- ⚠️⚠️ THE PROJECT'S SIGNATURE DEFECT, IN ITS PUREST FORM. `isTranscribable`
-- (packages/shared/src/pilotSample.ts) was written for exactly this and says so:
-- "689 of the 692 Instagram rows are instagram.com/explore/tags/... hashtag
-- pages -- no video, no transcript ... Sampling them would spend real calls to
-- discover they cannot be read." The PILOT SAMPLER calls it. This enqueue path
-- never has.
--
-- ⚠️ MEASURED IN PRODUCTION 2026-09-13:
--
--     Instagram assess_reference jobs                          115
--       instagram.com/explore/tags/... hashtag BROWSE PAGES    109   (57 distinct urls)
--       /p/... posts                                             6
--       /reel/... reels                                          0
--     of those 115, jobs that produced a transcript              0
--
-- ⚠️⚠️ AND THIS CORRECTS A DIAGNOSIS ON THE RECORD. The failure was read as a
-- CONTRACT MISMATCH -- "100% failure with a single identical message means the
-- actor's response shape no longer carries the field we read". It does not. The
-- Actor is correctly reporting `no audio url found` for a page that HAS no
-- video, and our code reads that message out of the field it expects. Nothing
-- about the integration is broken; we have been feeding it browse pages.
--
-- ⚖️ NOTE WHAT THE NUMBERS DO NOT SAY. ZERO `/reel/` URLs have ever been
-- assessed, so there is no evidence either way about Instagram reels. "Instagram
-- has never produced a transcript" is true; "Instagram cannot produce one" is
-- not something this data can support. Absent is not zero.
--
-- ⚖️ THE RULE IS MIRRORED FROM `isTranscribable`, NOT REINVENTED, and a parity
-- test executes both against one table of urls so the two cannot drift. A
-- trigger cannot import TypeScript; that is the reason for a mirror and also the
-- reason the mirror needs a test rather than a promise.
--
-- ⚠️ IT EXCLUDES, IT DOES NOT DELETE. These are live public rows. Removing them
-- is a separate irreversible decision belonging to their owner -- the same line
-- `isTranscribable` draws, for the same reason.
create or replace function public.enqueue_gallery_visual_analysis()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- ⚠️ FIRST, BEFORE ANY OTHER CHECK, BECAUSE THE OTHERS ALL ASSUME A VIDEO.
  -- The success check asks whether it was read, the in-flight check whether it
  -- is being read, the cooldown whether reading it failed recently. All three
  -- are the wrong question for a hashtag browse page: it will never be read, it
  -- is not a transient failure, and a cooldown would let it back in next week.
  --
  -- Mirrors `isTranscribable` in packages/shared/src/pilotSample.ts. Held by
  -- `a-hashtag-page-is-not-a-video.test.ts`, which runs both over one table.
  if new.url is null
     or position('/explore/tags/' in lower(new.url)) > 0
     or position('/explore/' in lower(new.url)) > 0
     or lower(new.url) !~ '^https?://'
  then
    return new;
  end if;

  -- Already has a finished visual pass for this exact video — skip.
  if exists (
    select 1 from public.reference_content_profiles rcp
    where rcp.url = new.url and rcp.visual_profile is not null
  ) then
    return new;
  end if;

  -- Already has a pass in flight for this exact video — skip, do not double-queue.
  if exists (
    select 1 from public.jobs j
    where j.type = 'assess_reference'
      and j.payload ->> 'url' = new.url
      and j.status in ('queued', 'running')
  ) then
    return new;
  end if;

  -- ⚠️ THE THIRD STATE, ASKED THE WAY IT ACTUALLY OCCURS (0205). 0199 asked for
  -- `status = 'failed'` and matched 0 of 425 real failures; this asks whether a
  -- recent attempt ended in an error, which is where `assess_reference` puts it.
  -- `failed` is still admitted so a future dead-letter path needs no migration.
  if exists (
    select 1 from public.jobs j
    where j.type = 'assess_reference'
      and j.payload ->> 'url' = new.url
      and j.created_at > now() - interval '7 days'
      and (j.status = 'failed' or j.result ->> 'error' is not null)
  ) then
    return new;
  end if;

  insert into public.jobs (type, payload)
  values (
    'assess_reference',
    jsonb_build_object('url', new.url, 'platform', new.platform, 'frames', true)
  );

  return new;
end
$fn$;

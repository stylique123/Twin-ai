-- 0205 — THE COOLDOWN 0199 ADDED HAS NEVER ONCE SUPPRESSED A JOB.
--
-- ⚠️⚠️ 0199 DIAGNOSED THE LOOP CORRECTLY AND THEN GUARDED ON A STATE THAT DOES
-- NOT OCCUR. Its third check asks for a recent job with `status = 'failed'`, and
-- its header explains why: "by the next morning its last job has already
-- dead-lettered". That is the assumption, and it is false.
--
-- ⚠️ MEASURED IN PRODUCTION 2026-09-13, AND THE NUMBER IS UNAMBIGUOUS:
--
--     assess_reference jobs that finished carrying result.error   425
--       ... with status = 'done'                                  425
--       ... with status = 'failed'                                  0
--     distinct urls among them                                    238
--     attempts per url                                           1.79
--
-- ZERO of 425. `assess_reference` records its fetch failure INTO the result and
-- completes the job, because a reference that cannot be read is a real property
-- of the library rather than a crash -- that is deliberate and correct, and it is
-- exactly what makes 0199's predicate unreachable. The cooldown is a comment
-- describing behaviour that never happens.
--
-- ⚠️ THIS IS THE SAME UNDERSTATEMENT ALREADY ON THE RECORD, SEEN FROM THE OTHER
-- SIDE. The standing measurement "a queue count reports 227 when the truth is
-- 381 -- understated by 40%, not zero" is this same fact: a status column that
-- does not know about a failure recorded in the result. There it cost an
-- accurate count; here it costs the entire fix 0199 shipped.
--
-- ⚖️ SO THE COOLDOWN NOW ASKS WHAT IT MEANT TO ASK: did a recent attempt END IN
-- AN ERROR? Status is no longer the question, because status is not where this
-- job type puts the answer. Both spellings are admitted -- a `failed` row still
-- counts -- so a future change that DOES dead-letter is covered without another
-- migration.
--
-- ⚖️ EVERYTHING ELSE 0199 DECIDED IS KEPT, DELIBERATELY AND UNCHANGED: seven
-- days rather than a blacklist, because 119 of the known failures are TikTok IP
-- blocks that a later fix could clear and a permanent refusal would outlive the
-- bug that caused it. The cooldown stays subordinate to the success check, so a
-- URL that has since acquired a `visual_profile` returns before reaching it and
-- a historical failure can never suppress a video that now works. UNKNOWN is
-- still not a default in either direction.
--
-- ⚠️ WHAT THIS DOES NOT FIX, NAMED SO IT IS NOT MISTAKEN FOR FIXED: the upstream
-- duplicate inserts (10,906 redundant gallery rows) are still upstream, and 57
-- of the 238 urls are `instagram.com/explore/tags/...` hashtag BROWSE PAGES that
-- are not videos at all and should never be asked even once. Both are their own
-- changes; this one makes the existing cooldown real.
create or replace function public.enqueue_gallery_visual_analysis()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
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

  -- ⚠️ THE THIRD STATE, ASKED THE WAY IT ACTUALLY OCCURS. 0199 asked for
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

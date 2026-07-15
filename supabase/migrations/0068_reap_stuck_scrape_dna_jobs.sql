-- Production-readiness (Phase 1) — reaper for stuck TikTok `scrape_dna` jobs.
--
-- The onboarding first-run dead-end: TikTok DNA is built by the VPS worker (yt-dlp)
-- via a `scrape_dna` job. If the worker is down or wedged, that job sits 'queued'
-- (never claimed) or 'running' (lease never released) indefinitely, and dna-poll
-- can only ever report 'building' — the ~220s onboarding hang.
--
-- 0018_dna_reaper already flips any brand_voice stuck 'building' past 600s to
-- 'failed' (so the UI surfaces the manual path) and dead-letters `build_dna` jobs —
-- but it does NOT dead-letter `scrape_dna` jobs. This closes that gap so a stuck
-- worker can't leave orphaned scrape jobs that get reprocessed for an
-- already-failed voice, and it belt-and-braces fails the voice too (idempotent with
-- 0018). DNA spends no credits, so there is nothing to refund — only stuck state to
-- clear. 600s is well beyond a normal yt-dlp scrape (~1-3 min) and the client's own
-- poll budget, so this only ever catches genuinely down/wedged builds.

create extension if not exists pg_cron;

create or replace function public.reap_stuck_scrape_dna(p_timeout_secs integer default 600)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare n integer;
begin
  -- Dead-letter scrape_dna jobs that never got claimed ('queued', worker down) or
  -- whose lease is long past ('running', worker wedged) — so they can't be
  -- resurrected and reprocessed for a voice we've already failed.
  with stale as (
    update public.jobs j
       set status = 'failed', error = 'reaped: scrape timed out', updated_at = now()
     where j.type = 'scrape_dna'
       and j.status in ('queued', 'running')
       and j.updated_at < now() - make_interval(secs => p_timeout_secs)
    returning j.payload ->> 'brand_voice_id' as brand_voice_id
  )
  select count(*) into n from stale;

  -- Fail the associated voices so a resumed poll sees 'failed' and offers the manual
  -- path, rather than an endless 'building' spinner. (0018 also catches these by the
  -- building-age rule; doing it here keeps job + voice in lockstep.)
  update public.brand_voices bv
     set status = 'failed',
         error  = 'Your voice scan took too long to finish. Try again, or set up your voice manually.',
         updated_at = now()
   where bv.status = 'building'
     and bv.id in (
       select (j.payload ->> 'brand_voice_id')::uuid
         from public.jobs j
        where j.type = 'scrape_dna'
          and j.status = 'failed'
          and j.error = 'reaped: scrape timed out'
          and j.updated_at > now() - make_interval(secs => 120)
     );

  return n;
end;
$$;

revoke all on function public.reap_stuck_scrape_dna(integer) from public, anon, authenticated;

-- Run every minute. Unschedule first so re-applying this migration is idempotent.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'reap-stuck-scrape-dna') then
    perform cron.unschedule('reap-stuck-scrape-dna');
  end if;
end $$;
select cron.schedule('reap-stuck-scrape-dna', '* * * * *', $$select public.reap_stuck_scrape_dna(600)$$);

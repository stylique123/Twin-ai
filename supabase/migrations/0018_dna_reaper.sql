-- Wave 1 (#3) — server-side reaper for stuck "building" voices.
--
-- The Apify `build_dna` job is advanced ONLY by the browser polling `dna-poll`.
-- Close the tab (or lose the connection, or hit the 60/min poll cap) and the
-- voice stays 'building' forever — the "infinite spinner". A synth that dies
-- mid-call leaves the job in 'synthesizing', which the poll loop can never
-- re-claim, so even an open tab can wedge. DNA spends no credits, so there is
-- nothing to refund here — only a stuck state to clear. We fail it cleanly so the
-- UI stops spinning and offers the manual fallback.
--
-- Timeout (600s) is well beyond a normal Apify run (~1-3 min) and the client's
-- own poll budget, so this only ever catches genuinely abandoned/wedged builds.

create extension if not exists pg_cron;

create or replace function public.reap_stuck_dna_builds(p_timeout_secs integer default 600)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare n integer;
begin
  -- Any voice that has been 'building' past the timeout is abandoned/wedged.
  -- (updated_at is bumped only on brand_voices writes — i.e. at build start — so
  -- this measures time since the build began, not since the last poll.)
  with stale as (
    update public.brand_voices bv
       set status = 'failed',
           error  = 'Your voice scan took too long to finish. Try again, or set up your voice manually.',
           updated_at = now()
     where bv.status = 'building'
       and bv.updated_at < now() - make_interval(secs => p_timeout_secs)
    returning bv.id
  )
  select count(*) into n from stale;

  -- Dead-letter the underlying Apify jobs so they don't linger as running/synthesizing.
  update public.jobs
     set status = 'failed', error = 'reaped: build timed out', updated_at = now()
   where type = 'build_dna'
     and status in ('running', 'synthesizing')
     and updated_at < now() - make_interval(secs => p_timeout_secs);

  return n;
end;
$$;

revoke all on function public.reap_stuck_dna_builds(integer) from public, anon, authenticated;

-- Run every minute. Unschedule first so re-applying this migration is idempotent.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'reap-stuck-dna') then
    perform cron.unschedule('reap-stuck-dna');
  end if;
end $$;
select cron.schedule('reap-stuck-dna', '* * * * *', $$select public.reap_stuck_dna_builds(600)$$);

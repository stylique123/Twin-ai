-- A RUNNING SCAN IS NOT STUCK UNTIL ITS LEASE RUNS OUT (security audit #17).
-- Both reapers run every 5 minutes with a 600-second timeout (0275):
--   reap_stuck_scrape_dna (0068) failed a 'running' scrape_dna job once its
--     updated_at was 10 minutes old, but a running job's updated_at is its claim
--     time and the worker allows it 35 minutes (WORKER_MAX_JOB_MS) inside a
--     40-minute lease (WORKER_VISIBILITY_SECS);
--   reap_stuck_dna_builds (0018) failed any voice 'building' for 10 minutes.
-- So a slow Instagram scan was shown as failed while it was still running, and
-- the creator paid for a second scan. Now:
--   * a queued job is still failed after the timeout (the worker is down);
--   * a running job is failed only when its lock is older than the 40-minute lease;
--   * a voice with a queued or running scrape_dna job is left alone; once that
--     job is reaped, 0068's own voice step (or the next run here) fails the voice.
-- Manual voices (no job) are reaped as before; 0304 lets her still save the form.
-- Otherwise the 0068 / 0018 bodies. Files only; applied by hand.
create or replace function public.reap_stuck_scrape_dna(p_timeout_secs integer default 600)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare n integer;
begin
  with stale as (
    update public.jobs j
       set status = 'failed', error = 'reaped: scrape timed out', updated_at = now()
     where j.type = 'scrape_dna'
       and (
         (j.status = 'queued' and j.updated_at < now() - make_interval(secs => p_timeout_secs))
         or (j.status = 'running' and coalesce(j.locked_at, j.updated_at) < now() - interval '40 minutes')
       )
    returning j.payload ->> 'brand_voice_id' as brand_voice_id
  )
  select count(*) into n from stale;

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
grant execute on function public.reap_stuck_scrape_dna(integer) to service_role;

create or replace function public.reap_stuck_dna_builds(p_timeout_secs integer default 600)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare n integer;
begin
  with stale as (
    update public.brand_voices bv
       set status = 'failed',
           error  = 'Your voice scan took too long to finish. Try again, or set up your voice manually.',
           updated_at = now()
     where bv.status = 'building'
       and bv.updated_at < now() - make_interval(secs => p_timeout_secs)
       and not exists (
         select 1 from public.jobs j
          where j.type = 'scrape_dna'
            and j.status in ('queued', 'running')
            and j.payload ->> 'brand_voice_id' = bv.id::text
       )
    returning bv.id
  )
  select count(*) into n from stale;

  update public.jobs
     set status = 'failed', error = 'reaped: build timed out', updated_at = now()
   where type = 'build_dna'
     and status in ('running', 'synthesizing')
     and updated_at < now() - make_interval(secs => p_timeout_secs);

  return n;
end;
$$;
revoke all on function public.reap_stuck_dna_builds(integer) from public, anon, authenticated;
grant execute on function public.reap_stuck_dna_builds(integer) to service_role;

-- A JOB THAT KEEPS KILLING THE WORKER STOPS BEING PICKED (security audit #8).
-- claim_job (0066) re-picks a job whose lease went stale without checking its
-- attempts. A job that crashes the process (a page that expands to gigabytes)
-- never reaches the worker's own "attempts >= max_attempts" check, so it was
-- re-picked every visibility window, forever, taking the worker down each time.
-- Now, inside the claim:
--   1. a stale running job that has used all its attempts is marked failed
--      (the refund triggers on status = 'failed', as with fail_job and the 0068 reaper);
--   2. a stale running job is only re-picked while attempts < max_attempts.
-- Otherwise 0066's body. Files only; applied by hand.
create or replace function public.claim_job(p_worker text, p_types text[], p_visibility_secs integer default 600)
returns setof public.jobs
language plpgsql
security definer set search_path = public
as $$
begin
  update public.jobs
     set status = 'failed',
         error = coalesce(error, 'stopped responding on every attempt'),
         locked_at = null, locked_by = null, updated_at = now()
   where type = any(p_types)
     and status = 'running'
     and locked_at < now() - make_interval(secs => p_visibility_secs)
     and attempts >= max_attempts;

  return query
  update public.jobs j
     set status     = 'running',
         attempts   = j.attempts + 1,
         locked_at  = now(),
         locked_by  = p_worker,
         updated_at = now()
   where j.id = (
     select id from public.jobs
      where type = any(p_types)
        and run_after <= now()
        and (
          status = 'queued'
          or (status = 'running' and locked_at < now() - make_interval(secs => p_visibility_secs) and attempts < max_attempts)
        )
      -- Paid-plan priority first, then FIFO within a tier.
      order by priority desc, created_at
      for update skip locked
      limit 1
   )
  returning j.*;
end;
$$;
revoke all on function public.claim_job(text, text[], integer) from public, anon, authenticated;
grant execute on function public.claim_job(text, text[], integer) to service_role;

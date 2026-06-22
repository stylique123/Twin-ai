-- Wave 1 follow-up (Infra #2) — owner-guard complete_job / fail_job.
--
-- A job reclaimed after its visibility timeout gets a NEW locked_by. Without a
-- guard, the ORIGINAL worker (still finishing the now-reassigned job) could call
-- complete_job/fail_job and clobber the new owner's run — double work, a result
-- race, or (for billable jobs) a spurious failure. Guard both so only the worker
-- that currently holds the lock can settle the job. The worker passes its id;
-- callers that omit it (none today) stay unguarded for back-compat.

drop function if exists public.complete_job(uuid, jsonb);
drop function if exists public.fail_job(uuid, text, integer);

create function public.complete_job(p_id uuid, p_result jsonb, p_worker text default null)
returns integer
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  update public.jobs
     set status = 'done', result = coalesce(p_result, '{}'::jsonb),
         locked_at = null, locked_by = null, error = null, updated_at = now()
   where id = p_id
     and (p_worker is null or locked_by = p_worker);
  get diagnostics n = row_count;
  return n; -- 0 = the caller no longer owns this job (reclaimed); don't clobber
end;
$$;

create function public.fail_job(p_id uuid, p_error text, p_backoff_secs integer default 30, p_worker text default null)
returns integer
language plpgsql security definer set search_path = public
as $$
declare j public.jobs; n integer;
begin
  select * into j from public.jobs where id = p_id;
  if not found then return 0; end if;
  -- Only the current lock holder may fail it (when a worker id is supplied).
  if p_worker is not null and j.locked_by is distinct from p_worker then
    return 0;
  end if;

  if j.attempts >= j.max_attempts then
    update public.jobs
       set status = 'failed', error = p_error, locked_at = null, locked_by = null, updated_at = now()
     where id = p_id;
  else
    update public.jobs
       set status = 'queued', error = p_error, locked_at = null, locked_by = null,
           run_after = now() + make_interval(secs => p_backoff_secs * (j.attempts + 1)),
           updated_at = now()
     where id = p_id;
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.complete_job(uuid, jsonb, text)       from public, anon, authenticated;
revoke all on function public.fail_job(uuid, text, integer, text)   from public, anon, authenticated;
grant execute on function public.complete_job(uuid, jsonb, text)     to service_role;
grant execute on function public.fail_job(uuid, text, integer, text) to service_role;

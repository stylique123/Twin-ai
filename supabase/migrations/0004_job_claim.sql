-- TwinAI Phase 3 — worker job-queue hardening (from the worker panel).
-- Makes the generic `jobs` queue safe for one or many workers:
--   * atomic claim via FOR UPDATE SKIP LOCKED (no two workers grab one job)
--   * visibility timeout: a crashed worker's "running" job is reclaimed
--   * retries with backoff + a max-attempts dead-letter
-- All RPCs are service-role only (the worker holds the service key server-side).

alter table public.jobs add column if not exists locked_at    timestamptz;
alter table public.jobs add column if not exists locked_by    text;
alter table public.jobs add column if not exists run_after    timestamptz not null default now();
alter table public.jobs add column if not exists max_attempts integer not null default 5;

create index if not exists jobs_claim_idx on public.jobs (status, run_after);

-- Claim the next eligible job of one of p_types. Returns 0 or 1 row.
-- Eligible = queued and due, OR running but past its visibility timeout (stale).
create or replace function public.claim_job(
  p_worker text, p_types text[], p_visibility_secs integer default 600
)
returns setof public.jobs
language plpgsql
security definer set search_path = public
as $$
begin
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
          or (status = 'running' and locked_at < now() - make_interval(secs => p_visibility_secs))
        )
      order by created_at
      for update skip locked
      limit 1
   )
  returning j.*;
end;
$$;

-- Mark a claimed job done with its result.
create or replace function public.complete_job(p_id uuid, p_result jsonb)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.jobs
     set status = 'done', result = coalesce(p_result, '{}'::jsonb),
         locked_at = null, locked_by = null, error = null, updated_at = now()
   where id = p_id;
end;
$$;

-- Fail a job: retry with backoff until max_attempts, then dead-letter (failed).
create or replace function public.fail_job(p_id uuid, p_error text, p_backoff_secs integer default 30)
returns void
language plpgsql
security definer set search_path = public
as $$
declare j public.jobs;
begin
  select * into j from public.jobs where id = p_id;
  if not found then return; end if;

  if j.attempts >= j.max_attempts then
    update public.jobs
       set status = 'failed', error = p_error, locked_at = null, locked_by = null, updated_at = now()
     where id = p_id;
  else
    update public.jobs
       set status = 'queued', error = p_error, locked_at = null, locked_by = null,
           run_after = now() + make_interval(secs => p_backoff_secs * (j.attempts + 1)), -- linear backoff
           updated_at = now()
     where id = p_id;
  end if;
end;
$$;

revoke all on function public.claim_job(text, text[], integer)   from public, anon, authenticated;
revoke all on function public.complete_job(uuid, jsonb)          from public, anon, authenticated;
revoke all on function public.fail_job(uuid, text, integer)      from public, anon, authenticated;
grant execute on function public.claim_job(text, text[], integer) to service_role;
grant execute on function public.complete_job(uuid, jsonb)        to service_role;
grant execute on function public.fail_job(uuid, text, integer)    to service_role;

-- transcripts — the worker's output for ingest/transcribe jobs (raw media is
-- discarded after analysis; only the text + word timings are kept).
create table if not exists public.transcripts (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references auth.users (id) on delete cascade,
  source_url   text,
  platform     text,
  language     text,
  duration_sec numeric,
  text         text,
  words        jsonb,   -- [{ w, start, end }]
  segments     jsonb,   -- [{ start, end, text }]
  created_at   timestamptz not null default now()
);
create index if not exists transcripts_owner_idx on public.transcripts (owner_id, created_at desc);

alter table public.transcripts enable row level security;
create policy "own transcripts read"  on public.transcripts for select using (auth.uid() = owner_id);
create policy "admin read transcripts" on public.transcripts for select using (public.is_platform_admin(auth.uid()));
-- Writes are service-role only (the worker), so no insert/update policy for clients.

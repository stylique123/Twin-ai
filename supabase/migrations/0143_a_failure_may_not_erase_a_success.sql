-- A FAILED RETRY MUST NOT DESTROY THE LAST KNOWN-GOOD ASSESSMENT.
--
-- ⚠️ THIS IS WRITTEN AFTER IT HAPPENED, NOT BEFORE. A forced re-run of 40
-- already-assessed videos hit a TikTok block; 38 of them returned a download
-- error, the handler upserted that error onto `url`, and 38 good profiles were
-- replaced by rows whose only content is a message about yt-dlp. The two that
-- read successfully proved the schema fix exactly as intended. The cost of that
-- proof was thirty-eight assessments we already owned.
--
-- ⚖️ AND THE INVARIANT ALREADY EXISTED ELSEWHERE, IN WORDS. The generation path
-- carries "a paid success must never be lost" and enforces it. This table was
-- written later, did not inherit it, and nothing noticed until a retry ran.
--
-- ── WHY THE DATABASE AND NOT THE WORKER ───────────────────────────────────
--
-- ⚠️ THE WORKER IS NOT THE ONLY WRITER. A driver script, a backfill, an operator
-- with psql and good intentions — each can upsert this table, and a rule that
-- lives in one TypeScript handler binds exactly one of them. The trigger below
-- binds all of them, including the next writer nobody has written yet.
--
-- ⚖️ MERGE SEMANTICS, STATED ONCE AND ENFORCED ONCE:
--
--     success + success  → replace (a newer read wins)
--     success + failure  → KEEP THE SUCCESS, record the attempt
--     failure + success  → promote (this is how a damaged row recovers)
--     failure + failure  → update the failure metadata only
--
-- The refusal is silent to the caller ON PURPOSE: a worker that crashed here
-- would retry the same URL forever, and a worker told "rejected" would have to
-- decide what that means. The attempt row is where the failure is durable.

-- ── THE ATTEMPT HISTORY ───────────────────────────────────────────────────
--
-- ⚠️ A FAILURE IS NOT A NON-EVENT. Discarding the overwrite without recording
-- it would mean a video that fails a hundred times looks identical to one that
-- has never been retried — and "which URLs keep failing, and with what" is the
-- question that would have caught the TikTok block hours earlier.
create table if not exists public.reference_assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  attempted_at timestamptz not null default now(),
  schema_version integer,
  -- 'success' | 'failure'. Not an enum: this table exists to record what
  -- happened, and a CHECK that refused an unexpected value would drop the
  -- record of the surprise.
  result_status text not null,
  error_message text,
  -- ⚖️ WHICH BUILD PRODUCED THIS. The 38 losses and the TikTok block landed in
  -- the same hour, and separating "our deploy broke it" from "the platform
  -- changed" took a manual read of two timestamps.
  worker_version text
);

create index if not exists reference_assessment_attempts_url_idx
  on public.reference_assessment_attempts (url, attempted_at desc);

alter table public.reference_assessment_attempts enable row level security;
-- System-owned, exactly as 0142: written by the worker under service_role,
-- readable by nobody through the API until something needs it.
revoke all on table public.reference_assessment_attempts from anon, authenticated;

-- ── THE RECOVERY SET ──────────────────────────────────────────────────────
--
-- ⚠️ NAMED, NOT "SOME FAILED ROWS". Thirty-eight specific URLs lost a profile
-- they had. Without a marker they are indistinguishable from the videos that
-- have simply never been read, and they would be recovered by luck or not at
-- all.
alter table public.reference_content_profiles
  add column if not exists recovery_batch text;

comment on column public.reference_content_profiles.recovery_batch is
  'Set when a row is KNOWN to have lost a good assessment to a failed retry. Null is the normal state. A row carrying this is a deterministic recovery target, not a video nobody has read.';

-- ── LAST KNOWN GOOD ───────────────────────────────────────────────────────
alter table public.reference_content_profiles
  add column if not exists last_success_at timestamptz;

update public.reference_content_profiles
  set last_success_at = assessed_at
  where error is null and last_success_at is null;

-- ── THE GUARD ─────────────────────────────────────────────────────────────
create or replace function public.reference_assessment_merge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.reference_assessment_attempts (
    url, schema_version, result_status, error_message, worker_version
  ) values (
    new.url,
    new.schema_version,
    case when new.error is null then 'success' else 'failure' end,
    left(new.error, 500),
    current_setting('twinai.worker_version', true)
  );

  -- SUCCESS + FAILURE → keep the success. Everything the failing run learned is
  -- already in the attempt row above.
  if old.error is null and new.error is not null then
    return old;
  end if;

  if new.error is null then
    new.last_success_at := new.assessed_at;
    -- FAILURE + SUCCESS is a recovery, and a recovered row is no longer a
    -- recovery target.
    new.recovery_batch := null;
  else
    new.last_success_at := old.last_success_at;
    new.recovery_batch := old.recovery_batch;
  end if;

  return new;
end;
$$;

drop trigger if exists reference_assessment_merge_guard on public.reference_content_profiles;
create trigger reference_assessment_merge_guard
  before update on public.reference_content_profiles
  for each row execute function public.reference_assessment_merge();

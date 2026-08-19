-- THE FIELDS THAT WOULD HAVE TOLD US, RECORDED BY THE ONLY PARTY THAT KNOWS.
--
-- ⚠️ `uploadForensics.ts` NAMES THIS TABLE'S ABSENCE AS THE REASON IT CANNOT
-- ANSWER. Two takes have read `uploading` since 2026-08-09 — 59.8MB and 123.7MB,
-- neither with an object in storage. A creator who closed the tab mid-upload and
-- a creator whose upload hung leave IDENTICAL rows, and `CANNOT_YET_DISTINGUISH`
-- says so in as many words: `upload_started_at`, `last_chunk_at` and
-- `retry_count` are what would separate them. This is those fields.
--
-- ⚖️ APPEND-ONLY, AND SEPARATE FROM `media_assets`. The asset row holds current
-- derived state and the server owns every field on it. What the client observed
-- is a different kind of fact with a different author, and mixing them would
-- mean widening the asset write path to accept client-supplied values — which
-- is precisely the hole 0139–0141 were written to close. A second table with no
-- UPDATE and no DELETE keeps the two authorities apart.
--
-- ⚠️ `abandoned` HERE IS A REPORT, NOT AN INFERENCE. The client may say it gave
-- up, because the client is the only party that knows. The SERVER may never
-- conclude abandonment from elapsed time alone — an asset sitting in `uploading`
-- with no report stays STALLED/unknown. `unknown ≠ false`.

create table if not exists public.media_upload_attempts (
  id             uuid primary key default gen_random_uuid(),
  asset_id       uuid not null references public.media_assets(id) on delete cascade,
  owner_id       uuid not null references auth.users(id) on delete cascade,

  -- ⚠️ WHAT THE CLIENT SAW, AND NOTHING ELSE. No status, no duration, no
  -- mime_type, no storage_path, no processing_state. Those are the server's to
  -- derive; accepting them here would rebuild the write hole with a REST façade.
  started_at        timestamptz,
  last_progress_at  timestamptz,
  bytes_sent        bigint,
  attempt_number    integer,
  outcome           text not null,
  failure_code      text,

  -- Server-stamped, never client-supplied.
  reported_at    timestamptz not null default now(),

  constraint media_upload_attempts_outcome_known
    check (outcome in ('progressing', 'failed', 'abandoned')),
  constraint media_upload_attempts_bytes_sane
    check (bytes_sent is null or bytes_sent >= 0),
  constraint media_upload_attempts_attempt_sane
    check (attempt_number is null or (attempt_number >= 1 and attempt_number <= 1000)),
  constraint media_upload_attempts_failure_code_bounded
    check (failure_code is null or char_length(failure_code) <= 200)
);

create index if not exists media_upload_attempts_asset_idx
  on public.media_upload_attempts (asset_id, reported_at desc);
create index if not exists media_upload_attempts_owner_idx
  on public.media_upload_attempts (owner_id, reported_at desc);

alter table public.media_upload_attempts enable row level security;

-- ⚖️ THE CREATOR MAY READ THEIR OWN REPORTS AND WRITE NONE OF THEM. Every row
-- arrives through the edge function, which checks ownership of the asset and
-- writes with privileged access. There is deliberately NO insert policy: a
-- client that can write this table directly can write a report about an attempt
-- that never happened, and the whole value of the table is that it is evidence.
drop policy if exists media_upload_attempts_select_own on public.media_upload_attempts;
create policy media_upload_attempts_select_own on public.media_upload_attempts
  for select using (auth.uid() = owner_id);

-- ⚠️ NO INSERT, NO UPDATE, NO DELETE POLICY, DELIBERATELY. Append-only means a
-- report cannot be amended after the fact, and a later report is a NEW ROW —
-- which is also how `attempt_number` stays meaningful.

-- ⚠️ RLS DOES NOT GATE `TRUNCATE`, AND THE SELECT-ONLY POLICY ABOVE IS NOT
-- ENOUGH WITHOUT THIS. A newly created table carries a default TRUNCATE grant
-- for the client roles, row security is never consulted for it, and "append-only
-- evidence a client can empty in one statement" is not append-only. This is the
-- whole permission, with nothing behind it.
--
-- ⚖️ AND 0140 DID NOT COVER IT, THOUGH IT EXPECTED TO. That migration revoked
-- TRUNCATE from every public table and reasoned that "the next table created
-- will inherit the same default grant and this should already cover it" — but a
-- migration is a one-time event, not a standing policy, so it covered every
-- table that existed IN 2026-08 AND NOTHING SINCE. This table is the proof, and
-- it was caught by `check_client_write_grants.sql` in CI rather than by anybody
-- noticing. Every future table needs its own revoke until that guard is what
-- creates them.
revoke truncate on table public.media_upload_attempts from anon, authenticated;

comment on table public.media_upload_attempts is
  'Append-only client reports of what an upload attempt did. Evidence, not state; media_assets keeps current/derived state. See packages/shared/src/uploadForensics.ts.';

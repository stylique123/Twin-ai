-- WHAT THE CREATOR DID WHEN TWIN WARNED THEM.
--
-- ⚠️ THIS TABLE IS THE ONLY THING THAT WILL EVER SAY WHETHER THE GATE IS ANY
-- GOOD. TwinAI is talking-head only, and the gate warns rather than blocks
-- because Twin agreed with a human on 73% of the visual claims it was judged on
-- (run 7204de6f: 75 SUPPORTED of 103 answered). A component wrong about one
-- video in four must not be able to stop anyone. But "warn and let them
-- continue" with nothing recorded is not a decision, it is a shrug: nobody can
-- say afterwards whether the warnings were right, so nobody can ever tighten or
-- loosen them on evidence.
--
-- ⚠️ BOTH CHOICES ARE RECORDED, NOT ONLY THE OVERRIDES, and this is the whole
-- design. A table of overrides alone has no denominator — "40 people ignored the
-- warning" is unreadable without knowing whether 45 saw it or 4,500. Logging the
-- agreements too makes the useful question answerable: of everyone Twin warned,
-- what share took the advice? A denominator that excludes the non-answers is not
-- a measurement.
--
-- ⚖️ APPEND-ONLY, AND WHAT THE CLIENT SAW ONLY, exactly like
-- media_upload_attempts (0149). The creator's choice is a different kind of fact
-- with a different author from anything the server derives, and mixing them
-- would mean widening a server write path to accept client-supplied judgement.
-- No UPDATE, no DELETE, and the verdict fields describe what TWIN said — they
-- are copied from the early look, never re-decided here.
--
-- ⚠️ AND `unsure` NEVER APPEARS HERE, because a creator who was never warned made
-- no choice. An `unsure` early look passes silently; writing a row for it would
-- put people who saw nothing into the denominator of a question about people who
-- saw a warning.

create table if not exists public.talking_head_overrides (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,

  -- Which ingest job's early look produced the warning. Nullable because the
  -- job row is reaped long before this record stops being useful, and losing the
  -- link must not lose the choice.
  job_id        uuid,

  -- ⚠️ WHAT TWIN SAID, copied from the early look rather than recomputed. If the
  -- rules change later, these rows still say what the creator was actually told,
  -- which is the only version that explains what they did about it.
  reason        text not null,
  frames_looked_at integer,

  -- ⚠️ WHAT THE CREATOR DID. The point of the table.
  choice        text not null,

  -- Server-stamped, never client-supplied.
  reported_at   timestamptz not null default now(),

  constraint talking_head_overrides_reason_known
    check (reason in ('ANIMATED', 'NOBODY_ON_CAMERA', 'NOBODY_TALKING_TO_CAMERA')),
  constraint talking_head_overrides_choice_known
    check (choice in ('used_anyway', 'picked_another'))
);

-- The question this table exists to answer is per-creator and recent-first.
create index if not exists talking_head_overrides_owner_time
  on public.talking_head_overrides (owner_id, reported_at desc);

-- The other question is "which reason does Twin get wrong most often".
create index if not exists talking_head_overrides_reason_choice
  on public.talking_head_overrides (reason, choice);

alter table public.talking_head_overrides enable row level security;

-- ⚠️ INSERT AND SELECT ONLY, AND ONLY YOUR OWN. There is deliberately no UPDATE
-- and no DELETE policy: a record of what somebody chose is worthless if it can
-- be edited afterwards, and this is evidence about OUR product rather than the
-- creator's content.
--
-- ⚖️ RE-RUNNABLE. Migrations here must survive being applied twice, so every
-- policy is dropped before it is created rather than assumed absent.
drop policy if exists talking_head_overrides_insert_own on public.talking_head_overrides;
create policy talking_head_overrides_insert_own
  on public.talking_head_overrides for insert
  with check (auth.uid() = owner_id);

drop policy if exists talking_head_overrides_select_own on public.talking_head_overrides;
create policy talking_head_overrides_select_own
  on public.talking_head_overrides for select
  using (auth.uid() = owner_id);

-- ⚠️ TRUNCATE IS NOT GATED BY ROW SECURITY, SO THE GRANT IS THE WHOLE
-- PERMISSION. A new table inherits client grants by default, and RLS only ever
-- filters ROWS: it has nothing to say about a statement that empties the table.
-- Left as created, any authenticated client could destroy the entire override
-- log in one statement — the exact evidence this table exists to hold, and the
-- only evidence that will ever say whether the gate is worth having.
--
-- ⚖️ AND DELETE AND UPDATE GO WITH IT, for the reason stated above: a record of
-- what somebody chose is worthless if it can be edited or removed afterwards.
-- The policies above grant INSERT and SELECT only; these revokes make that the
-- real permission rather than a description of one.
--
-- ⚠️ THE STAGING GUARD CAUGHT THIS, NOT REVIEW. check_client_write_grants.sql
-- failed the matrix with "client roles hold TRUNCATE on: talking_head_overrides
-- ... there is no legitimate client caller". It was right, and the fix is to
-- revoke the grant rather than to quieten the check.
revoke update, delete, truncate on table public.talking_head_overrides from anon, authenticated;

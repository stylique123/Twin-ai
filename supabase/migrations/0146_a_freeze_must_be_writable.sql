-- THE GUARD WAS SO GOOD AT ITS JOB THAT IT ATE THE FREEZE.
--
-- ⚠️ THE MARKER NEVER LANDED, AND IT LOOKED LIKE IT HAD. `0143` reverts
-- `recovery_batch` to its OLD value on any update that leaves the row in a
-- failure state:
--
--     else
--       new.last_success_at := old.last_success_at;
--       new.recovery_batch  := old.recovery_batch;   -- <— eats the freeze
--
-- So `update … set recovery_batch = 'proof_410_damage'` on a damaged row
-- reported "UPDATE 38" and changed nothing. Every row still read NULL. The
-- freeze meant to protect the evidence of the incident was itself silently
-- discarded by the fix for that incident — the same class of failure one layer
-- up: a write that reports success and is thrown away.
--
-- ⚠️ AND EVERY UPDATE LOGGED AN ATTEMPT, WHICH MADE THE RECORD AMBIGUOUS. The
-- trigger inserted into `reference_assessment_attempts` unconditionally, so a
-- bookkeeping write was recorded as an assessment `failure` indistinguishable
-- from a real one. Thirty-eight failure rows at a single instant could equally
-- be the damage, or the freeze that tried to mark the damage. A record that
-- cannot tell those apart is not a record.
--
-- ── A WHITELIST OF ONE COLUMN, NOT A BLACKLIST OF THE REST ────────────────
--
-- ⚖️ A WRITE IS BOOKKEEPING ONLY IF `recovery_batch` IS THE SOLE DIFFERENCE.
-- Stated as "everything else is identical" rather than "these fields changed",
-- so a column added to this table next year is protected by default instead of
-- being quietly writable until somebody notices. Anything else — a new profile,
-- a new error, a new `assessed_at`, even the same values written again — is an
-- assessment and goes through the full merge rules.
--
-- ⚠️ THE DESTRUCTIVE-RETRY GUARD IS UNCHANGED AND MUST STAY UNCHANGED. A failure
-- still may not erase a success; `last_success_at` is still never overwritten by
-- a failure; a failed recovery attempt still cannot clear the marker. Widening
-- this to "let an update through when it looks harmless" is precisely the move
-- that cost 38 assessments in the first place — which is why the condition below
-- is an exhaustive equality check and not a judgement about intent.
create or replace function public.reference_assessment_merge()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  -- `is not distinct from` rather than `=` throughout: NULL is the common value
  -- in most of these columns, and `null = null` is null, not true — a plain
  -- equality chain would classify almost every write as an assessment.
  is_bookkeeping boolean :=
        (new.recovery_batch is distinct from old.recovery_batch)
    and (new.url               is not distinct from old.url)
    and (new.platform          is not distinct from old.platform)
    and (new.schema_version    is not distinct from old.schema_version)
    and (new.profile           is not distinct from old.profile)
    and (new.rejections        is not distinct from old.rejections)
    and (new.fields_accepted   is not distinct from old.fields_accepted)
    and (new.transcript_source is not distinct from old.transcript_source)
    and (new.paid_because      is not distinct from old.paid_because)
    and (new.transcript_chars  is not distinct from old.transcript_chars)
    and (new.error             is not distinct from old.error)
    and (new.assessed_at       is not distinct from old.assessed_at)
    and (new.last_success_at   is not distinct from old.last_success_at);
begin
  -- The label moves and nothing else does — by the definition above, there is
  -- nothing else to protect here.
  if is_bookkeeping then
    return new;
  end if;

  insert into public.reference_assessment_attempts (
    url, schema_version, result_status, error_message, worker_version
  ) values (
    new.url,
    new.schema_version,
    case when new.error is null then 'success' else 'failure' end,
    left(new.error, 500),
    current_setting('twinai.worker_version', true)
  );

  -- ⚠️ UNCHANGED FROM 0143. A FAILED RETRY MAY NOT DESTROY THE LAST KNOWN-GOOD
  -- STATE. This is the line the incident was about.
  if old.error is null and new.error is not null then
    return old;
  end if;

  if new.error is null then
    new.last_success_at := new.assessed_at;
    new.recovery_batch  := null;
  else
    new.last_success_at := old.last_success_at;
    -- ⚖️ STILL PRESERVED ACROSS AN ASSESSMENT WRITE. A failed re-run must not
    -- clear the label saying why this row is watched; only a SUCCESS clears it,
    -- above, because a success is what the label was waiting for.
    new.recovery_batch  := old.recovery_batch;
  end if;
  return new;
end;
$function$;

-- Wave 1 (#4) — refund the recreation when a paid auto-edit dead-letters.
--
-- enqueue-autoedit charges a credit (a "recreation") BEFORE queuing the job. If
-- the worker then fails it past max_attempts (yt-dlp/ffmpeg/Revideo crash, VPS
-- OOM, render service down), fail_job sets status='failed' and NOTHING refunds —
-- the user paid and got no video. (generate-blueprint already refunds on failure;
-- the worker-job path was the gap.)
--
-- This trigger refunds the exact charged amount, exactly once, on the
-- ->failed dead-letter, for jobs that were actually charged. enqueue-autoedit now
-- stamps `charged`/`cost` into the payload so this can be precise and idempotent
-- (the `old.status is distinct from 'failed'` guard means it fires once).

create or replace function public.refund_failed_autoedit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.type = 'autoedit'
     and new.status = 'failed'
     and old.status is distinct from 'failed'
     and coalesce((new.payload->>'charged')::boolean, false)
     and new.owner_id is not null then
    perform public.refund_credits(
      new.owner_id,
      coalesce((new.payload->>'cost')::integer, 10),
      'edit_failed_refund'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_refund_failed_autoedit on public.jobs;
create trigger trg_refund_failed_autoedit
  after update on public.jobs
  for each row execute function public.refund_failed_autoedit();

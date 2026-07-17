-- Part 1 of the one-click-editor rebuild: the old AI editor was removed.
-- Repository deletion stops the app and edge functions from ENQUEUEING an
-- `autoedit` job, but that is weaker than a database guarantee. This forward
-- migration makes the prohibition structural: any INSERT of a job with
-- type='autoedit' is rejected at the database level, for EVERY role including
-- the service role (triggers fire regardless of the caller's role or RLS).
--
-- This is deliberately a BEFORE INSERT trigger, not a CHECK constraint:
--   * It blocks CREATION of new autoedit work (the actual risk).
--   * It leaves the historical autoedit rows (all status='done') fully intact
--     and still UPDATE-able, so nothing about past records, refunds, or admin
--     metrics changes. A CHECK on `type` would also re-validate on any UPDATE
--     of those historical rows.
--
-- The rebuilt editor MUST register a NEW job type (see
-- docs/ai-editor-rebuild-status.md); it must not reuse 'autoedit'. To retire
-- this guard for a differently-named editor, drop the trigger in a later
-- migration — it does not need to be reused.

create or replace function public.reject_new_autoedit_job()
returns trigger
language plpgsql
as $$
begin
  if new.type = 'autoedit' then
    raise exception
      'autoedit jobs are permanently disabled: the old AI editor was removed (see docs/ai-editor-rebuild-status.md). The rebuilt editor must use a new job type.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reject_new_autoedit on public.jobs;
create trigger trg_reject_new_autoedit
  before insert on public.jobs
  for each row
  execute function public.reject_new_autoedit_job();

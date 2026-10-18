-- CHECK THIS LINE (backlog d, trial only): a gate REVIEW line the creator
-- confirmed as true for her is saved as her fact with source 'check_line'
-- (generate-blueprint mode 'check_line'; creator_confirmed_at is set).
-- Idempotent: the constraint is dropped by name first.
-- FILE ONLY: not applied. Apply before CHECK_LINE_KILL is lifted for the trial.
alter table public.creator_knowledge drop constraint if exists creator_knowledge_source_check;
alter table public.creator_knowledge add constraint creator_knowledge_source_check
  check (source is null or source in ('caption', 'transcript', 'user', 'previous_video', 'asked', 'reply', 'comment', 'check_line'));

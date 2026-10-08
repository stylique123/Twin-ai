-- Lessons learned from the batch harness (the test account's audited runs) are
-- not something a creator taught Twin. They are flagged so the writer's lesson
-- selection (packages/shared/src/script/lessonSelect.ts) can drop them.
-- Readers tolerate this column being absent until it is applied.
alter table public.creator_lessons
  add column if not exists synthetic boolean not null default false;

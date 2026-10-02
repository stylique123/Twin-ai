-- ⚖️ THE ANGLE SHE PICKS IS A LESSON (owner brief 2026-10-01), through the same
-- learn_lesson path her hook picks already use: a new source, and a marker so
-- each generation's pick is learned once.
alter table public.creator_lessons drop constraint if exists creator_lessons_source_check;
alter table public.creator_lessons add constraint creator_lessons_source_check
  check (source in ('rating', 'rating_tag', 'audience', 'hook_pick', 'angle_pick'));
alter table public.generations add column if not exists angle_lesson_at timestamptz;

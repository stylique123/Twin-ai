-- UNANSWERED QUESTIONS UNDER HER POSTS. The social function's cron tick reads
-- comments on posts Twin published and keeps the questions she never replied
-- to. The worker files each one into her private brain as an objection note
-- (`filed_at`), so her next script answers it. Only the question is stored.
create table if not exists public.post_questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  platform text not null,
  external_comment_id text not null,
  question text not null check (length(question) between 12 and 240),
  asked_at timestamptz,
  created_at timestamptz not null default now(),
  filed_at timestamptz,
  unique (platform, external_comment_id)
);
create index if not exists post_questions_unfiled on public.post_questions (created_at) where filed_at is null;
alter table public.post_questions enable row level security;
drop policy if exists post_questions_owner_read on public.post_questions;
create policy post_questions_owner_read on public.post_questions for select using (owner_id = auth.uid());
alter table public.posts add column if not exists questions_synced_at timestamptz;

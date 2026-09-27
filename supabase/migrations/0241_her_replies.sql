-- HER OWN REPLIES UNDER HER POSTS (24-ideas #9). When she answered an audience
-- question, the social cron keeps her reply beside it; the worker files it into
-- `creator_knowledge` with the new source 'reply' (her words, first person,
-- the question kept as the evidence). `reply_filed_at` marks it filed.
alter table public.post_questions add column if not exists her_reply text
  check (her_reply is null or length(her_reply) between 1 and 240);
alter table public.post_questions add column if not exists reply_filed_at timestamptz;
create index if not exists post_questions_reply_unfiled on public.post_questions (created_at)
  where her_reply is not null and reply_filed_at is null;

alter table public.creator_knowledge drop constraint if exists creator_knowledge_source_check;
alter table public.creator_knowledge add constraint creator_knowledge_source_check
  check (source is null or source in ('caption', 'transcript', 'user', 'previous_video', 'asked', 'reply'));

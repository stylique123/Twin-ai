-- Auto-publishing records why a post failed so the Calendar can show it and the
-- creator can retry. The publish paths (social edge fn: interactive `publish` +
-- cron `publish_due`) set status='failed' + error on any adapter failure.
alter table public.posts add column if not exists error text;

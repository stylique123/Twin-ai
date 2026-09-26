-- VIEWS BACK FROM THE PLATFORMS. The social function's cron tick now re-reads
-- views/likes/comments for posts Twin published in the last 30 days (at most
-- every 6 hours) and writes them into `generation_outcomes`, which the niche
-- brain's learner already reads. This column records when a post was last read.
alter table public.posts add column if not exists stats_synced_at timestamptz;

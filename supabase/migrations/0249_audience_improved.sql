-- What the test viewers changed before the creator saw the script:
-- hook and watch-to-end counts before and after, hooks added, lines rewritten.
alter table public.audience_tests add column if not exists improved jsonb;

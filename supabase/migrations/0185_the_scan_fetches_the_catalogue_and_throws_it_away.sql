-- THE SCAN READS EVERY POST AND KEEPS NONE OF THEM.
--
-- ⚠️ MEASURED, NOT SUSPECTED. `dna_cache` holds 31 scans. Its `profile` column
-- has exactly 23 keys — audience, tone, hook_patterns, niche, vocabulary and so
-- on — and NOT ONE of them is the posts. `scrape_dna` fetches the creator's
-- catalogue, hands it to `synthesizeVoiceFromPosts` and
-- `extractKnowledgeFromCaptions`, and then the array goes out of scope. The
-- captions and the view counts are used in memory and dropped on the floor.
--
-- ⚖️ THE `posts` TABLE IS NOT THIS. It holds videos published THROUGH TwinAI --
-- 6 rows, 0 with a view count. A creator's existing back catalogue has never had
-- anywhere to live.
--
-- ── WHAT THAT COSTS, AND IT IS TWO SEPARATE THINGS ────────────────────────
--
-- 1. THE CREATOR'S OWN NUMBERS ARE UNAVAILABLE. A physio whose appreciation post
--    did 70,600 and whose parody did 543,000 has that written nowhere we can
--    read. `voice.ts` ranks by `plays` to pick which videos to transcribe and
--    formats the figure into a prompt string -- and that string is the only
--    place the number has ever existed. Nothing can ask "which of your videos
--    actually worked", because nothing kept the answer.
--
-- 2. THE CAPTION CAP CANNOT BE JUDGED. `extractKnowledgeFromCaptions` takes the
--    first 120 captions and then cuts the joined corpus to 12,000 characters.
--    The transcript path had the identical `.slice(0, 12000)` and it was replaced
--    with batching, under a comment recording that 12,000 characters is three
--    videos. Whether the caption cap discards a third of the material or none of
--    it is unanswerable today, because the input was never stored. Tuning it
--    without that is picking a number and hoping.
--
-- ⚖️ SO THE READER OF THIS TABLE IS THE MEASUREMENT, AND THAT IS A REAL READER.
-- 0175 made exactly this argument for the 'shown' outcome and it held: the count
-- is what makes the next decision evidential. Both questions above become
-- answerable with one query the moment a scan has run.
--
-- ⚠️ AND IT IS DELIBERATELY NOT WIRED INTO THE WRITER YET. Feeding stored posts
-- back into voice synthesis or knowledge extraction would change what creators
-- get, on the strength of a store nothing has validated. First keep the rows,
-- then look at them, then decide. The opposite order is how a cap gets set from
-- a reconstruction of a symptom.

create table if not exists public.scraped_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- Which voice this scan built. Nullable because a scan can fail after the
  -- fetch and before the voice row exists, and the posts are still worth keeping.
  voice_id uuid,
  platform text not null,
  handle text not null,

  -- The post itself.
  url text not null,
  /** The caption or title, verbatim, as `ScrapedPost.text`. */
  caption text not null,
  hashtags text[] not null default '{}',
  cover_url text,

  -- ⚠️⚠️ NULLABLE, AND THIS IS THE WHOLE REASON THE COLUMN IS WORTH HAVING.
  -- Every scraper coerced a missing count to 0 until the change that precedes
  -- this one, so "nobody watched it" and "the platform did not tell us" were the
  -- same number. NULL here means NOT READ. A zero means zero. Storing them any
  -- other way would preserve the ambiguity in a table built to end it.
  plays bigint,
  likes bigint,

  -- When this row was observed. A play count is a measurement at a moment, not a
  -- property of the video, and a reader comparing two scans needs to know which
  -- is which.
  observed_at timestamptz not null default now(),

  constraint scraped_posts_plays_nonneg check (plays is null or plays >= 0),
  constraint scraped_posts_likes_nonneg check (likes is null or likes >= 0),
  constraint scraped_posts_url_present check (length(btrim(url)) > 0),
  -- The extractor already drops empty captions before this point; the database
  -- refusing them keeps a row that carries nothing out of a corpus that exists to
  -- be counted.
  constraint scraped_posts_caption_present check (length(btrim(caption)) > 0)
);

-- ⚠️ ONE ROW PER POST PER CREATOR, AND A RE-SCAN UPDATES IT. Without this, every
-- re-scan would duplicate the whole catalogue and any count of "how many posts
-- does this creator have" would grow with the number of times they pressed the
-- button. The upsert target is (owner_id, url): the same video re-observed is
-- the same video.
create unique index if not exists scraped_posts_one_per_url
  on public.scraped_posts (owner_id, url);

-- The two queries this exists to serve: a creator's catalogue newest-first, and
-- their best-performing posts.
create index if not exists scraped_posts_owner_observed
  on public.scraped_posts (owner_id, observed_at desc);
-- ⚖️ `nulls last` IS THE POINT OF THE INDEX. An unread count must not sort as a
-- flop -- the same rule the ranking comparator now follows in code.
create index if not exists scraped_posts_owner_plays
  on public.scraped_posts (owner_id, plays desc nulls last);

alter table public.scraped_posts enable row level security;

-- ⚠️ THE CREATOR MAY READ THEIR OWN CATALOGUE AND NOTHING ELSE. The worker writes
-- through the service role, which bypasses RLS; there is deliberately no client
-- INSERT policy, because a client that could write here could invent a view
-- count for a video it does not own.
drop policy if exists scraped_posts_select_own on public.scraped_posts;
create policy scraped_posts_select_own on public.scraped_posts
  for select using (auth.uid() = owner_id);

-- ⚠️ `revoke all` FIRST, THEN GRANT BACK EXACTLY SELECT — 0172's ruling, and the
-- lesson 0183 had to learn twice in one day. Supabase's default privileges hand
-- `anon` and `authenticated` the full verb set on a new public table, and RLS
-- does not gate TRUNCATE, so enumerating verbs to revoke is how the hole gets
-- left open. `anon` gets nothing back: the policy tests `auth.uid()`, so an
-- anonymous caller could never satisfy it.
revoke all on table public.scraped_posts from anon, authenticated;
grant select on table public.scraped_posts to authenticated;

comment on table public.scraped_posts is
  'The creator''s own back catalogue as the DNA scan observed it: caption, url, '
  'hashtags and the play/like counts. Before this the scan fetched every post, '
  'used it in memory and discarded it, so a creator''s real view counts existed '
  'nowhere and the caption cap could not be judged against its own input. '
  'Read-only to the creator; written by the worker through the service role.';

comment on column public.scraped_posts.plays is
  'NULL means the platform did not give us a count — NOT that nobody watched. '
  'Zero means zero. Every scraper coerced the two together until the change that '
  'precedes this table.';

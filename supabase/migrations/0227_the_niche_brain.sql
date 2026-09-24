-- THE NICHE BRAIN — step 1: READ every corpus video once, SORT what it teaches.
--
-- ⚠️ MEASURED 2026-09-24, BEFORE THIS WAS WRITTEN. 6,793 gallery rows, 4,346
-- creators, 108 distinct `niche` labels. The label is the niche of the creator
-- whose SEARCH found the video, not what the video is about, and `why` is a
-- template ("Rides trending hashtags for distribution.") on almost every row.
-- So nothing in the corpus could be sorted by topic, sub-niche, mode or
-- persuasion shape: the information was never extracted.
--
-- ⚖️ PURELY ADDITIVE. Three new tables. No existing table, column, policy or
-- function is touched, and nothing on the script path reads these yet — the
-- Strategist (step 2) is the first reader. A failure here can only mean the
-- brain is empty, never that a script, scan or remix breaks.
--
-- ⚖️ WRITTEN ONLY BY THE WORKER (service role). Readable by signed-in users
-- because every row is derived from the shared public corpus — no creator's
-- private data lives here in step 1.

create extension if not exists vector with schema extensions;

-- ── 1. ONE READ PER VIDEO ─────────────────────────────────────────────────────
-- What the video actually is, as Gemini read it. `version` makes a better
-- reader re-read the corpus by bumping one constant (same rule as caption_shape).
create table if not exists public.corpus_reads (
  gallery_item_id uuid primary key references public.gallery_items(id) on delete cascade,
  version        integer not null,
  status         text not null check (status in ('read','unreadable','failed')),
  bucket         text,
  sub_niche      text,
  topic          text,
  mode           text check (mode in ('educate','entertain','teach','inspire','sell')),
  goal           text check (goal in ('views','leads','sales','authority','community')),
  language       text,
  hook_type      text,
  hook_pattern   text,
  -- what is said BEFORE the ask, the ask itself, and AFTER it
  structure      jsonb,
  -- proof used, objection answered, call to action
  persuasion     jsonb,
  why_it_works   text,
  views          bigint,
  model          text,
  failure        text,
  read_at        timestamptz not null default now()
);
create index if not exists corpus_reads_sub_niche on public.corpus_reads (bucket, sub_niche);
create index if not exists corpus_reads_version on public.corpus_reads (version);

-- ── 2. THE NOTES (the Obsidian part) ─────────────────────────────────────────
-- One idea per row. The librarian MERGES a new sighting into an existing note
-- (times_seen + sources grow) instead of writing a duplicate, so a note seen in
-- forty videos is one strong note, not forty weak ones.
create table if not exists public.brain_notes (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('topic','hook','angle','proof','objection','cta')),
  bucket      text,
  sub_niche   text,
  mode        text,
  goal        text,
  key         text not null,              -- normalised title, the exact-match fallback
  title       text not null,
  body        text,
  embedding   extensions.vector(768),     -- null when embedding was unavailable
  times_seen  integer not null default 1,
  total_views bigint not null default 0,
  sources     jsonb not null default '[]'::jsonb,  -- last 25 gallery_item ids
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  unique (kind, bucket, sub_niche, key)
);
create index if not exists brain_notes_place on public.brain_notes (bucket, sub_niche, kind);
create index if not exists brain_notes_last_seen on public.brain_notes (last_seen desc);

-- ── 3. THE LINKS ─────────────────────────────────────────────────────────────
create table if not exists public.brain_links (
  from_id   uuid not null references public.brain_notes(id) on delete cascade,
  to_id     uuid not null references public.brain_notes(id) on delete cascade,
  relation  text not null check (relation in ('opened_with','argued_by','proved_by','answers','closes_with','related')),
  weight    integer not null default 1,
  primary key (from_id, to_id, relation)
);

alter table public.corpus_reads enable row level security;
alter table public.brain_notes  enable row level security;
alter table public.brain_links  enable row level security;
drop policy if exists corpus_reads_read on public.corpus_reads;
create policy corpus_reads_read on public.corpus_reads for select to authenticated using (true);
drop policy if exists brain_notes_read on public.brain_notes;
create policy brain_notes_read on public.brain_notes  for select to authenticated using (true);
drop policy if exists brain_links_read on public.brain_links;
create policy brain_links_read on public.brain_links  for select to authenticated using (true);

-- ── NEAREST NOTE, BY MEANING ─────────────────────────────────────────────────
-- The librarian's "have I seen this before?" — same kind, same sub-niche.
create or replace function public.brain_nearest(
  p_embedding extensions.vector(768), p_kind text, p_bucket text, p_sub_niche text, p_k integer default 3
) returns table (id uuid, key text, similarity double precision)
language sql stable security definer set search_path = public, extensions as $$
  select n.id, n.key, 1 - (n.embedding <=> p_embedding) as similarity
  from public.brain_notes n
  where n.kind = p_kind
    and n.bucket is not distinct from p_bucket
    and n.sub_niche is not distinct from p_sub_niche
    and n.embedding is not null
  order by n.embedding <=> p_embedding
  limit greatest(1, least(p_k, 10));
$$;
revoke all on function public.brain_nearest(extensions.vector, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.brain_nearest(extensions.vector, text, text, text, integer) to service_role;

-- ── SUB-NICHES SEEN SO FAR IN A BUCKET ───────────────────────────────────────
-- Handed to the reader so it REUSES a label instead of inventing a near-copy
-- (the corpus already had 554 singleton topic labels out of 634).
create or replace function public.brain_subniches(p_bucket text, p_limit integer default 40)
returns table (sub_niche text, n bigint)
language sql stable security definer set search_path = public as $$
  select r.sub_niche, count(*) from public.corpus_reads r
  where r.status = 'read' and (p_bucket is null or r.bucket = p_bucket) and r.sub_niche is not null
  group by r.sub_niche order by count(*) desc limit greatest(1, least(p_limit, 100));
$$;
revoke all on function public.brain_subniches(text, integer) from public, anon, authenticated;
grant execute on function public.brain_subniches(text, integer) to service_role;

-- ── WHAT HAS NOT BEEN READ YET ───────────────────────────────────────────────
-- ⚠️ AN RPC, NOT A CLIENT-SIDE DIFF: PostgREST caps a plain select at 1,000 rows,
-- so "fetch every read id, subtract" would silently stop seeing the backlog.
create or replace function public.brain_unread(p_version integer, p_limit integer default 15)
returns setof public.gallery_items
language sql stable security definer set search_path = public as $$
  select g.* from public.gallery_items g
  where not exists (
    select 1 from public.corpus_reads r where r.gallery_item_id = g.id and r.version >= p_version
  )
  order by g.created_at desc
  limit greatest(1, least(p_limit, 100));
$$;
revoke all on function public.brain_unread(integer, integer) from public, anon, authenticated;
grant execute on function public.brain_unread(integer, integer) to service_role;

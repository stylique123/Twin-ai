-- ⚠️ OWNER BRIEF 2026-10-01 (comments, stories, analytics). Twin read comments
-- only under posts IT published (post_questions, 0240) — 5 posts ever, 0 rows —
-- and filed them straight into her brain without asking her. Her 600+ scraped
-- posts' comments were never read. This makes every comment source one path,
-- copied from "found you elsewhere" (0243):
--   read on a slow cadence → CANDIDATE → she confirms (and may answer, and say
--   which product it is about) → only then filed as knowledge.
-- Private matter is dropped before a candidate exists (worker, isPrivate), and
-- the filed row goes through the same store, view, exclusion and product scope
-- as every other fact.
create table if not exists public.comment_candidates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  voice_id uuid references public.brand_voices(id) on delete set null,
  platform text not null,
  -- The post it was asked under: a scraped post of hers, or one Twin published.
  post_url text,
  post_id uuid references public.posts(id) on delete set null,
  external_comment_id text not null,
  kind text not null check (kind in ('question', 'request')),
  text text not null check (length(text) between 12 and 240),
  -- Same question under several posts counts once, asked N times.
  times_asked int not null default 1 check (times_asked >= 1),
  likes int not null default 0,
  status text not null default 'found' check (status in ('found', 'confirmed', 'rejected')),
  product_entity_id uuid references public.product_entities(id) on delete set null,
  answer text check (answer is null or length(answer) between 1 and 240),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  filed_at timestamptz,
  unique (owner_id, platform, external_comment_id)
);
create index if not exists comment_candidates_open on public.comment_candidates (owner_id, created_at desc) where status = 'found';
create index if not exists comment_candidates_unfiled on public.comment_candidates (decided_at) where status = 'confirmed' and filed_at is null;
alter table public.comment_candidates enable row level security;
drop policy if exists comment_candidates_owner_read on public.comment_candidates;
create policy comment_candidates_owner_read on public.comment_candidates for select using (owner_id = auth.uid());

create table if not exists public.comment_reads (
  voice_id uuid primary key references public.brand_voices(id) on delete cascade,
  read_at timestamptz not null default now(),
  posts int not null default 0,
  comments int not null default 0,
  candidates int not null default 0,
  failure text
);
alter table public.comment_reads enable row level security;

-- She decides; nobody else can. A product id must be one of hers.
create or replace function public.decide_comment(p_id uuid, p_use boolean, p_product uuid default null, p_answer text default null)
returns boolean language sql security definer set search_path = public as $$
  with u as (
    update public.comment_candidates
       set status = case when p_use then 'confirmed' else 'rejected' end,
           decided_at = now(),
           product_entity_id = case when p_use and exists (select 1 from public.product_entities e
                                     where e.id = p_product and e.owner_id = auth.uid()) then p_product end,
           answer = case when p_use then nullif(left(btrim(coalesce(p_answer, '')), 240), '') end
     where id = p_id and owner_id = auth.uid() and status = 'found'
    returning 1)
  select exists(select 1 from u);
$$;
revoke all on function public.decide_comment(uuid, boolean, uuid, text) from public, anon;
grant execute on function public.decide_comment(uuid, boolean, uuid, text) to authenticated;

-- One voice at a time (TikTok / Instagram, where her comments are public),
-- ready, not read in 30 days, with her top posts by plays.
create or replace function public.comments_due(p_limit integer default 1)
returns table (voice_id uuid, owner_id uuid, platform text, handle text, urls text[])
language sql stable security definer set search_path = public as $$
  select v.id, v.owner_id, v.platform, v.handle,
         (select array_agg(u) from (select s.url as u from public.scraped_posts s
            where s.voice_id = v.id and s.url is not null order by s.plays desc nulls last limit 6) t)
  from public.brand_voices v
  left join public.comment_reads r on r.voice_id = v.id
  where v.status = 'ready' and v.platform in ('tiktok', 'instagram')
    and exists (select 1 from public.scraped_posts s where s.voice_id = v.id and s.url is not null)
    and (r.voice_id is null or r.read_at < now() - interval '30 days')
  order by r.read_at nulls first
  limit greatest(1, least(p_limit, 5));
$$;
revoke all on function public.comments_due(integer) from public, anon, authenticated;
grant execute on function public.comments_due(integer) to service_role;

-- A filed comment is its own source, so the writer and the screen can say where
-- it came from.
alter table public.creator_knowledge drop constraint if exists creator_knowledge_source_check;
alter table public.creator_knowledge add constraint creator_knowledge_source_check
  check (source is null or source in ('caption', 'transcript', 'user', 'previous_video', 'asked', 'reply', 'comment'));

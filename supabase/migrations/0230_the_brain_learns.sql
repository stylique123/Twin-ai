-- NICHE BRAIN step 5 — THE LEARNER. Three loops, one library.
--
-- ⚠️ MEASURED 2026-09-24, AND IT SETS THE ORDER. Her own posts: 569 rows with
-- plays. Scripts Twin wrote that were then filmed: 0 recorded; posted: 2. Her
-- edits to Twin's lines: 1. So the loop with data TODAY is her own content;
-- the outcome loop is plumbed now and learns as outcomes arrive.
--
--   1. HER LOOP     — her own posts are read by the same reader and filed as
--                     PRIVATE notes (owner_id set), weighted by her plays.
--   2. SCRIPT LOOP  — every note that reached a script is recorded
--                     (brain_note_uses); brain_learn() credits notes whose
--                     scripts were filmed, posted and viewed.
--   3. NICHE LOOP   — shared notes keep merging and gaining times_seen/views.
--
-- ⚖️ ADDITIVE. New columns default to "nothing learned yet"; shared notes stay
-- readable by everyone, private notes only by their owner.

alter table public.brain_notes
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists used_count integer not null default 0,
  add column if not exists filmed_count integer not null default 0,
  add column if not exists posted_count integer not null default 0,
  add column if not exists outcome_views bigint not null default 0;

alter table public.brain_notes drop constraint if exists brain_notes_kind_bucket_sub_niche_key_key;
create unique index if not exists brain_notes_identity
  on public.brain_notes (kind, bucket, sub_niche, key, coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists brain_notes_owner on public.brain_notes (owner_id) where owner_id is not null;

drop policy if exists brain_notes_read on public.brain_notes;
create policy brain_notes_read on public.brain_notes for select to authenticated
  using (owner_id is null or owner_id = auth.uid());

-- ── her own posts, read once ─────────────────────────────────────────────────
create table if not exists public.own_post_reads (
  scraped_post_id uuid primary key references public.scraped_posts(id) on delete cascade,
  owner_id     uuid not null,
  version      integer not null,
  status       text not null check (status in ('read','unreadable','failed')),
  topic        text,
  hook_type    text,
  hook_pattern text,
  mode         text,
  goal         text,
  why_it_works text,
  plays        bigint,
  failure      text,
  read_at      timestamptz not null default now()
);
alter table public.own_post_reads enable row level security;
drop policy if exists own_post_reads_read on public.own_post_reads;
create policy own_post_reads_read on public.own_post_reads for select to authenticated
  using (owner_id = auth.uid());

create or replace function public.brain_unread_own(p_version integer, p_limit integer default 10)
returns table (id uuid, owner_id uuid, caption text, plays bigint, platform text, niche text, sub_niche text)
language sql stable security definer set search_path = public as $$
  select p.id, p.owner_id, p.caption, p.plays, p.platform,
         v.profile->>'niche', v.profile->>'sub_niche'
  from public.scraped_posts p
  left join public.brand_voices v on v.id = p.voice_id
  where coalesce(p.caption, '') <> ''
    and not exists (select 1 from public.own_post_reads r where r.scraped_post_id = p.id and r.version >= p_version)
  order by p.plays desc nulls last
  limit greatest(1, least(p_limit, 50));
$$;
revoke all on function public.brain_unread_own(integer, integer) from public, anon, authenticated;
grant execute on function public.brain_unread_own(integer, integer) to service_role;

-- ── nearest, owner-aware (private notes never merge into shared ones) ───────
create or replace function public.brain_nearest_scoped(
  p_embedding extensions.vector(768), p_kind text, p_bucket text, p_sub_niche text, p_owner uuid, p_k integer default 3
) returns table (id uuid, key text, similarity double precision)
language sql stable security definer set search_path = public, extensions as $$
  select n.id, n.key, 1 - (n.embedding <=> p_embedding)
  from public.brain_notes n
  where n.kind = p_kind
    and n.bucket is not distinct from p_bucket
    and n.sub_niche is not distinct from p_sub_niche
    and n.owner_id is not distinct from p_owner
    and n.embedding is not null
  order by n.embedding <=> p_embedding
  limit greatest(1, least(p_k, 10));
$$;
revoke all on function public.brain_nearest_scoped(extensions.vector, text, text, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.brain_nearest_scoped(extensions.vector, text, text, text, uuid, integer) to service_role;

-- ── which notes reached which script ─────────────────────────────────────────
create table if not exists public.brain_note_uses (
  run_id     uuid not null,
  note_id    uuid not null references public.brain_notes(id) on delete cascade,
  owner_id   uuid,
  created_at timestamptz not null default now(),
  primary key (run_id, note_id)
);
alter table public.brain_note_uses enable row level security;

-- ── the brief, owner-aware and outcome-weighted ─────────────────────────────
create or replace function public.brain_brief_scoped(
  p_embedding extensions.vector(768), p_owner uuid, p_min_similarity double precision default 0.6, p_k integer default 24
) returns table (
  id uuid, kind text, title text, body text, sub_niche text, times_seen integer, total_views bigint,
  similarity double precision, is_hers boolean, filmed_count integer, posted_count integer
)
language sql stable security definer set search_path = public, extensions as $$
  with near as (
    select n.id, n.kind, n.title, n.body, n.sub_niche, n.times_seen, n.total_views,
           1 - (n.embedding <=> p_embedding) as similarity,
           (n.owner_id is not null) as is_hers, n.filmed_count, n.posted_count, n.outcome_views
    from public.brain_notes n
    where n.embedding is not null and (n.owner_id is null or n.owner_id = p_owner)
    order by n.embedding <=> p_embedding
    limit 300
  )
  select id, kind, title, body, sub_niche, times_seen, total_views, similarity, is_hers, filmed_count, posted_count
  from near
  where similarity >= p_min_similarity
  order by similarity
         + 0.02 * ln(1 + times_seen)
         + case when is_hers then 0.05 else 0 end
         + 0.02 * ln(1 + filmed_count)
         + 0.03 * ln(1 + posted_count)
         + 0.01 * ln(1 + outcome_views / 1000.0)
         desc
  limit greatest(1, least(p_k, 60));
$$;
revoke all on function public.brain_brief_scoped(extensions.vector, uuid, double precision, integer) from public, anon, authenticated;
grant execute on function public.brain_brief_scoped(extensions.vector, uuid, double precision, integer) to service_role;

-- ── the learner: recompute outcome credit from scratch (idempotent) ─────────
create or replace function public.brain_learn()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with outcome as (
    select u.note_id,
           count(*)::int used,
           count(*) filter (where o.was_filmed)::int filmed,
           count(*) filter (where o.was_published)::int posted,
           coalesce(sum(o.views_7d), 0)::bigint views
    from public.brain_note_uses u
    left join lateral (
      select generation_id from public.script_attempts a
      where a.run_id = u.run_id and a.generation_id is not null limit 1
    ) a on true
    left join public.generation_outcomes o on o.generation_id = a.generation_id
    group by u.note_id
  )
  update public.brain_notes b
     set used_count = o.used, filmed_count = o.filmed, posted_count = o.posted, outcome_views = o.views
    from outcome o
   where b.id = o.note_id
     and (b.used_count, b.filmed_count, b.posted_count, b.outcome_views) is distinct from (o.used, o.filmed, o.posted, o.views);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.brain_learn() from public, anon, authenticated;
grant execute on function public.brain_learn() to service_role;

-- ── her edits join her track record ─────────────────────────────────────────
create or replace function public.creator_recent_edits(p_owner uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select left(before_text, 160) before_text, left(after_text, 160) after_text, target, created_at
    from public.script_edits
    where owner_id = p_owner and coalesce(before_text,'') <> coalesce(after_text,'')
    order by created_at desc limit 6) x;
$$;
revoke all on function public.creator_recent_edits(uuid) from public, anon, authenticated;
grant execute on function public.creator_recent_edits(uuid) to service_role;

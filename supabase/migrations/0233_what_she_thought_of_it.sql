-- NICHE BRAIN — two more signals into the Learner.
--
-- 1. FILMED, WITHOUT ASKING. Measured 2026-09-24: 0 answers to "Did you film
--    it?", but 8 scripts have a recorded take and 4 an approved/finished edit.
--    The recording itself is the evidence, so brain_learn() now counts a script
--    as filmed when Twin holds a take, a source asset, an approved output or an
--    edit project for it — the answer is only a fallback.
--
-- 2. WHAT SHE THOUGHT OF IT. A one-tap rating when the script appears: stars,
--    quick tags, and "what would you change?". Her words steer her next scripts;
--    the stars credit (or discredit) the brain notes that script was built from,
--    so good patterns rise for everyone in the niche.
--
-- ⚖️ ADDITIVE: one table, two columns, functions replaced in place.
create table if not exists public.script_ratings (
  generation_id uuid primary key references public.generations(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,
  stars         smallint not null check (stars between 1 and 5),
  tags          text[] not null default '{}',
  change_note   text check (change_note is null or length(change_note) <= 1000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.script_ratings enable row level security;
drop policy if exists script_ratings_own_read on public.script_ratings;
create policy script_ratings_own_read on public.script_ratings for select to authenticated using (owner_id = auth.uid());
drop policy if exists script_ratings_own_insert on public.script_ratings;
create policy script_ratings_own_insert on public.script_ratings for insert to authenticated
  with check (owner_id = auth.uid() and exists (select 1 from public.generations g where g.id = generation_id and g.user_id = auth.uid()));
drop policy if exists script_ratings_own_update on public.script_ratings;
create policy script_ratings_own_update on public.script_ratings for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.brain_notes
  add column if not exists rating_sum integer not null default 0,
  add column if not exists rating_n integer not null default 0;

create or replace function public.brain_learn()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with gen as (
    select u.note_id, a.generation_id
    from public.brain_note_uses u
    left join lateral (
      select generation_id from public.script_attempts a
      where a.run_id = u.run_id and a.generation_id is not null limit 1
    ) a on true
  ),
  outcome as (
    select g.note_id,
           count(*)::int used,
           count(*) filter (where coalesce(o.was_filmed, false)
                              or ge.take_path is not null or ge.source_asset_id is not null
                              or ge.approved_output_asset_id is not null or ge.accepted_final_at is not null
                              or exists (select 1 from public.edit_projects ep where ep.generation_id = g.generation_id))::int filmed,
           count(*) filter (where o.was_published)::int posted,
           coalesce(sum(o.views_7d), 0)::bigint views,
           coalesce(sum(r.stars), 0)::int rsum,
           count(r.stars)::int rn
    from gen g
    left join public.generations ge on ge.id = g.generation_id
    left join public.generation_outcomes o on o.generation_id = g.generation_id
    left join public.script_ratings r on r.generation_id = g.generation_id
    group by g.note_id
  )
  update public.brain_notes b
     set used_count = o.used, filmed_count = o.filmed, posted_count = o.posted, outcome_views = o.views,
         rating_sum = o.rsum, rating_n = o.rn
    from outcome o
   where b.id = o.note_id
     and (b.used_count, b.filmed_count, b.posted_count, b.outcome_views, b.rating_sum, b.rating_n)
         is distinct from (o.used, o.filmed, o.posted, o.views, o.rsum, o.rn);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.brain_learn() from public, anon, authenticated;
grant execute on function public.brain_learn() to service_role;

-- ratings enter the brief: average stars above 3 lift a note, below 3 sink it
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
           (n.owner_id is not null) as is_hers, n.filmed_count, n.posted_count, n.outcome_views,
           case when n.rating_n > 0 then n.rating_sum::float / n.rating_n else null end as avg_rating
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
         + coalesce((avg_rating - 3) * 0.015, 0)
         desc
  limit greatest(1, least(p_k, 60));
$$;
revoke all on function public.brain_brief_scoped(extensions.vector, uuid, double precision, integer) from public, anon, authenticated;
grant execute on function public.brain_brief_scoped(extensions.vector, uuid, double precision, integer) to service_role;

-- her feedback on recent scripts, for the writer
create or replace function public.creator_script_feedback(p_owner uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select r.stars, r.tags, left(r.change_note, 300) change_note, r.created_at,
           left(coalesce(g.blueprint->'concept'->>'premise', ''), 120) premise
    from public.script_ratings r join public.generations g on g.id = r.generation_id
    where r.owner_id = p_owner
    order by r.created_at desc limit 8) x;
$$;
revoke all on function public.creator_script_feedback(uuid) from public, anon, authenticated;
grant execute on function public.creator_script_feedback(uuid) to service_role;

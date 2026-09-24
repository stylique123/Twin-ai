-- THE NICHE BRAIN REACHES THE SCRIPT — step 2's one read.
--
-- `generate-blueprint` embeds what this video is about (her sub-niche, niche,
-- offer, note) and asks for the notes nearest to it, across every kind, ranked
-- by meaning FIRST and evidence second: a note seen in twelve videos outranks a
-- note seen once at the same similarity, never a closer one by much.
--
-- ⚖️ ADDITIVE AND FAIL-OPEN. A new function only. The edge caller wraps it in a
-- timeout and renders nothing when it errors, returns too little, or is slow —
-- a script is never delayed or blocked by the brain.
create or replace function public.brain_brief(
  p_embedding extensions.vector(768), p_min_similarity double precision default 0.6, p_k integer default 24
) returns table (
  kind text, title text, body text, sub_niche text, times_seen integer, total_views bigint, similarity double precision
)
language sql stable security definer set search_path = public, extensions as $$
  with near as (
    select n.kind, n.title, n.body, n.sub_niche, n.times_seen, n.total_views,
           1 - (n.embedding <=> p_embedding) as similarity
    from public.brain_notes n
    where n.embedding is not null
    order by n.embedding <=> p_embedding
    limit 200
  )
  select * from near
  where similarity >= p_min_similarity
  order by similarity + 0.02 * ln(1 + times_seen) desc
  limit greatest(1, least(p_k, 60));
$$;
revoke all on function public.brain_brief(extensions.vector, double precision, integer) from public, anon, authenticated;
grant execute on function public.brain_brief(extensions.vector, double precision, integer) to service_role;

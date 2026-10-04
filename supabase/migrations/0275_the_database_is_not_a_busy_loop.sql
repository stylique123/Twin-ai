-- 0275 — THE DATABASE IS NOT A BUSY LOOP.
--
-- The NANO instance hit 98% CPU / 98% memory and Auth + PostgREST went
-- unhealthy. pg_stat_statements named the consumers; this migration is the
-- database half of the fix (the worker / web halves land in the same commit):
--
--   brain_unread         943 ms mean. It walks gallery_items newest-first and
--                        anti-joins corpus_reads; with no index on
--                        gallery_items.created_at every call sorted the whole
--                        table first. Index added; the worker also stops asking
--                        while the corpus is caught up.
--   brain_brief_scoped   3,052 ms mean. `order by embedding <=> $1 limit 300`
--                        over brain_notes with NO vector index = a full scan
--                        that detoasts every 768-d vector. HNSW (cosine) added,
--                        and the function asks the index for 300 candidates
--                        (hnsw.ef_search = 300) so the LIMIT 300 window it
--                        ranks is the same size it always was.
--   audience_untested    scanned 30 days of generations with no created_at
--                        index; index added (and the worker backs off on empty).
--   reapers / liveness   every minute, filtering jobs / brand_voices on
--                        (type, status, updated_at) with only a (status,
--                        created_at) index. Partial indexes on exactly the
--                        reapable rows; reapers move to every 5 min (their
--                        timeout is 10 min, so nothing is reaped later than
--                        it could matter), liveness to every 2 min (180s rule).
--   cron.job_run_details 428k rows and growing forever; trimmed daily to 3 days.
--
-- ⚠️ INDEX BUILDS. Supabase wraps each migration in a transaction, so these
-- are plain CREATE INDEX IF NOT EXISTS (no CONCURRENTLY, matching every other
-- migration here). They take a SHARE lock on their table while building. On a
-- live, overloaded NANO the HNSW build in particular is best done first, by
-- hand, outside a transaction and off-peak:
--   create index concurrently if not exists brain_notes_embedding_hnsw
--     on public.brain_notes using hnsw (embedding extensions.vector_cosine_ops)
--     where embedding is not null;
-- after which this migration's IF NOT EXISTS makes the statement a no-op.

-- ── 1. brain_unread ─────────────────────────────────────────────────────────
create index if not exists gallery_items_created_at_idx
  on public.gallery_items (created_at desc);

-- ── 2. brain_brief_scoped ───────────────────────────────────────────────────
create index if not exists brain_notes_embedding_hnsw
  on public.brain_notes using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

-- Same body and signature as 0261; only the planner settings change. The
-- HNSW scan returns at most ef_search rows, so it is raised to the 300 the
-- query's own window already asks for.
create or replace function public.brain_brief_scoped(p_embedding extensions.vector, p_owner uuid, p_min_similarity double precision default 0.6, p_k integer default 24)
 returns table(id uuid, kind text, title text, body text, sub_niche text, times_seen integer, total_views bigint, similarity double precision, is_hers boolean, filmed_count integer, posted_count integer)
 language plpgsql stable security definer
 set search_path to 'public', 'extensions'
as $function$
begin
  -- A function-level `set hnsw.ef_search` is refused for non-superusers (the
  -- parameter is a placeholder until pgvector loads); setting it per call is
  -- allowed, and keeps the 300-candidate window the ranking below expects.
  perform set_config('hnsw.ef_search', '300', true);
  return query
  with near as (
    select n.id, n.kind, n.title, n.body, n.sub_niche, n.times_seen, n.total_views,
           1 - (n.embedding <=> p_embedding) as similarity,
           (n.owner_id is not null) as is_hers, n.filmed_count, n.posted_count, n.outcome_lift,
           case when n.rating_n > 0 then n.rating_sum::float / n.rating_n else null end as avg_rating
    from public.brain_notes n
    where n.embedding is not null and (n.owner_id is null or n.owner_id = p_owner)
    order by n.embedding <=> p_embedding
    limit 300
  )
  select near.id, near.kind, near.title, near.body, near.sub_niche, near.times_seen, near.total_views, near.similarity, near.is_hers, near.filmed_count, near.posted_count
  from near
  where near.similarity >= p_min_similarity
  order by near.similarity
         + 0.02 * ln(1 + near.times_seen)
         + case when near.is_hers then 0.05 else 0 end
         + 0.02 * ln(1 + near.filmed_count)
         + 0.03 * ln(1 + near.posted_count)
         + 0.02 * ln(1 + near.outcome_lift)
         + coalesce((near.avg_rating - 3) * 0.015, 0)
         desc
  limit greatest(1, least(p_k, 60));
end
$function$;
-- Scratch table from a one-off visual baseline: nothing reads it, so lock it
-- to the service role (Supabase advisor: RLS disabled in public).
alter table if exists public.tmp_visual_baseline_pro enable row level security;
revoke all on function public.brain_brief_scoped(extensions.vector, uuid, double precision, integer) from public, anon, authenticated;
grant execute on function public.brain_brief_scoped(extensions.vector, uuid, double precision, integer) to service_role;

-- ── 3. audience_untested ────────────────────────────────────────────────────
create index if not exists generations_created_at_idx
  on public.generations (created_at desc);
create index if not exists script_batch_results_generation_idx
  on public.script_batch_results (generation_id);

-- ── 4. reapers + liveness: index exactly the rows they look at ──────────────
create index if not exists jobs_reapable_idx
  on public.jobs (type, updated_at)
  where status in ('queued', 'running', 'synthesizing');
create index if not exists brand_voices_building_idx
  on public.brand_voices (updated_at)
  where status = 'building';
create index if not exists ops_events_kind_created_idx
  on public.ops_events (kind, created_at desc);

do $outer$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job
     where jobname in ('reap-stuck-dna', 'reap-stuck-scrape-dna', 'check-worker-liveness', 'twinai-cron-history-trim');
    perform cron.schedule('reap-stuck-dna',        '*/5 * * * *', $c$select public.reap_stuck_dna_builds(600)$c$);
    perform cron.schedule('reap-stuck-scrape-dna', '*/5 * * * *', $c$select public.reap_stuck_scrape_dna(600)$c$);
    perform cron.schedule('check-worker-liveness', '*/2 * * * *', $c$select public.check_worker_liveness(180)$c$);
    -- ── 5. cron's own history grew forever ──
    perform cron.schedule('twinai-cron-history-trim', '23 3 * * *',
      $c$delete from cron.job_run_details where end_time < now() - interval '3 days'$c$);
  end if;
end
$outer$;

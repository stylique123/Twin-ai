-- NOTHING RECORDED WHICH EXTRACTOR SAID IT.
--
-- ⚠️ THE DEFECT, AND IT IS THE MULTIPLIER ON EVERY OTHER IMPROVEMENT. The
-- knowledge extractor's prompt has been changed repeatedly, and every change
-- only ever helped the NEXT creator scanned. 1,339 rows are stored across 42
-- voices and not one of them records WHICH prompt produced it, so there is no
-- answer to the only question that makes an improvement retroactive: "which
-- rows were made by an extractor older than the one we have now?" Without that
-- answer, re-mining is all-or-nothing — re-run every voice (paying for work
-- already done, and re-storing paraphrases of what is already there) or re-run
-- none, which is what has happened every time so far.
--
-- ⚖️ SO THE VERSION TRAVELS WITH THE ROW, NOT WITH THE RUN. A `runs` table
-- would record the same number once per scan, and the rows would still have to
-- be joined to it through a run id nothing writes. One integer on the row is
-- the whole feature: `where extractor_version is null or extractor_version < N`
-- is the re-mine cohort, and it is answerable by anyone with read access.
--
-- ⚖️ NULL MEANS VERSION 1 — "made before anything was stamped" — and is left
-- NULL rather than backfilled to 1. A backfill would assert that every existing
-- row came from one known prompt, which is false: the prompt changed several
-- times across the rows now in the table. NULL says "unknown, therefore stale",
-- which is both true and the reading every reader wants.
--
-- ⚠️ NOT NOT NULL, AND NOT DEFAULTED. A default would silently stamp the
-- CURRENT version onto a row written by a worker that predates the stamp — the
-- exact lie this column exists to prevent. A row is stamped by the code that
-- extracted it or it is not stamped at all.
alter table public.creator_knowledge
  add column if not exists extractor_version integer;

comment on column public.creator_knowledge.extractor_version is
  'Which version of the extraction prompt produced this row (worker/src/extractorVersion.ts). NULL = written before stamping existed, i.e. unknown and therefore stale. Never defaulted: an unstamped row must not claim a version it cannot have had.';

-- ⚖️ NO INDEX, DELIBERATELY. The re-mine cohort query is a full scan of a table
-- holding 1,339 rows, run by a sweep rather than by a request path. An index
-- here would be maintained on every one of the merges below to serve a query
-- nobody waits on.

-- ⚠️ THE MERGE HAS TO CARRY IT OR THE COLUMN IS A LIE ON THE COMMON PATH.
-- `merge_creator_knowledge` ENUMERATES its columns (0123, widened by 0178), so a
-- new column is dropped on the floor by the preferred write path while the
-- PostgREST fallback — which almost never runs — would store it. That is the
-- worst of the three possible outcomes: stamped sometimes, and only when
-- something else is already broken.
--
-- ⚖️ ON MERGE THE STAMP TAKES THE GREATER OF THE TWO, AND THAT IS THE POINT. A
-- newer extractor that re-derives a fact already stored has CONFIRMED that fact
-- with the current prompt — the row is no longer stale, and leaving the old
-- number would put it back in the cohort on every subsequent sweep, forever.
-- `greatest` over a NULL-safe coalesce, so an unstamped stored row is raised by
-- a stamped incoming one, and a stamped stored row is never lowered back to
-- NULL by a writer that does not stamp.
create or replace function public.merge_creator_knowledge(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with incoming as (
    select
      (r->>'owner_id')::uuid                                as owner_id,
      nullif(r->>'voice_id', '')::uuid                      as voice_id,
      r->>'kind'                                            as kind,
      r->>'text'                                            as text,
      coalesce(r->>'basis', 'inferred')                     as basis,
      coalesce((r->>'confidence')::numeric, 0.5)            as confidence,
      coalesce((r->>'times_seen')::integer, 1)              as times_seen,
      nullif(r->>'source_ref', '')                          as source_ref,
      nullif(r->>'source_url', '')                          as source_url,
      nullif(r->>'source', '')                              as source,
      nullif(btrim(r->>'cost'), '')                         as cost,
      nullif(btrim(r->>'consensus'), '')                    as consensus,
      nullif(r->>'extractor_version', '')::integer          as extractor_version
    from jsonb_array_elements(p_rows) as r
  ),
  merged as (
    insert into public.creator_knowledge
      (owner_id, voice_id, kind, text, basis, confidence, times_seen, source_ref, source_url, source, cost, consensus, extractor_version)
    select owner_id, voice_id, kind, text, basis, confidence, times_seen, source_ref, source_url, source, cost, consensus, extractor_version
    from incoming
    on conflict (owner_id, coalesce(voice_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, lower(btrim(text)))
    do update set
      times_seen = public.creator_knowledge.times_seen + 1,
      -- ⚠️ BASIS ONLY EVER STRENGTHENS. A later caption scan must not downgrade
      -- a claim that a transcript already proved was SPOKEN — that would let a
      -- weaker source silently revoke a licence the stronger one granted.
      basis = case
        when public.creator_knowledge.basis = 'stated' then 'stated'
        when excluded.basis = 'stated' then 'stated'
        when public.creator_knowledge.basis = 'demonstrated' or excluded.basis = 'demonstrated' then 'demonstrated'
        else public.creator_knowledge.basis
      end,
      -- Same rule for provenance: transcript outranks caption, and an absent
      -- source never overwrites a recorded one.
      source = case
        when public.creator_knowledge.source = 'transcript' then 'transcript'
        when excluded.source is not null then excluded.source
        else public.creator_knowledge.source
      end,
      -- A NULL NEVER ERASES A RECORDED VALUE (0178).
      cost = coalesce(excluded.cost, public.creator_knowledge.cost),
      consensus = coalesce(excluded.consensus, public.creator_knowledge.consensus),
      -- The stamp only ever rises. See the note above this function.
      extractor_version = case
        when excluded.extractor_version is null then public.creator_knowledge.extractor_version
        when public.creator_knowledge.extractor_version is null then excluded.extractor_version
        else greatest(public.creator_knowledge.extractor_version, excluded.extractor_version)
      end,
      updated_at = now()
    returning 1
  )
  select count(*) into v_count from merged;
  return v_count;
end;
$$;

revoke all on function public.merge_creator_knowledge(jsonb) from public, anon, authenticated;
grant execute on function public.merge_creator_knowledge(jsonb) to service_role;

comment on function public.merge_creator_knowledge(jsonb) is
  'Batch-merge creator knowledge: exact repeats increment times_seen instead of failing the whole batch on the 0121 unique index. Basis and source only ever strengthen; cost and consensus are never erased by a NULL; extractor_version only ever rises, so a fact re-confirmed by a newer prompt leaves the re-mine cohort. Does NOT dedupe paraphrases.';

-- ── THE COHORT, AND THE ONLY THING THAT MAKES THE COLUMN WORTH HAVING ──────
--
-- ⚠️ A STAMP NOTHING READS IS THE DEFECT THIS REPO KEEPS SHIPPING. `priority`,
-- `WORKER_GIT_SHA`, `commentsDatasetUrl`, `openingSetFor` — all built, all
-- correct, all read by nothing. So the reader ships in the same migration as the
-- column: this function IS "re-mine everything below version N", and it is one
-- call rather than a query somebody has to compose correctly under pressure.
--
-- ⚖️ IT ENQUEUES, IT DOES NOT EXTRACT. The work is model calls over stored
-- transcripts and belongs in the worker (`remine_knowledge`), where a failure
-- retries and a bound on spend already exists. A function that called out to a
-- model would hold a transaction open for minutes.
--
-- ⚖️ ONLY VOICES THAT HAVE SOMETHING TO RE-READ. `transcripts` with
-- `subject = 'own'` is the creator's own speech, kept since 0135 — that store is
-- the entire reason a re-mine costs a model call instead of a re-scrape. A voice
-- with no stored speech would enqueue a job that can only find nothing, and 21
-- of those would look exactly like the feature working.
--
-- ⚖️ AND IT IS IDEMPOTENT. A second call while the first sweep is still draining
-- must not double the queue: a voice with a queued or running re-mine is
-- skipped. `p_limit` bounds one call, because the spend is per voice.
create or replace function public.enqueue_stale_knowledge_remine(
  p_below_version integer,
  p_limit integer default 50
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_below_version is null or p_below_version < 1 then
    raise exception 'enqueue_stale_knowledge_remine: p_below_version must be >= 1, got %', p_below_version;
  end if;

  with cohort as (
    select v.id, v.owner_id, v.handle, v.platform
    from public.brand_voices v
    where v.status = 'ready'
      and exists (
        select 1 from public.transcripts t
        where t.owner_id = v.owner_id and t.subject = 'own'
      )
      -- ⚠️ `coalesce(..., 0)` IS WHAT MAKES AN EMPTY OR UNSTAMPED STORE STALE.
      -- max() over no rows is NULL, and NULL < N is NULL, which a WHERE clause
      -- reads as false — so without this the voices with the OLDEST knowledge,
      -- and the ones with none at all, would be the only voices never re-mined.
      and coalesce((
        select max(k.extractor_version) from public.creator_knowledge k
        where k.voice_id = v.id
      ), 0) < p_below_version
      and not exists (
        select 1 from public.jobs j
        where j.type = 'remine_knowledge'
          and j.status in ('queued', 'running')
          and j.payload->>'brand_voice_id' = v.id::text
      )
    order by v.created_at
    limit greatest(0, coalesce(p_limit, 50))
  ),
  queued as (
    insert into public.jobs (owner_id, type, payload)
    select c.owner_id, 'remine_knowledge', jsonb_build_object(
      'brand_voice_id', c.id,
      'handle', c.handle,
      'platform', c.platform,
      'below_version', p_below_version
    )
    from cohort c
    returning 1
  )
  select count(*) into v_count from queued;
  return v_count;
end;
$$;

revoke all on function public.enqueue_stale_knowledge_remine(integer, integer) from public, anon, authenticated;
grant execute on function public.enqueue_stale_knowledge_remine(integer, integer) to service_role;

comment on function public.enqueue_stale_knowledge_remine(integer, integer) is
  'Enqueue `remine_knowledge` for every ready voice whose stored knowledge was produced by an extractor older than p_below_version (NULL/absent counts as older) and that has own transcripts to re-read. Idempotent against queued/running jobs; bounded by p_limit.';

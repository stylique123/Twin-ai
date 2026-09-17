-- WHICH EXTRACTOR WROTE THIS ROW.
--
-- ⚠️ THE DEFECT, AND IT IS STRUCTURAL RATHER THAN ABOUT ANY ONE FIELD.
-- `creator_knowledge` has been written by at least four materially different
-- extractors: the original nine-kind pass (0121), the caption pass (0122), the
-- `cost`/`consensus` pass (0178), and the surface-form recorder (0133). Nothing
-- on a row says which. So every improvement to the extraction prompt has only
-- ever reached creators scanned AFTERWARDS. A creator scanned in July carries
-- what July's prompt could ask for, permanently, and no query in this database
-- can tell that from a row written this morning.
--
-- ⚖️ WHY `updated_at` CANNOT ANSWER THIS. It moves on every merge, including a
-- merge performed by the OLD extractor — `merge_creator_knowledge` bumps
-- `times_seen` and sets `updated_at = now()`. A row touched yesterday by the
-- pass that cannot ask what a thing cost is still a row with no cost, and a
-- date-based cohort would report it as current. The question is "which prompt
-- produced this", and only the prompt can answer it.
--
-- ⚖️ NULLABLE, NO DEFAULT, NO BACKFILL. NULL means "written before anything
-- recorded this", which is a different and true fact from "written by version
-- 1"; stamping the existing rows with 1 would assert that today's prompt
-- produced them. The reader (`remineCohort` in @twinai/shared) sorts NULL as the
-- oldest possible version, which is what it is, and never rewrites it.
--
-- ⚖️ AND IT HAS A READER BEFORE IT HAS A WRITER. The dominant defect class in
-- this repository is a column written and never read. `remineCohort` and the
-- owner-console `remineCard` both land in the same change as this migration.
alter table public.creator_knowledge
  add column if not exists extractor_version smallint;

-- A version is a small positive integer or nothing. Zero is rejected because no
-- extractor was ever version 0, and admitting it would give the "never stamped"
-- state a second spelling.
alter table public.creator_knowledge
  drop constraint if exists creator_knowledge_extractor_version_sane;
alter table public.creator_knowledge
  add constraint creator_knowledge_extractor_version_sane
  check (extractor_version is null or extractor_version between 1 and 1000);

comment on column public.creator_knowledge.extractor_version is
  'Which extraction prompt produced this row. NULL means it predates the stamp, never that it is version 1. Bumped only when a prompt change would produce a different row from the same transcript; see KNOWLEDGE_EXTRACTOR_VERSION in @twinai/shared for the changelog.';

-- The cohort query is "rows below the current version, grouped by voice", which
-- is a scan of the whole table without this.
create index if not exists creator_knowledge_extractor_version_idx
  on public.creator_knowledge (extractor_version, voice_id);

-- ⚠️ 0123 ENUMERATES ITS COLUMNS AND 0178 ALREADY PAID FOR FORGETTING THAT.
-- Without this replacement the merge keeps succeeding and drops
-- `extractor_version` on the floor, silently, on the primary write path — so the
-- stamp would exist on the table, be written by the worker, and never arrive.
-- That is this repository's signature defect wearing a migration.
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
      nullif(r->>'extractor_version', '')::smallint         as extractor_version
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
      -- ⚖️ AND THE SAME RULE, FOR THE SAME REASON, ON BOTH NEW COLUMNS: A NULL
      -- NEVER ERASES A RECORDED VALUE. Captions are stripped of `cost` and
      -- `consensus` at the worker by construction, so a caption re-scan of a
      -- claim a transcript already priced arrives with NULLs. Overwriting on
      -- merge would let the weaker source delete what the stronger one heard —
      -- the precise failure the `basis` ladder above exists to prevent. A
      -- recorded value is only ever replaced by another recorded value.
      cost = coalesce(excluded.cost, public.creator_knowledge.cost),
      consensus = coalesce(excluded.consensus, public.creator_knowledge.consensus),
      -- ⚖️ THE VERSION ONLY EVER ADVANCES, AND `greatest` IS NOT ENOUGH ON ITS
      -- OWN. `greatest(null, 2)` is 2 in Postgres, which is what we want when an
      -- unstamped row is re-mined by a stamped extractor; but `greatest(2, null)`
      -- is also 2, which is what we want when an OLD worker re-merges a row a
      -- NEW one already wrote. Both directions are the same call, and that is
      -- the reason it is safe to deploy the worker and this migration in either
      -- order.
      --
      -- ⚠️ A ROW WHOSE VERSION ADVANCES HAS NOT BEEN RE-EXTRACTED. The merge
      -- fires when the NEW extractor produced the SAME sentence, which means the
      -- new prompt did look at this material — so the stamp is honest. It is the
      -- rows the new prompt did NOT reproduce that keep their old version, and
      -- those are exactly the ones the cohort query should keep naming.
      extractor_version = greatest(excluded.extractor_version, public.creator_knowledge.extractor_version),
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
  'Batch-merge creator knowledge: exact repeats increment times_seen instead of failing the whole batch on the 0121 unique index. Basis and source only ever strengthen; cost and consensus are never erased by a NULL; extractor_version only ever advances. Does NOT dedupe paraphrases.';

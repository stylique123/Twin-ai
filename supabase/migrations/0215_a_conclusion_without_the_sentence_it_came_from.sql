-- THE SENTENCE THE CLAIM WAS READ OUT OF.
--
-- ⚠️ THE DEFECT, IN ONE COMPARISON. The store today holds "she cares about
-- pricing". What she actually said was "I charge £400 because the cheap rebinds
-- come apart inside a year". The first is a summary of a person; the second is
-- something a script can say out loud. The extractor has always been asked for
-- the conclusion and never for the evidence, so the half that a writer can
-- USE is distilled away at the moment of extraction and cannot be recovered —
-- the transcript is never retained (0121), by design.
--
-- ⚖️ THIS DOES NOT MAKE THE TABLE A TRANSCRIPT STORE, AND THE OBJECTION IS
-- WORTH ANSWERING BECAUSE 0121's WHOLE DESIGN RESTS ON IT. `text` is CHECK-
-- capped at 240 characters precisely so the schema refuses to become one. So
-- does this: ONE sentence, capped at 400, on a row whose conclusion is capped at
-- 240. The precedent is 0133 — `surface_forms` already stores up to twelve of
-- the creator's ACTUAL WORDINGS per row and has since #370. A single supporting
-- sentence is strictly less than that, and it is the same argument: the
-- distillate keeps the fact, and the phrasing the creator actually used is the
-- thing worth not throwing away.
--
-- ⚖️ NULLABLE, AND ABSENT IS THE ORDINARY ANSWER. An older extractor wrote no
-- evidence; a caption pass has no sentence to give, because a title is not
-- something anybody was heard saying. Requiring it would either fail those rows
-- or invite the model to manufacture a quotation, and a manufactured quotation
-- is the single worst thing this table could hold — it is `basis = 'stated'`
-- with a fabricated receipt attached, which is exactly the shape §G8 records as
-- "a true citation attached to an invented number", still open and caught by
-- nothing.
--
-- ⚠️⚠️ SO THE WRITER-SIDE RULE MATTERS MORE THAN THE COLUMN. `evidence` is
-- SUPPORTING MATERIAL, never a quotation to be reproduced verbatim in a script:
-- the extractor is instructed to copy a sentence the creator said, and an
-- extractor that paraphrases instead would put words in her mouth with a
-- receipt. The prompt says "this is what she said, write from it", not "say
-- this". That instruction and its test ship with this migration.
alter table public.creator_knowledge
  add column if not exists evidence text;

alter table public.creator_knowledge
  drop constraint if exists creator_knowledge_evidence_short;
alter table public.creator_knowledge
  add constraint creator_knowledge_evidence_short
  check (evidence is null or (length(btrim(evidence)) between 1 and 400));

comment on column public.creator_knowledge.evidence is
  'One sentence from the creator''s own speech that supports this row''s conclusion. NULL means none was recorded, never that none exists. Supporting material for the writer, NOT a quotation to reproduce verbatim.';

-- 0123 enumerates its columns by hand; 0178 and 0214 each paid for forgetting
-- that, and this is the third time. Without the replacement the worker writes
-- `evidence` and the merge drops it on the floor, silently, on the primary write
-- path.
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
      nullif(r->>'extractor_version', '')::smallint         as extractor_version,
      nullif(btrim(r->>'evidence'), '')                     as evidence
    from jsonb_array_elements(p_rows) as r
  ),
  merged as (
    insert into public.creator_knowledge
      (owner_id, voice_id, kind, text, basis, confidence, times_seen, source_ref, source_url, source, cost, consensus, extractor_version, evidence)
    select owner_id, voice_id, kind, text, basis, confidence, times_seen, source_ref, source_url, source, cost, consensus, extractor_version, evidence
    from incoming
    on conflict (owner_id, coalesce(voice_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, lower(btrim(text)))
    do update set
      times_seen = public.creator_knowledge.times_seen + 1,
      basis = case
        when public.creator_knowledge.basis = 'stated' then 'stated'
        when excluded.basis = 'stated' then 'stated'
        when public.creator_knowledge.basis = 'demonstrated' or excluded.basis = 'demonstrated' then 'demonstrated'
        else public.creator_knowledge.basis
      end,
      source = case
        when public.creator_knowledge.source = 'transcript' then 'transcript'
        when excluded.source is not null then excluded.source
        else public.creator_knowledge.source
      end,
      cost = coalesce(excluded.cost, public.creator_knowledge.cost),
      consensus = coalesce(excluded.consensus, public.creator_knowledge.consensus),
      extractor_version = greatest(excluded.extractor_version, public.creator_knowledge.extractor_version),
      -- ⚖️ THE FIRST RECORDED SENTENCE WINS, AND THIS IS THE ONE COLUMN HERE
      -- THAT IS NOT `coalesce(excluded, stored)`. The others take the newest
      -- recorded value because a later scan is a better reading of the same
      -- fact. Evidence is different in kind: it is a sentence somebody was heard
      -- saying on a specific day, tied to `source_url`. Overwriting it with a
      -- sentence from a DIFFERENT video would leave the row pointing at one
      -- video and quoting another — a citation that is individually true and
      -- jointly false, which is §G8's defect exactly.
      evidence = coalesce(public.creator_knowledge.evidence, excluded.evidence),
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
  'Batch-merge creator knowledge: exact repeats increment times_seen instead of failing the whole batch on the 0121 unique index. Basis and source only ever strengthen; cost and consensus are never erased by a NULL; extractor_version only ever advances; evidence keeps the FIRST recorded sentence, because it is tied to source_url.';

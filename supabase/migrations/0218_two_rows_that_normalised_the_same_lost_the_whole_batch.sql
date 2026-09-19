-- TWO ROWS THAT NORMALISED THE SAME LOST THE WHOLE BATCH.
--
-- ⚠️ MEASURED IN PRODUCTION, 2026-09-19, ON THE FIRST REAL RE-MINE SWEEP. Of 11
-- `remine_knowledge` jobs, 10 succeeded and ONE failed five times and
-- dead-lettered, writing NOTHING for that creator:
--
--     remine_knowledge: knowledge insert failed:
--     ON CONFLICT DO UPDATE command cannot affect row a second time
--
-- That is Postgres refusing to update one row twice inside ONE statement. It
-- means the INCOMING batch contained two items that normalise to the same
-- conflict key — `(owner_id, coalesce(voice_id, ...), kind, lower(btrim(text)))`
-- — and it is not a conflict with the stored table at all. `merge_creator_knowledge`
-- has always deduped incoming rows AGAINST THE TABLE and never against ITSELF.
--
-- ⚠️ AND THE COST IS THE WHOLE BATCH, NOT THE DUPLICATE. This is the same shape
-- as PGRST204: one bad element does not lose one row, it loses every row the
-- creator would have gained. The failing voice is the owner holding 162,668
-- characters — the largest corpus in the store — so the creator with the most
-- to say is exactly the one who got nothing.
--
-- ⚖️ WHY IT APPEARED ONLY NOW, WHICH IS THE PART WORTH RECORDING. Three passes
-- now feed one merge: general, targeted (0216) and mined. Two passes reading the
-- same speech can legitimately reach the same conclusion in the same words, and
-- until there was more than one pass that could not happen. The defect is older
-- than the symptom; the traffic that exposes it is new.
--
-- ⚖️ FIRST OCCURRENCE WINS, AND THE ORDER IS NOT ARBITRARY. The worker puts the
-- TARGETED answers at the FRONT of the row list because the write cap slices
-- from the front, so the earliest copy of a duplicated claim is the one most
-- likely to carry `evidence` and a `question_id`. `with ordinality` makes
-- "first" mean the caller's order rather than whatever the planner returns.
--
-- ⚠️ STATED PLAINLY: a later duplicate's `evidence` IS DISCARDED rather than
-- merged into the survivor. Coalescing across duplicates would mean picking a
-- winner per column, which is a second ranking rule nobody asked for; and
-- because the targeted pass is first, the column most worth keeping is already
-- on the row that survives. If that stops being true, this is the comment to
-- come back to.
--
-- ⚖️ NOTHING ELSE CHANGES. Every merge rule from 0123/0178/0214/0216 is carried
-- across unaltered: basis and source only strengthen, cost/consensus/evidence/
-- question_id are never erased by a NULL, extractor_version only rises.
create or replace function public.merge_creator_knowledge(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with parsed as (
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
      nullif(r->>'extractor_version', '')::integer          as extractor_version,
      nullif(btrim(r->>'evidence'), '')                     as evidence,
      nullif(btrim(r->>'question_id'), '')                  as question_id,
      idx
    from jsonb_array_elements(p_rows) with ordinality as t(r, idx)
  ),
  -- ⚠️ THIS `distinct on` IS THE WHOLE FIX. Its expression list must stay
  -- IDENTICAL to the 0121 unique index the `on conflict` below targets, or a
  -- pair that collides there will still slip through here and fail the batch.
  incoming as (
    select distinct on (
      owner_id,
      coalesce(voice_id, '00000000-0000-0000-0000-000000000000'::uuid),
      kind,
      lower(btrim(text))
    )
      owner_id, voice_id, kind, text, basis, confidence, times_seen,
      source_ref, source_url, source, cost, consensus, extractor_version,
      evidence, question_id
    from parsed
    order by
      owner_id,
      coalesce(voice_id, '00000000-0000-0000-0000-000000000000'::uuid),
      kind,
      lower(btrim(text)),
      idx
  ),
  merged as (
    insert into public.creator_knowledge
      (owner_id, voice_id, kind, text, basis, confidence, times_seen, source_ref, source_url, source, cost, consensus, extractor_version, evidence, question_id)
    select owner_id, voice_id, kind, text, basis, confidence, times_seen, source_ref, source_url, source, cost, consensus, extractor_version, evidence, question_id
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
      extractor_version = case
        when excluded.extractor_version is null then public.creator_knowledge.extractor_version
        when public.creator_knowledge.extractor_version is null then excluded.extractor_version
        else greatest(public.creator_knowledge.extractor_version, excluded.extractor_version)
      end,
      evidence = coalesce(excluded.evidence, public.creator_knowledge.evidence),
      question_id = coalesce(excluded.question_id, public.creator_knowledge.question_id),
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
  'Batch-merge creator knowledge. Incoming rows are deduped against EACH OTHER on the 0121 conflict key before the insert (first occurrence wins, by caller order) because two items normalising to the same key fail the WHOLE statement, not just the duplicate. Exact repeats against the stored table increment times_seen. Basis and source only ever strengthen; cost, consensus, evidence and question_id are never erased by a NULL; extractor_version only ever rises. Does NOT dedupe paraphrases.';

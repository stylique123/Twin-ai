-- A RE-SCAN MUST NOT THROW AWAY WHAT IT LEARNED.
--
-- ⚠️ THE DEFECT. `creator_knowledge_one_per_claim` (0121) is a UNIQUE index on
-- (owner_id, voice_id, kind, lower(btrim(text))) — deliberately, so a repeated
-- claim merges instead of accumulating. But the worker inserts a BATCH with a
-- plain `.insert()`, and Postgres fails the WHOLE batch on the first conflict.
-- So the second time a creator is scanned, if the extractor phrases even ONE
-- item exactly as before, every OTHER item in that batch — all the new material
-- — is discarded. The caller logs `knowledge insert failed` and carries on.
--
-- ⚖️ AND THE INDEX'S OWN COMMENT SAYS WHAT SHOULD HAPPEN: "the behaviour above is
-- only true if repeats merge." The index was built for a merge that was never
-- written. This is that merge.
--
-- ⚠️ WHY AN RPC RATHER THAN PostgREST `upsert`. The unique index is on an
-- EXPRESSION — `lower(btrim(text))` — and PostgREST's `on_conflict` parameter
-- takes column names only. It cannot name this index, so the merge has to live
-- in SQL where `ON CONFLICT` can target the expression directly.
--
-- ⚖️ `times_seen` IS INCREMENTED, NOT OVERWRITTEN, because that is the column's
-- entire purpose: "how often has this creator returned to this". A re-scan that
-- finds the same belief again is evidence the belief is durable, and the
-- knowledge selector ranks on exactly that.
--
-- ⚠️ THIS DOES NOT SOLVE PARAPHRASE DRIFT, and pretending otherwise would be
-- worse than leaving it. The extractor re-reads the transcripts on every scan
-- and writes the same fact in different words — "to understand their life
-- perspectives" one run, "to gain perspective on what truly matters" the next.
-- Those are different strings, so they take different keys and BOTH survive.
-- Exact repeats now merge; near-repeats still accumulate, and closing that needs
-- semantic matching rather than a unique index. Said out loud here so the next
-- reader does not assume this migration made the store clean.
create or replace function public.merge_creator_knowledge(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- ⚖️ ROWS ARRIVE AS JSONB SO THE SHAPE STAYS THE WORKER'S. Enumerating the
  -- columns here would mean two places to change when a column is added, and
  -- the one that gets forgotten is always the one that silently drops data.
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
      nullif(r->>'source', '')                              as source
    from jsonb_array_elements(p_rows) as r
  ),
  merged as (
    insert into public.creator_knowledge
      (owner_id, voice_id, kind, text, basis, confidence, times_seen, source_ref, source_url, source)
    select owner_id, voice_id, kind, text, basis, confidence, times_seen, source_ref, source_url, source
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
      updated_at = now()
    returning 1
  )
  select count(*) into v_count from merged;
  return v_count;
end;
$$;

-- The worker holds the service role; no creator-facing grant is added, because
-- nothing in the app should be able to write claims about a creator.
revoke all on function public.merge_creator_knowledge(jsonb) from public, anon, authenticated;
grant execute on function public.merge_creator_knowledge(jsonb) to service_role;

comment on function public.merge_creator_knowledge(jsonb) is
  'Batch-merge creator knowledge: exact repeats increment times_seen instead of failing the whole batch on the 0121 unique index. Basis and source only ever strengthen. Does NOT dedupe paraphrases.';

-- WHAT A THING COST, AND WHAT THEY WERE ARGUING WITH.
--
-- ⚠️ THE DEFECT, MEASURED ON THIS DATABASE. The story step asks a creator three
-- questions, and the scan could honestly prefill exactly one of them. Not
-- because creators have nothing to say, but because the extraction prompt never
-- asked for the half of the sentence the other two questions want:
--
--   of 69  `stated` `experience` rows, ONE  carries any cost/loss/mistake marker
--   of 129 `stated` `opinion`     rows, ZERO name a consensus and contradict it
--
-- `experience` was defined to the model as "something they personally did" and
-- `opinion` as "a position they hold", and the model obeyed both exactly:
-- "Currently works at Microsoft.", "Believes Pakistani chai is better than
-- coffee." Flat biography and a bare assertion. Nothing anywhere asked what a
-- thing had taken from them, or who they were arguing with, so nothing recorded
-- it and there was nothing to offer back.
--
-- ⚖️ TWO COLUMNS RATHER THAN TWO NEW KINDS, AND THE CHECK CONSTRAINT BELOW IS
-- WHY THAT MATTERS MOST. `creator_knowledge_kind_valid` enumerates nine kinds;
-- a new one would be rejected outright by any database this migration had not
-- reached, and PostgREST fails the WHOLE batch on one bad row. But the deeper
-- reason is downstream: `KIND_RANK` ranks `experience` top, and both
-- `creatorState` and `knowledgeResolver` gate personal beats on
-- `kind = 'experience' AND basis = 'stated'`. Re-filing costly lessons under a
-- `lesson` kind would have removed the single richest category of material from
-- all three readers at once. A costly lesson IS an experience. This records the
-- price beside it and moves nothing.
--
-- ⚖️ NULLABLE, WITH NO DEFAULT, AND NULL IS A REAL ANSWER. "Nobody recorded a
-- cost" and "it cost nothing" are different facts, and only NULL says the
-- first. Every one of the 930 existing rows keeps NULL and keeps its meaning;
-- nothing is backfilled, because backfilling would be inventing a price.
alter table public.creator_knowledge
  add column if not exists cost text,
  add column if not exists consensus text;

-- Capped like `text` (0121), so neither column can quietly become a transcript
-- store through a side door.
alter table public.creator_knowledge
  drop constraint if exists creator_knowledge_cost_short;
alter table public.creator_knowledge
  add constraint creator_knowledge_cost_short
  check (cost is null or (length(btrim(cost)) between 1 and 240));

alter table public.creator_knowledge
  drop constraint if exists creator_knowledge_consensus_short;
alter table public.creator_knowledge
  add constraint creator_knowledge_consensus_short
  check (consensus is null or (length(btrim(consensus)) between 1 and 240));

comment on column public.creator_knowledge.cost is
  'What this cost the creator, when they said so — money, months, a client. NULL means nobody recorded a cost, never that it was free. Written only from speech.';
comment on column public.creator_knowledge.consensus is
  'The belief the creator NAMED and argued against. NULL means they never named one, never that they argue with nobody. Written only from speech.';

-- ⚠️ 0123 ENUMERATES ITS COLUMNS, DESPITE ITS OWN COMMENT SAYING IT DOES NOT.
-- That comment claims rows arrive as jsonb so "the shape stays the worker's",
-- and then lists ten columns by hand. Two places to change, and this is the
-- forgotten one it warned about: without this replacement the merge would keep
-- succeeding and drop `cost` and `consensus` on the floor, silently, on the
-- primary write path. Re-stated here so the next column-adder does not have to
-- rediscover it.
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
      nullif(btrim(r->>'consensus'), '')                    as consensus
    from jsonb_array_elements(p_rows) as r
  ),
  merged as (
    insert into public.creator_knowledge
      (owner_id, voice_id, kind, text, basis, confidence, times_seen, source_ref, source_url, source, cost, consensus)
    select owner_id, voice_id, kind, text, basis, confidence, times_seen, source_ref, source_url, source, cost, consensus
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
  'Batch-merge creator knowledge: exact repeats increment times_seen instead of failing the whole batch on the 0121 unique index. Basis and source only ever strengthen; cost and consensus are never erased by a NULL. Does NOT dedupe paraphrases.';

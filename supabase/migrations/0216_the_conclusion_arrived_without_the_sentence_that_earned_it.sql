-- THE CONCLUSION ARRIVED WITHOUT THE SENTENCE THAT EARNED IT.
--
-- ⚠️ THE DEFECT, AND IT IS THE DIFFERENCE BETWEEN A USABLE ROW AND A GESTURE.
-- `creator_knowledge` stores a one-line distillate — "she cares about pricing" —
-- and nothing of what she actually said to produce it. A writer handed that has
-- two options: mention pricing vaguely, or fill the gap itself. "She charges £400
-- for a full rebind because cheap ones fall apart within a year" is the same
-- conclusion with the sentence that earns it still attached, and only the second
-- can be written into a script a creator will read aloud.
--
-- ⚖️ AND IT IS WHAT MAKES A DISPUTED ROW SETTLEABLE. `source_url` already says
-- WHICH VIDEO an item came from; a creator who disagrees with an item currently
-- has to watch the whole thing to find out why we think she said it. The evidence
-- line is the answer to "where did you get that", in her words.
--
-- ⚠️ NOT A QUOTE OF SOMEONE ELSE. This is the creator's OWN speech, which she
-- owns and which a script may put back in her mouth — the reference-borrowing
-- rules are about a DIFFERENT creator's words and are untouched by this column.
alter table public.creator_knowledge
  add column if not exists evidence text,
  add column if not exists question_id text;

comment on column public.creator_knowledge.evidence is
  'What she actually SAID that supports this row, in her own words, at most 240 chars. NULL on rows from the general pass, which is not asked for it. Never assembled from reasoning: an item whose evidence would have to be constructed is a guess and is not stored.';
comment on column public.creator_knowledge.question_id is
  'Which targeted question this row answers (worker/src/targetedQuestions.ts). NULL = the general pass, which asks no specific question. The CHECK below is the closed set.';

-- ⚠️ A CLOSED SET AT THE DATABASE, AND ADDING A QUESTION IS A MIGRATION. That is
-- the cost and it is deliberate: the whole value of the id is that "which of the
-- seven does this creator's speech never answer" is a query. An id that reaches
-- the table without being declared here makes that query silently wrong, which is
-- worse than a rejected insert — the same argument `creator_knowledge_kind_valid`
-- (0121) already makes for `kind`.
--
-- ⚖️ NULL IS ALLOWED AND IS THE COMMON CASE. 1,339 existing rows and every future
-- row from the general pass carry no question id, and they must stay valid.
alter table public.creator_knowledge
  drop constraint if exists creator_knowledge_question_known;
alter table public.creator_knowledge
  add constraint creator_knowledge_question_known
  check (question_id is null or question_id in (
    -- Track A — asked of every creator, always.
    'specific_number',
    'pushes_back_against',
    'specific_moment',
    'someone_else_said',
    'others_disagree',
    'lesson_the_hard_way',
    'real_cta',
    -- Track B — asked ONLY when a product or paid offer is on record. An empty
    -- Track B is a correct result for a creator who sells nothing, and nothing
    -- is ever substituted for it.
    'what_she_charges',
    'refuses_to_promise',
    'what_she_calls_it'
  ));

-- ⚠️ THE MERGE HAS TO CARRY BOTH OR THE COLUMNS ARE A LIE ON THE COMMON PATH.
-- `merge_creator_knowledge` ENUMERATES its columns (0123, widened by 0178 and
-- 0214), so a new column is dropped by the PREFERRED writer while the rarely-taken
-- PostgREST fallback stores it. This is the fourth widening and the reason is the
-- same every time.
--
-- ⚖️ AND NEITHER IS EVER ERASED BY A NULL, exactly as `cost` and `consensus` are
-- not. The general pass re-deriving a fact the targeted pass already evidenced
-- arrives with NULLs in both; overwriting would let the pass that asks no question
-- delete the answer to one.
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
      nullif(r->>'extractor_version', '')::integer          as extractor_version,
      nullif(btrim(r->>'evidence'), '')                     as evidence,
      nullif(btrim(r->>'question_id'), '')                  as question_id
    from jsonb_array_elements(p_rows) as r
  ),
  merged as (
    insert into public.creator_knowledge
      (owner_id, voice_id, kind, text, basis, confidence, times_seen, source_ref, source_url, source, cost, consensus, extractor_version, evidence, question_id)
    select owner_id, voice_id, kind, text, basis, confidence, times_seen, source_ref, source_url, source, cost, consensus, extractor_version, evidence, question_id
    from incoming
    on conflict (owner_id, coalesce(voice_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, lower(btrim(text)))
    do update set
      times_seen = public.creator_knowledge.times_seen + 1,
      -- BASIS ONLY EVER STRENGTHENS (0123).
      basis = case
        when public.creator_knowledge.basis = 'stated' then 'stated'
        when excluded.basis = 'stated' then 'stated'
        when public.creator_knowledge.basis = 'demonstrated' or excluded.basis = 'demonstrated' then 'demonstrated'
        else public.creator_knowledge.basis
      end,
      -- Transcript outranks caption; an absent source never overwrites a recorded one.
      source = case
        when public.creator_knowledge.source = 'transcript' then 'transcript'
        when excluded.source is not null then excluded.source
        else public.creator_knowledge.source
      end,
      -- A NULL NEVER ERASES A RECORDED VALUE (0178).
      cost = coalesce(excluded.cost, public.creator_knowledge.cost),
      consensus = coalesce(excluded.consensus, public.creator_knowledge.consensus),
      -- The stamp only ever rises (0214).
      extractor_version = case
        when excluded.extractor_version is null then public.creator_knowledge.extractor_version
        when public.creator_knowledge.extractor_version is null then excluded.extractor_version
        else greatest(public.creator_knowledge.extractor_version, excluded.extractor_version)
      end,
      -- Same rule, same reason, on both new columns.
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
  'Batch-merge creator knowledge: exact repeats increment times_seen instead of failing the whole batch on the 0121 unique index. Basis and source only ever strengthen; cost, consensus, evidence and question_id are never erased by a NULL; extractor_version only ever rises. Does NOT dedupe paraphrases.';

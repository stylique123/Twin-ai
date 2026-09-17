-- NOBODY COULD SEE WHICH CREATORS HAD NOTHING TO SAY.
--
-- ⚠️ THE DEFECT IS THAT THE ANSWER TOOK A HAND-WRITTEN QUERY EVERY TIME. "How
-- many voices clear the substance floor", "how many have a month of runway",
-- "which of the seven questions does nobody's speech answer", "how much of the
-- store is caption filler" — every one of those has been answered ad hoc, by
-- composing joins under pressure, and every answer expired in a transcript. The
-- numbers this product's whole depth problem turns on had no home.
--
-- ⚖️ SO IT IS A VIEW, AND IT READS THE COLUMNS THE LAST FOUR MIGRATIONS ADDED.
-- `extractor_version` (0214) says which voices an older prompt produced,
-- `used_count` (0215) says what has already been spent, `question_id` and
-- `evidence` (0216) say which targeted answers exist. Those four were built to
-- make a decision possible; this is where the decision is read from.
--
-- ⚠️ ONE ROW PER VOICE, NOT ONE HEADLINE. `metrics_overview` is a single row for
-- the data room and is the wrong shape for this: the question is always "WHICH
-- creators", because the remedy is per creator — re-mine this one, ask that one a
-- question, leave the two with runway alone. A mean would hide exactly the 19
-- voices that need work.
create or replace view public.creator_knowledge_coverage as
select
  v.id                                                        as voice_id,
  v.owner_id,
  v.handle,
  v.platform,
  v.status,
  count(k.id)                                                 as rows_total,
  -- SUBSTANCE_KINDS in packages/shared/src/knowledgeSelection.ts. Duplicated
  -- here deliberately and stated out loud: SQL cannot import the set, and the
  -- alternative — omitting the only column that says whether a script can be
  -- BUILT from this store — is worse than a duplicate with a comment on it.
  count(k.id) filter (
    where k.kind in ('claim', 'experience', 'framework', 'opinion', 'fact', 'example')
  )                                                           as rows_substance,
  count(k.id) filter (where k.basis = 'stated')               as rows_stated,
  count(k.id) filter (where k.source = 'transcript')          as rows_from_transcript,
  count(k.id) filter (where k.source = 'caption')             as rows_from_caption,
  count(k.id) filter (where k.source = 'asked')               as rows_from_asked,
  count(k.id) filter (where k.kind = 'experience')            as rows_episodes,
  count(k.id) filter (where k.evidence is not null)           as rows_with_evidence,
  count(distinct k.question_id)                               as questions_answered,
  -- ⚠️ `coalesce(..., 0)` FOR THE SAME REASON THE COHORT QUERY NEEDS IT (0214):
  -- max() over no rows is NULL, and a NULL here would make the voices with the
  -- oldest knowledge — and the ones with none — look like the newest.
  coalesce(max(k.extractor_version), 0)                       as newest_extractor,
  count(k.id) filter (where k.extractor_version is null)      as rows_unstamped,
  -- What the store has already been spent on. A voice whose every row has been
  -- supplied several times is out of runway however many rows it holds, which is
  -- the distinction `rows_total` alone cannot make.
  count(k.id) filter (where coalesce(k.used_count, 0) = 0)    as rows_never_supplied,
  max(k.used_count)                                           as most_supplied_count,
  max(k.last_used_at)                                         as last_supplied_at,
  -- The creator's own speech we still hold, which is what a re-mine can read.
  (select count(*) from public.transcripts t
     where t.owner_id = v.owner_id and t.subject = 'own')     as own_transcripts,
  (select coalesce(sum(length(t.text)), 0) from public.transcripts t
     where t.owner_id = v.owner_id and t.subject = 'own')     as own_transcript_chars
from public.brand_voices v
left join public.creator_knowledge k on k.voice_id = v.id
group by v.id, v.owner_id, v.handle, v.platform, v.status;

-- ⚠️ SERVICE ROLE AND PLATFORM ADMIN ONLY, like `metrics_overview`. This is a
-- cross-creator view: one creator seeing another's row count is a leak, and a
-- view inherits no RLS from the tables under it.
revoke all on public.creator_knowledge_coverage from anon, authenticated;
grant select on public.creator_knowledge_coverage to service_role;

comment on view public.creator_knowledge_coverage is
  'One row per brand voice: how much knowledge it holds, how much of it is substance, where it came from, how many targeted questions it answers, which extractor produced it, how much of it has already been supplied to a script, and how much of her own speech is still stored to re-mine. Read by admin-metrics; service role only.';

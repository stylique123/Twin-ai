-- SHE CONFIRMED IT AND THE ANSWER DIED IN THE TAB.
--
-- ⚠️ THE ONBOARDING SCREEN ALREADY ASKS. #766 wired `scannedAudienceFacts` into
-- the confirm step: 45 of 51 voices carry an inferred `audience_pain` and
-- `dream_outcome` (re-measured 2026-09-09), and the creator is shown each
-- sentence verbatim with "Yes, that's them" / "Not quite". That half works.
--
-- ⚠️⚠️ THE ANSWER IS THEN WRITTEN TO `sessionStorage` AND NOWHERE ELSE. The
-- `savePreScriptBrief` call two hundred lines below the card names every other
-- draft field and not these two, so the confirmation survives exactly as long as
-- the tab does. This is the defect `preScriptBrief.ts:535` already records in
-- its own comment — "a key the write path does not name is stored in name only"
-- — arriving a second time through a different door.
--
-- ⚖️ AND IT MATTERS BECAUSE THE WRITER CANNOT TELL THE TWO APART. The prompt
-- reads the SCAN's `audience_pain`, which is an inference nobody agreed to.
-- Storing the confirmed sentence is what moves that fact from "guessed" to
-- "stated" for `resolveProfileAnswers`, which the recognition lines on
-- V2Building and the profile meter already read. It is the same rule the offer
-- question states one line above the call: `offerTouched` exists so the scan's
-- guess is never stored as though the creator had confirmed it.
--
-- ⚖️ THE STORED VALUE IS THE SENTENCE, NOT A BOOLEAN, and `audienceFactConfirmed`
-- compares on the text for a stated reason: a re-scan that changes the sentence
-- means the creator confirmed something else, and the new one has been confirmed
-- by nobody. A flag would silently transfer their agreement onto text they never
-- read.
--
-- ⚠️ DECLINING STILL RECORDS NOTHING. "Not quite" sets the draft field to null
-- and `sanitizeBriefForWrite` drops nulls, so a refusal stays ABSENT rather than
-- becoming a stored empty answer. Unknown must stay unknown — the rule the rest
-- of this column is already built on.
--
-- WHAT THIS MIGRATION DOES: widens the shape CHECK by exactly two keys. Both are
-- plain non-empty strings, so they fall under the existing string rule with no
-- new branch. Nothing is backfilled — no creator has ever confirmed one durably,
-- and inventing agreement is the thing this column refuses.
create or replace function public.is_pre_script_brief(p jsonb)
returns boolean
language sql
immutable
set search_path to 'pg_catalog', 'public'
as $function$
  select p is null
      or (
        jsonb_typeof(p) = 'object'
        and not exists (
          select 1 from jsonb_object_keys(p) k
           where k not in (
             'goal', 'audience', 'workKind', 'workKindOther', 'offer',
             'forbiddenClaims', 'promotes', 'alsoWantsToMake', 'productEvidence',
             'audienceKnowledge', 'contentGoals', 'desiredFormats',
             'formatExploration', 'commercialTies',
             'ownProductKind', 'ownServiceKind',
             'defaultCta',
             'onCamera',
             -- ⚠️ THE TWO NEW ONES. The creator's confirmation of what the scan
             -- inferred about her audience, stored as the sentence she agreed
             -- to rather than a flag against a sentence that may since have
             -- changed underneath it.
             'confirmedAudiencePain', 'confirmedDreamOutcome'
           )
        )
        and not exists (
          select 1 from jsonb_each(p) e
           where e.key <> 'productEvidence'
             and e.key not in ('contentGoals', 'desiredFormats', 'commercialTies')
             and (jsonb_typeof(e.value) <> 'string' or btrim(e.value #>> '{}') = '')
        )
        and not exists (
          select 1 from jsonb_each(p) e
           where e.key in ('contentGoals', 'desiredFormats', 'commercialTies')
             and (
               jsonb_typeof(e.value) <> 'array'
               or jsonb_array_length(e.value) = 0
               or exists (
                 select 1 from jsonb_array_elements(e.value) x
                  where jsonb_typeof(x) <> 'string' or btrim(x #>> '{}') = ''
               )
             )
        )
        and (
          not p ? 'productEvidence'
          or p -> 'productEvidence' = '"declined"'::jsonb
          or jsonb_typeof(p -> 'productEvidence') = 'object'
        )
      );
$function$;

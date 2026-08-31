-- NOBODY EVER ASKS WHETHER THE CREATOR IS IN FRONT OF THE CAMERA.
--
-- ⚠️ MEASURED AGAINST A REAL SEGMENT. A faceless voiceover channel — the kind
-- that posts daily and buys tools — gets a script whose every scene is a
-- direction about how to stand and move. The writer prompt instructs
-- `location: WHERE THE CREATOR PHYSICALLY STANDS` unconditionally, so a person
-- who is never in frame is handed staging notes for a body the video will not
-- contain. It is not a degraded script; it is an unusable one.
--
-- ⚖️ AND THE DATA MODEL ALREADY SUPPORTED IT, WHICH IS WHY THIS IS SMALL.
-- `recordingScript.ts` states that a b_roll scene "is never a teleprompter
-- scene unless it carries voiceover", so voice-over-footage is a shape the
-- schema has always been able to describe. Nothing was missing except the
-- question. A capability nobody is asked about is a capability nobody has.
--
-- ⚖️ THE CHECK STILL PINS THE KEY SET, WHICH IS THE POINT OF IT. This widens it
-- deliberately, by name, exactly as 0136 did — and the reader ships in the same
-- change, so `check_brief_consumers` can never record this key as unwired.
--
-- ⚠️ IDEMPOTENT, AS A RATCHET. `create or replace` re-runs safely and the
-- constraint is dropped before being re-added, so applying this twice is a
-- no-op rather than an error.

create or replace function public.is_pre_script_brief(p jsonb)
returns boolean
language sql
immutable
set search_path to 'pg_catalog', 'public'
as $function$
  select p is null
      or (
        jsonb_typeof(p) = 'object'
        -- No key outside the set. A client cannot grow the brief by writing to
        -- it, which is how a question set becomes whatever a form posted.
        and not exists (
          select 1 from jsonb_object_keys(p) k
           where k not in (
             -- The original three-answer brief.
             'goal', 'audience', 'workKind', 'workKindOther', 'offer',
             'forbiddenClaims', 'promotes', 'alsoWantsToMake', 'productEvidence',
             -- The six onboarding questions. Read by `profileCompletion` for
             -- the Content Profile meter and the Product DNA state, and by
             -- `productSuggestionConfidence` to decide whether to suggest.
             -- NOTE: no parentheses in this block. The drift test slices the
             -- key list at the first closing bracket after `not in (`, so a
             -- parenthesised aside here silently truncates the list it reads.
             'audienceKnowledge', 'contentGoals', 'desiredFormats',
             'formatExploration', 'commercialTies',
             'ownProductKind', 'ownServiceKind',
             -- The creator's own CTA wording. Read by `cta.ts`, which never
             -- writes a generated sentence into it — so a value here is always
             -- something a person typed.
             'defaultCta',
             -- Whether the creator appears on camera. Read by generate-blueprint
             -- to decide whether a beat may be given physical staging direction
             -- at all. A faceless channel that is told where to stand receives a
             -- script it cannot film. NOTE: no parentheses in this block; the
             -- drift test slices at the first closing bracket after not in.
             'onCamera'
           )
        )
        -- Every scalar answer is a NON-EMPTY string. An empty one reads as
        -- unanswered the moment anything consumes it, so storing it would
        -- create a fourth state that means the same as the absent one and is
        -- counted differently by whoever forgets.
        and not exists (
          select 1 from jsonb_each(p) e
           where e.key <> 'productEvidence'
             and e.key not in ('contentGoals', 'desiredFormats', 'commercialTies')
             and (jsonb_typeof(e.value) <> 'string' or btrim(e.value #>> '{}') = '')
        )
        -- The three multi-selects are arrays of non-empty strings, and never
        -- empty arrays — `[]` and absent are the same fact to every reader.
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
        -- The product answer is either the string 'declined' — a real answer,
        -- "there is nothing to show" — or the evidence object itself. Anything
        -- else is a description of a product, which the container rule refuses.
        and (
          not p ? 'productEvidence'
          or p -> 'productEvidence' = '"declined"'::jsonb
          or jsonb_typeof(p -> 'productEvidence') = 'object'
        )
      );
$function$;

-- ⚠️ NO `alter table` HERE, AND THAT IS THE WHOLE REASON THE FIRST VERSION OF
-- THIS FILE BROKE STAGING. It ended with a drop-and-re-add of
-- `brand_voices_pre_script_brief_shape`, copied from 0109 where the constraint
-- was being created for the first time. On staging `brand_voices` is a
-- STAGING-ONLY FIXTURE applied AFTER the migration loop
-- (scripts/staging-integration/staging-brand-schema.sql), so the loop hit
-- `ERROR: column "pre_script_brief" does not exist` and the matrix died three
-- minutes in. 0171's exclusion note says exactly this, and it was read before
-- this file was written.
--
-- ⚖️ AND THE RE-ADD WAS NEVER NEEDED. The constraint already exists and calls
-- `is_pre_script_brief` BY NAME, so replacing the function body is the whole
-- change — which is precisely why 0136, the last migration to widen this key
-- set, touches no table either. Re-adding a constraint that is already there
-- buys nothing and costs the one environment that can catch a drift.
--
-- ⚖️ NO BACKFILL, DELIBERATELY. Every existing brief is valid under the widened
-- rule unchanged, and nothing here can invent an answer a creator never gave.
-- An absent key means "not asked yet", which is what it means for all of them.

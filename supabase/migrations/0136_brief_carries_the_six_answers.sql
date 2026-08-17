-- THE SIX ONBOARDING ANSWERS HAD NO SERVER-SIDE HOME.
--
-- ⚠️ THEY LIVED IN LOCAL STORAGE ONLY, and three separate readers had to caveat
-- themselves because of it: the Product Library's "I sell nothing" suggestion
-- filter, the Content Profile meter, and `productDnaStatus`. All three read the
-- onboarding draft, so on a second device — or after clearing site data — a
-- creator who had answered every question looked like one who had answered none.
-- Each consumer was papering over the same missing column.
--
-- ⚠️ AND ONE OF THEM FAILS UNSAFELY IN THE OTHER DIRECTION. `commercialTies`
-- carries "nothing commercial", which is the answer that SUPPRESSES product
-- suggestions. Losing it does not merely under-report — it re-enables suggestions
-- for the one creator who explicitly said they sell nothing.
--
-- ⚖️ EXTENDED RATHER THAN PARALLELED. `pre_script_brief` already holds the older
-- three-answer brief for five voices and is already the read-merge-write target
-- of `savePreScriptBrief`. A second column would mean two places to look for
-- "what the creator told us", and the six questions are the successor to those
-- three, not a different subject.
--
-- ⚖️ THE CHECK STILL PINS THE KEY SET, WHICH IS THE POINT OF IT. A client cannot
-- grow the brief by writing to it; that is how a question set becomes whatever a
-- form happened to post. This widens the set deliberately, by name, and every new
-- key has a reader in `profileCompletion` shipped alongside it.
--
-- ⚠️ THE ARRAY KEYS ARE THE ONE REAL LOOSENING, AND THEY ARE ENUMERATED. The old
-- rule was "every value is a non-empty string", which the multi-selects cannot
-- satisfy. Rather than relax that globally — which would let any key arrive as an
-- array and quietly change what every existing reader receives — the three
-- multi-select keys are named, and their ELEMENTS still have to be non-empty
-- strings. An empty array is refused for the same reason an empty string is: it
-- is a fourth state that means "unanswered" and counts as answered.

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
             'defaultCta'
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

-- ⚖️ NO BACKFILL, AND THAT IS DELIBERATE. The five existing briefs are valid
-- under the widened rule unchanged, and nothing here can invent answers the five
-- creators never gave. An absent key means "not asked yet", which is exactly what
-- it means for them.

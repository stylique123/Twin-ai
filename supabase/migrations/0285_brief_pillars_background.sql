-- Plan v3.10 (Part 16): onboarding asks 2 to 3 content pillars and her
-- background. Widens the brief CHECK by name: `contentPillars` (array, like the
-- other multi-selects) and `background` (non-empty string). Applied by hand.
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
             'confirmedAudiencePain', 'confirmedDreamOutcome',
             'productFacts',
             'contentPillars', 'background'
           )
        )
        and not exists (
          select 1 from jsonb_each(p) e
           where e.key <> 'productEvidence'
             and e.key not in ('contentGoals', 'desiredFormats', 'commercialTies', 'contentPillars')
             and (jsonb_typeof(e.value) <> 'string' or btrim(e.value #>> '{}') = '')
        )
        and not exists (
          select 1 from jsonb_each(p) e
           where e.key in ('contentGoals', 'desiredFormats', 'commercialTies', 'contentPillars')
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

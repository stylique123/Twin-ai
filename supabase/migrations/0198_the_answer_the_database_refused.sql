-- THE FACTS SHE TYPED COULD NOT BE STORED, AND THEY TOOK HER OTHER ANSWERS WITH THEM.
--
-- ⚠️⚠️ MEASURED IN PRODUCTION, NOT INFERRED. `generate-blueprint` writes
-- `stable.productFacts` whenever a creator answers the readiness question
-- labelled "Specific features, numbers or outcomes this video is allowed to
-- state", then persists the WHOLE brief in one update:
--
--   update brand_voices set pre_script_brief = {...brief, ...stable}
--
-- `productFacts` is not in this CHECK's key set, so the database rejects that
-- update ENTIRELY. Probed against the live function on 2026-09-10:
--
--   is_pre_script_brief('{"offer":"x"}')                      -> true
--   is_pre_script_brief('{"confirmedAudiencePain":"x"}')       -> true
--   is_pre_script_brief('{"commercialTies":["affiliate"]}')    -> true
--   is_pre_script_brief('{"productFacts":"wide band, 45 dollars"}') -> FALSE
--   is_pre_script_brief('{"productFacts":["wide band"]}')      -> FALSE
--   is_pre_script_brief('{"totallyMadeUpKey":"x"}')            -> false  (control)
--
-- ⚠️ THE FIRST PROBE OF THIS WAS WRONG AND IS RECORDED SO NOBODY REPEATS IT. I
-- tested `'{"commercialTies":"affiliate"}'` as a STRING, got false, and almost
-- concluded the constraint was unenforced — 10 voices have that key stored. It
-- failed on the VALUE's type, not the key: `commercialTies` must be an array.
-- The control above is what separates the two, and `productFacts` fails as a
-- string AND as an array, which is what makes it a key problem.
--
-- ⚠️⚠️ AND THE BLAST RADIUS IS NOT ONLY THIS KEY, BECAUSE THE WRITE IS ONE
-- STATEMENT. A creator who answered the claims question AND the CTA question lost
-- BOTH: the rejected row takes `offer`, `promotes` and `defaultCta` down with it.
-- That is the mechanism behind three separate measured zeroes —
--
--   voices with a stored productFacts  ->  0 of 52 (never storable at all)
--   voices with a stored defaultCta    ->  0 of 51, though it IS an allowed key
--                                          and IS read by the writer
--   offer-field specifics in a script  ->  5 of 6 dropped, audited over ten runs
--
-- — and the only trace is `console.warn('readiness_answers_not_persisted')`,
-- because failing the persist must not fail a build the creator already paid for.
-- That severity is right. The silence it bought is what hid this.
--
-- WHAT THIS MIGRATION DOES: widens the key set by exactly one key. `productFacts`
-- is a plain non-empty string (capped at 2,000 characters by the writer), so it
-- falls under the existing string rule with no new branch.
--
-- ⚖️ NOTHING IS BACKFILLED. No creator has ever had one stored, and there is no
-- source to backfill FROM — the answers were rejected, not kept elsewhere. An
-- invented value here would be a claim in her voice that she never typed, which
-- is the one thing this column exists to prevent.
--
-- ⚖️ AND IT IS A `create or replace`, WHICH IS RERUNNABLE BY CONSTRUCTION. The
-- CHECK constraint references the function by name and is not re-created, so no
-- table is rewritten and no existing row is revalidated. Every key already
-- accepted is still accepted: this list is the live definition with one line
-- added, copied forward rather than retyped.
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
             -- ⚠️ THE NEW ONE. The facts the creator typed about her own product
             -- — price, sizes, what the thing physically IS — which the writer
             -- had no way to learn from anywhere else: the only other product
             -- facts in the prompt come from scraping the product's own pages.
             'productFacts'
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

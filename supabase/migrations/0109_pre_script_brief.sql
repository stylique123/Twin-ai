-- 0109 — THE BRIEF IS STORED, INSTEAD OF BEING ASKED AND DISCARDED.
--
-- §8a.1's question set has been asked in the product since the onboarding scan
-- shipped. `Onboarding.tsx` collects `workKind` and `forbiddenClaims`, writes
-- them into the onboarding draft, and the draft is `localStorage`. At `confirm()`
-- the three writers that run are `saveVoiceProfile`, `saveCapabilityDefaults`
-- and `saveDNA`, and none of them carries either field. There is no column.
-- Grepping the whole repository for `work_kind` or `forbidden_claims` returned
-- nothing before this migration.
--
-- So a doctor typed "no guaranteed outcomes, never say cure" into a box we put
-- in front of them, and it lived in one browser until that browser was cleared.
-- No script generation ever saw it.
--
-- THAT IS WORSE THAN NOT ASKING. An unasked question leaves a creator knowing
-- the system does not know. A question asked and dropped leaves them believing
-- it does — and the belief is the dangerous half, because it is the reason they
-- stop checking the output for the claim they told us never to make.
--
-- ── WHY beside the brand voice, and not a new table ───────────────────────
--
-- `generate-blueprint` already loads `brand_voices` (`select id, handle,
-- platform, profile, brand_kit`) and builds the creator context from `vp` with
-- `profiles.dna` as the fallback. The brief answers the SAME questions that
-- fallback chain currently answers by inference — goal, audience, offer. Put
-- anywhere else, it becomes a second authority for one set of facts, resolved
-- by whichever reader was written last. Put here, it is one more field on the
-- object the consumer already holds, and the precedence rule can be stated in
-- one line: THE CREATOR'S OWN ANSWER WINS OVER ANYTHING WE INFERRED.
--
-- The scope is the same as `default_capability_flags`, deliberately: what is
-- usually true of this brand's work. A per-video override is NOT added here.
-- `capability_flags` has one because a capability genuinely changes per video
-- (the same creator can film a product this week and not next); "what may you
-- never claim" does not change per video, and a per-video copy would be a
-- second place for a compliance answer to be wrong.
--
-- ── UNSET IS A THIRD STATE, AND THE CHECK ENFORCES IT ─────────────────────
--
-- The same rule 0103 wrote down, and it matters more here. `forbiddenClaims`
-- has three states that a two-state read collapses: "we never asked", "they
-- left it blank", and "they said there are no restrictions". A system that
-- reads an empty box as permission has quietly decided a doctor may say
-- anything. So an ABSENT KEY means unanswered, an empty string is refused
-- rather than stored (it is indistinguishable from unanswered once read), and
-- `"none"` is a real, storable answer that means something different.
--
-- ── THE KEY SET MIRRORS `BRIEF_QUESTIONS`, INCLUDING THE ONES NOT YET ASKED ─
--
-- `promotes` and `alsoWantsToMake` are the confirm-screen half of §8a.1 and are
-- built by a different track. They are permitted here from the start, on
-- purpose: a key set frozen to only the questions THIS track asks would make
-- the other track's first write fail a CHECK, and the fix under deadline is
-- always a second column. Two columns for one brief is precisely the
-- duplicate-authority failure this file exists to avoid. The vocabulary is
-- closed against invention, not against the questions already designed.

create or replace function public.is_pre_script_brief(p jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select p is null
      or (
        jsonb_typeof(p) = 'object'
        -- No key outside §8a.1's set. A client cannot grow the brief by writing
        -- to it, which is how a question set becomes whatever a form posted.
        and not exists (
          select 1 from jsonb_object_keys(p) k
           where k not in (
             'goal', 'audience', 'workKind', 'workKindOther', 'offer',
             'forbiddenClaims', 'promotes', 'alsoWantsToMake', 'productEvidence'
           )
        )
        -- Every text answer is a NON-EMPTY string. An empty one reads as
        -- unanswered the moment anything consumes it, so storing it would
        -- create a fourth state that means the same as the absent one and is
        -- counted differently by whoever forgets.
        and not exists (
          select 1 from jsonb_each(p) e
           where e.key <> 'productEvidence'
             and (jsonb_typeof(e.value) <> 'string' or btrim(e.value #>> '{}') = '')
        )
        -- The product answer is either the string 'declined' — a real answer,
        -- "there is nothing to show" — or the evidence object itself. Anything
        -- else is a description of a product, which §2.3's container rule
        -- exists to refuse.
        and (
          not p ? 'productEvidence'
          or p -> 'productEvidence' = '"declined"'::jsonb
          or jsonb_typeof(p -> 'productEvidence') = 'object'
        )
      );
$$;
revoke all on function public.is_pre_script_brief(jsonb) from public, anon, authenticated;
grant execute on function public.is_pre_script_brief(jsonb) to authenticated, service_role;

alter table public.brand_voices
  add column if not exists pre_script_brief jsonb;

alter table public.brand_voices
  drop constraint if exists brand_voices_pre_script_brief_shape;
alter table public.brand_voices
  add constraint brand_voices_pre_script_brief_shape
  check (public.is_pre_script_brief(pre_script_brief));

-- THE COLUMN GRANT, without which none of the above can be written.
--
-- `brand_voices` revoked table-level UPDATE from `authenticated` in 0002 and
-- grants it back one column at a time, so a new column is UNWRITABLE by default
-- and fails with a bare 42501 that names no column. This has already happened
-- twice in this tree — 0053 for `scene_timeline` (the V2 flow dead-ended on a
-- raw permission error AFTER the creator spent a recreation) and 0051 for
-- `brand_kit`. Granting in the same migration as the column is what stops a
-- third, and 0103 said the same thing one column earlier.
grant update (pre_script_brief) on public.brand_voices to authenticated;

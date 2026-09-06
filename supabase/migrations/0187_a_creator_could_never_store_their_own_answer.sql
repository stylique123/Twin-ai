-- A CREATOR'S TYPED ANSWER COULD NEVER BE STORED. NOT ONCE, FOR ANYBODY.
--
-- ⚠️ MEASURED ON PRODUCTION, 2026-09-06:
--
--     creator_questions_put, outcome='answered'   12 rows, 4 creators
--     creator_knowledge, source='asked'            0 rows
--     creator_knowledge, source='user'             0 rows
--     creator_knowledge sources present            caption (610), transcript (478)
--
-- Four real creators typed twelve real answers, the most recent on 2026-09-05.
-- Not one reached the store the writer reads. Every row of creator_knowledge in
-- existence was written by the worker or an edge function using the service key,
-- which bypasses row security entirely.
--
-- ── WHY, EXACTLY ──────────────────────────────────────────────────────────
--
-- `answerQuestion` (apps/web/src/lib/creatorAnswers.ts) writes from the BROWSER
-- client, as the creator. `creator_knowledge` has policies for SELECT, UPDATE
-- and DELETE — and none for INSERT — and 0141 revoked the INSERT grant to match.
-- So the insert is refused twice over: no grant, and no policy behind it.
--
-- ⚠️ AND 0141 SAID THIS WAS SAFE, IN WRITING: "no policy means row security
-- refuses the write — so nothing in the product can be using these, or it would
-- already be failing." Something WAS using it. It WAS already failing. The
-- failure was invisible because the caller swallows it:
--
--     console.warn('answer not stored as knowledge', error.message)
--     return { ok: false, reason: 'not_saved' }
--
-- An absent bug report was read as an absent caller. That is the same mistake as
-- reading an absent error as evidence a check ran.
--
-- ⚠️ AND THE ORDERING MAKES IT WORSE THAN A FAILED SAVE. `markPut(id,'answered')`
-- runs BEFORE the insert, deliberately, so a creator is never re-asked something
-- they already answered. With the insert refused, each answer is lost AND its
-- question is permanently closed. The creator is told "We could not save that
-- just now — try again in a moment", and the question never returns.
--
-- ── WHAT THIS DOES, AND WHY IT IS NOT A WEAKENING ─────────────────────────
--
-- ⚖️ THE PREDICATE IS THE ONE ALREADY ON THE OTHER THREE POLICIES, character for
-- character: `auth.uid() = owner_id`. A creator may insert rows they own and no
-- others. This does not widen the boundary; it completes the one the product was
-- always written against. The absence was the defect, not the protection.
--
-- ⚖️ `authenticated` ONLY, NEVER `anon`. An unauthenticated caller has no
-- `auth.uid()` to match, so the row could not be attributed to anybody — and
-- 0141's whole point is that a grant nobody decided to give is not a permission.
--
-- ⚖️ BOTH HALVES, BECAUSE EITHER ALONE IS INERT. A policy without the grant is
-- refused at the grant layer; a grant without the policy is refused by row
-- security AND illegal under scripts/ci/check_client_write_grants.sql. That
-- guard is derived from the policies rather than an allowlist, so adding the two
-- together keeps it satisfied without editing it.
--
-- ⚖️ IT DOES NOT BACKFILL THE TWELVE LOST ANSWERS. Their text was never written
-- anywhere — `creator_questions_put` records only that a question was answered,
-- not with what. Those sentences are gone, and inventing plausible replacements
-- for a store the writer quotes as the creator's own words would be worse than
-- the gap. What this migration buys is that the thirteenth answer survives.

-- ⚖️ SAFE TO APPLY TWICE. A dropped-then-created policy converges; the grant is
-- idempotent by definition.
drop policy if exists "own knowledge insert" on public.creator_knowledge;

create policy "own knowledge insert"
  on public.creator_knowledge
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

grant insert on public.creator_knowledge to authenticated;

-- SECURITY DEFINER FUNCTIONS WERE REACHABLE BY anon, AND NO MIGRATION ASKED FOR IT.
--
-- `revoke all on function ... from public` does NOT remove a role grant, and a
-- default privilege on this project grants EXECUTE to anon on functions created
-- in `public`. So a migration that creates a SECURITY DEFINER function and
-- revokes only PUBLIC ships it callable by anyone holding the anon key.
-- SECURITY DEFINER then bypasses RLS, so the owner_id filter on the table is
-- not in the path.
--
-- It is NOT every function: 0003's is_platform_admin and is_superadmin carry no
-- anon grant in production, so the default did not reach them. Measured, not
-- assumed — which is why the CI guard added with this migration reads the
-- migrations rather than claiming to know the live ACL it cannot see.
--
-- MEASURED in production on 2026-10-01, running `set local role anon`:
--   · niche_research_due(30)      returned 1 ROW  — a live cross-tenant read
--   · panel_answers_pending(5)    executed clean, 0 rows ONLY because no answer
--                                 is pending yet. Its body has no auth.uid()
--                                 filter at all and it returns owner_id and the
--                                 full blueprint for EVERY creator. Absent is
--                                 not zero; this is latent, not safe.
--   · select from public.generations returned 0 — RLS itself is intact. The
--                                 functions are the hole, not the tables.
--
-- Every reader is the worker, holding the service role:
--   panel_answers_pending  worker/src/nicheBrain/audience.ts:339
--   niche_research_due     worker/src/nicheBrain/nicheResearch.ts:21
--   merge_sub_niches       worker/src/nicheBrain/sweep.ts:251
-- so anon AND authenticated both come off those three.
--
-- `ensure_review_token(uuid)` is different: 0046 granted it to `authenticated`
-- only and the web app calls it (packages/shared/src/api.ts:947). Production had
-- drifted to include anon, which would let an unauthenticated caller mint a
-- review token for any generation id. Only anon comes off — 0046's intent is
-- restored, not changed.
--
-- `brand_report(text)` KEEPS its anon grant. 0035 granted it deliberately and
-- the unguessable share token is the access control. This migration does not
-- touch it.
--
-- scripts/ci/check_definer_functions_not_public.mjs now fails any migration that
-- adds a SECURITY DEFINER function without revoking it from anon or recording
-- why anon may reach it.
--
-- This only ever REMOVES privilege. It is safe to re-run.

revoke execute on function public.panel_answers_pending(int) from anon, authenticated;
revoke execute on function public.niche_research_due(int)    from anon, authenticated;
revoke execute on function public.merge_sub_niches()         from anon, authenticated;
revoke execute on function public.ensure_review_token(uuid)   from anon;

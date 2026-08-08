-- R7-1 / hardened R8-4: AUTHORITATIVE live verification of the storage-object
-- delete posture. This is the authoritative check (the migration-derived guard
-- scripts/ci/check_takes_delete_policy.mjs is supporting evidence only). Run it
-- read-only as part of the sign-off sequence BEFORE claiming the posture.
--
-- Why this shape: a predicate-text / policy-name match for the literal 'takes'
-- is NOT authoritative — an indirect predicate such as
--   create policy "deleter" on storage.objects
--     for delete using (public.can_delete_take(name, auth.uid()));
-- references no literal 'takes' yet can still delete a takes object. The repo has
-- NO DELETE/ALL policy on storage.objects at all, so the authoritative gate is
-- simply: ZERO live DELETE-or-ALL policies on storage.objects. We also enumerate
-- every policy's command, roles, and predicates as evidence.
--
-- Run (read-only), e.g. supabase MCP execute_sql or:
--   psql "$SUPABASE_DB_URL" -f scripts/prod-smoke/verify_takes_policy_live.sql
--
-- PASS criteria (all):
--   1. delete_or_all_policies_on_storage_objects = 0
--   2. has_insert = FALSE          -- inverted by 0112, see below
--   3. has_select = true
-- Any nonzero delete/all count fails the posture and BLOCKS sign-off.
--
-- CRITERION 2 USED TO READ `has_insert = true`. That made a client INSERT policy
-- on the `takes` bucket part of the signed-off posture, when it is in fact a
-- provenance bypass: bytes could land in `takes/<uid>/…` with no capture intent,
-- no finalize record and no etag binding, which makes
-- `bytes_changed_after_finalize` pass vacuously and leaves the 0090–0093 chain
-- resting on a row that was never created. 0112 drops the policy. Uploads go
-- through source-asset → signed upload token → finalize → validate_source, and a
-- signed URL authorizes exactly one object without any bucket INSERT policy.
--
-- has_select stays TRUE on purpose: objects already in the bucket must remain
-- playable. This posture is about who may WRITE.

select
  count(*) filter (where cmd in ('DELETE', 'ALL'))               as delete_or_all_policies_on_storage_objects,
  bool_or(cmd in ('INSERT', 'ALL'))                              as has_insert,
  bool_or(cmd in ('SELECT', 'ALL'))                              as has_select,
  -- Evidence: every DELETE/ALL policy with its roles + predicates (should be []).
  coalesce(jsonb_agg(
    jsonb_build_object('policy', policyname, 'cmd', cmd, 'roles', roles,
                       'qual', qual, 'with_check', with_check)
    order by policyname
  ) filter (where cmd in ('DELETE', 'ALL')), '[]'::jsonb)        as delete_or_all_detail,
  -- Evidence: full policy roster on storage.objects.
  coalesce(jsonb_agg(
    jsonb_build_object('policy', policyname, 'cmd', cmd) order by policyname
  ), '[]'::jsonb)                                                as all_storage_objects_policies
from pg_policies
where schemaname = 'storage' and tablename = 'objects';

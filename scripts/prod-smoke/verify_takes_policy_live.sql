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
--   2. has_insert = true
--   3. has_select = true
-- Any nonzero delete/all count fails the posture and BLOCKS sign-off.

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

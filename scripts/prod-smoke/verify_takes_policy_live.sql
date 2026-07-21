-- R7-1: AUTHORITATIVE live verification of the `takes` storage-policy posture.
--
-- The migration-derived guard (scripts/ci/check_takes_delete_policy.mjs) is
-- SUPPORTING evidence only. This query is the AUTHORITATIVE check of the real
-- production posture and MUST be run (read-only) as part of the sign-off
-- sequence — BEFORE claiming that a client cannot delete its own `takes` object.
--
-- Run it against production (read-only) with a service-role/DB connection, e.g.:
--   supabase (MCP execute_sql) or psql "$SUPABASE_DB_URL" -f this-file.sql
--
-- PASS criteria (all three):
--   1. delete_capable_takes_policies = 0   (no FOR DELETE and no FOR ALL policy
--      on storage.objects whose predicate references the `takes` bucket)
--   2. has_insert = true                   (owner INSERT policy present)
--   3. has_select = true                   (owner SELECT policy present)
-- Any nonzero delete_capable count fails the posture and BLOCKS sign-off.

with takes_policies as (
  select
    policyname,
    cmd,                                   -- SELECT | INSERT | UPDATE | DELETE | ALL
    coalesce(qual, '') || ' ' || coalesce(with_check, '') as predicate
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and (
      coalesce(qual, '')       ilike '%''takes''%'
      or coalesce(with_check, '') ilike '%''takes''%'
      or policyname ilike '%takes%'
    )
)
select
  count(*) filter (where cmd in ('DELETE', 'ALL')) as delete_capable_takes_policies,
  bool_or(cmd = 'INSERT' or cmd = 'ALL')           as has_insert,
  bool_or(cmd = 'SELECT' or cmd = 'ALL')           as has_select,
  coalesce(
    jsonb_agg(jsonb_build_object('policy', policyname, 'cmd', cmd) order by policyname),
    '[]'::jsonb
  )                                                as all_takes_policies
from takes_policies;

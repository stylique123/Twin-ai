-- A WRITE NEEDS BOTH A GRANT AND A POLICY. THIS ASSERTS THE GRANT LAYER.
--
-- ⚠️ THE INVARIANT, NOT THE MIGRATION. 0139 and 0140 fixed the schema as it
-- stood; this fails the build if it drifts back. Supabase grants ALL on every
-- new public table to `anon` and `authenticated` by default, so the drift is not
-- hypothetical — it is what happens automatically the next time anybody creates
-- a table and does not think about it.
--
-- ⚖️ TWO RULES, AND THE SECOND ONE HAS NO EXCEPTIONS:
--
--   1. A client role may hold INSERT / UPDATE / DELETE on a table only if that
--      table has a policy for that command (or a `FOR ALL` policy). A grant with
--      no policy behind it is a permission nobody decided to give.
--
--   2. No client role may hold TRUNCATE on anything, ever. Row security is not
--      consulted for TRUNCATE, so the grant IS the whole permission — and no
--      part of this product truncates a table from a client.
--
-- ⚠️ RULE 1 IS DELIBERATELY WEAKER THAN "system tables must be empty". Expressed
-- as an allowlist it would be a second list to maintain beside the policies
-- themselves, and the two would drift — the failure this codebase keeps finding.
-- Derived from the policies, it cannot: deleting a write policy makes its grant
-- illegal on the next run, automatically.
--
-- Run against staging in the matrix, where the schema is real. A guard that reads
-- migration FILES would pass on a database nobody had applied them to.
do $$
declare
  bad text;
begin
  -- RULE 2 — TRUNCATE, ∅
  select string_agg(distinct table_name, ', ' order by table_name) into bad
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and privilege_type = 'TRUNCATE';

  if bad is not null then
    raise exception
      'client roles hold TRUNCATE on: %. Row security does not gate TRUNCATE, so the grant is the whole permission. Revoke it — there is no legitimate client caller.', bad;
  end if;

  -- RULE 1 — a write grant needs a write policy for the same command
  select string_agg(x.what, E'\n  ' order by x.what) into bad
  from (
    select g.table_name || ' ' || g.privilege_type || ' (' || g.grantee || ')' as what
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.grantee in ('anon', 'authenticated')
      and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = g.table_name
          and p.cmd in (g.privilege_type, 'ALL')
      )
  ) x;

  if bad is not null then
    raise exception
      E'write grants with no policy behind them:\n  %\nEither add the policy that was intended, or revoke the grant. A grant nothing can use is a lock left unlocked.', bad;
  end if;

  raise notice 'client-write-grants invariant: OK';
end $$;

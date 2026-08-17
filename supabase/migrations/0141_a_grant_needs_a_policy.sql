-- A WRITE GRANT WITH NO POLICY BEHIND IT IS A PERMISSION NOBODY DECIDED TO GIVE.
--
-- ⚠️ 0139 CAUGHT THE TABLES WITH NO WRITE POLICY AT ALL. It missed the larger
-- case: a table with SOME write policy still carries default grants for the
-- commands it has no policy for. `generations` has no INSERT or DELETE policy
-- and granted both; `profiles`, `brand_voices`, `creator_knowledge`,
-- `notifications`, `workspace_members` and a dozen more are the same shape.
-- Forty-two grant/command pairs on production, every one of them a lock left
-- unlocked behind a door that happens to be shut.
--
-- ⚖️ THIS CHANGES NOTHING TODAY. For INSERT, UPDATE and DELETE, no policy means
-- row security refuses the write — so nothing in the product can be using these,
-- or it would already be failing. (TRUNCATE is the exception that 0140 exists
-- for: row security does not gate it, so there the grant WAS the permission.)
--
-- ⚠️ DERIVED, NOT LISTED, AND THAT IS THE POINT. Written as forty-two REVOKE
-- statements this would be a second list beside the policies, and the two would
-- drift — the failure this codebase keeps finding, in migrations, in scorers, in
-- guards. Expressed as "revoke what has no policy", the migration and
-- `check_client_write_grants.sql` are the same sentence, so a future policy
-- change cannot leave one of them stale.
--
-- ⚖️ AND IT IS SAFE TO RE-RUN. A revoke of a privilege already absent is a no-op,
-- so this converges rather than accumulating.
do $$
declare
  r record;
begin
  for r in
    select distinct g.table_name, g.privilege_type
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
  loop
    execute format('revoke %s on table public.%I from anon, authenticated',
                   r.privilege_type, r.table_name);
  end loop;
end $$;

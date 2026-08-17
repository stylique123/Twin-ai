-- RLS DOES NOT GATE `TRUNCATE`, AND 0139 ONLY REMOVED IT FROM TWELVE TABLES.
--
-- ⚠️ THE ASSUMPTION THAT MADE THE FIRST AUDIT WRONG. 0139 reasoned that broad
-- write grants were inert because row-level security refuses the writes. That
-- holds for INSERT, UPDATE and DELETE. It does NOT hold for TRUNCATE: row
-- security is not consulted for it at all, so a TRUNCATE grant is the whole
-- permission, with nothing behind it. Nineteen tables still carried one after
-- 0139 — `posts`, `generations`, `product_entities`, `profiles`, `brand_voices`,
-- `creator_knowledge` among them — because 0139 was scoped to the tables with no
-- write POLICY, and these have owner-scoped ones that TRUNCATE ignores.
--
-- ⚖️ NOT CURRENTLY REACHABLE, AND STILL WRONG. PostgREST never emits TRUNCATE,
-- so no HTTP request can reach it today. It becomes live the moment a
-- SECURITY INVOKER function truncates, or a direct connection uses these roles —
-- and "unreachable through the front door we happen to ship" is a property of
-- the client, not of the permission.
--
-- ⚠️ SO THE RULE IS ∅, WITH NO ALLOWLIST. Every other privilege here has some
-- legitimate caller to argue about; TRUNCATE has none anywhere in this product,
-- for any table, for either client role. A rule with no exceptions is one nobody
-- has to interpret, and `check_client_write_grants.sql` enforces it from here on.
--
-- Applies to EVERY public table rather than a list, because the next table
-- created will inherit the same default grant and this should already cover it.
do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind = 'r'
  loop
    execute format('revoke truncate on table public.%I from anon, authenticated', r.relname);
  end loop;
end $$;

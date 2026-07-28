-- ===========================================================================
-- THE CANONICAL SEMANTIC MANIFEST
-- ===========================================================================
-- One read-only SELECT that renders the COMPLETE owned surface of migrations
-- 0090-0093 as a canonical JSON document.
--
-- The SAME file runs against the disposable EXPECTED database and against
-- STAGING. Identical query text on both sides is what makes the comparison
-- apples-to-apples; there is no second, drifting "staging edition".
--
-- WRITES: none. This file contains exactly one statement and it is a SELECT.
-- Callers additionally run it under `default_transaction_read_only = on`, so the
-- server itself rejects any write this file could theoretically contain. See
-- lib/guard.mjs (readManifest) and the read-only proof in hostile/run.mjs.
--
-- Input: :ledger — the ownership ledger JSON (see lib/ledger.mjs).
--
-- Canonicalization rules, so two semantically identical databases always produce
-- byte-identical documents:
--   * every array is ORDER BY'd on a stable key;
--   * object keys are emitted in a fixed order by construction;
--   * OIDs, sizes, row counts, timestamps and other non-semantic values are
--     never emitted;
--   * regprocedure/regtype/pg_get_*def renderings are used so a type or function
--     reference is compared by NAME, not by an OID that differs per database.
-- ===========================================================================

with ledger as (
  select :'ledger'::jsonb as l
),
owned_tables as (
  select c.oid, n.nspname as sch, c.relname as tbl
    from ledger, jsonb_array_elements_text(l -> 'owned_tables') k
    join pg_class c on c.oid = to_regclass(k.value)
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r'
),
-- Ledger keys that did not resolve to a live relation: the object is MISSING.
missing_tables as (
  select k.value as key
    from ledger, jsonb_array_elements_text(l -> 'owned_tables') k
   where to_regclass(k.value) is null
),

-- ---------------------------------------------------------------------------
-- ZONE A: complete surface of every owned table.
-- ---------------------------------------------------------------------------
t_columns as (
  select ot.oid, jsonb_agg(jsonb_build_object(
           'name', a.attname,
           'type', format_type(a.atttypid, a.atttypmod),
           'not_null', a.attnotnull,
           'default', pg_get_expr(ad.adbin, ad.adrelid),
           'identity', a.attidentity,      -- '' | 'a' (always) | 'd' (by default)
           'generated', a.attgenerated,    -- '' | 's' (stored)
           'collation', co.collname
         ) order by a.attname) as v
    from owned_tables ot
    join pg_attribute a on a.attrelid = ot.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
    left join pg_collation co on co.oid = a.attcollation
   group by ot.oid
),
t_constraints as (
  select ot.oid, jsonb_agg(jsonb_build_object(
           'name', con.conname,
           'type', con.contype,            -- p primary, u unique, f foreign, c check, x exclusion
           'definition', pg_get_constraintdef(con.oid),
           'deferrable', con.condeferrable,
           'deferred', con.condeferred,
           'validated', con.convalidated
         ) order by con.conname) as v
    from owned_tables ot
    join pg_constraint con on con.conrelid = ot.oid
   group by ot.oid
),
t_indexes as (
  select ot.oid, jsonb_agg(jsonb_build_object(
           'name', ic.relname,
           'definition', pg_get_indexdef(i.indexrelid),
           'unique', i.indisunique,
           'primary', i.indisprimary,
           'valid', i.indisvalid,
           'replica_identity', i.indisreplident
         ) order by ic.relname) as v
    from owned_tables ot
    join pg_index i on i.indrelid = ot.oid
    join pg_class ic on ic.oid = i.indexrelid
   group by ot.oid
),
t_policies as (
  select ot.oid, jsonb_agg(jsonb_build_object(
           'name', p.polname,
           'command', p.polcmd,            -- r select, a insert, w update, d delete, * all
           -- PERMISSIVE vs RESTRICTIVE. A permissive->restrictive flip silently
           -- ANDs instead of ORs and can lock every read out (or, flipped the
           -- other way, open one up). It is a first-class field, not a footnote.
           'permissive', p.polpermissive,
           'roles', (select coalesce(jsonb_agg(pg_get_userbyid(r) order by pg_get_userbyid(r)), '[]'::jsonb)
                       from unnest(p.polroles) r),
           'using', pg_get_expr(p.polqual, p.polrelid),
           'with_check', pg_get_expr(p.polwithcheck, p.polrelid)
         ) order by p.polname) as v
    from owned_tables ot
    join pg_policy p on p.polrelid = ot.oid
   group by ot.oid
),
t_triggers as (
  select ot.oid, jsonb_agg(jsonb_build_object(
           'name', t.tgname,
           'definition', pg_get_triggerdef(t.oid),
           'function', t.tgfoid::regprocedure::text,
           -- ENABLED STATE. `ALTER TABLE ... DISABLE TRIGGER` leaves the trigger
           -- in the catalog looking perfect while it never fires again. 'O' is
           -- the default (fires in origin/local), 'D' is disabled.
           'enabled', t.tgenabled
         ) order by t.tgname) as v
    from owned_tables ot
    join pg_trigger t on t.tgrelid = ot.oid and not t.tgisinternal
   group by ot.oid
),
t_acl as (
  select ot.oid, coalesce(jsonb_agg(jsonb_build_object(
           'grantee', case when g.grantee = 0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end,
           'grantor', pg_get_userbyid(g.grantor),
           'privilege', g.privilege_type,
           'grantable', g.is_grantable
         ) order by (case when g.grantee = 0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end),
                    g.privilege_type), '[]'::jsonb) as v
    from owned_tables ot
    join pg_class c on c.oid = ot.oid
    left join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) g on true
   group by ot.oid
),
tables_json as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'schema', ot.sch,
           'table', ot.tbl,
           'owner', pg_get_userbyid(c.relowner),
           'persistence', c.relpersistence,
           'rls_enabled', c.relrowsecurity,
           -- FORCED RLS. Without it the table OWNER bypasses every policy. A
           -- table that is rls_enabled but not forced is a materially different
           -- security posture, and the previous fingerprint did not look at it.
           'rls_forced', c.relforcerowsecurity,
           'replica_identity', c.relreplident,
           'columns', coalesce(tc.v, '[]'::jsonb),
           'constraints', coalesce(tk.v, '[]'::jsonb),
           'indexes', coalesce(ti.v, '[]'::jsonb),
           'policies', coalesce(tp.v, '[]'::jsonb),
           'triggers', coalesce(tt.v, '[]'::jsonb),
           'acl', coalesce(ta.v, '[]'::jsonb)
         ) order by ot.sch, ot.tbl), '[]'::jsonb) as v
    from owned_tables ot
    join pg_class c on c.oid = ot.oid
    left join t_columns tc on tc.oid = ot.oid
    left join t_constraints tk on tk.oid = ot.oid
    left join t_indexes ti on ti.oid = ot.oid
    left join t_policies tp on tp.oid = ot.oid
    left join t_triggers tt on tt.oid = ot.oid
    left join t_acl ta on ta.oid = ot.oid
),

-- ---------------------------------------------------------------------------
-- Owned functions, by IDENTITY (name + identity argument types).
-- ---------------------------------------------------------------------------
owned_functions as (
  select k.value as key, p.oid
    from ledger, jsonb_array_elements_text(l -> 'owned_functions') k
    join pg_proc p on p.oid = to_regprocedure(k.value)
),
missing_functions as (
  select k.value as key
    from ledger, jsonb_array_elements_text(l -> 'owned_functions') k
   where to_regprocedure(k.value) is null
),
-- ADDITIVE detection for functions: any OTHER overload sharing an owned
-- function's schema-qualified NAME. No committed migration in 0090-0093 creates
-- one, so an extra overload is drift — and a dangerous kind, since PostgreSQL
-- may resolve a call to the impostor.
owned_function_names as (
  select distinct n.nspname as sch, p.proname as nm
    from owned_functions of_ join pg_proc p on p.oid = of_.oid
    join pg_namespace n on n.oid = p.pronamespace
),
extra_overloads as (
  select coalesce(jsonb_agg(
           (n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')
           order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::jsonb) as v

    from owned_function_names ofn
    join pg_namespace n on n.nspname = ofn.sch
    join pg_proc p on p.pronamespace = n.oid and p.proname = ofn.nm
   where not exists (select 1 from owned_functions of2 where of2.oid = p.oid)
),
f_acl as (
  select of_.oid, coalesce(jsonb_agg(jsonb_build_object(
           'grantee', case when g.grantee = 0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end,
           'privilege', g.privilege_type,
           'grantable', g.is_grantable
         ) order by (case when g.grantee = 0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end),
                    g.privilege_type), '[]'::jsonb) as v
    from owned_functions of_
    join pg_proc p on p.oid = of_.oid
    left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g on true
   group by of_.oid
),
functions_json as (
  select coalesce(jsonb_agg(jsonb_build_object(
           -- Same type-only identity key the ledger uses (see 10_catalog_census.sql).
           'identity', of_.key,
           'schema', n.nspname,
           'name', p.proname,
           -- Named identity arguments too: a renamed parameter breaks every
           -- `func(arg => value)` call site, so it is semantic drift.
           'identity_args', pg_get_function_identity_arguments(p.oid),
           'result', pg_get_function_result(p.oid),
           'language', lg.lanname,
           'owner', pg_get_userbyid(p.proowner),
           'volatility', p.provolatile,        -- i immutable, s stable, v volatile
           'parallel', p.proparallel,
           'strict', p.proisstrict,
           'returns_set', p.proretset,
           -- SECURITY MODE. security definer runs as the owner; flipping it to
           -- invoker silently disables every RPC that relies on bypassing RLS,
           -- and flipping it on turns a helper into a privilege escalation.
           'security_definer', p.prosecdef,
           'leakproof', p.proleakproof,
           -- SEARCH_PATH and every other proconfig setting. A security-definer
           -- function without a pinned search_path is a textbook hijack; the
           -- exact pinned value is therefore part of the contract.
           'config', (select coalesce(jsonb_agg(cfg order by cfg), '[]'::jsonb)
                        from unnest(coalesce(p.proconfig, '{}')) cfg),
           -- Full body. Compared verbatim, and additionally hashed so a diff can
           -- report "body changed" without dumping a 200-line function.
           'body', p.prosrc,
           -- pg_catalog.sha256 (built in since PG11), NOT extensions.digest:
           -- this query must run against ANY database without depending on
           -- pgcrypto being installed, or a missing extension would surface as a
           -- harness error instead of a schema verdict.
           'body_sha256', encode(pg_catalog.sha256(convert_to(p.prosrc, 'UTF8')), 'hex'),
           'acl', coalesce(fa.v, '[]'::jsonb)
         ) order by of_.key), '[]'::jsonb) as v
    from owned_functions of_
    join pg_proc p on p.oid = of_.oid
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language lg on lg.oid = p.prolang
    left join f_acl fa on fa.oid = of_.oid
),

-- ---------------------------------------------------------------------------
-- ZONE B: named attachments on PRE-EXISTING tables.
-- ---------------------------------------------------------------------------
scoped_columns as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', s.key,
           'present', (a.attname is not null),
           'type', format_type(a.atttypid, a.atttypmod),
           'not_null', a.attnotnull,
           'default', pg_get_expr(ad.adbin, ad.adrelid),
           'identity', a.attidentity,
           'generated', a.attgenerated
         ) order by s.key), '[]'::jsonb) as v
    from (select k.value as key,
                 split_part(k.value, '.', 1) || '.' || split_part(k.value, '.', 2) as rel,
                 split_part(k.value, '.', 3) as col
            from ledger, jsonb_array_elements_text(l -> 'scoped_columns') k) s
    left join pg_class c on c.oid = to_regclass(s.rel)
    left join pg_attribute a on a.attrelid = c.oid and a.attname = s.col and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
),
scoped_constraints as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', s.key,
           'present', (con.conname is not null),
           'type', con.contype,
           'definition', pg_get_constraintdef(con.oid),
           'validated', con.convalidated
         ) order by s.key), '[]'::jsonb) as v
    from (select k.value as key,
                 split_part(k.value, '.', 1) || '.' || split_part(k.value, '.', 2) as rel,
                 split_part(k.value, '.', 3) as nm
            from ledger, jsonb_array_elements_text(l -> 'scoped_constraints') k) s
    left join pg_class c on c.oid = to_regclass(s.rel)
    left join pg_constraint con on con.conrelid = c.oid and con.conname = s.nm
),
scoped_policies as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', s.key,
           'present', (p.polname is not null),
           'command', p.polcmd,
           'permissive', p.polpermissive,
           'roles', (select coalesce(jsonb_agg(pg_get_userbyid(r) order by pg_get_userbyid(r)), '[]'::jsonb)
                       from unnest(coalesce(p.polroles, '{}')) r),
           'using', pg_get_expr(p.polqual, p.polrelid),
           'with_check', pg_get_expr(p.polwithcheck, p.polrelid)
         ) order by s.key), '[]'::jsonb) as v
    from (select k.value as key,
                 split_part(k.value, '.', 1) || '.' || split_part(k.value, '.', 2) as rel,
                 split_part(k.value, '.', 3) as nm
            from ledger, jsonb_array_elements_text(l -> 'scoped_policies') k) s
    left join pg_class c on c.oid = to_regclass(s.rel)
    left join pg_policy p on p.polrelid = c.oid and p.polname = s.nm
),
scoped_indexes as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', s.key,
           'present', (ic.relname is not null),
           'definition', pg_get_indexdef(i.indexrelid),
           'unique', i.indisunique,
           'valid', i.indisvalid
         ) order by s.key), '[]'::jsonb) as v
    from (select k.value as key from ledger, jsonb_array_elements_text(l -> 'scoped_indexes') k) s
    left join pg_class ic on ic.oid = to_regclass(s.key)
    left join pg_index i on i.indexrelid = ic.oid
),
-- ---------------------------------------------------------------------------
-- CROSS-ZONE ADDITIVE RULE: every trigger ANYWHERE in the database that is bound
-- to an owned function. This is what stops an extra trigger on a pre-existing
-- table (media_assets, edit_director_decisions) from hiding in Zone B's
-- named-only comparison — the binding, not the table, defines ownership.
-- ---------------------------------------------------------------------------
owned_function_triggers as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', tn.nspname || '.' || tc.relname || '.' || t.tgname,
           'definition', pg_get_triggerdef(t.oid),
           'function', t.tgfoid::regprocedure::text,
           'enabled', t.tgenabled
         ) order by tn.nspname || '.' || tc.relname || '.' || t.tgname), '[]'::jsonb) as v
    from pg_trigger t
    join pg_class tc on tc.oid = t.tgrelid
    join pg_namespace tn on tn.oid = tc.relnamespace
   where not t.tgisinternal
     and t.tgfoid in (select oid from owned_functions)
),

-- ---------------------------------------------------------------------------
-- Sequences owned by the migrations (identity/serial backing included), with the
-- column they are attached to and their shape.
-- ---------------------------------------------------------------------------
owned_sequences as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', s.key,
           'present', (c.relname is not null),
           'owner', pg_get_userbyid(c.relowner),
           'data_type', format_type(sq.seqtypid, null),
           'start', sq.seqstart, 'increment', sq.seqincrement,
           'min', sq.seqmin, 'max', sq.seqmax, 'cache', sq.seqcache, 'cycle', sq.seqcycle,
           'owned_by', (select dn.nspname || '.' || dc.relname || '.' || da.attname
                          from pg_depend d
                          join pg_class dc on dc.oid = d.refobjid
                          join pg_namespace dn on dn.oid = dc.relnamespace
                          join pg_attribute da on da.attrelid = d.refobjid and da.attnum = d.refobjsubid
                         where d.objid = c.oid and d.classid = 'pg_class'::regclass
                           and d.refclassid = 'pg_class'::regclass and d.deptype in ('a','i')
                         limit 1),
           'acl', (select coalesce(jsonb_agg(jsonb_build_object(
                            'grantee', case when g.grantee = 0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end,
                            'privilege', g.privilege_type) order by
                            (case when g.grantee = 0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end),
                            g.privilege_type), '[]'::jsonb)
                     from aclexplode(coalesce(c.relacl, acldefault('S', c.relowner))) g)
         ) order by s.key), '[]'::jsonb) as v
    from (select k.value as key from ledger, jsonb_array_elements_text(l -> 'owned_sequences') k) s
    left join pg_class c on c.oid = to_regclass(s.key) and c.relkind = 'S'
    left join pg_sequence sq on sq.seqrelid = c.oid
),

-- ---------------------------------------------------------------------------
-- Absence assertions: 0091 creates editor_backfill_capture_marker(), CALLS it,
-- then DROPs it. A staging database where it still exists did not run the same
-- migration to completion.
-- ---------------------------------------------------------------------------
absent_functions as (
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', k.value,
           -- Match by NAME, not identity: a resurrected function with different
           -- argument types is just as much a violation of "this is gone".
           'present', exists (
             select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = split_part(k.value, '.', 1)
                and p.proname = split_part(split_part(k.value, '.', 2), '(', 1))
         ) order by k.value), '[]'::jsonb) as v
    from ledger, jsonb_array_elements_text(l -> 'absent_functions') k
),

-- Schemas that host owned objects, with ownership.
owned_schemas as (
  select coalesce(jsonb_agg(distinct jsonb_build_object(
           'name', n.nspname,
           'owner', pg_get_userbyid(n.nspowner),
           'acl', (select coalesce(jsonb_agg(jsonb_build_object(
                            'grantee', case when g.grantee = 0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end,
                            'privilege', g.privilege_type) order by
                            (case when g.grantee = 0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end),
                            g.privilege_type), '[]'::jsonb)
                     from aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) g)
         )), '[]'::jsonb) as v
    from pg_namespace n
   where n.nspname in (select sch from owned_tables
                       union select n2.nspname from owned_functions of_
                         join pg_proc p on p.oid = of_.oid
                         join pg_namespace n2 on n2.oid = p.pronamespace)
)

select jsonb_pretty(jsonb_build_object(
  'manifest_version', 1,
  'schemas', (select v from owned_schemas),
  'tables', (select v from tables_json),
  'missing_tables', (select coalesce(jsonb_agg(key order by key), '[]'::jsonb) from missing_tables),
  'functions', (select v from functions_json),
  'missing_functions', (select coalesce(jsonb_agg(key order by key), '[]'::jsonb) from missing_functions),
  'extra_function_overloads', (select v from extra_overloads),
  'scoped_columns', (select v from scoped_columns),
  'scoped_constraints', (select v from scoped_constraints),
  'scoped_policies', (select v from scoped_policies),
  'scoped_indexes', (select v from scoped_indexes),
  'owned_function_triggers', (select v from owned_function_triggers),
  'sequences', (select v from owned_sequences),
  'absent_functions', (select v from absent_functions)
));

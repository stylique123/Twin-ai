-- Catalog CENSUS — the raw object inventory used to DERIVE the ownership ledger.
--
-- Run twice against the disposable EXPECTED database: once after the prelude
-- (BEFORE) and once after 0090-0093 are applied (AFTER). AFTER minus BEFORE is
-- exactly the surface those four migrations own. Nothing is hand-listed, so the
-- ledger cannot drift away from the migrations the way a hand-maintained list
-- would.
--
-- Emits one JSON array of {kind, key} rows on a single line.

select jsonb_agg(x order by x->>'kind', x->>'key')
from (
  -- tables in public (base tables only)
  select jsonb_build_object('kind', 'table', 'key', n.nspname || '.' || c.relname) as x
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r' and n.nspname = 'public'

  union all
  -- columns (so a column ADDED to a pre-existing table is attributed correctly)
  select jsonb_build_object('kind', 'column',
           'key', n.nspname || '.' || c.relname || '.' || a.attname)
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r' and n.nspname = 'public' and a.attnum > 0 and not a.attisdropped

  union all
  -- constraints
  select jsonb_build_object('kind', 'constraint',
           'key', n.nspname || '.' || c.relname || '.' || con.conname)
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'

  union all
  -- indexes
  select jsonb_build_object('kind', 'index', 'key', n.nspname || '.' || ic.relname)
    from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
    join pg_namespace n on n.oid = ic.relnamespace
   where n.nspname = 'public'

  union all
  -- policies
  select jsonb_build_object('kind', 'policy',
           'key', n.nspname || '.' || c.relname || '.' || p.polname)
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'

  union all
  -- triggers (user triggers only; FK enforcement triggers are internal)
  select jsonb_build_object('kind', 'trigger',
           'key', n.nspname || '.' || c.relname || '.' || t.tgname)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal

  union all
  -- Functions, keyed by IDENTITY: schema.name(argtype,...). proargtypes is
  -- exactly the IN/INOUT/VARIADIC list, i.e. what distinguishes two overloads.
  -- Deliberately TYPES ONLY (not pg_get_function_identity_arguments, which also
  -- emits parameter NAMES): this key is cast back via to_regprocedure() in
  -- sql/30_manifest.sql, and regprocedure does not accept parameter names.
  select jsonb_build_object('kind', 'function',
           'key', n.nspname || '.' || p.proname || '(' ||
                  coalesce((select string_agg(format_type(t, null), ',' order by ord)
                              from unnest(p.proargtypes) with ordinality u(t, ord)), '') || ')')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'

  union all
  -- sequences (identity/serial backing included)
  select jsonb_build_object('kind', 'sequence', 'key', n.nspname || '.' || c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'S' and n.nspname = 'public'
) s;

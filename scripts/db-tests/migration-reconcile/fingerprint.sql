-- Semantic fingerprint of the objects migrations 0090-0093 own.
--
-- Object EXISTENCE proves nothing about bodies, grants, policies, triggers, constraints
-- or indexes. This emits the actual definitions so drift is detectable, not assumed.
-- Output is one stable, sorted text blob; callers hash it and compare.
--
-- Reads only catalogs. Emits no data rows, no secrets, no connection details.
with objs(name) as (
  values ('source_capture_intents'), ('source_capture_manifests'), ('source_script_snapshots')
),
fns as (
  select 'FN  ' || p.proname || '  ' || md5(pg_get_functiondef(p.oid)) as line
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'editor_capture_no_mutate','editor_persist_script_binding','editor_complete_validation',
       'editor_assert_director_decision_v2','editor_link_ready_source','editor_capture_append_only')
),
trgs as (
  select 'TRG ' || c.relname || '.' || t.tgname || '  ' || md5(pg_get_triggerdef(t.oid)) as line
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal
     and c.relname in (select name from objs)
),
pols as (
  select 'POL ' || tablename || '.' || policyname || '  ' || md5(coalesce(qual,'') || '|' || coalesce(with_check,'') || '|' || cmd || '|' || array_to_string(roles,',')) as line
    from pg_policies where schemaname = 'public' and tablename in (select name from objs)
),
grants as (
  select 'GRA ' || table_name || '  ' || grantee || '  ' || privilege_type as line
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name in (select name from objs)
),
cons as (
  select 'CON ' || c.relname || '.' || con.conname || '  ' || md5(pg_get_constraintdef(con.oid)) as line
    from pg_constraint con join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in (select name from objs)
),
idxs as (
  select 'IDX ' || c.relname || '.' || i.relname || '  ' || md5(pg_get_indexdef(i.oid)) as line
    from pg_index x join pg_class i on i.oid = x.indexrelid
    join pg_class c on c.oid = x.indrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in (select name from objs)
),
rls as (
  select 'RLS ' || c.relname || '  ' || c.relrowsecurity::text as line
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in (select name from objs)
),
cols as (
  select 'COL ' || table_name || '.' || column_name || '  ' || data_type || '  ' || is_nullable as line
    from information_schema.columns
   where table_schema = 'public' and table_name in (select name from objs)
)
select line from (
  select line from fns   union all select line from trgs union all select line from pols
  union all select line from grants union all select line from cons union all select line from idxs
  union all select line from rls  union all select line from cols
) all_lines order by line;

-- POST-APPLY VERIFICATION FOR 0164 THEN 0165. READ-ONLY.
--
-- Paste this whole file into the Supabase SQL editor AFTER applying both
-- migrations, in the same session. It writes nothing.
--
-- ⚠️ ONE QUERY, ONE RESULT SET, ON PURPOSE. Split into separate statements the
-- editor shows only the last one, and the checks above it would look like they
-- had run. Every check is a row here, and the row is the evidence.
--
-- ⚠️ EVERY EXPECTED OBJECT IS A LITERAL, LEFT JOINED TO THE CATALOG. A query
-- that selects only what exists cannot report what is missing -- absence comes
-- back as an empty result and reads like a pass. Here a missing object is its
-- own row saying FAIL.
--
-- ⚠️ SCHEMA SHAPE, NOT BEHAVIOUR. This proves the columns, tables, constraints,
-- triggers and access posture are present. It does NOT prove the watched-session
-- endpoint works or that a render row is written correctly. Only a real run
-- does that.
--
-- READING IT: sort by verdict. Any FAIL is a stop. Expected total = 23 rows,
-- all PASS. Fewer than 23 rows means this file was edited, not that the schema
-- is fine.

with expected_0164_columns(column_name, want_type) as (values
  ('plan_quantisation_delta_ms', 'integer'),
  ('target_frame_count',         'integer'),
  ('zoom_count',                 'integer'),
  -- Not added by 0164. Listed because 0164 REDEFINES WHAT IT MEANS -- the
  -- frame-grid duration the renderer can actually emit, not the duration the
  -- Director requested. Its disappearance is a bigger problem than a missing
  -- new column, so it is checked rather than assumed.
  ('predicted_duration_ms',      'integer'),
  -- ⚖️ 0164 MOVED THE TARGET, NOT THE TOLERANCE. If this column ever goes
  -- missing, the frozen tolerance stopped being enforced somewhere.
  ('duration_tolerance_ms',      'integer')
),
expected_tables(table_name) as (values
  ('watched_sessions'), ('watched_session_events'),
  ('watched_session_gaps'), ('watched_session_observations')
),
expected_triggers(tgname, want_table) as (values
  ('trg_refuse_observation_after_lock', 'watched_session_observations'),
  ('trg_refuse_evidence_change',        'watched_session_events')
),
expected_checks(conname) as (values
  ('watched_session_consent_before_watching'),
  ('watched_session_lock_is_complete'),
  ('watched_session_observer_is_not_subject')
),
expected_children(child_table) as (values
  ('watched_session_events'), ('watched_session_gaps'), ('watched_session_observations')
)

-- ── 0164: the three new columns, plus the two whose meaning it depends on ──
select '0164 column' as check_name, e.column_name as subject,
       case when c.column_name is null then 'FAIL - column missing'
            when c.data_type <> e.want_type then 'FAIL - type is ' || c.data_type || ', expected ' || e.want_type
            else 'PASS' end as verdict,
       coalesce(c.data_type, '(absent)') as detail
from expected_0164_columns e
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = 'render_attempts'
 and c.column_name = e.column_name

union all
-- ── 0164: the drop-then-add check constraint (the re-runnable one) ─────────
select '0164 constraint', 'render_attempts_frame_counts_sane',
       case when c.conname is null then 'FAIL - constraint missing' else 'PASS' end,
       coalesce(pg_get_constraintdef(c.oid), '(absent)')
from (values ('render_attempts_frame_counts_sane')) as e(conname)
left join pg_constraint c
  on c.conname = e.conname and c.conrelid = to_regclass('public.render_attempts')

union all
-- ── 0165: the four tables ─────────────────────────────────────────────────
select '0165 table', e.table_name,
       case when t.tablename is null then 'FAIL - table missing' else 'PASS' end,
       coalesce(t.tablename, '(absent)')
from expected_tables e
left join pg_tables t on t.schemaname = 'public' and t.tablename = e.table_name

union all
-- ── 0165: RLS enabled on all four ─────────────────────────────────────────
-- ⚠️ RLS ON WITH NO POLICIES IS THE INTENDED POSTURE, exactly as 0163. These
-- are system-owned tables reached only through the service role. "No policies"
-- is not a finding here; RLS being OFF is.
select '0165 rls', e.table_name,
       case when c.relname is null then 'FAIL - table missing'
            when not c.relrowsecurity then 'FAIL - RLS is OFF'
            else 'PASS' end,
       coalesce(c.relrowsecurity::text, '(absent)')
from expected_tables e
left join pg_class c
  on c.relname = e.table_name and c.relnamespace = 'public'::regnamespace

union all
-- ── 0165: anon and authenticated hold NOTHING ─────────────────────────────
-- ⚠️ THE DANGEROUS DEFAULT. Supabase grants ALL on new public tables, so the
-- revoke in 0165 is the entire access story. This is phrased as a count so the
-- check REPORTS ITSELF: a grant-listing query returning no rows would otherwise
-- be indistinguishable from a query that never ran.
-- ⚠️ AND IT REFUSES TO PASS VACUOUSLY. Counting grants on tables that do not
-- exist returns zero and reads as "no client access" -- the strongest possible
-- result, produced by the schema being empty. Proven against an empty database
-- before this guard was added: it said PASS. So the table count is asserted
-- first, and a missing table fails this check instead of flattering it.
select '0165 grants', 'anon + authenticated on all four tables',
       case when (select count(*) from pg_tables
                   where schemaname = 'public'
                     and tablename in ('watched_sessions', 'watched_session_events',
                                       'watched_session_gaps', 'watched_session_observations')) <> 4
              then 'FAIL - cannot judge: the four tables are not all present'
            when count(*) = 0 then 'PASS'
            else 'FAIL - ' || count(*) || ' client privilege(s) exist' end,
       coalesce(string_agg(distinct grantee || ':' || table_name || ':' || privilege_type, ', '), 'none')
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('watched_sessions', 'watched_session_events',
                     'watched_session_gaps', 'watched_session_observations')
  and grantee in ('anon', 'authenticated')

union all
-- ── 0165: the two evidence triggers, on the right tables ──────────────────
select '0165 trigger', e.tgname,
       case when t.tgname is null then 'FAIL - trigger missing'
            when cls.relname <> e.want_table then 'FAIL - on ' || cls.relname || ', expected ' || e.want_table
            else 'PASS' end,
       coalesce(cls.relname, '(absent)')
from expected_triggers e
left join pg_trigger t on t.tgname = e.tgname and not t.tgisinternal
left join pg_class cls on cls.oid = t.tgrelid

union all
-- ── 0165: the three named check constraints on watched_sessions ───────────
select '0165 constraint', e.conname,
       case when c.conname is null then 'FAIL - constraint missing' else 'PASS' end,
       coalesce(pg_get_constraintdef(c.oid), '(absent)')
from expected_checks e
left join pg_constraint c
  on c.conname = e.conname and c.conrelid = to_regclass('public.watched_sessions')

union all
-- ── 0165: children cascade from the session ───────────────────────────────
-- A child row that outlives its session is evidence attributable to nothing.
select '0165 cascade', e.child_table,
       case when c.conname is null then 'FAIL - foreign key missing'
            when c.confdeltype <> 'c' then 'FAIL - ON DELETE is not CASCADE'
            else 'PASS' end,
       coalesce(c.conname, '(absent)')
from expected_children e
left join pg_constraint c
  on c.conrelid = to_regclass('public.' || e.child_table)
 and c.contype = 'f'
 and c.confrelid = to_regclass('public.watched_sessions')

order by 3 desc, 1, 2;

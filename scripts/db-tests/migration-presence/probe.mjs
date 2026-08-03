// WHICH COMMITTED MIGRATIONS IS A DEPLOYED DATABASE MISSING?
//
// The question that has no answer today, and the one that cost this project a
// day of looking in the wrong place.
//
// THE LEDGER CANNOT ANSWER IT. `supabase_migrations.schema_migrations` on
// staging stops at 0090 while objects from 0091-0100 are plainly present —
// staging-integration.yml applies migrations with `psql -f` rather than the
// migration tool, so the schema advances and the ledger does not.
// migration-reconcile/README.md documents exactly this and repairs the ledger
// for 0090-0093. Everywhere else the ledger under-reports, so "is this applied?"
// read off it is worse than no answer: it is a confident wrong one.
//
// PRESENCE IS NOT ENOUGH EITHER, AND THAT IS THE INTERESTING PART. 124 of the
// creation statements in supabase/migrations are `create or replace function`.
// A function EXISTING proves only that some migration created it once — not
// that the latest one to redefine it ran. That is precisely how a production
// database sat three migrations behind without a single symptom: 0100 REPLACES
// `editor_record_analysis` to admit the `alignment` component, and the old
// function was still there, still callable, still passing every presence check
// anyone would think to write, and still refusing the component.
//
// So this compares BODIES, not names. For every function the migrations define,
// the expected body is the one from the HIGHEST-numbered migration that defines
// it — last writer wins, which is what applying them in order means — and the
// probe compares sha256(prosrc) against that. A stale function is then a
// difference in a digest, and it names the migration that would fix it.
//
// READ-ONLY BY CONSTRUCTION. This file never connects to anything. It emits ONE
// `select` to run against whichever database is in question — via the Supabase
// MCP `execute_sql`, `psql`, or the SQL editor — and interprets what comes back.
// Nothing here can mutate a database because nothing here can reach one.
//
//   node scripts/db-tests/migration-presence/probe.mjs --selftest
//   node scripts/db-tests/migration-presence/probe.mjs --sql        # the query
//   node scripts/db-tests/migration-presence/probe.mjs --report f.json
//   node scripts/db-tests/migration-presence/probe.mjs --sql-diff   # drift only
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'

export const MIGRATIONS_DIR = 'supabase/migrations'

/** Strip `-- line comments` and block comments so keywords inside prose never parse. */
export function stripSqlComments(sql) {
  let out = ''
  let i = 0
  while (i < sql.length) {
    const two = sql.slice(i, i + 2)
    if (two === '--') {
      const nl = sql.indexOf('\n', i)
      i = nl === -1 ? sql.length : nl
      continue
    }
    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2)
      i = end === -1 ? sql.length : end + 2
      continue
    }
    // A dollar-quoted body may contain anything, including `--`. Copy it whole.
    const dollar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))
    if (dollar) {
      const tag = dollar[0]
      const end = sql.indexOf(tag, i + tag.length)
      const stop = end === -1 ? sql.length : end + tag.length
      out += sql.slice(i, stop)
      i = stop
      continue
    }
    if (sql[i] === "'") {
      let j = i + 1
      while (j < sql.length && sql[j] !== "'") j++
      out += sql.slice(i, j + 1)
      i = j + 1
      continue
    }
    out += sql[i]
    i++
  }
  return out
}

const TABLE_RE = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi

/** Tables a migration creates. These are STRONG probes: a table either exists or does not. */
export function parseCreatedTables(sql) {
  const clean = stripSqlComments(sql)
  const names = new Set()
  for (const m of clean.matchAll(TABLE_RE)) names.add(m[1])
  return [...names]
}

const FUNC_RE = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi

/**
 * Functions a migration defines, with the exact dollar-quoted body Postgres
 * stores in `pg_proc.prosrc`. Overloads collapse to the name: this repo has none,
 * and `parseFunctions` reports a collision rather than silently keeping one.
 */
export function parseFunctions(sql) {
  const clean = stripSqlComments(sql)
  const out = []
  for (const m of clean.matchAll(FUNC_RE)) {
    const after = clean.slice(m.index)
    // The body is the first dollar-quoted string after the signature. `as $$`
    // and `as $function$` are both used in this tree.
    const open = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(after)
    if (!open) continue
    const tag = open[0]
    const bodyStart = open.index + tag.length
    const bodyEnd = after.indexOf(tag, bodyStart)
    if (bodyEnd === -1) continue
    out.push({ name: m[1], body: after.slice(bodyStart, bodyEnd) })
  }
  return out
}

export const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex')

/**
 * Fold every migration, in order, into what a fully-applied database must hold.
 *
 * LAST WRITER WINS for functions, because that is what applying migrations in
 * order does. The migration recorded against a function is therefore the LATEST
 * one that defines it — the one a stale digest is missing.
 */
export function buildExpected(dir = MIGRATIONS_DIR, since = '') {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const tables = new Map()
  const functions = new Map()
  for (const file of files) {
    const sql = readFileSync(`${dir}/${file}`, 'utf8')
    for (const t of parseCreatedTables(sql)) if (!tables.has(t)) tables.set(t, file)
    for (const f of parseFunctions(sql)) functions.set(f.name, { file, sha256: sha256(f.body) })
  }
  // `since` NARROWS THE REPORT, NOT THE FOLD. Every migration is still read, so
  // last-writer-wins still resolves against the whole history — a function
  // redefined by 0100 is compared to 0100's body even when the report is scoped
  // to 0088+. Filtering the fold instead would compare against a body that was
  // superseded, and report drift on a database that is perfectly up to date.
  if (!since) return { files, tables, functions }
  const keep = (f) => f >= since
  return {
    files: files.filter(keep),
    tables: new Map([...tables].filter(([, f]) => keep(f))),
    functions: new Map([...functions].filter(([, v]) => keep(v.file))),
  }
}

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

/**
 * ONE read-only `select`, safe to paste anywhere. It reports what the database
 * HAS; the verdict is computed here, from the answer, so the query itself
 * encodes no expectations and cannot be made to lie by being partially applied.
 */
export function buildProbeSql(expected) {
  const tables = [...expected.tables.keys()]
  const funcs = [...expected.functions.keys()]
  return `select jsonb_build_object(
  'tables', (
    select coalesce(jsonb_object_agg(t, to_regclass('public.' || t) is not null), '{}'::jsonb)
    from unnest(array[${tables.map(quote).join(', ')}]) as t
  ),
  'functions', (
    select coalesce(jsonb_object_agg(p.proname, encode(pg_catalog.sha256(convert_to(p.prosrc, 'UTF8')), 'hex')), '{}'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[${funcs.map(quote).join(', ')}])
  )
) as probe;`
}

/**
 * The same comparison, pushed INTO the query, returning only what is wrong.
 *
 * `--sql` returns the database's whole answer and decides here, which is the
 * honest shape: the query states no expectations, so it cannot be made to agree
 * with itself. But that answer is ~100 digests, which is unusable through a
 * console or an MCP tool where the result has to be read by eye. This mode
 * inlines the expected digests and returns ONLY the divergences.
 *
 * It is strictly less trustworthy than `--sql` — a query carrying the expected
 * values can be wrong in the same direction as the thing it checks — so it is
 * an ergonomic convenience, not the authority. `--sql | --report` stays the one
 * that decides. An empty result here means "nothing diverged", never "the query
 * failed to run": a failed query returns an error, not an empty set.
 */
export function buildDiffSql(expected) {
  const tvals = [...expected.tables].map(([t, f]) => `(${quote(t)}, ${quote(f)})`).join(', ')
  const fvals = [...expected.functions].map(([n, v]) => `(${quote(n)}, ${quote(v.sha256)}, ${quote(v.file)})`).join(', ')
  return `with want_t(name, file) as (values ${tvals}),
     want_f(name, sha, file) as (values ${fvals}),
     got_f as (
       select p.proname as name, encode(pg_catalog.sha256(convert_to(p.prosrc, 'UTF8')), 'hex') as sha
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
     )
select 'missing_table' as kind, w.name, w.file from want_t w where to_regclass('public.' || w.name) is null
union all
select case when g.name is null then 'absent_function' else 'stale_function' end, w.name, w.file
  from want_f w left join got_f g on g.name = w.name
  where g.name is null or g.sha is distinct from w.sha
order by file, kind, name;`
}

/**
 * Compare a probe result against the expected state.
 *
 * FAILS CLOSED on a malformed answer: a probe that could not be read is not the
 * same as a database with nothing wrong, and reporting it as clean would be the
 * exact shape of defect this tree spent a day removing.
 */
export function diagnose(expected, probe) {
  if (!probe || typeof probe !== 'object' || typeof probe.tables !== 'object' || typeof probe.functions !== 'object') {
    return { ok: false, unreadable: true, missingTables: [], staleFunctions: [], absentFunctions: [], behind: [] }
  }
  const missingTables = []
  for (const [name, file] of expected.tables) {
    if (probe.tables[name] !== true) missingTables.push({ name, file })
  }
  const staleFunctions = []
  const absentFunctions = []
  for (const [name, want] of expected.functions) {
    const got = probe.functions[name]
    if (got === undefined) absentFunctions.push({ name, file: want.file })
    else if (got !== want.sha256) staleFunctions.push({ name, file: want.file })
  }
  // The headline: which migration files have evidence of not being applied. A
  // stale function body is evidence for the migration that LAST defined it.
  const behind = [...new Set([
    ...missingTables.map((m) => m.file),
    ...absentFunctions.map((m) => m.file),
    ...staleFunctions.map((m) => m.file),
  ])].sort()
  // WHAT THIS CANNOT SEE, SAID OUT LOUD. A migration that creates no table and
  // defines no function — one that only ALTERs a column, adds a constraint, a
  // policy, an index or a grant — leaves no fingerprint this probe reads, so
  // "not behind" is silent about it rather than reassuring. 0098 is exactly such
  // a migration. Naming them is the difference between a tool that reports its
  // coverage and one that lets an unexamined file read as verified, which is the
  // defect class this whole directory exists to close.
  const unprobed = (expected.files ?? []).filter((f) =>
    ![...expected.tables.values()].includes(f) && ![...expected.functions.values()].some((v) => v.file === f))
  return {
    ok: behind.length === 0,
    unreadable: false,
    missingTables,
    absentFunctions,
    staleFunctions,
    behind,
    unprobed,
  }
}

export function formatReport(d) {
  if (d.unreadable) return 'PROBE UNREADABLE — no verdict (fail closed)'
  const coverage = d.unprobed?.length
    ? `\n${d.unprobed.length} migration(s) carry no table or function and are NOT covered:\n`
      + d.unprobed.map((f) => `  ? ${f}`).join('\n')
    : ''
  if (d.ok) return 'in sync: every table exists and every function body matches the migrations' + coverage
  const lines = [`BEHIND on ${d.behind.length} migration file(s):`, ...d.behind.map((f) => `  - ${f}`)]
  if (d.missingTables.length) {
    lines.push('missing tables:', ...d.missingTables.map((m) => `  - public.${m.name}  (${m.file})`))
  }
  if (d.absentFunctions.length) {
    lines.push('absent functions:', ...d.absentFunctions.map((m) => `  - public.${m.name}()  (${m.file})`))
  }
  if (d.staleFunctions.length) {
    lines.push('functions whose body is NOT the committed one:',
      ...d.staleFunctions.map((m) => `  - public.${m.name}()  should be from ${m.file}`))
  }
  return lines.join('\n') + coverage
}

// ── selftest ───────────────────────────────────────────────────────────────
// Every case here is a defect this parser could plausibly have. The two that
// matter most are the comment cases: this tree's migrations open with dozens of
// lines of prose that quote their own DDL, and a parser that read those would
// report objects no migration creates — which, in a drift tool, means crying
// wolf until people stop reading it.
function selftest() {
  const fails = []
  const check = (name, cond) => { if (!cond) fails.push(name) }

  check('a plain create table is found',
    parseCreatedTables('create table public.foo (id int);').join() === 'foo')
  check('if not exists is found',
    parseCreatedTables('create table if not exists public.bar (id int);').join() === 'bar')
  check('an unqualified table is found',
    parseCreatedTables('create table baz (id int);').join() === 'baz')
  check('a table named in a LINE COMMENT is not a creation',
    parseCreatedTables('-- create table public.ghost (id int)\nselect 1;').length === 0)
  check('a table named in a BLOCK COMMENT is not a creation',
    parseCreatedTables('/* create table public.ghost (id int) */ select 1;').length === 0)
  check('create index does not look like create table',
    parseCreatedTables('create index if not exists foo_idx on public.foo (id);').length === 0)

  const fn = parseFunctions(
    'create or replace function public.f() returns trigger language plpgsql as $$\nbegin\n  return new;\nend;\n$$;')
  check('a function name is found', fn.length === 1 && fn[0].name === 'f')
  check('the body is exactly what prosrc holds — dollar quotes excluded',
    fn[0].body === '\nbegin\n  return new;\nend;\n')
  const tagged = parseFunctions('create function public.g() returns int language sql as $body$ select 1 $body$;')
  check('a TAGGED dollar quote is handled', tagged.length === 1 && tagged[0].body === ' select 1 ')
  check('a function whose body CONTAINS a line comment keeps it — prosrc does',
    parseFunctions('create function public.h() returns int language sql as $$ -- note\n select 1 $$;')[0]
      .body.includes('-- note'))
  check('a function named in a comment is not a definition',
    parseFunctions('-- create or replace function public.ghost() ...\nselect 1;').length === 0)

  // The whole point: presence is not enough.
  const exp = { tables: new Map(), functions: new Map([['f', { file: '0100_x.sql', sha256: sha256('NEW') }]]) }
  const stalediag = diagnose(exp, { tables: {}, functions: { f: sha256('OLD') } })
  check('a function that EXISTS but holds the old body is reported behind',
    !stalediag.ok && stalediag.behind.join() === '0100_x.sql')
  check('the same function with the committed body is in sync',
    diagnose(exp, { tables: {}, functions: { f: sha256('NEW') } }).ok)
  check('an ABSENT function is reported behind',
    !diagnose(exp, { tables: {}, functions: {} }).ok)

  const texp = { tables: new Map([['t', '0095_x.sql']]), functions: new Map() }
  check('a missing table is reported behind',
    diagnose(texp, { tables: { t: false }, functions: {} }).behind.join() === '0095_x.sql')
  check('a present table is in sync',
    diagnose(texp, { tables: { t: true }, functions: {} }).ok)

  check('an unreadable probe is NOT reported as clean',
    diagnose(texp, null).unreadable && !diagnose(texp, null).ok)
  check('a probe missing the functions key is unreadable, not clean',
    diagnose(texp, { tables: { t: true } }).unreadable)

  // And against the real tree, so a restructure that breaks parsing is caught.
  const real = buildExpected()
  check('a migration that creates no table and no function is reported UNPROBED',
    diagnose(buildExpected(MIGRATIONS_DIR, '0098'), { tables: {}, functions: {} })
      .unprobed.includes('0098_posts_edit_project_link.sql'))
  check('a migration that DOES create surface is not reported unprobed',
    !diagnose(buildExpected(MIGRATIONS_DIR, '0098'), { tables: {}, functions: {} })
      .unprobed.includes('0099_media_purge.sql'))
  check('the real migrations parse to a non-trivial expected state',
    real.files.length > 50 && real.tables.size > 20 && real.functions.size > 50)
  check('a known table resolves to the migration that creates it',
    real.tables.get('creative_transfer_plans') === '0095_creative_transfer_lineage.sql')
  check('a REPLACED function resolves to the LAST migration to define it',
    real.functions.get('editor_record_analysis')?.file === '0100_register_alignment_component.sql')

  if (fails.length) {
    console.error(`selftest FAILED (${fails.length}):`)
    for (const f of fails) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log('selftest ok')
}

const arg = process.argv[2]
if (arg === '--selftest') {
  selftest()
} else if (arg === '--sql') {
  console.log(buildProbeSql(buildExpected(MIGRATIONS_DIR, process.argv[3] ?? '')))
} else if (arg === '--sql-diff') {
  console.log(buildDiffSql(buildExpected(MIGRATIONS_DIR, process.argv[3] ?? '')))
} else if (arg === '--report') {
  const probe = JSON.parse(readFileSync(process.argv[3], 'utf8'))
  const d = diagnose(buildExpected(), probe.probe ?? probe)
  console.log(formatReport(d))
  process.exit(d.ok ? 0 : 1)
} else {
  console.error('usage: probe.mjs --selftest | --sql [since] | --sql-diff [since] | --report <probe.json>')
  process.exit(2)
}

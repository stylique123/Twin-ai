// A COLUMN NAMED `asymmetric` IS A SYNTAX ERROR, NOT A COLUMN.
//
// ⚠️ MEASURED, AND THE MIGRATION WAS UNRUNNABLE FROM THE MOMENT IT WAS WRITTEN.
// Migration 0156 added `asymmetric boolean not null default false`. The bare
// word is RESERVED in Postgres -- it is the second half of `between symmetric`
// / `between asymmetric` -- so the parser sees a keyword where a column name
// belongs and the whole file aborts. Nothing in review caught it: the word
// reads like an adjective, the statement reads like every other `add column`,
// and the failure surfaces only when somebody finally runs the file.
//
// ⚖️ AND QUOTING IS THE WRONG FIX. `"asymmetric"` compiles, and then every
// query touching it is one forgotten pair of quotes from the same error, in a
// place further from the cause. 0156 was renamed to `arms_asymmetric` instead.
// So this guard refuses the reserved name whether or not it is quoted: a quoted
// reserved column is a trap that has merely been armed more carefully.
//
// ⚖️ IT ASSERTS THE NAME, NOT THE PARSE. There is no SQL engine here and there
// should not be -- the two shapes it reads (`add column X`, and the column
// definitions inside `create table (...)`) are where every column in this repo
// is born, and a guard that tried to parse everything would be a second,
// drifting authority on the schema.
//
//   node scripts/ci/check_reserved_column_names.mjs
//   node scripts/ci/check_reserved_column_names.mjs --selftest
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')

/** Postgres reserved keywords: cannot name a column without quoting, and must
 *  not name one even with it. Appendix C, the `reserved` category. */
export const RESERVED = new Set(`all analyse analyze and any array as asc asymmetric both case cast
check collate column constraint create current_catalog current_date current_role current_time
current_timestamp current_user default deferrable desc distinct do else end except false fetch for
foreign from grant group having in initially intersect into lateral leading limit localtime
localtimestamp not null offset on only or order placing primary references returning select
session_user some symmetric system_user table then to trailing true union unique user using variadic
when where window with`.split(/\s+/))

/** Reserved unless used as a function or type name. A column of this name still
 *  breaks ordinary queries, so it is refused for the same reason. */
export const RESERVED_FUNC_TYPE = new Set(`authorization binary collation concurrently cross
current_schema freeze full ilike inner is isnull join left like natural notnull outer overlaps right
similar tablesample verbose`.split(/\s+/))

/** Words that open a table CONSTRAINT, not a column. */
const CONSTRAINT_STARTERS = new Set([
  'constraint', 'primary', 'foreign', 'unique', 'check', 'exclude', 'like', 'partition', 'inherits',
])

const strip = (sql) => String(sql ?? '')
  .replace(/--[^\n]*/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')

const bare = (ident) => ident.replace(/^"(.*)"$/s, '$1').toLowerCase()

function verdict(name, where, file) {
  const n = bare(name)
  if (RESERVED.has(n)) {
    return `${file}: column "${name}" in ${where} is a RESERVED Postgres keyword. `
      + 'Unquoted it is a syntax error and the whole migration aborts; quoted it compiles '
      + 'and leaves every later query one forgotten pair of quotes from the same error. '
      + `Rename it -- 0156 became arms_asymmetric for exactly this.`
  }
  if (RESERVED_FUNC_TYPE.has(n)) {
    return `${file}: column "${name}" in ${where} is reserved except as a function or type name, `
      + 'so ordinary queries against it break. Rename it.'
  }
  return null
}

/** Split a parenthesised body on TOP-LEVEL commas, respecting nesting and quotes. */
function topLevelItems(body) {
  const out = []
  let depth = 0, cur = '', q = null
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (q) { cur += c; if (c === q) q = null; continue }
    if (c === "'" || c === '"') { q = c; cur += c; continue }
    if (c === '(') depth++
    if (c === ')') depth--
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue }
    cur += c
  }
  if (cur.trim()) out.push(cur)
  return out
}

/** Read the parenthesised body of a create-table, from the first `(` after it. */
function bodyAfter(text, from) {
  const open = text.indexOf('(', from)
  if (open < 0) return null
  let depth = 0, q = null
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === q) q = null; continue }
    if (c === "'" || c === '"') { q = c; continue }
    if (c === '(') depth++
    else if (c === ')') { depth--; if (depth === 0) return text.slice(open + 1, i) }
  }
  return null
}

const IDENT = '("[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)'

export function checkSql(sql, file = 'migration') {
  const text = strip(sql)
  const problems = []

  const add = new RegExp(`\\badd\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?${IDENT}`, 'gi')
  let m
  while ((m = add.exec(text)) !== null) {
    const p = verdict(m[1], 'add column', file)
    if (p) problems.push(p)
  }

  const ct = /\bcreate\s+(?:or\s+replace\s+)?(?:unlogged\s+|temp\s+|temporary\s+)?table\s+(?:if\s+not\s+exists\s+)?/gi
  while ((m = ct.exec(text)) !== null) {
    const body = bodyAfter(text, m.index + m[0].length)
    if (body === null) continue
    for (const item of topLevelItems(body)) {
      const first = item.trim().match(new RegExp(`^${IDENT}`))
      if (!first) continue
      if (CONSTRAINT_STARTERS.has(bare(first[1]))) continue
      const p = verdict(first[1], 'create table', file)
      if (p) problems.push(p)
    }
  }
  return problems
}

if (process.argv.includes('--selftest')) {
  let failed = 0
  const cases = [
    ['the real 0156 bug FAILS',
      'alter table t add column if not exists asymmetric boolean not null default false;', true],
    ['the rename that fixed it passes',
      'alter table t add column if not exists arms_asymmetric boolean not null default false;', true === false],
    // ⚠️ QUOTING IS NOT A FIX. It compiles and moves the error further from the cause.
    ['a QUOTED reserved column still FAILS', 'alter table t add column "asymmetric" boolean;', true],
    ['a reserved column inside create table FAILS',
      'create table t (id uuid primary key, "order" int);', true],
    ['an ordinary create table passes',
      'create table t (id uuid primary key, url text not null, chars int);', false],
    // ⚖️ THE SHAPES THAT LOOK LIKE COLUMNS AND ARE NOT.
    ['a table CONSTRAINT named with a keyword-ish word passes',
      'create table t (id uuid, constraint check_it check (id is not null), primary key (id));', false],
    ['a unique/foreign constraint item passes',
      'create table t (a int, b int, unique (a, b), foreign key (a) references u(id));', false],
    ['a reserved word in a COMMENT does not count',
      '-- we nearly called this asymmetric\nalter table t add column arms_asymmetric boolean;', false],
    ['a reserved word inside a default expression does not count',
      "create table t (id uuid, made timestamptz default now(), note text default 'order');", false],
    ['a nested paren type does not break item splitting',
      'create table t (id uuid, ratio numeric(10,4), asymmetric bool);', true],
    ['reserved-as-function-or-type is caught too', 'alter table t add column left int;', true],
  ]
  for (const [name, sql, expectFail] of cases) {
    const got = checkSql(sql, 'f').length > 0
    if (got !== expectFail) { console.error(`selftest: ${name} — got ${JSON.stringify(checkSql(sql, 'f'))}`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) process.exit(1)
  console.log('reserved-column-names selftest: all cases passed')
  process.exit(0)
}

const dir = join(REPO, 'supabase', 'migrations')
const problems = []
for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
  problems.push(...checkSql(readFileSync(join(dir, f), 'utf8'), f))
}
if (problems.length) {
  for (const p of problems) console.error(`::error::${p}`)
  process.exit(1)
}
console.log(`reserved-column-names guard: OK (${readdirSync(dir).filter((n) => n.endsWith('.sql')).length} migrations)`)

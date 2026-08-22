#!/usr/bin/env node
// A MIGRATION MUST SURVIVE BEING APPLIED TWICE.
//
// ⚠️ THE DEFECT THIS PREVENTS BROKE EVERY PR AT ONCE. The staging matrix applies
// every listed migration BYTE-EXACT on every run. 0164 used a bare
// `add constraint` on a table that already had it, and the second application
// failed with:
//
//   ERROR: constraint "render_attempts_frame_counts_sane" ... already exists
//
// That is not a failure of the PR that introduces it -- it ships GREEN, because
// a first application against a schema that has never seen the migration cannot
// reveal it. It fails for the NEXT PR, and every PR after that, on a file none
// of them touched.
//
// ⚖️ POSTGRES HAS NO `ADD CONSTRAINT IF NOT EXISTS`. So the repo has exactly two
// re-runnable spellings, and this guard accepts both:
//
//   1. drop-then-add (0162, 0164)   -- also survives a CHANGED definition
//   2. the pg_constraint do-block (0030, 0094) -- keeps whatever is already there
//
// Form 1 is preferred: form 2 silently keeps the OLD constraint while the file
// claims the new one, so editing a guarded constraint is a no-op that reads as
// a change. This guard does not enforce that preference -- it is a comment, not
// a rule, because both forms are genuinely re-runnable.
//
// ⚠️ WHAT THIS GUARD DOES NOT COVER, stated so a green run is not read as more
// than it is: it checks CONSTRAINTS ONLY. `create trigger`, `create type`,
// `create policy` and `insert` without a conflict clause are the same latent
// class and are NOT checked here. Adding them is a separate change with its own
// claim; listing them here rather than implying coverage.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = join(ROOT, 'supabase', 'migrations')

/** ⚖️ A COMMENT IS NOT SQL. `-- add constraint foo` must not count as either an
 * offence or a rescue, and a file whose prose explains the pattern (this repo
 * has several) would otherwise be read as containing it. */
export function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => {
      // ⚠️ Only strip `--` outside a string literal. A check constraint may
      // legitimately contain `--` inside quotes.
      let out = ''
      let quote = null
      for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (quote) {
          out += c
          if (c === quote) quote = null
          continue
        }
        if (c === "'" || c === '"') { quote = c; out += c; continue }
        if (c === '-' && line[i + 1] === '-') break
        out += c
      }
      return out
    })
    .join('\n')
}

const ADD = /\badd\s+constraint\s+([A-Za-z0-9_]+)/gi
const DROP = /\bdrop\s+constraint\s+if\s+exists\s+([A-Za-z0-9_]+)/gi
/**
 * ⚠️ THE GUARD FORM HAS MORE THAN ONE SPELLING AND A NARROW REGEX CALLS THE
 * OTHERS OFFENCES. 0030 writes `pg_constraint where conname = 'x'`; 0138 writes
 * `pg_constraint where conrelid = ... and conname = 'x'`. Both are the same
 * check. So the rule is: the file consults `pg_constraint`, AND that name is
 * compared against `conname`. Requiring `where` immediately before `conname`
 * reported 0138 as a defect it does not have.
 */
const GUARDED = /\bconname\s*=\s*'([A-Za-z0-9_]+)'/gi

/** Names rescued by a pg_constraint do-block anywhere in the file. */
export function guardedNames(sql) {
  if (!/\bpg_constraint\b/i.test(sql)) return new Set()
  return new Set([...sql.matchAll(GUARDED)].map((m) => m[1]))
}

/**
 * ⚠️ ORDER MATTERS AND POSITION IS THE ONLY HONEST TEST. A `drop constraint if
 * exists` that appears AFTER the `add constraint` rescues nothing -- the add
 * has already failed. So a drop counts only when its offset is lower.
 */
export function unrescuedConstraints(rawSql) {
  const sql = stripComments(rawSql)
  const guarded = guardedNames(sql)
  const drops = [...sql.matchAll(DROP)].map((m) => ({ name: m[1], at: m.index }))
  const bad = []
  for (const m of sql.matchAll(ADD)) {
    const name = m[1]
    const at = m.index
    if (guarded.has(name)) continue
    if (drops.some((d) => d.name === name && d.at < at)) continue
    bad.push({ name, at })
  }
  return bad
}

export function scan(dir = DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const offenders = []
  for (const file of files) {
    const bad = unrescuedConstraints(readFileSync(join(dir, file), 'utf8'))
    if (bad.length) offenders.push({ file, names: bad.map((b) => b.name) })
  }
  return { scanned: files.length, offenders }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { scanned, offenders } = scan()
  const count = offenders.reduce((n, o) => n + o.names.length, 0)
  if (offenders.length) {
    console.error(`migration-rerunnable: ${count} bare ADD CONSTRAINT in ${offenders.length} of ${scanned} migrations\n`)
    for (const o of offenders) console.error(`  ${o.file}\n    ${o.names.join('\n    ')}`)
    console.error(`
Postgres has no ADD CONSTRAINT IF NOT EXISTS. Use either:

  alter table X drop constraint if exists NAME;
  alter table X add constraint NAME check (...);

or the pg_constraint do-block. The staging matrix applies every listed
migration on EVERY run, so a bare add breaks every later run for every PR.`)
    process.exit(1)
  }
  console.log(`migration-rerunnable: OK (${scanned} migrations, every ADD CONSTRAINT is re-runnable)`)
}

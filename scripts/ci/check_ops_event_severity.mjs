#!/usr/bin/env node
// ── EVERY `ops_events.severity` LITERAL MUST BE ONE THE DATABASE ACCEPTS ──
//
// ⚠️ WHY THIS EXISTS, MEASURED 2026-09-14. Migration 0208 constrained
// `ops_events.severity` to ('info','warn','error','critical') and was applied
// to production on 2026-09-13. Three live inserts in generate-blueprint were
// still writing 'warning' — among them `generation_instrumentation_failed`,
// which exists precisely because "edge logs expire and were unreadable when it
// mattered". Every one of those inserts is `.then(() => {}, () => {})`, so the
// CHECK violation is SWALLOWED: the telemetry stops landing and nothing says so.
//
// ⚠️ AND THE SPELLING DRIFTS BY COPYING. 0208's own header records that two of
// the four spellings it found were added in a single week, because each new
// writer "picked a spelling by copying whichever neighbour they happened to
// read". That is what an unconstrained column does, and a constraint alone does
// not stop it — it only converts a silent drift into a silent rejection. This
// guard is the half that makes the drift LOUD, at the time it is written.
//
// ⚖️ THE ALLOWED SET IS PARSED OUT OF THE MIGRATION, NEVER RESTATED HERE.
// A hardcoded list in this file would be a fifth place to drift, and the day it
// disagreed with the database this guard would pass while production rejected
// the row. The migration is the only authority.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MIG_DIR = 'supabase/migrations'
const CONSTRAINT = 'ops_events_severity_known'
// One insert's object literal is short; a bounded window keeps this from
// running past the statement and attributing a later severity to this table.
const WINDOW = 1200

export function allowedFromMigrations(dir = MIG_DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  let found = null
  for (const f of files) {
    const sql = readFileSync(join(dir, f), 'utf8')
    if (!sql.includes(CONSTRAINT)) continue
    // Take the CHECK that ADDS the constraint, not a `drop constraint if exists`.
    const add = sql.slice(sql.indexOf(`add constraint ${CONSTRAINT}`))
    if (!add) continue
    const inList = add.match(/severity\s+in\s*\(([^)]*)\)/i)
    if (!inList) continue
    const vals = [...inList[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    // ⚠️ LAST ONE WINS. A later migration may re-state the constraint, and the
    // newest statement is the one the database is actually running.
    if (vals.length) found = { file: f, allowed: vals }
  }
  return found
}

// ⚠️ WHOLE-LINE COMMENTS ONLY. Stripping everything after `//` would delete a
// real read that follows a string containing a slash — the exact way a guard in
// this repo stopped catching the thing it existed for. This file's own prose
// names 'warning' several times above, so a naive scan would accuse it.
function stripCommentLines(src) {
  return src
    .split('\n')
    .map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l))
    .join('\n')
}

export function severityLiteralsIn(src) {
  const code = stripCommentLines(src)
  const out = []
  const anchor = /\.from\(\s*['"]ops_events['"]\s*\)/g
  let m
  while ((m = anchor.exec(code)) !== null) {
    const block = code.slice(m.index, m.index + WINDOW)
    // Stop at the next ops_events statement so two adjacent inserts do not
    // pool; a severity after that anchor belongs to the next one.
    const next = block.slice(1).search(/\.from\(\s*['"]ops_events['"]\s*\)/)
    const scope = next === -1 ? block : block.slice(0, next + 1)
    for (const s of scope.matchAll(/severity:\s*'([^']*)'/g)) {
      out.push({ value: s[1], line: code.slice(0, m.index).split('\n').length })
    }
  }
  return out
}

// ⚠️ TEST FIXTURES ARE NOT WRITERS. A test proving this guard rejects
// 'warning' must CONTAIN 'warning', and accusing it would make the guard fail
// on the very evidence that it works. The constraint governs writes to
// production; a fixture string in a test reaches no database.
//
// ⚠⚠️ AND THIS IS THE ONE PLACE A WIDENING WOULD BE INVISIBLE. Add
// `supabase/functions` here and the guard goes green while production rejects
// every row. It is exported so a test pins exactly what it may skip.
export function isFixture(path) {
  const p = path.replace(/\\/g, '/')
  return /(^|\/)(__tests__|__fixtures__)\//.test(p) || /\.test\.(ts|tsx|mjs|js)$/.test(p)
}

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git' || e === 'dist' || e === 'coverage') continue
    const p = join(dir, e)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, acc)
    else if (/\.(ts|tsx|mjs|js)$/.test(e)) acc.push(p)
  }
  return acc
}

function main() {
  const mig = allowedFromMigrations()
  if (!mig) {
    // ⚠️ A MISSING CONSTRAINT IS A FAILURE, NOT A PASS. Production carries it;
    // if no migration in the repo does, the repo is not a true description of
    // production and this guard has nothing to check against.
    console.error(
      `ops-event-severity: no migration defines ${CONSTRAINT}. Production applied it on 2026-09-13; the repo must carry the SQL.`,
    )
    process.exit(1)
  }
  const allowed = new Set(mig.allowed)
  const bad = []
  let checked = 0
  for (const f of walk('.')) {
    if (f.includes(`${MIG_DIR}/`)) continue
    if (isFixture(f)) continue
    let src
    try { src = readFileSync(f, 'utf8') } catch { continue }
    if (!src.includes('ops_events')) continue
    for (const hit of severityLiteralsIn(src)) {
      checked++
      if (!allowed.has(hit.value)) bad.push(`${f}:${hit.line} writes severity '${hit.value}'`)
    }
  }
  if (bad.length) {
    console.error(
      `ops-event-severity: ${bad.length} write(s) use a severity the database REJECTS.\n`
      + `  allowed (from ${mig.file}): ${[...allowed].join(', ')}\n`
      + bad.map((b) => `  ${b}`).join('\n')
      + `\n  ⚠️ These inserts swallow their error, so the row simply never lands.`,
    )
    process.exit(1)
  }
  console.log(`ops-event-severity: OK (${checked} literals, all in ${[...allowed].join('/')} per ${mig.file})`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()

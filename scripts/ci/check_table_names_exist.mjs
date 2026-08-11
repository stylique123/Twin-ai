#!/usr/bin/env node
// EVERY TABLE A FUNCTION WRITES TO MUST BE A TABLE THAT EXISTS.
//
// ⚠️ THE DEFECT THIS WAS WRITTEN FOR. `generate-blueprint` alerted on a failed
// refund by inserting into `ops_alerts` — a table that has never existed in any
// migration or any database. The name is real, but it belongs to the TRIGGER
// (`notify_admins_on_ops_alert`); the table is `ops_events`.
//
// It survived because the insert is deliberately fire-and-forget:
//
//     .from('ops_alerts').insert({ kind: 'refund_failed', ... })
//       .then(() => {}, () => {})          // ← swallows the 42P01
//
// So the single alert meaning A REFUND FAILED AND A HUMAN MUST RECONCILE IT
// went nowhere, on every occurrence, and the admin notification trigger it was
// supposed to fire never ran. A typo in a string cannot be caught by the
// compiler, and this one could not be caught by a test either — the code path
// only runs during a duplicate-key race against a failing RPC.
//
// ⚖️ A CONTRACT CHECK BEATS A PROMPT RULE WHERE THE DEFECT IS DECIDABLE, and
// "is this string the name of a table we create?" is decidable from the repo
// alone. No database connection, no credentials, no staging.
//
// ── WHAT IT DOES NOT CHECK ────────────────────────────────────────────────
//
// That the migration has been APPLIED. A table can exist in `supabase/migrations`
// and not in production — which is true of `product_entities` (0120) and
// `creator_knowledge` (0121) as this is written. That is a DEPLOY-ORDER problem
// and this guard would be lying if it claimed to catch it; see
// `check_staging_migration_coverage.mjs`, which owns the exclusions, and the
// deploy note in docs/twinai-open-items-ledger.md.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS = 'supabase/migrations'
const ROOTS = ['supabase/functions', 'worker/src']

/** Tables and views the repo creates. Views count: code reads `metrics_overview`,
 *  which is a view, and refusing it would make the guard wrong rather than strict. */
function createdRelations() {
  const out = new Map()
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql'))) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8')
    const re = /create\s+(?:or\s+replace\s+)?(?:table|view|materialized\s+view)\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi
    for (const m of sql.matchAll(re)) if (!out.has(m[1])) out.set(m[1], f)
  }
  return out
}

/** ⚖️ `admin.storage.from('edits')` is a BUCKET, not a table, and an earlier
 *  draft of this guard reported it as a missing table — a false positive that
 *  would have taught the next person to add an exemption rather than fix a bug.
 *  Buckets are matched and skipped by their receiver, not by an allowlist. */
const TABLE_FROM = /(?<!storage)\.from\(\s*'([a-z_][a-z0-9_]*)'/g

function walk(dir, out = []) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (p.endsWith('.ts') && !p.includes('__tests__')) out.push(p)
  }
  return out
}

const known = createdRelations()
const problems = []
for (const file of ROOTS.flatMap((r) => walk(r))) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(TABLE_FROM)) {
    const name = m[1]
    if (known.has(name)) continue
    const line = src.slice(0, m.index).split('\n').length
    problems.push({ file, line, name })
  }
}

if (problems.length) {
  console.error('table-names guard: FAILED — code reads or writes relations no migration creates.\n')
  for (const p of problems) {
    console.error(`  ${p.file}:${p.line}  .from('${p.name}')`)
  }
  console.error('\nEither the name is wrong (the case this guard exists for — `ops_alerts`')
  console.error('was meant to be `ops_events`), or the migration that creates it is missing.')
  console.error('Do NOT add an exemption: a name nothing creates is a write that goes nowhere.')
  process.exit(1)
}

console.log(`table-names guard: OK (${known.size} relations created; every .from() resolves)`)

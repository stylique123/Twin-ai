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
// ⚖️ POSTGRES HAS NO `IF NOT EXISTS` FOR CONSTRAINTS, TRIGGERS OR POLICIES, so
// all three are the same defect wearing three names, and all three are scanned.
// `create type` was MEASURED and has zero offenders here, so it is not scanned.
//
// ── WHY THIS IS A RATCHET AND NOT A CLEAN BILL OF HEALTH ────────────────────
// The constraint class is CLOSED: every one is re-runnable, and the inventory
// below holds none. Triggers and policies are NOT closed -- 70 pre-existing
// bare creates are recorded in migration_rerunnable_debt.json and allowed.
//
// ⚠️ SO A GREEN RUN HERE DOES NOT MEAN EVERY MIGRATION IS RE-RUNNABLE. It means
// NO NEW ONE WAS ADDED. That distinction is the whole point of the file, and
// anybody reading this guard's green tick as "the migrations are fine" has read
// it wrong.
//
// The inventory is one-way. A finding that is not in it fails the build (new
// debt). An entry in it that no longer matches anything ALSO fails the build,
// with an instruction to delete the line -- so the list can only ever shrink,
// and a fix cannot silently leave a stale exemption behind for a future bare
// create to slot into.
//
// ⚖️ WHY THE 70 WERE NOT SIMPLY FIXED. They span 19 migrations that are already
// applied to production, and NONE of them are in the staging matrix's applied
// list -- which is exactly why they have never broken a run. Rewriting applied
// history to satisfy a guard is a bigger and riskier change than the defect it
// would close, and it is not urgent. Closing them is its own PR, and every one
// closed is a line deleted here.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanAll } from './migration_rerunnable_scan.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEBT_FILE = join(HERE, 'migration_rerunnable_debt.json')

export function loadDebt(file = DEBT_FILE) {
  return new Set(JSON.parse(readFileSync(file, 'utf8')).entries)
}

/**
 * Compares findings against the frozen inventory.
 *   added   -- a bare create that is not recorded. THE BUILD FAILS.
 *   stale   -- a recorded entry nothing matches any more. THE BUILD ALSO FAILS,
 *              because an exemption outliving its defect is a hole with a
 *              plausible name, and the next bare create with that name inherits
 *              it silently.
 */
export function reconcile(findings, debt) {
  const seen = new Set(findings.map((f) => f.key))
  return {
    added: findings.filter((f) => !debt.has(f.key)),
    stale: [...debt].filter((k) => !seen.has(k)).sort(),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { scanned, findings } = scanAll()
  const debt = loadDebt()
  const { added, stale } = reconcile(findings, debt)

  if (added.length) {
    console.error(`migration-rerunnable: ${added.length} NEW bare create(s) -- Postgres will refuse the second application\n`)
    for (const f of added) console.error(`  ${f.file}\n    ${f.kind} ${f.name}`)
    console.error(`
Add the matching drop before it:

  drop constraint if exists NAME;   -- then: alter table X add constraint NAME ...
  drop trigger    if exists NAME on TABLE;
  drop policy     if exists "NAME" on TABLE;

The staging matrix applies every listed migration on EVERY run, so a bare
create breaks every later run for every PR -- not just this one.`)
    process.exit(1)
  }

  if (stale.length) {
    console.error(`migration-rerunnable: ${stale.length} recorded entr(ies) no longer exist. Delete them from`)
    console.error(`${DEBT_FILE}\n`)
    for (const k of stale) console.error(`  ${k}`)
    console.error(`
An exemption that outlives its defect is a hole with a plausible name. The
inventory shrinks; it never carries entries that match nothing.`)
    process.exit(1)
  }

  const byKind = findings.reduce((a, f) => ({ ...a, [f.kind]: (a[f.kind] ?? 0) + 1 }), {})
  const summary = Object.entries(byKind).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'
  console.log(`migration-rerunnable: OK (${scanned} migrations, no new bare creates)`)
  console.log(`  recorded and still outstanding: ${summary}`)
  console.log('  ⚠️ this is "nothing new was added", NOT "every migration is re-runnable"')
}

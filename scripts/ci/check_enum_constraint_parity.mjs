#!/usr/bin/env node
// A TYPE THE APPLICATION OFFERED AND THE DATABASE HAD NEVER HEARD OF.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-22, AFTER THE MERGE. #967 added `BUSINESS`
// to `ENTITY_TYPES` and not to `product_entities_type_known`. The picker
// offered "My whole business, not one product", `attestedEntity` built the row,
// `claimProductEntity` sent it, and the CHECK would have rejected it: a creator
// picking the one option added for her, told her product could not be saved,
// with a Postgres constraint name behind it. Merged, deployed, dead on first
// use — and found by reading `pg_constraint` by hand, not by any control.
//
// ⚠️⚠️ AND EVERY TEST PASSED, WHICH IS THE POINT. The enum had it, the picker
// offered it, the capability question fired, the scene guidance was right,
// mutants died. All of them mock `supabase`, so the one authority that would
// have refused the write was the one authority never consulted. This is the
// repo's signature defect with the halves swapped: not a column nobody reads,
// but a value nobody may write.
//
// ── THE INSTRUMENT ────────────────────────────────────────────────────────
//
// For each pair below: read the TypeScript list, read the LAST definition of
// the named constraint across the migrations in order (a later migration may
// drop and recreate it — only the final one is live), and compare the two sets.
//
// ⚖️ SET EQUALITY, NOT CONTAINMENT, AND BOTH DIRECTIONS ARE REAL DEFECTS. A
// value in TS and not in the CHECK is the failure above. A value in the CHECK
// and not in TS is a row shape production can hold that no reader can name —
// how a column comes to carry a value every switch falls through.
//
// ⚖️ AND IT READS THE MIGRATIONS, NOT A LIVE DATABASE. CI has no credentials
// and should not need them; the migrations ARE the schema's source of truth,
// and a drift between them and production is a different check's job.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const REPO = process.cwd()
const MIGRATIONS = join(REPO, 'supabase', 'migrations')

/** The pairs that must agree. Each is one fact written in two languages. */
const PAIRS = [
  {
    file: 'packages/shared/src/productEntity.ts',
    symbol: 'ENTITY_TYPES',
    constraint: 'product_entities_type_known',
  },
  {
    file: 'packages/shared/src/productEntity.ts',
    symbol: 'ENTITY_RELATIONSHIPS',
    constraint: 'product_entities_relationship_known',
  },
  {
    file: 'packages/shared/src/productEntity.ts',
    symbol: 'SHOWABILITY_STATES',
    constraint: 'product_entities_showability_known',
  },
  {
    file: 'packages/shared/src/productEntity.ts',
    symbol: 'PERSONAL_USE_STATES',
    constraint: 'product_entities_personal_use_known',
  },
]

/** The members of `export const NAME = [...] as const`. */
function tsMembers(file, symbol) {
  const src = readFileSync(join(REPO, file), 'utf8')
  const at = src.indexOf(`export const ${symbol} = [`)
  if (at < 0) return null
  const close = src.indexOf('] as const', at)
  if (close < 0) return null
  const block = src.slice(at, close)
  return [...block.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1])
}

/** The members of the LAST `check (col in (...))` for this constraint.
 *
 *  ⚠️ LAST, NOT FIRST. `product_entities_type_known` is defined in 0120, again
 *  in 0125 and again in 0223; only the final one describes the live schema, and
 *  a check reading the first would have passed while production refused writes. */
function sqlMembers(constraint) {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  let found = null
  for (const f of files) {
    const src = readFileSync(join(MIGRATIONS, f), 'utf8')
    let from = 0
    for (;;) {
      const at = src.indexOf(`constraint ${constraint}`, from)
      if (at < 0) break
      from = at + 1
      // A `drop constraint` line names it too and defines nothing.
      const line = src.slice(src.lastIndexOf('\n', at) + 1, at)
      if (/drop\s+constraint/i.test(line)) continue
      // ⚖️ COMMENTS ARE STRIPPED BEFORE THE MEMBER LIST IS READ. A
      // `-- see 'BUSINESS'` note inside the block would otherwise count as a
      // member and hide the exact drift this gate exists to catch.
      //
      // ⚠️ AND BOTH LAYOUTS ARE MATCHED. The table-level constraints in 0120
      // are one line ending `)),` and the standalone ones in 0125/0223 are
      // indented and end `));`. A pattern fitting only the second found three
      // of four constraints "missing" and would have shipped as a gate that
      // silently checked one pair.
      const bare = src.slice(at).replace(/--[^\n]*/g, '')
      const m = /check\s*\(\s*[a-z_]+\s+in\s*\(([^)]*)\)/i.exec(bare)
      if (!m) continue
      found = { file: f, members: [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]) }
    }
  }
  return found
}

const problems = []
for (const { file, symbol, constraint } of PAIRS) {
  const ts = tsMembers(file, symbol)
  if (ts === null || ts.length === 0) {
    problems.push(`${symbol}: could not read the list from ${file} — re-anchor this gate`)
    continue
  }
  const sql = sqlMembers(constraint)
  if (sql === null) {
    problems.push(`${constraint}: no CHECK definition found in supabase/migrations`)
    continue
  }
  const onlyTs = ts.filter((v) => !sql.members.includes(v))
  const onlySql = sql.members.filter((v) => !ts.includes(v))
  if (onlyTs.length > 0) {
    problems.push(
      `${symbol} has ${onlyTs.join(', ')} and ${constraint} (last defined in ${sql.file}) does not.\n`
      + '    The application can offer this value and the database will refuse to store it.\n'
      + '    Add a migration that drops and recreates the constraint with the new member.',
    )
  }
  if (onlySql.length > 0) {
    problems.push(
      `${constraint} allows ${onlySql.join(', ')} and ${symbol} does not name it.\n`
      + '    Production can hold a value no reader can name, so every switch on it falls through.',
    )
  }
}

if (problems.length > 0) {
  console.error('enum/constraint parity FAILED\n')
  for (const p of problems) console.error(`  - ${p}\n`)
  process.exit(1)
}
console.log(`enum/constraint parity OK (${PAIRS.length} pairs)`)

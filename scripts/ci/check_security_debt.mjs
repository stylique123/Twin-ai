#!/usr/bin/env node
// A CREDENTIAL IN A TRANSCRIPT HAS NO EXPIRY AND NO OWNER.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// On 2026-08-21 a live production service-role JWT was pasted into a
// conversation transcript. It was used once, read-only, and written to no
// file — and none of that matters, because the transcript is permanent. The
// only thing that retires the exposure is ROTATION.
//
// Security debt with a real completion criterion is exactly the kind of item
// that evaporates. It lives in a ticket nobody reopens, or in a context window
// that ends. This guard is the mechanism that refuses to go quiet: the record
// lives in SECURITY.md, the build reads it, and an entry cannot be softened,
// emptied, or deleted without the build saying so.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────
//
// ⚠️ IT CANNOT VERIFY THAT A KEY WAS ACTUALLY ROTATED. Nothing in CI can:
// proving the old credential no longer authenticates would mean holding the
// old credential. So this guard checks the SHAPE of the record and the
// PRESENCE of the entries — never the security outcome — and it must not be
// read as evidence that anything was rotated. A `RESOLVED` row here means a
// human wrote down a date and a list of places; it does not mean CI watched
// it happen.
import { readFileSync } from 'node:fs'

// ⚠️ APPEND-ONLY BY CONSTRUCTION. An id that has ever been recorded stays in
// this list forever, so deleting its row from SECURITY.md fails the build
// rather than quietly clearing the debt. Removing an id from HERE is the same
// deletion wearing a different hat, and is what code review is for.
const KNOWN_IDS = [
  'EXPOSED_SERVICE_ROLE_KEY_ROTATION_REQUIRED',
  // An audit CLAIMED a Gemini key exposure that could not be confirmed or
  // refuted from here. It is listed because an unverifiable credential claim
  // defaults to OPEN -- the cheap outcome is a needless console check, the
  // expensive one is a live key nobody ever looked at again.
  'UNVERIFIED_GEMINI_API_KEY_EXPOSURE_CLAIM',
]

const VALID_STATUS = new Set(['BLOCKING_SECURITY_CLEANUP', 'ACCEPTED_RISK', 'RESOLVED'])

function parseRows(md) {
  const rows = []
  for (const line of md.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('|')) continue
    const cells = t.slice(1, t.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim())
    if (cells.length !== 5) continue
    const id = cells[0].replace(/^`|`$/g, '')
    if (!/^[A-Z0-9_]+$/.test(id)) continue
    rows.push({ id, reason: cells[1], trigger: cells[2], criterion: cells[3], status: cells[4].replace(/^`|`$/g, '') })
  }
  return rows
}

function check(md) {
  const problems = []
  const rows = parseRows(md)
  const seen = new Map()

  for (const row of rows) {
    if (seen.has(row.id)) problems.push(`${row.id}: recorded twice — one id, one row`)
    seen.set(row.id, row)

    if (!VALID_STATUS.has(row.status)) {
      problems.push(`${row.id}: status "${row.status}" is not one of ${[...VALID_STATUS].join(', ')}`)
    }
    // ⚠️ AN EMPTY CELL IS THE FAILURE MODE THIS CATCHES. A row with a blank
    // trigger reads as recorded and is not: nobody knows when to act on it.
    for (const field of ['reason', 'trigger', 'criterion']) {
      if (row[field].length < 12) problems.push(`${row.id}: ${field} is empty or too short to be a real one`)
    }
    // A resolution has to say WHEN, or it is an assertion rather than a record.
    if (row.status === 'RESOLVED' && !/\b20\d{2}-\d{2}-\d{2}\b/.test(row.criterion)) {
      problems.push(`${row.id}: marked RESOLVED without a dated line saying what was done`)
    }
  }

  for (const id of KNOWN_IDS) {
    if (!seen.has(id)) problems.push(`${id}: known security debt is missing from SECURITY.md — deleting the row does not clear the debt`)
  }
  return { problems, rows }
}

// ── SELFTEST ──────────────────────────────────────────────────────────────
// ⚠️ THE GUARD IS TESTED AGAINST A KNOWN-BAD DOCUMENT, not only a good one. A
// checker that accepts everything passes on the real corpus too.
if (process.argv.includes('--selftest')) {
  // ⚠️ THE WELL-FORMED FIXTURE IS DERIVED FROM KNOWN_IDS, NOT HARD-CODED.
  // A literal one-row document stops being well-formed the moment a second id
  // is recorded, and the selftest would then fail for a reason that has
  // nothing to do with the guard.
  const rowFor = (id) => `| \`${id}\` | a real reason here | a real trigger here | a real criterion here | \`BLOCKING_SECURITY_CLEANUP\` |`
  const good = KNOWN_IDS.map(rowFor).join('\n')
  const one = rowFor(KNOWN_IDS[0])
  const fails = [
    ['deleted row', '| `SOMETHING_ELSE_ENTIRELY` | reason reason reason | trigger trigger | criterion criterion | `RESOLVED` |'],
    ['blank trigger', good.replace('a real trigger here', '')],
    ['deleted second row', one],
    ['bogus status', good.replace('BLOCKING_SECURITY_CLEANUP', 'PROBABLY_FINE')],
    ['undated resolution', good.replace('BLOCKING_SECURITY_CLEANUP', 'RESOLVED')],
    ['duplicate id', `${good}\n${one}`],
  ]
  let failures = 0
  if (check(good).problems.length !== 0) { console.error('selftest: a well-formed row was rejected'); failures++ }
  for (const [name, md] of fails) {
    if (check(md).problems.length === 0) { console.error(`selftest: "${name}" was accepted and must not be`); failures++ }
  }
  if (failures > 0) { console.error(`security-debt guard selftest: ${failures} FAILED`); process.exit(1) }
  console.log('security-debt guard selftest: OK (1 accepted, 6 rejected)')
  process.exit(0)
}

const { problems, rows } = check(readFileSync('SECURITY.md', 'utf8'))
const open = rows.filter((r) => r.status === 'BLOCKING_SECURITY_CLEANUP')
console.log(`  ${rows.length} security-debt entries · ${open.length} BLOCKING_SECURITY_CLEANUP`)
for (const r of open) console.log(`    ⚠️ ${r.id} — waits on: ${r.trigger}`)
if (problems.length > 0) {
  for (const p of problems) console.log(`::error::security debt: ${p}`)
  process.exit(1)
}
console.log('security-debt guard: OK')

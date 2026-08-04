// THE FAILURE CATALOGUE EXISTS TWICE, AND THIS IS WHAT STOPS IT DRIFTING.
//
// `worker/src/jobs/failureExplain.ts` is the AUTHORITY: its companion coverage
// guard reads every `new PermanentJobError` in the tree from source, so the
// catalogue provably has no holes. The worker cannot export the map — it
// deliberately does not depend on @twinai/shared, and its CI job runs `npm ci`
// inside worker/ — so `packages/shared/src/editor/failureExplain.ts` mirrors it
// for the client, which needs no API because `failure_code` is already
// owner-readable.
//
// Two copies of a map that a person edits by hand is a drift waiting to happen,
// and the drift would be SILENT and CRUEL: a code reclassified from
// `retry_wont_help` to `retry_helps` in one file only means the product tells
// half its surfaces to press retry on a failure that can never clear. That is
// the precise defect Phase 10 item 5 exists to prevent, reintroduced by a
// copy-paste.
//
// So: parse both, compare the code -> class maps exactly, and fail on any
// difference in either direction — a code in one and not the other, or the same
// code classified differently.
//
//   node scripts/ci/check_failure_catalogue.mjs --selftest
//   node scripts/ci/check_failure_catalogue.mjs
import { readFileSync } from 'node:fs'

const WORKER = 'worker/src/jobs/failureExplain.ts'
const SHARED = 'packages/shared/src/editor/failureExplain.ts'

/**
 * Pull `code: { c: 'class' }` pairs out of the CLASSES literal.
 *
 * Deliberately parses the BLOCK first rather than scanning the whole file: the
 * default-message table below it also maps names to strings, and a looser regex
 * would read `retry_helps: RETRY_HELPS` as a catalogue entry and then report a
 * phantom disagreement — a guard that cries wolf gets switched off.
 */
export function parseCatalogue(source) {
  const block = source.match(
    /const CLASSES: Record<string, \{ c: FailureClass, m\?: string \}> = \{([\s\S]*?)\n\}/)
  if (!block) return null
  const out = new Map()
  const re = /^\s{2}([a-z0-9_]+):\s*\{\s*c:\s*'([a-z_]+)'/gm
  let m
  while ((m = re.exec(block[1])) !== null) out.set(m[1], m[2])
  return out
}

function compare(a, b) {
  const problems = []
  for (const [code, cls] of a) {
    if (!b.has(code)) problems.push(`${code}: in the worker, MISSING from shared`)
    else if (b.get(code) !== cls) problems.push(`${code}: worker says ${cls}, shared says ${b.get(code)}`)
  }
  for (const code of b.keys()) {
    if (!a.has(code)) problems.push(`${code}: in shared, MISSING from the worker`)
  }
  return problems
}

function selftest() {
  const fail = []
  const check = (name, ok) => { if (!ok) fail.push(name) }
  const wrap = (body) =>
    `const CLASSES: Record<string, { c: FailureClass, m?: string }> = {\n${body}\n}\n`

  const base = wrap("  a_code: { c: 'refilm' },\n  b_code: { c: 'retry_helps' },")
  check('parses a two-entry catalogue', parseCatalogue(base)?.size === 2)
  check('reads the class', parseCatalogue(base)?.get('a_code') === 'refilm')
  check('an entry with a message still parses',
    parseCatalogue(wrap("  a_code: { c: 'refilm', m: 'film it again' },"))?.get('a_code') === 'refilm')
  check('a missing block returns null', parseCatalogue('nothing here') === null)

  // THE DEFAULT-MESSAGE TRAP, pinned: a looser regex reads the table BELOW the
  // block and invents entries. This is why the block is isolated first.
  const withDefaults = base
    + "const DEFAULT_MESSAGE: Record<FailureClass, string> = {\n  retry_helps: RETRY_HELPS,\n}\n"
  check('the default-message table is not read as catalogue entries',
    parseCatalogue(withDefaults)?.size === 2)

  // The comparison must catch all three shapes of drift.
  const a = parseCatalogue(base)
  check('identical maps agree', compare(a, parseCatalogue(base)).length === 0)
  check('a RECLASSIFIED code is caught — the cruel one',
    compare(a, parseCatalogue(wrap("  a_code: { c: 'retry_helps' },\n  b_code: { c: 'retry_helps' },"))).length === 1)
  check('a code missing from shared is caught',
    compare(a, parseCatalogue(wrap("  a_code: { c: 'refilm' },"))).length === 1)
  check('a code only in shared is caught',
    compare(parseCatalogue(wrap("  a_code: { c: 'refilm' },")), a).length === 1)

  if (fail.length) {
    console.error(`selftest FAILED (${fail.length}):`)
    for (const f of fail) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log('selftest ok')
}

if (process.argv.includes('--selftest')) {
  selftest()
} else {
  const worker = parseCatalogue(readFileSync(WORKER, 'utf8'))
  const shared = parseCatalogue(readFileSync(SHARED, 'utf8'))
  if (!worker || !shared) {
    console.error('failure-catalogue guard: could not find the CLASSES block in '
      + (!worker ? WORKER : SHARED) + ' — the guard cannot verify what it cannot parse')
    process.exit(1)
  }
  if (worker.size === 0) {
    // An empty parse would make every comparison trivially pass. Silence is not
    // success — the same rule the staging-matrix gate learned.
    console.error('failure-catalogue guard: parsed ZERO entries from the worker catalogue')
    process.exit(1)
  }
  const problems = compare(worker, shared)
  if (problems.length) {
    console.error(`failure-catalogue guard: ${problems.length} disagreement(s) between`)
    console.error(`  ${WORKER} (the authority)`)
    console.error(`  ${SHARED} (the client mirror)`)
    for (const p of problems) console.error(`  - ${p}`)
    console.error('A code classified differently in the two files means the product tells')
    console.error('half its surfaces to press retry on a failure that can never clear.')
    process.exit(1)
  }
  console.log(`failure-catalogue guard: OK — ${worker.size} codes, both copies agree`)
}

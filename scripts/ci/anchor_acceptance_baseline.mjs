#!/usr/bin/env node
// Anchor the acceptance baseline to the inventory THIS run collected.
//
// WHY THIS IS A SCRIPT AND NOT INLINE jq
// --------------------------------------
// The first version of this anchor was one jq expression in the workflow:
//     jq -r '.sha256 // "unknown"' inventory-before.json
// The field is `report_sha256`. `.sha256` is always null, `// "unknown"` swallowed
// it, and the step printed `inventory sha256 : unknown` and EXITED ZERO. An anchor
// that cannot fail is not an anchor — it is a label. Inline jq had nowhere to put
// a test, so the wrong field name was unfalsifiable.
//
// Two rules follow, and the selftest enforces both:
//   * the digest must be present and well-formed, or this exits non-zero;
//   * the record count comes from the CANONICAL top-level arrays, not from a
//     recursive walk. `[.. | objects | select(has("class"))]` counts anything
//     anywhere that happens to carry a `class` key, so a nested annotation would
//     silently inflate the count and a schema change would silently deflate it.
import { readFileSync } from 'node:fs'

/** The top-level resource arrays build_resource_inventory.mjs emits. */
export const RESOURCE_ARRAYS = ['containers', 'images', 'volumes', 'networks']
export const DIGEST_FIELD = 'report_sha256'
const HEX64 = /^[0-9a-f]{64}$/

export class BaselineError extends Error {
  constructor(message) { super(message); this.name = 'BaselineError' }
}

export function anchor(inv) {
  if (inv === null || typeof inv !== 'object' || Array.isArray(inv)) {
    throw new BaselineError('inventory is not a JSON object')
  }
  const digest = inv[DIGEST_FIELD]
  if (typeof digest !== 'string' || !HEX64.test(digest)) {
    // Named explicitly, because the failure this replaces was a WRONG FIELD NAME
    // reading as null. Saying which field was expected turns a silent "unknown"
    // into a message that points straight at the cause.
    throw new BaselineError(
      `inventory.${DIGEST_FIELD} is not a 64-hex digest (got ${JSON.stringify(digest)}). `
      + 'The acceptance delta would compare against an unidentified baseline.',
    )
  }
  const counts = {}
  let total = 0
  for (const k of RESOURCE_ARRAYS) {
    const v = inv[k]
    if (!Array.isArray(v)) {
      throw new BaselineError(`inventory.${k} is missing or not an array; the record count would be wrong`)
    }
    counts[k] = v.length
    total += v.length
  }
  if (total === 0) {
    throw new BaselineError('the inventory contains zero resources; that is not a usable baseline')
  }
  return { digest, counts, total }
}

export function render(a, runId) {
  return [
    'acceptance baseline anchor',
    `  inventory ${DIGEST_FIELD} : ${a.digest}`,
    `  record count             : ${a.total}` +
      ` (${RESOURCE_ARRAYS.map((k) => `${k}=${a.counts[k]}`).join(' ')})`,
    `  run id                   : ${runId}`,
    '  note                     : pass THIS run id as baseline_run_id to the accept stage.',
    '                             An older artifact describes a host that has since changed.',
  ].join('\n')
}

// ------------------------------------------------------------------ selftest
const GOOD = {
  report_sha256: 'a'.repeat(64),
  containers: [{ name: 'x' }, { name: 'y' }],
  images: [{ id: 'i' }],
  volumes: [{ name: 'v' }],
  networks: [{ name: 'n' }, { name: 'm' }],
}

function selftest() {
  let failed = 0
  const t = (name, fn, expectThrow) => {
    let threw = null
    try { fn() } catch (e) { threw = e }
    const ok = expectThrow ? threw !== null : threw === null
    if (ok) console.log(`  ok: ${name}`)
    else { console.error(`SELFTEST FAIL: ${name}${threw ? ` => ${threw.message}` : ' => did not throw'}`); failed++ }
  }
  const eq = (name, got, exp) => {
    if (got === exp) console.log(`  ok: ${name}`)
    else { console.error(`SELFTEST FAIL: ${name} => ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); failed++ }
  }

  // The positive, first — otherwise every rejection below could be passing
  // because the anchor rejects everything.
  t('a real inventory anchors', () => anchor(GOOD), false)
  eq('  …with the digest from report_sha256', anchor(GOOD).digest, 'a'.repeat(64))
  eq('  …and a count summed from the canonical arrays', anchor(GOOD).total, 6)

  // THE DEFECT THIS FILE EXISTS FOR: the old field name.
  t('an inventory carrying the OLD field `sha256` instead of `report_sha256` FAILS', () => {
    const bad = { ...GOOD }; delete bad.report_sha256; bad.sha256 = 'a'.repeat(64)
    anchor(bad)
  }, true)
  t('a missing digest FAILS', () => { const b = { ...GOOD }; delete b.report_sha256; anchor(b) }, true)
  t('a non-hex digest FAILS', () => anchor({ ...GOOD, report_sha256: 'unknown' }), true)
  t('a short digest FAILS', () => anchor({ ...GOOD, report_sha256: 'abc' }), true)
  t('an uppercase digest FAILS (canonical form is lowercase)',
    () => anchor({ ...GOOD, report_sha256: 'A'.repeat(64) }), true)

  // Record count: explicit arrays, not a recursive walk.
  t('a missing resource array FAILS rather than counting short',
    () => { const b = { ...GOOD }; delete b.volumes; anchor(b) }, true)
  t('a resource array that is not an array FAILS', () => anchor({ ...GOOD, images: 42 }), true)
  t('an empty inventory FAILS', () => anchor({
    report_sha256: 'a'.repeat(64), containers: [], images: [], volumes: [], networks: [],
  }), true)
  // The recursive form would have counted these; the explicit form must not.
  eq('a nested object carrying a `class` key does NOT inflate the count', anchor({
    ...GOOD,
    twinai: { facts: { class: 'active-twinai' } },
    totals: { class: 'noise' },
  }).total, 6)

  eq('the rendered anchor names the real field',
    render(anchor(GOOD), '123').includes('report_sha256'), true)
  eq('the rendered anchor never prints the word unknown',
    /unknown/i.test(render(anchor(GOOD), '123')), false)

  console.log(failed === 0 ? 'ACCEPTANCE-BASELINE SELFTEST PASS' : `ACCEPTANCE-BASELINE SELFTEST FAIL (${failed})`)
  process.exit(failed === 0 ? 0 : 1)
}

const arg = process.argv[2]
if (arg === '--selftest') selftest()
else if (arg) {
  let inv
  try { inv = JSON.parse(readFileSync(arg, 'utf8')) } catch (e) {
    console.error(`::error::could not read the inventory: ${e.message}`)
    process.exit(1)
  }
  try {
    console.log(render(anchor(inv), process.env.GITHUB_RUN_ID ?? 'unknown-run'))
  } catch (e) {
    console.error(`::error::acceptance baseline anchor failed: ${e.message}`)
    process.exit(1)
  }
} else {
  console.error('usage: anchor_acceptance_baseline.mjs <inventory.json> | --selftest')
  process.exit(2)
}

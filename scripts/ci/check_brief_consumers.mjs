// EVERY ANSWER A CREATOR GIVES US MUST BE READ BY SOMETHING.
//
// Nine questions are asked during the scan and on confirm, validated, sanitized
// and stored in brand_voices.pre_script_brief. Five of them are read by nothing.
// The script generator never learns whether it is writing for a doctor or a
// hobbyist, and the product page we captured is never offered to it.
//
// Every PR that added one of those questions was correct in isolation: the
// question was well-designed, the storage was three-state clean, the tests
// passed. The defect only exists BETWEEN the PRs, which is exactly the kind
// nobody is assigned to notice.
//
// So this guard reads scripts/ci/brief_consumers.json and fails the build when
// it and the repository disagree. Four checks, and the last two are the ones
// that make it more than a comment:
//
//   1. Every key in BRIEF_STORED_KEYS is declared in the registry.
//   2. The registry declares no key that BRIEF_STORED_KEYS does not have.
//   3. Every path in `readBy` exists AND mentions the key. A reader that was
//      removed, or renamed, or never actually referenced the key, is a FAILURE
//      — otherwise the registry decays into a wish list.
//   4. Every key declared UNWIRED must have no reader anywhere in
//      supabase/functions. The exemption is therefore self-expiring: the moment
//      someone wires one up, this file is stale and the build says so.
//
// FAILS CLOSED. BRIEF_STORED_KEYS is parsed out of preScriptBrief.ts, and if
// that parse stops matching — the array is restructured, renamed, or split —
// that is a failure, not a pass. A guard that silently stops checking is worse
// than no guard, because it also stops anyone from noticing.
//
// WHY IT SEARCHES supabase/functions AND NOT THE WHOLE REPO. The brief exists to
// shape what the model is told. A key referenced only in the web app has been
// collected and displayed, not consumed — and "we show it back to you" is not
// what asking a question promises. The edge functions are where an answer turns
// into a different video.
//
//   node scripts/ci/check_brief_consumers.mjs --selftest
//   node scripts/ci/check_brief_consumers.mjs
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

export const REGISTRY_PATH = 'scripts/ci/brief_consumers.json'
export const KEYS_SOURCE = 'packages/shared/src/preScriptBrief.ts'
export const FUNCTIONS_DIR = 'supabase/functions'

/**
 * Pull BRIEF_STORED_KEYS out of its declaration.
 *
 * Deliberately narrow: it matches the `as const` array by name and takes the
 * quoted strings inside it. A rename or a restructure makes this return null
 * rather than an empty list, because "no keys found" and "the keys are gone"
 * must not look the same to the caller — an empty list would make every other
 * check vacuously pass.
 */
export function parseStoredKeys(source) {
  const m = source.match(/export const BRIEF_STORED_KEYS\s*=\s*\[([\s\S]*?)\]\s*as const/)
  if (!m) return null
  const keys = [...m[1].matchAll(/'([A-Za-z0-9_]+)'/g)].map((k) => k[1])
  return keys.length > 0 ? keys : null
}

/** Every .ts file under supabase/functions, so a reader cannot hide in a subdir. */
export function edgeFunctionFiles(dir) {
  const out = []
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.ts')) out.push(p)
    }
  }
  if (existsSync(dir)) walk(dir)
  return out
}

/**
 * Where a key is actually mentioned.
 *
 * Word-boundary matched, so `goal` does not match `goalPost` and — the one that
 * matters — `promotes` does not match a comment about promoting a branch.
 */
export function filesMentioning(key, files, read) {
  const re = new RegExp(`\\b${key}\\b`)
  return files.filter((f) => re.test(read(f)))
}

export function check({ storedKeys, registry, files, read }) {
  const errors = []

  if (storedKeys === null) {
    errors.push(`Could not parse BRIEF_STORED_KEYS from ${KEYS_SOURCE}. `
      + 'The guard fails closed: fix the parse rather than removing the check.')
    return errors
  }

  const declared = Object.keys(registry.keys ?? {})

  for (const key of storedKeys) {
    if (!declared.includes(key)) {
      errors.push(`${key}: stored in the brief and absent from ${REGISTRY_PATH}. `
        + 'Declare who reads it, or declare readBy: [] with an unwiredReason saying what is missing.')
    }
  }
  for (const key of declared) {
    if (!storedKeys.includes(key)) {
      errors.push(`${key}: declared in ${REGISTRY_PATH} and not in BRIEF_STORED_KEYS. `
        + 'A registry that outlives the thing it describes is worse than no registry.')
    }
  }

  for (const key of declared) {
    const entry = registry.keys[key]
    const readBy = entry.readBy ?? []
    const mentioning = filesMentioning(key, files, read)

    if (readBy.length === 0) {
      if (!entry.unwiredReason || entry.unwiredReason.trim() === '') {
        errors.push(`${key}: readBy is empty and unwiredReason is missing. `
          + 'An undeclared gap is the thing this guard exists to stop.')
      }
      // THE SELF-EXPIRING HALF. A key excused as unwired that HAS a reader means
      // the excuse outlived the defect, and the next person reads a registry
      // that lies about the system.
      if (mentioning.length > 0) {
        errors.push(`${key}: declared unwired, but read by ${mentioning.join(', ')}. `
          + 'Move it to readBy and delete unwiredReason — in the PR that wired it.')
      }
      continue
    }

    if (entry.unwiredReason) {
      errors.push(`${key}: has readers and still carries unwiredReason. Delete the reason.`)
    }
    for (const path of readBy) {
      if (!files.includes(path)) {
        errors.push(`${key}: readBy names ${path}, which is not a file under ${FUNCTIONS_DIR}.`)
      } else if (!mentioning.includes(path)) {
        errors.push(`${key}: readBy names ${path}, which never mentions it. `
          + 'The reader was removed or never existed; the registry must say so.')
      }
    }
  }

  return errors
}

// ── SELFTEST ──────────────────────────────────────────────────────────────
// Every check is exercised in BOTH directions, because a guard that has only
// ever been seen to pass has not been shown to do anything.
function selftest() {
  const read = (f) => ({
    'a.ts': 'const g = brief.goal',
    'b.ts': 'const w = brief.workKind',
  })[f] ?? ''
  const files = ['a.ts', 'b.ts']
  const fail = []

  const expect = (name, errors, shouldPass) => {
    const passed = errors.length === 0
    if (passed !== shouldPass) {
      fail.push(`${name}: expected ${shouldPass ? 'pass' : 'failure'}, got ${
        passed ? 'pass' : errors.join(' | ')}`)
    }
  }

  expect('wired key with a real reader', check({
    storedKeys: ['goal'], files, read,
    registry: { keys: { goal: { readBy: ['a.ts'] } } },
  }), true)

  expect('unwired key with a declared reason', check({
    storedKeys: ['offer'], files, read,
    registry: { keys: { offer: { readBy: [], unwiredReason: 'nothing reads it yet' } } },
  }), true)

  expect('unwired key with NO reason', check({
    storedKeys: ['offer'], files, read,
    registry: { keys: { offer: { readBy: [] } } },
  }), false)

  expect('unwired key that actually HAS a reader', check({
    storedKeys: ['workKind'], files, read,
    registry: { keys: { workKind: { readBy: [], unwiredReason: 'stale excuse' } } },
  }), false)

  expect('readBy naming a file that does not mention the key', check({
    storedKeys: ['goal'], files, read,
    registry: { keys: { goal: { readBy: ['b.ts'] } } },
  }), false)

  expect('readBy naming a file that does not exist', check({
    storedKeys: ['goal'], files, read,
    registry: { keys: { goal: { readBy: ['gone.ts'] } } },
  }), false)

  expect('stored key missing from the registry', check({
    storedKeys: ['goal', 'audience'], files, read,
    registry: { keys: { goal: { readBy: ['a.ts'] } } },
  }), false)

  expect('registry key that is not stored', check({
    storedKeys: ['goal'], files, read,
    registry: { keys: { goal: { readBy: ['a.ts'] }, ghost: { readBy: [] } } },
  }), false)

  expect('unparseable BRIEF_STORED_KEYS fails closed', check({
    storedKeys: null, files, read, registry: { keys: {} },
  }), false)

  expect('parseStoredKeys reads a real declaration', (() => {
    const keys = parseStoredKeys(
      "export const BRIEF_STORED_KEYS = [\n  'goal', 'audience',\n] as const")
    return keys && keys.length === 2 && keys[0] === 'goal' ? [] : ['parse returned ' + keys]
  })(), true)

  expect('parseStoredKeys returns null when the declaration is gone', (() => {
    return parseStoredKeys('export const SOMETHING_ELSE = []') === null ? [] : ['expected null']
  })(), true)

  if (fail.length > 0) {
    console.error('check_brief_consumers selftest FAILED:')
    for (const f of fail) console.error('  ' + f)
    process.exit(1)
  }
  console.log('check_brief_consumers selftest passed (11 cases)')
}

function main() {
  if (process.argv.includes('--selftest')) return selftest()

  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
  const storedKeys = parseStoredKeys(readFileSync(KEYS_SOURCE, 'utf8'))
  const files = edgeFunctionFiles(FUNCTIONS_DIR)
  const cache = new Map()
  const read = (f) => {
    if (!cache.has(f)) cache.set(f, readFileSync(f, 'utf8'))
    return cache.get(f)
  }

  const errors = check({ storedKeys, registry, files, read })
  if (errors.length > 0) {
    console.error(`\n${REGISTRY_PATH} disagrees with the repository:\n`)
    for (const e of errors) console.error('  • ' + e)
    console.error('\nEvery answer a creator gives us must be read by something,')
    console.error('or the registry must say plainly that it is not.\n')
    process.exit(1)
  }
  console.log(`brief consumers: ${Object.keys(registry.keys).length} keys, registry agrees`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()

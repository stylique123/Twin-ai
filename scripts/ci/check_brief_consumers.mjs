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
// The one file that persists the brief. Named so a move is a failure, not a skip.
export const BRIEF_WRITER = 'supabase/functions/generate-blueprint/index.ts'

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
 * Where a key is actually READ OFF THE BRIEF.
 *
 * THE FIRST VERSION OF THIS MATCHED THE BARE WORD, AND IT WAS WRONG — caught by
 * running it against main rather than by thinking about it. Four of the nine
 * keys are ordinary English (`goal`, `offer`, `audience`, `promotes`), and
 * generate-blueprint's prompt is full of ordinary English: `goal: str` in the
 * response schema, "place ONE clear CTA near the end that fits the goal" in the
 * instructions, `- Goal: ${goal}` in the brief block. All three matched.
 *
 * So the guard certified `goal` as read when line 635 is
 * `const goal = vp?.goal ?? dna.goal ?? 'turn attention into trust'` — the voice
 * profile and the DNA, never the brief. A guard that blesses a fact nobody
 * reads is worse than no guard: it converts an open question into a settled
 * one, in the exact direction that lets the bug survive.
 *
 * A READ IS A PROPERTY ACCESS ON THE BRIEF OBJECT, and nothing else counts:
 *
 *   brief.workKind            answers.workKind          storedBrief.workKind
 *   brief['workKind']         const { workKind } = brief
 *
 * `dna.goal` and `vp.goal` deliberately do NOT count. They are different
 * authorities holding a similarly-named value, which is the audit's "overlapping
 * authorities" finding showing up as a naming collision — and treating them as
 * interchangeable is how the brief's answer stays unread while looking read.
 */
// ⚠️ COMMENTS ARE NOT CODE, AND THIS GUARD LEARNED IT THE EXPENSIVE WAY.
// `desiredFormats` was correctly reported as read while the ONLY thing matching
// was a code comment explaining a cast that had been REMOVED: the prose
// `brief.desiredFormats as string[]` sat in a block describing why that spelling
// was wrong. A right answer for a reason that cannot be trusted is worse than a
// wrong one, because it passes review. The selftest already had a prose case;
// it used prose that did not contain a brief-shaped ACCESS, so it never
// exercised this.
function withoutComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

export function filesMentioning(key, files, read) {
  // `[\w$]*` on BOTH sides, not a required leading character — the commonest
  // reader in the codebase is the bare identifier `brief`, and a pattern that
  // demanded a prefix silently matched none of them. Caught by the selftest.
  const holder = `[\\w$]*(?:[Bb]rief|[Aa]nswers)[\\w$]*`
  const access = new RegExp(`\\b${holder}\\s*(?:\\.\\s*${key}\\b`
    + `|\\[\\s*['"\`]${key}['"\`]\\s*\\])`)
  const destructure = new RegExp(
    `\\{[^{}]*\\b${key}\\b[^{}]*\\}\\s*=\\s*\\b${holder}\\b`)
  // ⚠️ THE READ THIS GUARD COULD NOT SEE AT ALL. A key pulled out by a helper --
  // `briefListInline(briefRaw, 'contentGoals')` -- is a real read with no
  // property access anywhere in it. Two keys wired in exactly that shape sat
  // declared-unwired and the guard stayed green, which is the precise failure it
  // exists to prevent: an answer the creator gave that nothing admits to reading.
  //
  // ⚖️ THE BRIEF-SHAPED ARGUMENT IS REQUIRED, not just the quoted key. Matching
  // a bare string would call any occurrence of the word a read.
  const viaHelper = new RegExp(
    `\\b${holder}\\b[^()]{0,80}?['"\`]${key}['"\`]`
    + `|['"\`]${key}['"\`][^()]{0,80}?\\b${holder}\\b`)
  return files.filter((f) => {
    const src = withoutComments(read(f))
    return access.test(src) || destructure.test(src) || viaHelper.test(src)
  })
}


/**
 * Every key this repository PERSISTS into the brief, read off the writer itself.
 *
 * ⚠️⚠️ THE HOLE THAT LET `productFacts` EXIST. This guard demanded a reader for
 * every key in BRIEF_STORED_KEYS — and `stable.productFacts` was written to the
 * column by generate-blueprint without ever being in that list. So the one key
 * whose answer nothing read was the one key the guard could not see. A registry
 * of a list that is not the authority checks nothing about the keys outside it.
 *
 * ⚖️ `stable` IS THE PERSISTED OBJECT, and that is why it is the thing parsed.
 * `brief` is mutated per request and legitimately carries keys that are never
 * stored; `stable` is spread straight into the `pre_script_brief` update.
 */
export function parsePersistedKeys(source) {
  const withoutProse = withoutComments(source)
  if (!/\bpre_script_brief:\s*\{\s*\.\.\.brief,\s*\.\.\.stable\s*\}/.test(withoutProse)) {
    // FAILS CLOSED, like the BRIEF_STORED_KEYS parse. If the persist is
    // restructured this returns null and the caller errors, rather than
    // reporting an empty set and passing vacuously.
    return null
  }
  const keys = [...withoutProse.matchAll(/\bstable\s*\.\s*([A-Za-z0-9_]+)\s*=/g)].map((m) => m[1])
  return keys.length > 0 ? [...new Set(keys)] : null
}

/**
 * The key set the DATABASE actually accepts, taken from the LAST migration that
 * redefines `is_pre_script_brief`.
 *
 * ⚠️⚠️ THE SECOND HALF OF THE SAME HOLE, AND THE ONE THAT COST THREE FIELDS.
 * `productFacts` was absent from this CHECK, the persist is ONE update of the
 * whole brief, and a rejected row takes every other answer in the batch with it:
 * measured 2026-09-10, 0 of 52 voices carry productFacts AND 0 of 51 carry a
 * stored defaultCta, which IS an allowed and wired key. Two lists agreeing with
 * each other while the database disagrees with both is not a checked system.
 *
 * ⚖️ THE LAST DEFINITION WINS, because `create or replace` is how this function
 * is widened and earlier migrations are history rather than current truth.
 */
export function parseDatabaseKeys(migrationSources) {
  const defs = migrationSources.filter(({ sql }) =>
    /create\s+or\s+replace\s+function\s+public\.is_pre_script_brief/i.test(sql)
      || /create\s+function\s+public\.is_pre_script_brief/i.test(sql))
  if (defs.length === 0) return null
  defs.sort((a, b) => a.path.localeCompare(b.path))
  const sql = defs[defs.length - 1].sql
  const m = sql.match(/jsonb_object_keys\(p\)\s*k[\s\S]*?not in \(([\s\S]*?)\)\s*\)/i)
  if (!m) return null
  const body = m[1].replace(/--[^\n]*/g, ' ')
  const keys = [...body.matchAll(/'([A-Za-z0-9_]+)'/g)].map((k) => k[1])
  return keys.length > 0 ? { keys: [...new Set(keys)], path: defs[defs.length - 1].path } : null
}

export function check({ storedKeys, registry, files, read, persistedKeys, databaseKeys }) {
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

  // ── CHECK 5: NOTHING IS PERSISTED THAT THIS REGISTRY CANNOT SEE ───────────
  // The hole `productFacts` came through. Undefined means the caller did not
  // supply it, which is itself a failure: an optional check is not a check.
  if (persistedKeys === undefined) {
    errors.push('persistedKeys was not supplied. The guard fails closed.')
  } else if (persistedKeys === null) {
    errors.push('Could not parse the persisted keys from the brief writer. '
      + 'The guard fails closed: fix the parse rather than removing the check.')
  } else {
    for (const key of persistedKeys) {
      if (!storedKeys.includes(key)) {
        errors.push(`${key}: written into pre_script_brief and absent from BRIEF_STORED_KEYS. `
          + 'A key outside that list is invisible to this registry, so nothing ever '
          + 'demands a reader for it — which is how an answer nothing reads survives.')
      }
    }
  }

  // ── CHECK 6: THE DATABASE ACCEPTS EVERY KEY WE STORE ──────────────────────
  // Two lists agreeing with each other while the database rejects the write is
  // not a checked system. The persist is ONE statement, so one unacceptable key
  // discards every other answer in the same batch.
  if (databaseKeys === undefined) {
    errors.push('databaseKeys was not supplied. The guard fails closed.')
  } else if (databaseKeys === null) {
    errors.push('Could not parse the accepted key set from any migration defining '
      + 'is_pre_script_brief. The guard fails closed.')
  } else {
    for (const key of storedKeys) {
      if (!databaseKeys.keys.includes(key)) {
        errors.push(`${key}: in BRIEF_STORED_KEYS and REJECTED by the shape CHECK in ${
          databaseKeys.path}. The persist writes the whole brief in one update, so `
          + 'this key does not merely fail to store — it discards every other answer '
          + 'written with it. Widen the CHECK in a migration, in this PR.')
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
    // The case the first version of this guard got wrong: the word is present,
    // read off a DIFFERENT authority. It must not count as a reader.
    'prose.ts': 'const goal = vp?.goal ?? dna.goal\nGoal: ${goal}\n{ goal: str }',
    'destructured.ts': 'const { promotes } = storedBrief',
    // ⚠️ A COMMENT IS NOT A READER. This is prose that DOES contain a
    // brief-shaped access -- the old prose fixture did not, which is why the
    // gap survived a passing selftest.
    'comment.ts': '// my first version wrote brief.offer as string[], which tsc rejected\nconst x = 1',
    // ⚠️ A READ WITH NO PROPERTY ACCESS ANYWHERE IN IT.
    'helper.ts': "const g = briefListInline(briefRaw, 'workKind')",
    // The same helper shape with NO brief-shaped argument: a quoted word alone
    // must not count, or every string in the codebase becomes a reader.
    'quoted.ts': "const g = pick(config, 'workKind')",
  })[f] ?? ''
  const files = ['a.ts', 'b.ts', 'prose.ts', 'destructured.ts', 'comment.ts',
    'helper.ts', 'quoted.ts']
  // ⚠️ THE NEW INPUTS ARE SUPPLIED TO EVERY EXISTING CASE, because checks 5 and
  // 6 fail closed on `undefined` — an optional check is not a check, and a
  // default of "skip" is how this guard had a hole in the first place.
  const OK_EXTRA = {
    persistedKeys: [],
    databaseKeys: { keys: ['goal', 'audience', 'offer', 'workKind', 'promotes'], path: 'm.sql' },
  }
  const fail = []

  // ⚠️ THE COUNT IS DERIVED, NOT TYPED. It read "14 cases" while thirteen ran,
  // and stayed "14" after six more were added. A number nobody computes is not a
  // report, it is decoration -- and it is exactly what would have let these new
  // cases sit unexecuted while the line said they passed.
  let ran = 0
  const expect = (name, errors, shouldPass) => {
    ran += 1
    const passed = errors.length === 0
    if (passed !== shouldPass) {
      fail.push(`${name}: expected ${shouldPass ? 'pass' : 'failure'}, got ${
        passed ? 'pass' : errors.join(' | ')}`)
    }
  }

  expect('wired key with a real reader', check({
    ...OK_EXTRA, storedKeys: ['goal'], files, read,
    registry: { keys: { goal: { readBy: ['a.ts'] } } },
  }), true)

  expect('unwired key with a declared reason', check({
    ...OK_EXTRA, storedKeys: ['offer'], files, read,
    registry: { keys: { offer: { readBy: [], unwiredReason: 'nothing reads it yet' } } },
  }), true)

  expect('unwired key with NO reason', check({
    ...OK_EXTRA, storedKeys: ['offer'], files, read,
    registry: { keys: { offer: { readBy: [] } } },
  }), false)

  expect('unwired key that actually HAS a reader', check({
    ...OK_EXTRA, storedKeys: ['workKind'], files, read,
    registry: { keys: { workKind: { readBy: [], unwiredReason: 'stale excuse' } } },
  }), false)

  expect('readBy naming a file that does not mention the key', check({
    ...OK_EXTRA, storedKeys: ['goal'], files, read,
    registry: { keys: { goal: { readBy: ['b.ts'] } } },
  }), false)

  expect('readBy naming a file that does not exist', check({
    ...OK_EXTRA, storedKeys: ['goal'], files, read,
    registry: { keys: { goal: { readBy: ['gone.ts'] } } },
  }), false)

  expect('stored key missing from the registry', check({
    ...OK_EXTRA, storedKeys: ['goal', 'audience'], files, read,
    registry: { keys: { goal: { readBy: ['a.ts'] } } },
  }), false)

  expect('registry key that is not stored', check({
    ...OK_EXTRA, storedKeys: ['goal'], files, read,
    registry: { keys: { goal: { readBy: ['a.ts'] }, ghost: { readBy: [] } } },
  }), false)

  expect('unparseable BRIEF_STORED_KEYS fails closed', check({
    ...OK_EXTRA, storedKeys: null, files, read, registry: { keys: {} },
  }), false)

  // THE REGRESSION. Prose, a schema field and a same-named read off another
  // authority are all present in prose.ts, and none of them is a brief read.
  expect('the word present but read off another authority is NOT a reader', check({
    ...OK_EXTRA, storedKeys: ['goal'], files, read,
    registry: { keys: { goal: { readBy: ['prose.ts'] } } },
  }), false)

  expect('a key excused as unwired stays excused when only prose mentions it', check({
    ...OK_EXTRA, storedKeys: ['goal'], files: ['prose.ts'], read,
    registry: { keys: { goal: { readBy: [], unwiredReason: 'read off dna, not the brief' } } },
  }), true)

  // ⚠️ THE GAP THAT LET A KEY BE CALLED READ FOR THE WRONG REASON. Found in
  // production: `desiredFormats` was reported read while the only match was a
  // comment describing a cast that had already been deleted.
  expect('a key mentioned ONLY in a comment stays unwired', check({
    ...OK_EXTRA, storedKeys: ['offer'], files: ['comment.ts'], read,
    registry: { keys: { offer: { readBy: [], unwiredReason: 'nothing reads it yet' } } },
  }), true)

  expect('a comment is not enough to name a file a reader', check({
    ...OK_EXTRA, storedKeys: ['offer'], files: ['comment.ts'], read,
    registry: { keys: { offer: { readBy: ['comment.ts'] } } },
  }), false)

  // ⚠️ THE GAP THAT HID TWO REAL READS. A helper pulling the key out by name is
  // a read; the guard saw no property access and stayed green.
  expect('a helper read counts, and a stale excuse for it fails', check({
    ...OK_EXTRA, storedKeys: ['workKind'], files: ['helper.ts'], read,
    registry: { keys: { workKind: { readBy: [], unwiredReason: 'stale excuse' } } },
  }), false)

  expect('a helper read satisfies readBy', check({
    ...OK_EXTRA, storedKeys: ['workKind'], files: ['helper.ts'], read,
    registry: { keys: { workKind: { readBy: ['helper.ts'] } } },
  }), true)

  // ⚖️ AND THE BRIEF-SHAPED ARGUMENT IS LOAD-BEARING. The same call shape off a
  // different authority must not launder the word into a read.
  expect('a quoted key with no brief argument is NOT a reader', check({
    ...OK_EXTRA, storedKeys: ['workKind'], files: ['quoted.ts'], read,
    registry: { keys: { workKind: { readBy: [], unwiredReason: 'read off config, not the brief' } } },
  }), true)

  expect('a destructured read counts', check({
    ...OK_EXTRA, storedKeys: ['promotes'], files, read,
    registry: { keys: { promotes: { readBy: ['destructured.ts'] } } },
  }), true)

  expect('parseStoredKeys reads a real declaration', (() => {
    const keys = parseStoredKeys(
      "export const BRIEF_STORED_KEYS = [\n  'goal', 'audience',\n] as const")
    return keys && keys.length === 2 && keys[0] === 'goal' ? [] : ['parse returned ' + keys]
  })(), true)

  expect('parseStoredKeys returns null when the declaration is gone', (() => {
    return parseStoredKeys('export const SOMETHING_ELSE = []') === null ? [] : ['expected null']
  })(), true)

  // ── CHECK 5, BOTH DIRECTIONS ────────────────────────────────────────────
  expect('a persisted key that IS in BRIEF_STORED_KEYS', check({
    ...OK_EXTRA, persistedKeys: ['goal'], storedKeys: ['goal'], files, read,
    registry: { keys: { goal: { readBy: ['a.ts'] } } },
  }), true)

  expect('a persisted key that is NOT in BRIEF_STORED_KEYS', check({
    // ⚠️⚠️ THE EXACT SHAPE `productFacts` HAD: written into the column, outside
    // the list, therefore never asked for a reader by anything.
    ...OK_EXTRA, persistedKeys: ['goal', 'productFacts'], storedKeys: ['goal'], files, read,
    registry: { keys: { goal: { readBy: ['a.ts'] } } },
  }), false)

  expect('persistedKeys missing entirely fails closed', check({
    ...OK_EXTRA, persistedKeys: undefined, storedKeys: ['goal'], files, read,
    registry: { keys: { goal: { readBy: ['a.ts'] } } },
  }), false)

  expect('an unparseable persist fails closed', check({
    ...OK_EXTRA, persistedKeys: null, storedKeys: ['goal'], files, read,
    registry: { keys: { goal: { readBy: ['a.ts'] } } },
  }), false)

  // ── CHECK 6, BOTH DIRECTIONS ────────────────────────────────────────────
  expect('a stored key the database accepts', check({
    ...OK_EXTRA, storedKeys: ['goal'], files, read,
    registry: { keys: { goal: { readBy: ['a.ts'] } } },
  }), true)

  expect('a stored key the database REJECTS', check({
    // ⚠️⚠️ THE OTHER HALF OF THE SAME DEFECT, and the expensive one: the persist
    // is one update, so this key discards `offer` and `defaultCta` alongside it.
    ...OK_EXTRA, storedKeys: ['goal', 'productFacts'], files, read,
    registry: { keys: {
      goal: { readBy: ['a.ts'] },
      productFacts: { readBy: ['a.ts'], } } },
  }), false)

  expect('databaseKeys missing entirely fails closed', check({
    ...OK_EXTRA, databaseKeys: undefined, storedKeys: ['goal'], files, read,
    registry: { keys: { goal: { readBy: ['a.ts'] } } },
  }), false)

  expect('an unparseable CHECK definition fails closed', check({
    ...OK_EXTRA, databaseKeys: null, storedKeys: ['goal'], files, read,
    registry: { keys: { goal: { readBy: ['a.ts'] } } },
  }), false)

  // ── THE TWO PARSERS, ON REAL SHAPES ─────────────────────────────────────
  expect('the persist parser finds stable writes', [
    JSON.stringify(parsePersistedKeys(
      'if (x) stable.offer = a\nstable.productFacts = b\n'
      + 'await admin.update({ pre_script_brief: { ...brief, ...stable } })',
    )) === JSON.stringify(['offer', 'productFacts']) ? null : 'wrong keys',
  ].filter(Boolean), true)

  expect('the persist parser ignores a stable write in a COMMENT', [
    JSON.stringify(parsePersistedKeys(
      '// stable.ghost = 1\nstable.offer = a\n'
      + 'update({ pre_script_brief: { ...brief, ...stable } })',
    )) === JSON.stringify(['offer']) ? null : 'comment counted',
  ].filter(Boolean), true)

  expect('the persist parser fails closed when the persist is restructured', [
    parsePersistedKeys('stable.offer = a') === null ? null : 'did not fail closed',
  ].filter(Boolean), true)

  expect('the database parser takes the LAST definition', [
    (() => {
      const got = parseDatabaseKeys([
        { path: '0109_a.sql', sql: "create or replace function public.is_pre_script_brief(p jsonb)\n"
          + "select 1 from jsonb_object_keys(p) k where k not in ( 'goal' ) )" },
        { path: '0198_b.sql', sql: "create or replace function public.is_pre_script_brief(p jsonb)\n"
          + "select 1 from jsonb_object_keys(p) k where k not in ( 'goal', -- a note\n 'productFacts' ) )" },
      ])
      if (got === null) return 'parsed nothing'
      if (got.path !== '0198_b.sql') return `took ${got.path}`
      return got.keys.join(',') === 'goal,productFacts' ? null : `keys ${got.keys.join(',')}`
    })(),
  ].filter(Boolean), true)

  expect('the database parser fails closed with no definition anywhere', [
    parseDatabaseKeys([{ path: 'x.sql', sql: 'select 1' }]) === null ? null : 'did not fail closed',
  ].filter(Boolean), true)

  if (fail.length > 0) {
    console.error('check_brief_consumers selftest FAILED:')
    for (const f of fail) console.error('  ' + f)
    process.exit(1)
  }
  console.log(`check_brief_consumers selftest passed (${ran} cases)`)
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

  // ⚖️ THE MIGRATIONS ARE READ HERE RATHER THAN IN `check`, so `check` stays a
  // pure function of its inputs and the selftest can exercise both directions of
  // every branch without a filesystem.
  const MIGRATIONS_DIR = 'supabase/migrations'
  const migrationSources = existsSync(MIGRATIONS_DIR)
    ? readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
      .map((f) => ({ path: join(MIGRATIONS_DIR, f), sql: readFileSync(join(MIGRATIONS_DIR, f), 'utf8') }))
    : []
  const persistedKeys = parsePersistedKeys(readFileSync(BRIEF_WRITER, 'utf8'))
  const databaseKeys = parseDatabaseKeys(migrationSources)

  const errors = check({ storedKeys, registry, files, read, persistedKeys, databaseKeys })
  if (errors.length > 0) {
    console.error(`\n${REGISTRY_PATH} disagrees with the repository:\n`)
    for (const e of errors) console.error('  • ' + e)
    console.error('\nEvery answer a creator gives us must be read by something,')
    console.error('or the registry must say plainly that it is not.\n')
    process.exit(1)
  }
  console.log(`brief consumers: ${Object.keys(registry.keys).length} keys, registry agrees`
    + ` · ${persistedKeys.length} persisted, all listed`
    + ` · ${databaseKeys.keys.length} accepted by ${databaseKeys.path}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()

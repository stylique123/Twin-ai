// CI guard (§2.4): per-task model routing agrees with the code.
//
// Routing existed before this catalog did — decided three separate ways and
// recorded nowhere: a frozen constant in directorContract.ts, an env knob
// passed at one call site, and an implicit fallthrough for everything that
// passed no model at all. Three mechanisms, two different default models, and
// nothing comparing them. That is the same shape as the twelve
// analysis-component allowlists removed in #244, so it gets the same medicine:
// one catalog, and a guard that fails when anything disagrees with it.
//
// WHAT THIS ENFORCES
//   1. Every task class named in code exists in the catalog, and every
//      catalogued class is actually reached. An unused class is a stale entry;
//      an unlisted one throws at runtime, which is worse.
//   2. `decide` is FROZEN — envOverride null. That is what makes a recorded
//      Director decision reproducible from its bundle, and the provider layer's
//      "never env" comment is only true while this holds.
//   3. The catalog's `decide` model EQUALS DIRECTOR_MODEL in both copies of the
//      contract. directorContract.ts is a byte-for-byte runtime duplicate of
//      the shared authority, pinned by a parity test, and the shared module
//      cannot read the worker's catalog — so the catalog RECORDS that value
//      rather than owning it, and this is what stops the two drifting.
//   4. No module names a Gemini model literal outside the catalog and the two
//      pinned contract copies. A second place that decides is the defect.
//
//   node scripts/ci/check_model_routing.mjs --selftest
//   node scripts/ci/check_model_routing.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CATALOG = 'worker/model_routing_v1.json'
export const LOADER = 'worker/src/modelRouting.ts'
export const CONTRACT_WORKER = 'worker/src/jobs/directorContract.ts'
export const CONTRACT_SHARED = 'packages/shared/src/editor/director.ts'
/** A model literal is legitimate ONLY in these. Everything else routes. */
export const MODEL_LITERAL_ALLOWED = new Set([CATALOG, CONTRACT_WORKER, CONTRACT_SHARED])

const MODEL_LITERAL_RE = /['"]gemini-[a-z0-9.-]+['"]/g

export function parseCatalog(text) {
  const raw = JSON.parse(text)
  return raw?.taskClasses ?? null
}
export function directorModelFrom(text) {
  const m = /DIRECTOR_MODEL\s*=\s*'([^']+)'/.exec(text)
  return m ? m[1] : null
}
export function taskClassesUsedIn(text) {
  return [...text.matchAll(/modelForTask\(\s*'([a-z_]+)'/g)].map((m) => m[1])
}

/**
 * files: { path: contents }. Returns reasons; empty means everything agrees.
 */
export function evaluate(files) {
  const reasons = []
  const need = (p) => {
    if (files[p] == null || files[p].trim() === '') { reasons.push(`${p}: REQUIRED file missing/empty (fail closed)`); return false }
    return true
  }
  for (const p of [CATALOG, LOADER, CONTRACT_WORKER, CONTRACT_SHARED]) need(p)
  if (reasons.length) return reasons

  let classes
  try { classes = parseCatalog(files[CATALOG]) } catch (err) { return [`${CATALOG}: does not parse (${err.message})`] }
  if (!classes || typeof classes !== 'object') return [`${CATALOG}: no taskClasses object`]
  const ids = Object.keys(classes)
  if (ids.length === 0) reasons.push(`${CATALOG}: zero task classes — never right, failing closed`)

  for (const [id, entry] of Object.entries(classes)) {
    if (typeof entry?.model !== 'string' || entry.model.trim() === '') {
      reasons.push(`${CATALOG}: task class '${id}' has no model`)
    }
    if (!('envOverride' in (entry ?? {}))) {
      reasons.push(`${CATALOG}: task class '${id}' does not state envOverride — absent is not the same as null, and only null means FROZEN`)
    }
  }

  // 2 + 3. the Director class is frozen, and agrees with both contract copies
  const decide = classes.decide
  if (!decide) {
    reasons.push(`${CATALOG}: no 'decide' task class — the Director's model must be recorded here`)
  } else {
    if (decide.envOverride !== null) {
      reasons.push(
        `${CATALOG}: 'decide' has envOverride ${JSON.stringify(decide.envOverride)}, must be null. ` +
        `A Director decision records its model and must be reproducible from that record; an env-settable model breaks it.`)
    }
    for (const p of [CONTRACT_WORKER, CONTRACT_SHARED]) {
      const inCode = directorModelFrom(files[p])
      if (inCode === null) reasons.push(`${p}: DIRECTOR_MODEL literal not found — REQUIRED anchor (fail closed)`)
      else if (inCode !== decide.model) {
        reasons.push(`${p}: DIRECTOR_MODEL is '${inCode}', catalog 'decide' says '${decide.model}'`)
      }
    }
  }

  // 1. every class used exists; every class declared is used
  const used = new Set()
  for (const [p, text] of Object.entries(files)) {
    if (p === LOADER || p === CATALOG) continue
    for (const id of taskClassesUsedIn(text)) {
      used.add(id)
      if (!classes[id]) reasons.push(`${p}: uses task class '${id}', which the catalog does not declare — modelForTask would throw`)
    }
  }
  // `decide` is recorded rather than resolved through modelForTask (see the
  // parity note above), so it is legitimately never "used" in that sense.
  for (const id of ids) {
    if (id !== 'decide' && !used.has(id)) {
      reasons.push(`${CATALOG}: task class '${id}' is declared but nothing routes through it — a stale entry is a claim nobody checks`)
    }
  }

  // 4. no model literal anywhere else
  for (const [p, text] of Object.entries(files)) {
    if (MODEL_LITERAL_ALLOWED.has(p)) continue
    const hits = [...text.matchAll(MODEL_LITERAL_RE)].map((m) => m[0])
    if (hits.length) {
      reasons.push(`${p}: names a model literal (${[...new Set(hits)].join(', ')}) outside the catalog — route it through modelForTask instead`)
    }
  }

  return reasons
}

function selftest() {
  let failed = 0
  const ok = (c, m) => { if (!c) { console.error(`SELFTEST FAIL: ${m}`); failed++ } else console.log(`  ok: ${m}`) }

  const base = () => ({
    [CATALOG]: JSON.stringify({ taskClasses: {
      decide: { model: 'gemini-3.5-flash', envOverride: null },
      extract: { model: 'gemini-x', envOverride: 'GEMINI_FAST_MODEL' },
    } }),
    [LOADER]: 'export function modelForTask() {}',
    [CONTRACT_WORKER]: "export const DIRECTOR_MODEL = 'gemini-3.5-flash'",
    [CONTRACT_SHARED]: "export const DIRECTOR_MODEL = 'gemini-3.5-flash'",
    'worker/src/structure.ts': "modelForTask('extract')",
  })

  ok(evaluate(base()).length === 0, 'CONTROL: an agreeing catalog and code produce zero findings')

  const one = (mutate, label, re) => {
    const f = base(); mutate(f)
    const r = evaluate(f)
    ok(r.length > 0 && r.some((x) => re.test(x)), `${label} → caught (${r[0]?.slice(0, 80) ?? 'NOTHING'})`)
  }

  one((f) => { f[CONTRACT_WORKER] = "export const DIRECTOR_MODEL = 'gemini-9'" },
    'the worker contract drifts from the catalog', /DIRECTOR_MODEL is 'gemini-9'/)
  one((f) => { f[CONTRACT_SHARED] = "export const DIRECTOR_MODEL = 'gemini-9'" },
    'the SHARED contract drifts from the catalog', /director\.ts: DIRECTOR_MODEL is/)
  one((f) => {
    f[CATALOG] = JSON.stringify({ taskClasses: {
      decide: { model: 'gemini-3.5-flash', envOverride: 'GEMINI_MODEL' },
      extract: { model: 'gemini-x', envOverride: 'GEMINI_FAST_MODEL' } } })
  }, 'the Director becomes env-settable', /must be null/)
  one((f) => { f['worker/src/other.ts'] = "modelForTask('invented')" },
    'a task class used but not declared', /does not declare/)
  one((f) => {
    f[CATALOG] = JSON.stringify({ taskClasses: {
      decide: { model: 'gemini-3.5-flash', envOverride: null },
      extract: { model: 'gemini-x', envOverride: 'GEMINI_FAST_MODEL' },
      ghost: { model: 'gemini-y', envOverride: null } } })
  }, 'a declared class nothing routes through', /declared but nothing routes/)
  one((f) => { f['worker/src/sneaky.ts'] = "const m = 'gemini-3.1-pro-preview'" },
    'a model literal outside the catalog', /names a model literal/)
  one((f) => {
    f[CATALOG] = JSON.stringify({ taskClasses: { extract: { model: 'gemini-x', envOverride: 'X' } } })
  }, "no 'decide' class at all", /no 'decide' task class/)
  one((f) => {
    f[CATALOG] = JSON.stringify({ taskClasses: {
      decide: { model: 'gemini-3.5-flash' },
      extract: { model: 'gemini-x', envOverride: 'GEMINI_FAST_MODEL' } } })
  }, 'envOverride omitted rather than null', /does not state envOverride/)
  one((f) => { f[CATALOG] = JSON.stringify({ taskClasses: {} }) }, 'an empty catalog', /zero task classes/)
  one((f) => { f[CATALOG] = '{ not json' }, 'an unparseable catalog', /does not parse/)

  for (const p of [CATALOG, LOADER, CONTRACT_WORKER, CONTRACT_SHARED]) {
    one((f) => { delete f[p] }, `FAIL CLOSED: ${p} missing`, /REQUIRED file missing/)
  }
  one((f) => { f[CONTRACT_WORKER] = 'export const SOMETHING_ELSE = 1' },
    'FAIL CLOSED: the DIRECTOR_MODEL anchor disappears', /literal not found/)

  if (failed) { console.error(`\ncheck_model_routing selftest: ${failed} failure(s)`); process.exit(1) }
  console.log('\ncheck_model_routing selftest: all cases passed')
}

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '__tests__' || n === 'dist' || n.startsWith('.')) continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (n.endsWith('.ts') || n.endsWith('.mjs')) out.push(p)
  }
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) selftest()
  else {
    const files = {}
    for (const p of [CATALOG, LOADER, CONTRACT_WORKER, CONTRACT_SHARED]) {
      try { files[p] = readFileSync(p, 'utf8') } catch { /* evaluate() fails closed */ }
    }
    for (const dir of ['worker/src', 'packages/shared/src']) {
      for (const p of walk(dir)) if (files[p] == null) files[p] = readFileSync(p, 'utf8')
    }
    const reasons = evaluate(files)
    if (reasons.length) {
      console.error(`::error::Model routing disagrees with the code in ${reasons.length} place(s):`)
      for (const r of reasons) console.error(`  - ${r}`)
      process.exit(1)
    }
    const classes = parseCatalog(files[CATALOG])
    console.log(`model-routing guard: OK — ${Object.keys(classes).length} task classes (${Object.keys(classes).join(', ')}); decide is frozen and agrees with both contract copies`)
  }
}

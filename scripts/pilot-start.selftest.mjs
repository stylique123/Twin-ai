#!/usr/bin/env node
// EVERY REFUSAL IS PROVEN TO FIRE.
//
// ⚠️ A GUARD NOBODY TRIGGERED IS A GUARD NOBODY HAS TESTED. The dangerous
// failure here is not a wrong error message — it is a refusal that silently
// does not refuse, leaving an action that looks crippled and is not. So each
// case below asserts the REFUSAL happens, and the accepting cases assert it
// does not, so a check that rejects everything cannot pass either.
import {
  validateStartRequest, validateStatusRequest, activePilotRefusal, resolveActiveRun, pilotJobRows, expectedCost,
  ACTIVE_STATUSES, ALLOWED_KEYS, STATUS_KEYS, DOWNLOADS_PER_REFERENCE,
} from './pilot-start.mjs'
import { MAX_SIZE, DEFAULT_SIZE, PILOT_PRIORITY } from './pilot-core.mjs'

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++ } else { fail++; console.error(`  FAIL  ${name}`) } }
const refuses = (name, fn, needle) => {
  try { fn(); fail++; console.error(`  FAIL  ${name} — accepted, and must not`) }
  catch (e) {
    if (needle && !e.message.includes(needle)) { fail++; console.error(`  FAIL  ${name} — wrong reason: ${e.message}`) }
    else pass++
  }
}
const accepts = (name, fn) => {
  try { fn(); pass++ } catch (e) { fail++; console.error(`  FAIL  ${name} — refused a valid request: ${e.message}`) }
}

const good = { size: 8, cost_ceiling_downloads: 16 }

// ── the shape of a request ────────────────────────────────────────────────
accepts('a well-formed request is accepted', () => validateStartRequest(good))
accepts('size may be omitted and defaults to the pilot default', () => {
  const r = validateStartRequest({ cost_ceiling_downloads: 99 })
  if (r.size !== DEFAULT_SIZE) throw new Error(`defaulted to ${r.size}, not ${DEFAULT_SIZE}`)
})
refuses('a URL list is refused, not ignored', () => validateStartRequest({ ...good, urls: ['x'] }), 'unknown key')
refuses('a job payload is refused, not ignored', () => validateStartRequest({ ...good, payload: {} }), 'unknown key')
refuses('a backlog flag is refused, not ignored', () => validateStartRequest({ ...good, backlog: true }), 'unknown key')
refuses('a job type override is refused', () => validateStartRequest({ ...good, type: 'ingest' }), 'unknown key')
refuses('a priority override is refused', () => validateStartRequest({ ...good, priority: -99 }), 'unknown key')
refuses('a non-object body is refused', () => validateStartRequest('size=8'), 'must be an object')
refuses('an array body is refused', () => validateStartRequest([]), 'must be an object')

// ── the size ceiling ──────────────────────────────────────────────────────
accepts('exactly the ceiling is allowed', () => validateStartRequest({ size: MAX_SIZE, cost_ceiling_downloads: 999 }))
refuses('one past the ceiling is refused', () => validateStartRequest({ size: MAX_SIZE + 1, cost_ceiling_downloads: 999 }), 'exceeds the pilot ceiling')
refuses('the backlog-sized request is refused', () => validateStartRequest({ size: 332, cost_ceiling_downloads: 99999 }), 'exceeds the pilot ceiling')
refuses('zero references is refused', () => validateStartRequest({ size: 0, cost_ceiling_downloads: 9 }), 'positive whole number')
refuses('a fractional size is refused', () => validateStartRequest({ size: 2.5, cost_ceiling_downloads: 9 }), 'positive whole number')
refuses('a negative size is refused', () => validateStartRequest({ size: -8, cost_ceiling_downloads: 9 }), 'positive whole number')

// ── the cost ceiling ──────────────────────────────────────────────────────
refuses('a missing ceiling is refused — there is no default', () => validateStartRequest({ size: 8 }), 'no default')
refuses('a zero ceiling is refused', () => validateStartRequest({ size: 8, cost_ceiling_downloads: 0 }), 'required')
refuses('a non-numeric ceiling is refused', () => validateStartRequest({ size: 8, cost_ceiling_downloads: 'lots' }), 'required')
refuses('a ceiling below the real bill is refused', () => validateStartRequest({ size: 8, cost_ceiling_downloads: 15 }), 'Nothing was enqueued')
accepts('a ceiling exactly equal to the bill is allowed', () => validateStartRequest({ size: 8, cost_ceiling_downloads: 16 }))
ok('the bill counts the re-acquisition as well as the frames pull',
  expectedCost(8).downloads === 8 * DOWNLOADS_PER_REFERENCE && DOWNLOADS_PER_REFERENCE === 2)
ok('one vision call per reference', expectedCost(8).visionCalls === 8)

// ── one pilot at a time ───────────────────────────────────────────────────
ok('no runs at all is not a refusal', activePilotRefusal([]) === null)
ok('an undefined list is not a refusal', activePilotRefusal(undefined) === null)
ok('a locked run does not block a new one', activePilotRefusal([{ id: 'a', status: 'locked' }]) === null)
ok('an abandoned run does not block a new one', activePilotRefusal([{ id: 'a', status: 'abandoned' }]) === null)
for (const status of ACTIVE_STATUSES) {
  const r = activePilotRefusal([{ id: 'live-1', status }])
  ok(`a ${status} run blocks a second pilot`, typeof r === 'string' && r.includes('live-1') && r.includes(status))
}
ok('a live run among finished ones still blocks',
  typeof activePilotRefusal([
    { id: 'a', status: 'locked' }, { id: 'b', status: 'collecting' }, { id: 'c', status: 'abandoned' },
  ]) === 'string')

// ── the jobs that actually get written ────────────────────────────────────
const rows = pilotJobRows(['u1', 'u2'], 'run-7', PILOT_PRIORITY)
ok('one job per reference, no more', rows.length === 2)
ok('the job type is assess_reference and nothing else', rows.every((r) => r.type === 'assess_reference'))
ok('frames are always on', rows.every((r) => r.payload.frames === true))
ok('every job carries its pilot_run_id', rows.every((r) => r.payload.pilot_run_id === 'run-7'))
ok('the payload carries no keys beyond the five constructed here',
  rows.every((r) => Object.keys(r.payload).sort().join(',') === 'force,frames,pilot_run_id,platform,url'))
refuses('a job without a run id is refused', () => pilotJobRows(['u1'], '', PILOT_PRIORITY), 'pilot_run_id is required')
refuses('an empty sample is refused', () => pilotJobRows([], 'run-7', PILOT_PRIORITY), 'empty sample')
refuses('more jobs than the ceiling is refused',
  () => pilotJobRows(Array.from({ length: MAX_SIZE + 1 }, (_, i) => `u${i}`), 'run-7', PILOT_PRIORITY), 'ceiling')

// ── status is read-only and still refuses unknown keys ────────────────────
accepts('a well-formed status request is accepted',
  () => validateStatusRequest({ action: 'status', pilot_run_id: 'run-7' }))
// ⚠️ OMITTING THE ID IS THE RECOVERY PATH, NOT A MALFORMED REQUEST. A present
// but empty id is still a caller bug, and these two cases must not collapse
// into each other — that is exactly how "resolve the active pilot" would start
// silently answering typos.
ok('a status request with no run id asks for the active pilot',
  validateStatusRequest({ action: 'status' }) === null)
ok('an explicit null id means the same thing',
  validateStatusRequest({ action: 'status', pilot_run_id: null }) === null)
refuses('a present-but-empty run id is still refused',
  () => validateStatusRequest({ action: 'status', pilot_run_id: '' }), 'given but empty')
refuses('a status request may not smuggle a size',
  () => validateStatusRequest({ action: 'status', pilot_run_id: 'r', size: 999 }), 'unknown key')
refuses('a status request may not smuggle a URL list',
  () => validateStatusRequest({ action: 'status', pilot_run_id: 'r', urls: ['x'] }), 'unknown key')
refuses('a non-object status body is refused',
  () => validateStatusRequest('run-7'), 'must be an object')
ok('the status allow-list cannot name a payload or a size',
  !STATUS_KEYS.includes('payload') && !STATUS_KEYS.includes('size'))

// ── resolving "the active pilot" ──────────────────────────────────────────
ok('no runs at all resolves to nothing, and is not an error',
  resolveActiveRun([]).id === null && resolveActiveRun([]).refusal === null)
ok('a null run list resolves to nothing rather than throwing',
  resolveActiveRun(null).id === null && resolveActiveRun(null).refusal === null)
ok('exactly one active run resolves to that run',
  resolveActiveRun([{ id: 'r1', status: 'collecting' }]).id === 'r1')
ok('a run still waiting to be labelled is active — that is the tab you closed',
  resolveActiveRun([{ id: 'r9', status: 'ready_for_label' }]).id === 'r9')
// ⚠️ THE TERMINAL STATES MUST NOT RESOLVE. Handing back a locked run would let
// the start screen offer to "pick up" a pilot whose labels are already final.
ok('a locked run is not active',
  resolveActiveRun([{ id: 'r2', status: 'locked' }]).id === null)
ok('an abandoned run is not active',
  resolveActiveRun([{ id: 'r3', status: 'abandoned' }]).id === null)
ok('a locked run alongside an active one resolves to the active one',
  resolveActiveRun([{ id: 'r2', status: 'locked' }, { id: 'r4', status: 'frozen' }]).id === 'r4')
// ⚠️ TWO ACTIVE RUNS MEANS THE ONE-PILOT REFUSAL ALREADY FAILED. Guessing here
// would attach a label set to the wrong run, so it refuses and names both.
ok('two active runs refuse rather than guess', (() => {
  const r = resolveActiveRun([{ id: 'rA', status: 'collecting' }, { id: 'rB', status: 'frozen' }])
  return r.id === null && !!r.refusal && r.refusal.includes('rA') && r.refusal.includes('rB')
})())
// The two readers of ACTIVE_STATUSES must agree, or "the active pilot" and
// "you already have one" would disagree about the same row.
ok('resolve and refuse agree about every status', ACTIVE_STATUSES.every((st) =>
  resolveActiveRun([{ id: 'x', status: st }]).id === 'x'
  && activePilotRefusal([{ id: 'x', status: st }]) !== null))

// ── the allow-list itself ─────────────────────────────────────────────────
ok('the allow-list cannot name a URL list or a payload',
  !ALLOWED_KEYS.includes('urls') && !ALLOWED_KEYS.includes('payload') && !ALLOWED_KEYS.includes('backlog'))

console.log(`pilot-start selftest: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)

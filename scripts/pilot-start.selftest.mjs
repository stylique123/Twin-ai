#!/usr/bin/env node
// EVERY REFUSAL IS PROVEN TO FIRE.
//
// ⚠️ A GUARD NOBODY TRIGGERED IS A GUARD NOBODY HAS TESTED. The dangerous
// failure here is not a wrong error message — it is a refusal that silently
// does not refuse, leaving an action that looks crippled and is not. So each
// case below asserts the REFUSAL happens, and the accepting cases assert it
// does not, so a check that rejects everything cannot pass either.
import {
  validateStartRequest, validateStatusRequest, activePilotRefusal, activePilotRun,
  resolveActivePilotRun, ambiguousPilotRefusal,
  pilotJobRows, expectedCost,
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

// ── the run you already have, so it can be recovered rather than replaced ──
//
// ⚖️ THE REFUSAL AND THE RECOVERY MUST AGREE. If activePilotRun ever considered
// a run live that activePilotRefusal did not (or the reverse), the product
// would refuse to start a run it could not find, which is the exact state a
// real pilot was stranded in.
ok('no active run when there are none', activePilotRun([]) === null)
ok('an undefined list has no active run', activePilotRun(undefined) === null)
ok('a locked run is not active', activePilotRun([{ id: 'a', status: 'locked' }]) === null)
ok('an abandoned run is not active', activePilotRun([{ id: 'a', status: 'abandoned' }]) === null)
for (const status of ACTIVE_STATUSES) {
  ok(`a ${status} run is recoverable`, activePilotRun([{ id: 'live-1', status }])?.id === 'live-1')
}
ok('enqueued is recoverable — the state the stranded run was actually in',
  activePilotRun([{ id: '7204de6f', status: 'enqueued' }])?.id === '7204de6f')
ok('a live run among finished ones is the one returned',
  activePilotRun([
    { id: 'a', status: 'locked' }, { id: 'b', status: 'collecting' }, { id: 'c', status: 'abandoned' },
  ])?.id === 'b')
for (const status of [...ACTIVE_STATUSES, 'locked', 'abandoned']) {
  const runs = [{ id: 'x', status }]
  ok(`refusal and recovery agree about "${status}"`,
    (activePilotRefusal(runs) === null) === (activePilotRun(runs) === null))
}

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
refuses('a status request without a run id is refused',
  () => validateStatusRequest({ action: 'status' }), 'pilot_run_id is required')
refuses('a status request may not smuggle a size',
  () => validateStatusRequest({ action: 'status', pilot_run_id: 'r', size: 999 }), 'unknown key')
refuses('a status request may not smuggle a URL list',
  () => validateStatusRequest({ action: 'status', pilot_run_id: 'r', urls: ['x'] }), 'unknown key')
refuses('a non-object status body is refused',
  () => validateStatusRequest('run-7'), 'must be an object')
ok('the status allow-list cannot name a payload or a size',
  !STATUS_KEYS.includes('payload') && !STATUS_KEYS.includes('size'))

// ── the allow-list itself ─────────────────────────────────────────────────
ok('the allow-list cannot name a URL list or a payload',
  !ALLOWED_KEYS.includes('urls') && !ALLOWED_KEYS.includes('payload') && !ALLOWED_KEYS.includes('backlog'))

// ── adopting a run is not the same question as refusing one ─────────────────
// ⚠️ activePilotRun RETURNS active[0]. That is correct for the refusal — any
// active run is grounds, and the answer is "no" either way — and wrong for
// adoption, where picking one of two sends the owner to an arbitrary run and
// attaches their labels to it. Labels are the entire result of the pilot, and
// a label on the wrong run is worse than no label because nothing downstream
// can tell.
ok('nothing active resolves to nothing, and is not ambiguous', (() => {
  const r = resolveActivePilotRun([])
  return r.run === null && r.ambiguous === false && r.ids.length === 0
})())
ok('an undefined list resolves to nothing rather than throwing',
  resolveActivePilotRun(undefined).run === null)
ok('exactly one active run resolves to it', (() => {
  const r = resolveActivePilotRun([{ id: '7204de6f', status: 'ready_for_label' }])
  return r.run?.id === '7204de6f' && r.ambiguous === false
})())
ok('terminal runs do not resolve — a locked run is not one to pick up',
  resolveActivePilotRun([{ id: 'a', status: 'locked' }, { id: 'b', status: 'abandoned' }]).run === null)

// ⚠️ TWO ACTIVE RUNS REFUSES AND NAMES BOTH. It does NOT pick.
{
  const two = [{ id: 'run-a', status: 'collecting' }, { id: 'run-b', status: 'frozen' }]
  const r = resolveActivePilotRun(two)
  ok('two active runs are ambiguous', r.ambiguous === true)
  ok('and it refuses to choose one', r.run === null)
  ok('and both ids are named', JSON.stringify(r.ids) === JSON.stringify(['run-a', 'run-b']))
  const said = ambiguousPilotRefusal(r.ids)
  ok('the refusal names both ids', said.includes('run-a') && said.includes('run-b'))
  ok('the refusal says why picking is not an option', said.includes('cannot be resolved by picking'))
}
// A terminal run alongside a live one is NOT ambiguity — there is one active.
ok('a locked run beside a live one is still unambiguous', (() => {
  const r = resolveActivePilotRun([{ id: 'old', status: 'locked' }, { id: 'live', status: 'enqueued' }])
  return r.ambiguous === false && r.run?.id === 'live'
})())

// ⚖️ THE REFUSAL PATH IS DELIBERATELY UNCHANGED. Starting a second pilot must
// still be refused when two are somehow active — that is MORE reason to refuse,
// not less — so activePilotRefusal must keep answering on the same rows.
ok('CONTROL starting a second pilot is still refused when two are active',
  activePilotRefusal([{ id: 'run-a', status: 'collecting' }, { id: 'run-b', status: 'frozen' }]) !== null)
// The two functions agree about WHETHER anything is active, and differ only
// about whether one can be singled out.
for (const runs of [[], [{ id: 'x', status: 'collecting' }],
  [{ id: 'x', status: 'collecting' }, { id: 'y', status: 'collecting' }],
  [{ id: 'x', status: 'locked' }]]) {
  ok('active-ness agrees between refusal and resolution',
    (activePilotRefusal(runs) === null) === (resolveActivePilotRun(runs).ids.length === 0))
}

console.log(`pilot-start selftest: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)

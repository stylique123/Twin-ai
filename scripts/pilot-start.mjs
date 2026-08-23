// THE ONLY WAY TO START A PILOT, AND IT IS DELIBERATELY CRIPPLED.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// The pilot used to start from a terminal: `frame-pilot.mjs --review --size 8
// --go`, holding a service role key, on somebody's laptop. That command can
// enqueue anything. It is a general-purpose job producer that happens to be
// pointed at a pilot, and the only thing stopping it from spending the whole
// Gemini budget on an arbitrary URL list is that nobody typed one.
//
// ⚠️ THE SURFACE IS THE PROBLEM, NOT THE OPERATOR'S CARE. This module replaces
// it with an action that CANNOT express the dangerous requests:
//
//   no arbitrary URL list      the sample is drawn from the frozen cohort rule
//   no arbitrary job payload   the payload is constructed here, not accepted
//   no backlog mode            there is no parameter that means "and the rest"
//   one job type               assess_reference, hard-coded
//   frames: true               hard-coded; a pilot without frames measures nothing
//   pilot_run_id required      every job is attributable to one frozen run
//   size <= MAX_SIZE           ten, and it is the ceiling for a reason
//   one active pilot           a second concurrent run doubles the bill silently
//   cost ceiling required      the caller must state a bound, and it is checked
//
// ⚖️ AND UNKNOWN KEYS ARE REFUSED, NOT IGNORED. An ignored `urls` key is a key
// somebody wires up in six months, in a hurry, without reading this comment.
// Refusing it means that change cannot be made by accident.
//
// This module is PURE. It decides what is allowed and what a request costs; it
// executes nothing. The edge function does the SQL, so every refusal below is
// testable without a database and without a credential.

import { MAX_SIZE, DEFAULT_SIZE } from './pilot-core.mjs'

/** Statuses that mean a pilot is still consuming the lane. `locked` and
 *  `abandoned` are finished; everything else is in flight. */
export const ACTIVE_STATUSES = Object.freeze(['frozen', 'enqueued', 'collecting', 'ready_for_label'])

/** The only keys a start request may carry. Anything else is a refusal. */
export const ALLOWED_KEYS = Object.freeze(['action', 'size', 'cost_ceiling_downloads'])

/** The only keys a status request may carry.
 *
 * ⚠️ STATUS IS READ-ONLY AND STILL REFUSES UNKNOWN KEYS. Leaving one action
 * laxer than the others is how the strictness stops being a property of the
 * endpoint and becomes a property of whichever branch somebody remembered. */
export const STATUS_KEYS = Object.freeze(['action', 'pilot_run_id'])

/** ⚠️ TWO PER REFERENCE, AND THE SECOND ONE IS THE ONE PEOPLE FORGET.
 *  `force: true` bypasses the transcript cache, so each reference pays a fresh
 *  acquisition AND a frames pull. Costing it at one download per reference is
 *  how a bill comes in at double the quoted figure. */
export const DOWNLOADS_PER_REFERENCE = 2

export function expectedCost(size) {
  const n = Number(size)
  if (!Number.isInteger(n) || n < 1) throw new Error(`size ${size} is not a positive whole number`)
  return { references: n, downloads: n * DOWNLOADS_PER_REFERENCE, visionCalls: n }
}

/**
 * Validate a start request. Returns `{ size, ceiling }` or throws.
 *
 * ⚠️ THE CEILING IS REQUIRED AND HAS NO DEFAULT. A default ceiling is not a
 * ceiling — it is a number nobody chose, which is exactly the state the
 * spending control exists to prevent. The caller must say what they are
 * willing to spend before anything is enqueued.
 */
export function validateStartRequest(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('the request body must be an object')
  }
  const unknown = Object.keys(body).filter((k) => !ALLOWED_KEYS.includes(k))
  if (unknown.length > 0) {
    throw new Error(`refusing unknown key(s): ${unknown.sort().join(', ')}. `
      + `This action accepts only ${ALLOWED_KEYS.join(', ')} — it cannot take a URL list, `
      + 'a job payload, or a backlog flag, and silently ignoring one would be worse than refusing it.')
  }

  const size = body.size === undefined ? DEFAULT_SIZE : Number(body.size)
  if (!Number.isInteger(size) || size < 1) throw new Error(`size ${body.size} is not a positive whole number`)
  if (size > MAX_SIZE) {
    throw new Error(`size ${size} exceeds the pilot ceiling of ${MAX_SIZE}. `
      + 'This is the step before deciding whether the visual pass is trustworthy enough to touch '
      + '332 references; a "pilot" larger than the ceiling has already made that decision by spending it.')
  }

  const ceiling = Number(body.cost_ceiling_downloads)
  if (!Number.isInteger(ceiling) || ceiling < 1) {
    throw new Error('cost_ceiling_downloads is required and must be a positive whole number. '
      + 'There is no default: a ceiling nobody chose is not a ceiling.')
  }

  const cost = expectedCost(size)
  if (cost.downloads > ceiling) {
    throw new Error(`this run would cost ${cost.downloads} downloads (${size} references × `
      + `${DOWNLOADS_PER_REFERENCE}, because force:true re-acquires as well as pulling frames) `
      + `but the stated ceiling is ${ceiling}. Nothing was enqueued.`)
  }
  return { size, ceiling, cost }
}

/** Validate a status request. Returns the run id or throws. */
export function validateStatusRequest(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('the request body must be an object')
  }
  const unknown = Object.keys(body).filter((k) => !STATUS_KEYS.includes(k))
  if (unknown.length > 0) {
    throw new Error(`refusing unknown key(s): ${unknown.sort().join(', ')}. `
      + `A status request accepts only ${STATUS_KEYS.join(', ')}.`)
  }
  const id = String(body.pilot_run_id ?? '')
  if (!id) throw new Error('pilot_run_id is required')
  return id
}

/**
 * Refuse a second concurrent pilot.
 *
 * ⚠️ NOT A CONVENIENCE. Two live runs draw overlapping samples from the same
 * cohort, so the same reference is paid for twice and two label sets disagree
 * about one URL with no way to say which run a label belonged to.
 */
/**
 * The pilot that is already live, or null.
 *
 * ⚖️ ONE RULE, TWO READERS. The refusal that stops a second run and the lookup
 * that RECOVERS the first must agree about what "already live" means, or the
 * product refuses to start a run it also cannot find — which is exactly what
 * happened: a real run sat `enqueued` holding eight references of paid-for
 * evidence, the start page could only ever reach a run it had started itself,
 * and the only thing that knew the run existed was the message refusing to
 * start another one.
 */
export function activePilotRun(runs) {
  const active = (runs ?? []).filter((r) => ACTIVE_STATUSES.includes(String(r?.status)))
  return active.length === 0 ? null : active[0]
}

/**
 * THE RUN TO ADOPT WHEN THE OWNER ARRIVES WITHOUT AN ID — OR A REFUSAL.
 *
 * ⚠️ REFUSING A SECOND PILOT AND ADOPTING AN EXISTING ONE ARE NOT THE SAME
 * QUESTION, AND activePilotRun ONLY ANSWERS THE FIRST. For the refusal, ANY
 * active run is sufficient grounds and picking one of several is harmless --
 * the answer is "no" either way. For adoption it is the opposite: picking
 * active[0] out of two sends the owner to an arbitrary run and attaches a
 * label set to it, and labels are the entire result of the pilot. A label on
 * the wrong run is worse than no label, because nothing downstream can tell.
 *
 * ⚖️ TWO ACTIVE RUNS MEANS THE ONE-PILOT INVARIANT HAS ALREADY FAILED. That is
 * a condition to report, naming both, not one to paper over by choosing. The
 * adoption path is the only caller that must care.
 */
export function resolveActivePilotRun(runs) {
  const active = (runs ?? []).filter((r) => ACTIVE_STATUSES.includes(String(r?.status)))
  if (active.length === 0) return { run: null, ambiguous: false, ids: [] }
  const ids = active.map((r) => String(r?.id))
  if (active.length > 1) return { run: null, ambiguous: true, ids }
  return { run: active[0], ambiguous: false, ids }
}

export function ambiguousPilotRefusal(ids) {
  return `${ids.length} pilot runs are active at once (${ids.join(', ')}). Only one may be, so `
    + 'this cannot be resolved by picking: adopting the wrong one would attach your labels to a '
    + 'run they were not given about, and nothing downstream could tell. Open the one you meant '
    + 'by its id, or abandon the runs that should not be active.'
}

export function activePilotRefusal(runs) {
  const r = activePilotRun(runs)
  if (!r) return null
  return `pilot run ${r.id} is still ${r.status}. One pilot at a time: a second run would draw an `
    + 'overlapping sample from the same cohort, pay for those references twice, and produce two '
    + 'label sets that disagree about one URL with nothing to say which run a label came from. '
    + 'Finish and lock it, or abandon it, then start a new one.'
}

/**
 * The job rows for a frozen sample. THE PAYLOAD IS CONSTRUCTED, NEVER ACCEPTED.
 *
 * ⚠️ `pilot_run_id` IS NOT OPTIONAL AND IS NOT COSMETIC. It is what makes a
 * frame attributable to the run whose labels will be locked. A job without it
 * spends money and produces evidence belonging to nothing.
 */
export function pilotJobRows(urls, pilotRunId, priority) {
  if (!pilotRunId) throw new Error('pilot_run_id is required — an unattributable job is a job whose evidence belongs to nothing')
  if (!Array.isArray(urls) || urls.length === 0) throw new Error('refusing to enqueue an empty sample')
  if (urls.length > MAX_SIZE) throw new Error(`refusing to enqueue ${urls.length} jobs — the ceiling is ${MAX_SIZE}`)
  return urls.map((url) => ({
    type: 'assess_reference',
    priority,
    payload: { url, platform: 'tiktok', frames: true, force: true, pilot_run_id: pilotRunId },
  }))
}

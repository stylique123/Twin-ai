// THE MACHINE COLLECTS THE EVIDENCE. YOU ASK WHY.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// D1 is one person watching one creator use Twin. The observer's whole
// attention should be on the one question a machine cannot answer — why they
// stopped — and not on remembering to capture a timeline.
//
// ⚠️ SO THE STATE MACHINE IS THE PRODUCT HERE. Which transitions are legal,
// what must exist before each one, and what may never be written by anything
// other than a human. The transitions are pure and testable without a database;
// the endpoint does the SQL.
//
// ⚖️ AND NOTHING IN THIS FILE PRODUCES AN OBSERVATION. Every function either
// validates one a human wrote or refuses a transition. If a future change makes
// this module able to emit a blocker on its own, that change is the defect.

import { BLOCKERS, REQUIRED_EVENTS, validateObservation } from './d1-core.mjs'

export { BLOCKERS, REQUIRED_EVENTS, validateObservation }

/** created → watching → finished → locked. `abandoned` is reachable from
 *  anywhere that is not already terminal, because a session that went wrong
 *  must be closable without pretending it produced evidence. */
export const TRANSITIONS = Object.freeze({
  created: ['watching', 'abandoned'],
  watching: ['finished', 'abandoned'],
  finished: ['locked', 'abandoned'],
  locked: [],
  abandoned: [],
})

export function canTransition(from, to) {
  const allowed = TRANSITIONS[String(from)]
  if (!allowed) return `unknown status ${JSON.stringify(from)}`
  if (!allowed.includes(String(to))) {
    return allowed.length === 0
      ? `a ${from} session is final and cannot become ${to}`
      : `a ${from} session may only become ${allowed.join(' or ')}, not ${to}`
  }
  return null
}

/**
 * ⚠️ CONSENT IS A PRECONDITION OF WATCHING, NOT A FORM FILLED IN AFTER.
 * Recording that somebody agreed once you have already watched them is
 * bookkeeping, not consent.
 */
export function refuseStart(session) {
  const bad = canTransition(session?.status, 'watching')
  if (bad) return bad
  if (!session.consent_given_at) {
    return 'consent has not been recorded — read the consent script and get a yes before watching'
  }
  if (session.observer_user_id === session.subject_user_id) {
    return 'the observer cannot be the subject — watching yourself is a rehearsal, not evidence'
  }
  return null
}

/**
 * ⚠️ A LOCK WITH NO OBSERVATION IS AN EMPTY SESSION WEARING A RESULT'S CLOTHES.
 * The entire point of D1 is the human answer; locking without one produces a
 * row that later reads as "we ran the session and learned nothing", which is
 * indistinguishable from "we ran the session and never asked".
 */
export function refuseLock(session, observations) {
  const bad = canTransition(session?.status, 'locked')
  if (bad) return bad
  const n = (observations ?? []).length
  if (n === 0) {
    return 'this session has no recorded reason. The machine timeline is not the finding — '
      + 'the creator\'s own words are. Record at least one before locking.'
  }
  const invalid = (observations ?? []).map(validateObservation).filter(Boolean)
  if (invalid.length > 0) return `an observation is incomplete: ${invalid[0]}`
  return null
}

/**
 * Which required events never arrived, and how far the machine can honestly
 * classify each absence.
 *
 * ⚠️ `not_reached` IS NEVER INFERRED HERE. The machine can prove an event is
 * uninstrumented (nothing in the codebase emits it); it cannot tell "they did
 * not do it" from "we did not record it". Anything not provably uninstrumented
 * is `unknown`, and a human may narrow it later.
 */
export function classifyGaps(events, instrumentedNames) {
  const seen = new Set((events ?? []).map((e) => String(e.event_name ?? e.name ?? '')))
  const instrumented = new Set(instrumentedNames ?? [])
  return Object.keys(REQUIRED_EVENTS)
    .filter((name) => !seen.has(name))
    .map((name) => ({
      event_name: name,
      reason: instrumented.has(name) ? 'unknown' : 'uninstrumented',
    }))
}

/**
 * The events that belong to this session.
 *
 * ⚠️ A SNAPSHOT BOUNDED BY THE SESSION WINDOW. Copying "the subject's recent
 * events" would sweep in yesterday's browsing and last week's failed render,
 * and the timeline would describe a person rather than a sitting.
 */
export function evidenceWindow(session, events) {
  if (!session?.started_at) throw new Error('a session that never started has no evidence window')
  const from = Date.parse(session.started_at)
  // An unfinished session is bounded by now, so a live view is still correct.
  const to = session.finished_at ? Date.parse(session.finished_at) : Number.POSITIVE_INFINITY
  if (Number.isNaN(from)) throw new Error(`started_at ${session.started_at} is not a time`)
  if (session.finished_at && Number.isNaN(to)) throw new Error(`finished_at ${session.finished_at} is not a time`)
  if (to < from) throw new Error('the session finished before it started')
  return (events ?? []).filter((e) => {
    const t = Date.parse(e.occurred_at ?? e.at ?? '')
    if (Number.isNaN(t)) return false
    return t >= from && t <= to
      && String(e.user_id ?? '') === String(session.subject_user_id ?? '')
  })
}

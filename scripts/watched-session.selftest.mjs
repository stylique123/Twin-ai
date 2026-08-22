#!/usr/bin/env node
// ⚠️ THE ASSERTIONS THAT MATTER ARE THE REFUSALS. A state machine that lets
// everything through is not a state machine, and the two transitions worth
// guarding are "watched without consent" and "locked without asking why".
import {
  canTransition, refuseStart, refuseLock, classifyGaps, evidenceWindow,
  TRANSITIONS, REQUIRED_EVENTS, BLOCKERS,
} from './watched-session.mjs'
import { reconstruct } from './d1-core.mjs'

let pass = 0, fail = 0
const ok = (n, c) => { if (c) pass++; else { fail++; console.error(`  FAIL  ${n}`) } }
const refuses = (n, fn) => { try { fn(); fail++; console.error(`  FAIL  ${n} — accepted`) } catch { pass++ } }

const session = (o = {}) => ({
  status: 'created', consent_given_at: '2026-08-22T10:00:00Z',
  observer_user_id: 'obs', subject_user_id: 'sub',
  started_at: '2026-08-22T10:00:00Z', finished_at: '2026-08-22T10:30:00Z', ...o,
})
const obs = (o = {}) => ({ blocker: 'SCRIPT_REJECTION', creatorReason: 'it sounded like an advert', ...o })

// ── transitions ───────────────────────────────────────────────────────────
ok('created may begin watching', canTransition('created', 'watching') === null)
ok('watching may finish', canTransition('watching', 'finished') === null)
ok('finished may lock', canTransition('finished', 'locked') === null)
ok('a locked session is final', typeof canTransition('locked', 'watching') === 'string')
ok('an abandoned session is final', typeof canTransition('abandoned', 'finished') === 'string')
ok('created may NOT jump straight to locked', typeof canTransition('created', 'locked') === 'string')
ok('watching may NOT skip finishing', typeof canTransition('watching', 'locked') === 'string')
ok('an unknown status is refused, not defaulted', typeof canTransition('nonsense', 'watching') === 'string')
ok('every status can be abandoned except the terminal ones',
  TRANSITIONS.created.includes('abandoned') && TRANSITIONS.watching.includes('abandoned')
  && TRANSITIONS.finished.includes('abandoned')
  && TRANSITIONS.locked.length === 0 && TRANSITIONS.abandoned.length === 0)

// ── consent ───────────────────────────────────────────────────────────────
ok('CONTROL: a consented session may start', refuseStart(session()) === null)
ok('watching WITHOUT consent is refused',
  typeof refuseStart(session({ consent_given_at: null })) === 'string')
ok('...and the refusal says to get a yes first',
  String(refuseStart(session({ consent_given_at: null }))).includes('consent'))
ok('watching yourself is refused',
  typeof refuseStart(session({ subject_user_id: 'obs' })) === 'string')
ok('a session already watching cannot start again',
  typeof refuseStart(session({ status: 'watching' })) === 'string')

// ── the lock ──────────────────────────────────────────────────────────────
ok('CONTROL: a finished session with a real observation locks',
  refuseLock(session({ status: 'finished' }), [obs()]) === null)
ok('locking with NO observation is refused — the timeline is not the finding',
  typeof refuseLock(session({ status: 'finished' }), []) === 'string')
ok('...and says the creator\'s own words are what is missing',
  String(refuseLock(session({ status: 'finished' }), [])).includes('own words'))
ok('locking with an EMPTY reason is refused',
  typeof refuseLock(session({ status: 'finished' }), [obs({ creatorReason: '   ' })]) === 'string')
ok('locking with an off-taxonomy blocker is refused',
  typeof refuseLock(session({ status: 'finished' }), [obs({ blocker: 'VIBES' })]) === 'string')
ok('OTHER without the creator\'s words is refused',
  typeof refuseLock(session({ status: 'finished' }), [obs({ blocker: 'OTHER', creatorReason: 'meh' })]) === 'string')
ok('OTHER WITH the creator\'s words is accepted — it is the pressure gauge, not a failure',
  refuseLock(session({ status: 'finished' }),
    [obs({ blocker: 'OTHER', creatorReason: 'their flatmate came home mid-take' })]) === null)
ok('a session that never finished cannot lock',
  typeof refuseLock(session({ status: 'watching' }), [obs()]) === 'string')

// ── gaps: absent is not zero ──────────────────────────────────────────────
{
  const names = Object.keys(REQUIRED_EVENTS)
  const gaps = classifyGaps([], [])
  ok('with nothing instrumented, every required event is a gap', gaps.length === names.length)
  ok('and each is classified UNINSTRUMENTED, a fact about the code',
    gaps.every((g) => g.reason === 'uninstrumented'))

  // ⚠️ THE DISTINCTION THIS EXISTS FOR.
  const instrumented = classifyGaps([], names)
  ok('an instrumented event that never fired is UNKNOWN, never "they did not do it"',
    instrumented.every((g) => g.reason === 'unknown'))
  ok('the machine never writes not_reached on its own',
    [...gaps, ...instrumented].every((g) => g.reason !== 'not_reached'))

  const some = classifyGaps([{ event_name: names[0] }], names)
  ok('an event that DID arrive is not a gap', !some.some((g) => g.event_name === names[0]))
}

// ── the evidence window ───────────────────────────────────────────────────
{
  const s = session()
  const ev = (at, user = 'sub') => ({ occurred_at: at, user_id: user, event_name: 'page_view' })
  const got = evidenceWindow(s, [
    ev('2026-08-22T09:59:00Z'),           // before
    ev('2026-08-22T10:15:00Z'),           // inside
    ev('2026-08-22T10:45:00Z'),           // after
    ev('2026-08-22T10:15:00Z', 'someone'), // inside, WRONG PERSON
  ])
  ok('only events inside the window are collected', got.length === 1)
  ok('and only the subject\'s', got.every((e) => e.user_id === 'sub'))

  const live = evidenceWindow(session({ finished_at: null }), [ev('2026-08-22T23:00:00Z')])
  ok('an unfinished session is bounded by now, so a live view still works', live.length === 1)

  refuses('a session that never started has no window',
    () => evidenceWindow(session({ started_at: null }), []))
  refuses('a session that finished before it started is refused',
    () => evidenceWindow(session({ finished_at: '2026-08-22T09:00:00Z' }), []))
}

// ── the module may not invent a reason ────────────────────────────────────
ok('the blocker taxonomy is frozen and includes the pressure gauge',
  Object.isFrozen(BLOCKERS) && 'OTHER' in BLOCKERS)

// ── the tie-break path, which nothing was exercising ──────────────────────
//
// ⚠️ A LATENT ReferenceError LIVED HERE. Extracting d1-core.mjs cut above the
// `createHash` import, and the only caller is the deterministic tie-break in
// reconstruct() — reached ONLY when two events share a millisecond, which the
// code's own comment calls common on a click that fires both. `||`
// short-circuits, so every existing test passed while the file was broken.
{
  const tied = reconstruct([
    { name: 'b', at: '2026-08-22T10:00:00.000Z' },
    { name: 'a', at: '2026-08-22T10:00:00.000Z' },
  ])
  ok('two events in the same millisecond reconstruct without throwing', tied.length === 2)
  const again = reconstruct([
    { name: 'a', at: '2026-08-22T10:00:00.000Z' },
    { name: 'b', at: '2026-08-22T10:00:00.000Z' },
  ])
  ok('and the tie breaks the SAME way whichever order they arrive in',
    JSON.stringify(tied.map((e) => e.name)) === JSON.stringify(again.map((e) => e.name)))
}

console.log(`watched-session selftest: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)

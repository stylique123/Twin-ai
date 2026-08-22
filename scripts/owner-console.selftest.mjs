#!/usr/bin/env node
// ⚠️ THE DANGEROUS FAILURE OF A STATUS PAGE IS A CARD THAT LOOKS SETTLED.
// Every case below pins a state that must NOT be reported as done or as
// progress, and each has a control asserting the honest state still appears —
// a page that says "action needed" about everything is no more useful than one
// that says "fine".
import {
  CARDS, schemaCard, pilotCard, recordingsCard, watchedSessionCard, rotationCard,
  nextAction, ROTATION_LOCATIONS, RECORDINGS_NEEDED, SCHEMA_STEPS,
} from './owner-console.mjs'

let pass = 0, fail = 0
const ok = (n, c) => { if (c) pass++; else { fail++; console.error(`  FAIL  ${n}`) } }

// ── schema ────────────────────────────────────────────────────────────────
ok('both objects present is done',
  schemaCard({ hasZoomCount: true, hasWatchedSessions: true }).state === 'done')
ok('missing zoom_count names 0164',
  schemaCard({ hasZoomCount: false, hasWatchedSessions: true }).ownerAction.includes('0164'))
ok('missing both asks for ONE pass in order', (() => {
  const c = schemaCard({ hasZoomCount: false, hasWatchedSessions: false })
  return c.ownerAction.includes('0164 then 0165') && !c.ownerAction.includes('0165 then 0164')
})())
// ⚠️ THE CARD MUST SAY WHY IT MATTERS TODAY, or it reads as a chore.
ok('a missing 0164 reports that editor_v2 is BLOCKED, not degraded',
  schemaCard({ hasZoomCount: false, hasWatchedSessions: true }).detail.includes('blocked, not degraded'))
// ⚠️ UNPROBEABLE IS NOT FINE.
ok('an unprobeable schema is unknown, never done',
  schemaCard({ hasZoomCount: null, hasWatchedSessions: true }).state === 'unknown')
ok('and it says so in words',
  schemaCard({ hasZoomCount: null, hasWatchedSessions: null }).detail.includes('not evidence'))
ok('a missing 0165 blocks the watched-session card',
  (schemaCard({ hasZoomCount: true, hasWatchedSessions: false }).blocks ?? []).includes('watched_session'))
ok('a present 0165 blocks nothing',
  (schemaCard({ hasZoomCount: true, hasWatchedSessions: true }).blocks ?? []).length === 0)

// ⚠️ BOTH PENDING FILES MUST BE NAMED BEFORE THE OWNER STARTS. Applying one and
// discovering the other afterwards is the exact failure this list prevents.
ok('a card missing both names both files, in order', (() => {
  const st = schemaCard({ hasZoomCount: false, hasWatchedSessions: false }).steps
  return st.length === 2 && st[0].id === '0164' && st[1].id === '0165'
})())
ok('a card missing only 0165 does not offer to re-apply 0164', (() => {
  const st = schemaCard({ hasZoomCount: true, hasWatchedSessions: false }).steps
  return st.length === 1 && st[0].id === '0165'
})())
ok('every step carries the file path that must actually be pasted',
  SCHEMA_STEPS.every((s) => s.file.startsWith('supabase/migrations/') && s.file.endsWith('.sql')))
ok('every step says why it matters, not what it changes',
  SCHEMA_STEPS.every((s) => typeof s.because === 'string' && s.because.length > 20))
ok('a satisfied schema offers no steps at all',
  schemaCard({ hasZoomCount: true, hasWatchedSessions: true }).steps === undefined)

// ── pilot ─────────────────────────────────────────────────────────────────
ok('no run asks for the click', pilotCard(null, { canStart: true }).ownerAction.includes('Start'))
ok('collecting is NOT an owner action',
  pilotCard({ id: 'r', status: 'collecting' }, { canStart: true }).ownerAction === null)
ok('ready_for_label is the judgment ask',
  pilotCard({ id: 'r', status: 'ready_for_label' }, { canStart: true }).ownerAction.includes('Label'))
ok('and it links to that exact run',
  pilotCard({ id: 'r7', status: 'ready_for_label' }, { canStart: true }).href === '/internal/review/visual/r7')
ok('locked is done', pilotCard({ id: 'r', status: 'locked' }, { canStart: true }).state === 'done')
ok('an undeployed pilot is blocked, not startable',
  pilotCard(null, { canStart: false }).state === 'blocked')

// ⚠️ THE STATE A REAL PILOT WAS IN TONIGHT. Eight references collected, real
// evidence for every one, zero claims, run still at `enqueued` — because
// nothing on the button path built the packet. "Still collecting" would have
// left the owner waiting for something that was never going to happen.
ok('a run that finished collecting with no packet is BLOCKED, not working',
  pilotCard({ id: 'r', status: 'enqueued' }, { canStart: true, claims: 0, collectionDone: true }).state === 'blocked')
ok('and it tells the owner the evidence is safe',
  pilotCard({ id: 'r', status: 'enqueued' }, { canStart: true, claims: 0, collectionDone: true })
    .detail.includes('evidence is safe'))
ok('and warns against starting another pilot',
  pilotCard({ id: 'r', status: 'enqueued' }, { canStart: true, claims: 0, collectionDone: true })
    .detail.includes('do not start another'))
// ⚠️ MID-FLIGHT WITH NO CLAIMS YET IS NORMAL, not stuck. Collapsing the two
// would cry wolf on every healthy run.
ok('a run still collecting with no claims yet is still just working',
  pilotCard({ id: 'r', status: 'collecting' }, { canStart: true, claims: 0, collectionDone: false }).state === 'working')
ok('a finished run WITH claims is not blocked',
  pilotCard({ id: 'r', status: 'ready_for_label' }, { canStart: true, claims: 40, collectionDone: true }).state === 'action_needed')

// ── recordings ────────────────────────────────────────────────────────────
ok('zero asks for two', recordingsCard(0).ownerAction.includes('2 more'))
ok('one asks for one, singular', recordingsCard(1).ownerAction.includes('1 more video through'))
ok('two is enough to label', recordingsCard(RECORDINGS_NEEDED).ownerAction.includes('Label'))
// ⚠️ ABSENT IS NOT ZERO — but an absent count must still render as zero-needed
// work rather than crashing the page or claiming completeness.
ok('a missing count is treated as none, not as enough', recordingsCard(undefined).ownerAction.includes('2 more'))
ok('the upload exclusion is stated where the owner reads it',
  recordingsCard(0).detail.includes('Uploads do not count'))

// ── watched session ───────────────────────────────────────────────────────
ok('no tables is blocked and names the migration',
  watchedSessionCard(null, { tablesExist: false }).detail.includes('0165'))
ok('a blocked card asks for nothing',
  watchedSessionCard(null, { tablesExist: false }).ownerAction === null)
ok('tables but no session asks for the observation',
  watchedSessionCard(null, { tablesExist: true }).ownerAction.includes('observe'))
ok('and says the machine cannot supply why',
  watchedSessionCard(null, { tablesExist: true }).detail.includes('why'))
ok('locked is done', watchedSessionCard({ status: 'locked' }, { tablesExist: true }).state === 'done')

// ── rotation ──────────────────────────────────────────────────────────────
ok('before any lock, rotation waits and asks nothing',
  rotationCard({ anyPilotLocked: false, resolved: false }).ownerAction === null)
ok('and says that is deliberate',
  rotationCard({ anyPilotLocked: false, resolved: false }).detail.includes('must not block'))
ok('after a lock it becomes due',
  rotationCard({ anyPilotLocked: true, resolved: false }).state === 'action_needed')
// ⚠️ ALL FOUR PLACES UP FRONT — discovering them one at a time is how a
// rotation half-completes and something keeps authenticating with the old key.
ok('and it names all four locations before the owner starts',
  rotationCard({ anyPilotLocked: true, resolved: false }).checklist.length === ROTATION_LOCATIONS.length
  && ROTATION_LOCATIONS.length === 4)
ok('resolved requires the old key to have been refused',
  rotationCard({ anyPilotLocked: true, resolved: true }).detail.includes('refused'))

// ── next action ───────────────────────────────────────────────────────────
const all = (over = {}) => [
  schemaCard(over.schema ?? { hasZoomCount: true, hasWatchedSessions: true }),
  pilotCard(over.pilot ?? null, { canStart: true }),
  recordingsCard(over.recordings ?? 0),
  watchedSessionCard(over.session ?? null, { tablesExist: over.tablesExist ?? true }),
  rotationCard(over.rotation ?? { anyPilotLocked: false, resolved: false }),
]
ok('schema outranks everything when it is pending',
  nextAction(all({ schema: { hasZoomCount: false, hasWatchedSessions: false } })).card === 'production_schema')
ok('otherwise the pilot click is next', nextAction(all()).card === 'visual_pilot')
// ⚠️ A BLOCKED CARD CAN NEVER BE "NEXT". Sending the owner to observe a
// creator against tables that do not exist wastes a session that cannot be
// repeated.
ok('a card blocked by the schema is never offered', (() => {
  const cards = all({ schema: { hasZoomCount: true, hasWatchedSessions: false },
    pilot: { id: 'r', status: 'locked' }, recordings: 2, tablesExist: false })
  const n = nextAction(cards)
  return n.card !== 'watched_session'
})())
ok('nothing to do returns null, not a made-up task', (() => {
  const cards = [
    schemaCard({ hasZoomCount: true, hasWatchedSessions: true }),
    pilotCard({ id: 'r', status: 'collecting' }, { canStart: true }),
    recordingsCard(2), // asks for labelling
  ]
  return nextAction(cards.slice(0, 2)) === null
})())
ok('every card name is covered by the order', CARDS.length === 5)

console.log(`owner-console selftest: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)

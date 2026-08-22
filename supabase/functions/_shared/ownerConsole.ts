// GENERATED FROM scripts/owner-console.mjs — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// THE OWNER'S REMAINING WORK, ON ONE PAGE, DERIVED FROM EVIDENCE.
//
// The owner has been carrying the sequence in their head: which migration is
// next, whether a pilot can start, whether two recordings exist yet, whether
// the key may be rotated. That is a list a person should never have to hold,
// and every item of it is already written down somewhere durable.
//
// ⚠️ SO NOTHING HERE IS REMEMBERED. Every card is computed from rows and schema
// probes at read time. A card cannot be stale, because there is nowhere for it
// to be stale FROM.
//
// ⚖️ AND IT PROBES OBJECTS, NOT A MIGRATION LEDGER. "Is 0164 applied" asked as
// "is 0164 in schema_migrations" is a question about bookkeeping; asked as
// "does render_attempts have zoom_count" it is a question about the database.
// The ledger can disagree with the schema. The schema cannot disagree with
// itself.
//
// ⚠️ THIS FILE DECIDES NOTHING A HUMAN MUST DECIDE. It reports whether evidence
// exists, never whether the evidence is good: not whether a claim is supported,
// not whether a cut sounds bad, not why a creator stopped.

/** The five things the owner can actually be asked to do. Order is the order. */
export const CARDS = Object.freeze([
  'production_schema', 'visual_pilot', 'recordings', 'watched_session', 'key_rotation',
])

/**
 * Production schema readiness, from object probes.
 *
 * ⚠️ `absent` IS A THIRD ANSWER, NOT A FALSE. A probe that could not run is not
 * a probe that found nothing — folding the two together is how "we could not
 * check" starts reading as "it is fine".
 */
export function schemaCard({ hasZoomCount, hasWatchedSessions }) {
  const missing = []
  if (hasZoomCount === false) missing.push('0164')
  if (hasWatchedSessions === false) missing.push('0165')
  const unknown = hasZoomCount === null || hasWatchedSessions === null
  if (unknown) {
    return { card: 'production_schema', state: 'unknown', ownerAction: null,
      detail: 'The schema could not be probed. This is not evidence that it is fine.' }
  }
  if (missing.length === 0) {
    return { card: 'production_schema', state: 'done', ownerAction: null,
      detail: 'render_attempts carries the 0164 columns and the watched_session tables exist.' }
  }
  return {
    card: 'production_schema', state: 'action_needed',
    ownerAction: `Apply ${missing.join(' then ')} in one pass, then run verify_0164_0165.sql`,
    // ⚖️ THE CONSEQUENCE, NOT JUST THE FACT. "0164 pending" is a chore; "the
    // worker will not claim editor_v2 work" is why it is today's chore.
    detail: missing.includes('0164')
      ? 'Until 0164 lands, the worker declines editor_v2 work entirely — it is blocked, not degraded.'
      : 'Until 0165 lands, the deployed watched-session endpoint fails on its first query.',
    blocks: missing.includes('0165') ? ['watched_session'] : [],
  }
}

/**
 * The visual pilot. ⚠️ "no run" and "a run that failed to collect" are
 * different states and must not collapse: one needs a click, the other needs
 * looking at.
 */
export function pilotCard(run, { canStart }) {
  if (!canStart) {
    return { card: 'visual_pilot', state: 'blocked', ownerAction: null,
      detail: 'pilot-start is not deployed or its tables are missing.' }
  }
  if (!run) {
    return { card: 'visual_pilot', state: 'action_needed',
      ownerAction: 'Open /internal/review/visual/start and press Start',
      detail: 'No pilot has been run. Starting one costs the quoted downloads and nothing else.' }
  }
  if (run.status === 'locked') {
    return { card: 'visual_pilot', state: 'done', ownerAction: null,
      detail: 'Labels are final and the report was computed on the server.' }
  }
  if (run.status === 'ready_for_label') {
    return { card: 'visual_pilot', state: 'action_needed',
      ownerAction: 'Label the claims, then Finish & Lock',
      detail: 'Collection finished. This is the judgment nothing else can supply.',
      href: `/internal/review/visual/${run.id}` }
  }
  // frozen / enqueued / collecting
  return { card: 'visual_pilot', state: 'working', ownerAction: null,
    detail: `Twin is still collecting (${run.status}). Nothing for you to do until it is ready.`,
    href: `/internal/review/visual/${run.id}` }
}

/** How many genuine product-origin renders exist, and how far off two is. */
export const RECORDINGS_NEEDED = 2

export function recordingsCard(eligibleCount) {
  const n = Number.isInteger(eligibleCount) ? eligibleCount : 0
  if (n >= RECORDINGS_NEEDED) {
    return { card: 'recordings', state: 'action_needed',
      ownerAction: 'Label the cut review packet',
      detail: `${n} product-origin renders exist. The packet can be built.` }
  }
  return {
    card: 'recordings', state: 'action_needed',
    ownerAction: `Record ${RECORDINGS_NEEDED - n} more video${RECORDINGS_NEEDED - n === 1 ? '' : 's'} through the teleprompter`,
    // ⚠️ THE EXCLUSION IS THE POINT. An upload is a creator testing Twin's
    // editing of someone else's footage; counting it would answer a question
    // about the product with a question about a file.
    detail: `${n} of ${RECORDINGS_NEEDED}. Uploads do not count — only videos recorded through the teleprompter.`,
  }
}

export function watchedSessionCard(session, { tablesExist }) {
  if (!tablesExist) {
    return { card: 'watched_session', state: 'blocked', ownerAction: null,
      detail: 'Waiting on 0165. The endpoint is deployed but its tables do not exist yet.' }
  }
  if (!session) {
    return { card: 'watched_session', state: 'action_needed',
      ownerAction: 'Start a watched session and observe one real creator',
      detail: 'Twin records what happened. Only you can record why.' }
  }
  if (session.status === 'locked') {
    return { card: 'watched_session', state: 'done', ownerAction: null, detail: 'Observation recorded and locked.' }
  }
  return { card: 'watched_session', state: 'action_needed',
    ownerAction: 'Finish the session you started, in the creator\'s own words',
    detail: `In progress (${session.status}).` }
}

/**
 * ⚠️ ROTATION IS NOT DUE UNTIL A PILOT LOCKS, AND IS NOT DONE UNTIL THE OLD KEY
 * IS REFUSED. Neither "the key is absent from a shell" nor "there is no .env"
 * is rotation, and this card must never render either as progress.
 */
export const ROTATION_LOCATIONS = Object.freeze([
  'Supabase dashboard (rotate)', 'Edge function secrets', 'Worker VPS environment', 'CI secrets',
])

export function rotationCard({ anyPilotLocked, resolved }) {
  if (resolved) {
    return { card: 'key_rotation', state: 'done', ownerAction: null,
      detail: 'Rotated, and the old key was proven to be refused.' }
  }
  if (!anyPilotLocked) {
    return { card: 'key_rotation', state: 'waiting', ownerAction: null,
      detail: 'Not yet. This waits for the first pilot to lock, on purpose — it must not block engineering.' }
  }
  return {
    card: 'key_rotation', state: 'action_needed',
    ownerAction: 'Rotate the service-role key in one pass',
    detail: 'A pilot has locked, so the exposed key may now be retired. All four places, one sitting.',
    checklist: [...ROTATION_LOCATIONS],
  }
}

/**
 * What the owner should do NEXT — exactly one thing, or nothing.
 *
 * ⚖️ ONE, BECAUSE A LIST OF FIVE IS THE PROBLEM THIS PAGE EXISTS TO SOLVE. A
 * card blocked by another card can never be next, so the sequence the owner was
 * holding in their head is computed here instead.
 */
export function nextAction(cards) {
  const byName = new Map(cards.map((c) => [c.card, c]))
  const blocked = new Set()
  for (const c of cards) for (const b of c.blocks ?? []) blocked.add(b)
  for (const name of CARDS) {
    const c = byName.get(name)
    if (!c || blocked.has(name)) continue
    if (c.state === 'action_needed' && c.ownerAction) return c
  }
  return null
}

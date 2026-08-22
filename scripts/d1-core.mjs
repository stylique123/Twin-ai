// D1'S LOGIC, SEPARATED FROM ITS COMMAND LINE.
//
// ⚠️ THIS EXTRACTION IS NOT TIDINESS, IT IS A PREREQUISITE — AND THE HAZARD WAS
// HIT LIVE. d1-observer.mjs runs its CLI at module scope, and the last thing it
// does with no recognised flag is `process.exit(2)`. Importing it to reuse
// BLOCKERS or validateObservation therefore KILLED the importing process. That
// is the same defect pilot-core.mjs was extracted to fix, in a second file.
//
// ⚖️ AND IT IS THE SAME CODE, MOVED, NOT REWRITTEN. Retyping the blocker
// taxonomy for a new caller would create a second authority on what the
// categories mean, and the two would drift on the first change — at which
// point two sessions "coded the same way" would not be.

/**
 * ⚠️ FROZEN BEFORE THE SESSION, NOT AFTER IT. A taxonomy invented while watching
 * is a taxonomy shaped by the first creator, and every later session gets
 * squeezed into one person's afternoon.
 *
 * ⚖️ OTHER IS NOT A FAILURE OF THE LIST, IT IS THE PRESSURE GAUGE ON IT. If OTHER
 * wins twice, the taxonomy is wrong and that is a finding — which is why the
 * verbatim note is required whenever it is chosen.
 */
export const BLOCKERS = Object.freeze({
  SCRIPT_REJECTION: 'The words were wrong — they would not say that.',
  PREMISE_REJECTION: 'The idea was wrong — not a video they would make.',
  PRODUCTION_TOO_HARD: 'They would say it, but not shoot it.',
  CAMERA_FRICTION: 'The recording step itself got in the way.',
  TIME_CONSTRAINT: 'They ran out of time, not out of willingness.',
  BROWSING_ONLY: 'They were never going to record today.',
  TECHNICAL_FAILURE: 'Something broke.',
  OTHER: 'None of these fit — say what it was.',
})

/**
 * The events a reconstructable session needs, and what each one lets the
 * observer see. ⚠️ Declared, so their ABSENCE is reportable. An uninstrumented
 * step and a step the creator skipped are indistinguishable in a timeline and
 * point at opposite fixes.
 */
export const REQUIRED_EVENTS = Object.freeze({
  page_view: 'where they were, and for how long',
  gallery_remix: 'which reference they chose',
  blueprint_generated: 'the script arrived',
  camera_opened: 'they got as far as the camera',
  recording_started: 'they actually rolled',
  recording_aborted: 'they rolled and stopped',
  edit_rendered: 'Twin produced a video',
  client_error: 'something broke in front of them',
  session_abandoned: 'where they stopped',
})

/** ⚖️ SORTED BY TIME, AND TIES BROKEN DETERMINISTICALLY. Two events in the same
 *  millisecond are common on a click that fires both; a wobbling order would
 *  make two readings of one session disagree. */
export function reconstruct(events) {
  const rows = [...events]
    .map((e) => ({ ...e, at: new Date(e.created_at ?? e.at).getTime() }))
    .filter((e) => Number.isFinite(e.at))
    .sort((a, b) => a.at - b.at
      || createHash('sha256').update(JSON.stringify(a)).digest('hex')
        .localeCompare(createHash('sha256').update(JSON.stringify(b)).digest('hex')))

  const start = rows.length ? rows[0].at : null
  return rows.map((e, i) => ({
    event: e.event,
    at: e.at,
    since_start_ms: start === null ? null : e.at - start,
    // ⚠️ THE DWELL IS UNTIL THE NEXT EVENT, and the LAST one has none. Reporting
    // zero there would say they left instantly; reporting "now minus then" would
    // grow every time somebody re-reads the session.
    dwell_ms: i + 1 < rows.length ? rows[i + 1].at - e.at : null,
    props: e.props ?? {},
  }))
}

/** What the timeline could not see. ⚠️ THIS IS THE #71 SCOPE, generated rather
 *  than remembered. */
export function missingInstrumentation(events) {
  const seen = new Set(events.map((e) => e.event))
  return Object.entries(REQUIRED_EVENTS)
    .filter(([k]) => !seen.has(k))
    .map(([k, why]) => ({ event: k, blind_to: why }))
}

/** Facts the observer should not have to retype. ⚖️ FACTS ONLY — counts and
 *  timings. Nothing here characterises WHY, because a prefilled cause is a
 *  cause the observer will accept. */
export function prefill(timeline, scriptEdits = null) {
  const count = (e) => timeline.filter((t) => t.event === e).length
  const first = (e) => timeline.find((t) => t.event === e) ?? null
  const scriptArrived = first('blueprint_generated')
  const cameraOpened = first('camera_opened')
  return {
    events_seen: timeline.length,
    reference_selected: count('gallery_remix') > 0,
    script_generated: count('blueprint_generated') > 0,
    // Time between the script arriving and the next thing they did.
    ms_on_script: scriptArrived?.dwell_ms ?? null,
    // ⚠️ FROM script_edits (0127), NOT FROM AN EVENT. That table already holds
    // the before and after text, which is strictly more than a counter. A second
    // thinner record of the same act would give two numbers that drift with no
    // way to say which is right. `null` means the table was not read, which is
    // not the same fact as zero edits.
    script_edits: scriptEdits,
    camera_opened: cameraOpened !== null,
    recordings_started: count('recording_started'),
    recordings_aborted: count('recording_aborted'),
    rendered: count('edit_rendered') > 0,
    errors: count('client_error'),
    // ⚠️ THE LAST EVENT IS WHERE THEY STOPPED, which is a fact. WHY they stopped
    // is the question this file exists to leave open.
    stopped_at: timeline.length ? timeline[timeline.length - 1].event : null,
  }
}

/** ⚠️ A BLOCKER WITHOUT THE CREATOR'S OWN WORDS IS A GUESS WITH A LABEL ON IT.
 *  The taxonomy is for counting; the verbatim is the evidence. OTHER without a
 *  note is refused outright, because OTHER is precisely the case where the
 *  category carries no information at all. */
export function validateObservation(o) {
  if (!Object.prototype.hasOwnProperty.call(BLOCKERS, o?.blocker ?? '')) {
    return 'choose a blocker from the frozen taxonomy'
  }
  const note = String(o.creatorReason ?? '').trim()
  if (o.blocker === 'OTHER' && note.length < 10) {
    return 'OTHER needs the creator\'s own words — the category says nothing on its own'
  }
  if (note.length === 0) {
    return 'record what the creator said, in their words, however short'
  }
  return null
}

export const CONSENT = `Before we start — is it OK if I watch you use this, and take notes?

  · I am watching what you do on screen and writing down the steps.
  · I will ask you why at a few points. You can say "I would rather not".
  · Nothing is recorded unless you say yes to that separately.
  · You can stop at any point and I will delete the notes.
  · There is no right way to use it. If it is confusing, that is the finding.

May I take notes?   [ yes / no ]
May I record the screen?   [ yes / no ]   (separate question, and optional)`

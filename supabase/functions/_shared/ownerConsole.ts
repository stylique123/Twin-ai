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
 * What a failed probe means, in the order the files must be applied.
 *
 * ⚠️ THE ORDER IS PART OF THE DATA, not something the reader reconstructs. Two
 * pending migrations discovered separately is how the second one gets found
 * later, by something behaving strangely.
 */
export const SCHEMA_STEPS = Object.freeze([
  {
    id: '0164',
    file: 'supabase/migrations/0164_the_quantisation_is_nobodys_fault_so_it_gets_its_own_column.sql',
    // ⚖️ THE CONSEQUENCE, NOT THE CHANGELOG. schemaCapabilities declares these
    // columns as an editor_v2 requirement and the worker drops a blocked type
    // from its claim list entirely, so this is not a degraded editor — it is an
    // editor that never picks the work up.
    because: 'Until this lands, the worker declines editor_v2 work entirely — blocked, not degraded.',
  },
  {
    id: '0165',
    file: 'supabase/migrations/0165_a_watched_session_lives_in_the_database_not_a_laptop.sql',
    because: 'Until this lands, the deployed watched-session endpoint fails on its first query.',
  },
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
  // ⚠️ EVERY PENDING FILE, NAMED, IN ORDER, BEFORE THE OWNER STARTS. Applying
  // one and discovering the other afterwards is the failure this list exists to
  // prevent. Both files are re-runnable, so a mid-pass retry is safe.
  const steps = SCHEMA_STEPS.filter((s) => missing.includes(s.id))
  return {
    card: 'production_schema', state: 'action_needed',
    ownerAction: `Apply ${missing.join(' then ')} in one pass, then run verify_0164_0165.sql`,
    steps,
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
export function pilotCard(run, { canStart, claims = null, collectionDone = false }) {
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
  // ⚠️ A RUN THAT FINISHED COLLECTING BUT HAS NO PACKET IS STUCK, NOT WORKING.
  // This is not hypothetical: a real pilot collected all eight references,
  // produced real evidence for every one, and sat at `enqueued` with zero
  // claims because nothing on the button path ever built the packet. Reporting
  // that as "still collecting" would have left the owner waiting on a thing
  // that was never going to happen.
  if (collectionDone && claims === 0) {
    return { card: 'visual_pilot', state: 'blocked', ownerAction: null,
      detail: 'Twin finished watching the videos but has not produced anything to label yet. '
        + 'The evidence is safe — do not start another pilot.',
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

// ── WHERE A CREATOR STOPS, WHICH NOTHING HAS EVER SHOWN THE OWNER ──────────
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-14, AND IT REFRAMES EVERY QUALITY DEBATE:
// 134 scripts generated · 6 camera opens · 6 recordings · 0 script edits ·
// 0 edit projects · 0 exports. 128 of 134 scripts never had a camera opened.
// `recordingFunnel.ts` recorded 41 -> 3 -> 0 -> 0 when it was written; the
// ratio has held at roughly one in twenty-two.
//
// So resolver fill rates, substance grading, borrowing reduction, the shape
// block and the niche vocabulary are all being tuned on evidence from almost
// nobody who finished a video. That is not an argument against any of them. It
// is the reason this number belongs on the owner's page rather than in a query
// somebody has to remember to run.
//
// ⚠️⚠️ AND THE CARD REFUSES TO SAY WHY, WHICH IS THE WHOLE DISCIPLINE.
// `recordingFunnel.ts` states it plainly: a funnel says where people died,
// never what killed them. 128 creators not opening the camera is equally
// consistent with a bad script, an irrelevant premise, an intimidating record
// button, no time, or somebody who was only ever clicking around — and those
// need OPPOSITE fixes. The card reports the drop and names the missing
// discriminator instead of guessing at a cause.
//
// ⚖️ AND IT IS `action_needed` ON THE INSTRUMENTATION, NOT ON THE DROP. The
// owner cannot fix a 4% record rate by being told about it; they can collect
// the one field that makes it attributable. So that is the action.

/** Below this, the funnel is describing a handful of people and should say so
 *  rather than quoting a percentage that moves when one creator records. */
export const FUNNEL_MIN_SCRIPTS = 20

export function funnelCard(counts) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null)
  const scripts = n(counts?.scripts)
  // ⚠️⚠️ `recordings` IS FINISHED TAKES ONLY, AND THAT IS THE WHOLE POINT OF THIS
  // CHANGE. Measured on production 2026-09-14: `media_assets` holds 7 rows and
  // SIX ARE `uploading` -- only ONE is `ready`. Counting the table gave
  // "147 scripts, 7 recorded, 0 exported", which reads as creators recording and
  // then abandoning. The truth is that six of seven never finished uploading,
  // which is the upload 403, a completely different fix.
  const recordings = n(counts?.recordings)
  // ⚖️ AND THE STALL IS ITS OWN NUMBER, because a take stuck mid-upload and a
  // creator who chose not to film need OPPOSITE fixes -- the same reason the
  // refusal card keeps quality and disclosure apart. Pooling them is how a
  // funnel reports a behaviour problem that is actually an infrastructure one.
  const stalledUploads = n(counts?.stalledUploads)
  // ⚠️ `edit_project_created` IS A STAGE ON PURPOSE. recordingFunnel.ts records
  // why: "A take that uploads and is then REJECTED by validation never creates
  // an edit project ... Pooling them would have reported 'nobody exports' and
  // hidden that we refused the only take anybody finished." Omitting it here
  // reproduced exactly that reading.
  const editProjects = n(counts?.editProjects)
  const exports_ = n(counts?.exports)
  const intents = n(counts?.scriptIntents)

  // ⚠️ NULL IS NOT ZERO HERE EITHER. A count that could not be read is not a
  // product with no recordings, and reporting it as one would put a false
  // crisis on the owner's page.
  if (scripts === null || recordings === null) {
    return {
      card: 'funnel', state: 'blocked', ownerAction: null,
      detail: 'The funnel counts could not be read, which is not the same as a funnel of zero.',
    }
  }

  if (scripts < FUNNEL_MIN_SCRIPTS) {
    return {
      card: 'funnel', state: 'ok', ownerAction: null,
      detail: `${scripts} script${scripts === 1 ? '' : 's'} so far — too few to read a funnel from. `
        + `${recordings} recorded.`,
    }
  }

  const rate = Math.round((recordings / scripts) * 1000) / 10
  const stalled = scripts - recordings
  // Named only when it exists, so a healthy funnel does not carry a clause
  // about a problem it does not have.
  const stallLine = stalledUploads !== null && stalledUploads > 0
    ? ` ${stalledUploads} take${stalledUploads === 1 ? '' : 's'} never finished uploading, `
      + `which is an upload failure and not a choice.`
    : ''
  const projectLine = recordings > 0 && editProjects === 0
    ? ` ${recordings} finished take${recordings === 1 ? '' : 's'} produced no edit project at all, `
      + `so nothing was refused downstream of a take -- it stopped before that.`
    : ''

  // ⚠️ THE MISSING FIELD IS NAMED, because without it the drop is
  // unattributable and any fix is a guess. `script_intent` is already defined
  // in recordingFunnel.ts and nothing collects it.
  if (intents === null || intents === 0) {
    return {
      card: 'funnel', state: 'action_needed',
      ownerAction: 'Collect script_intent — the drop cannot be attributed without it',
      detail: `${scripts} scripts, ${recordings} recorded (${rate}%), ${exports_ ?? 0} exported. `
        + `${stalled} never opened the camera, and nothing records whether they would have.`
        + `${stallLine}${projectLine} `
        + `A funnel says where people stopped, never why.`,
    }
  }

  return {
    card: 'funnel', state: 'ok', ownerAction: null,
    detail: `${scripts} scripts, ${recordings} recorded (${rate}%), ${exports_ ?? 0} exported. `
      + `${intents} said whether they would record it.${stallLine}${projectLine}`,
  }
}

// ── TWIN REFUSED A FIFTH OF ITS OWN WORK AND NOBODY READ THE NUMBER ────────
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-14, from `credit_events.reason`:
//
//   blueprint (charges)                141
//   blueprint_refund_quality            25
//   blueprint_refund (older path)        7
//   disclosure_missing                   0
//   disclosure_denied                    0
//
// 25 of 141 paid generations — 18% — were refunded because Twin judged its own
// output not good enough to charge for. That is the most direct quality signal
// the product has, it has been accruing since before this was written, and no
// loop reads it.
//
// ⚠️⚠️ AND THE WIRING STANDARD SAYS REFUSALS ARE "never collected". THEY ARE
// COLLECTED. They have been in the credits ledger all along — `refundOnce`
// passes its reason straight through to `refund_credits`. The gap was never
// gate 5; it was gate 1, a reader. Grepping first is what found that, and
// building a collector would have duplicated a working one.
//
// ⚖️ A RATE, NOT A COUNT, AND ITS DENOMINATOR IS CHARGES. "25 refunds" means
// nothing without "of 141". A refund count alone rises with traffic and would
// read as a regression on a good week.
//
// ⚖️ AND THE TWO REFUND REASONS ARE KEPT APART. `blueprint_refund_quality` is
// Twin refusing its own script; `disclosure_missing` and `disclosure_denied`
// are Twin refusing to publish a claim the creator cannot support. Pooling them
// would average a writer problem with a compliance one, and they need opposite
// fixes. Both disclosure reasons read ZERO today, which is consistent rather
// than surprising: until the negation fix landed, `disclosure_missing` could
// not fire at all, because a denial matched the phrase it denied.

/** Below this many charges a percentage moves too far on one refund to quote. */
export const REFUSAL_MIN_CHARGES = 20

export function refusalCard(counts) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null)
  const charges = n(counts?.charges)
  const quality = n(counts?.qualityRefunds)
  const disclosure = n(counts?.disclosureRefusals)

  // ⚠️ NULL IS NOT ZERO. A count that could not be read is not a product that
  // never refunded anything, and reporting it as one would put a false all-clear
  // on the owner's page.
  if (charges === null || quality === null) {
    return {
      card: 'refusals', state: 'blocked', ownerAction: null,
      detail: 'The refund counts could not be read, which is not the same as no refunds.',
    }
  }

  if (charges < REFUSAL_MIN_CHARGES) {
    return {
      card: 'refusals', state: 'ok', ownerAction: null,
      detail: `${charges} paid generation${charges === 1 ? '' : 's'} so far — too few to quote a rate from. `
        + `${quality} refunded on quality.`,
    }
  }

  const rate = Math.round((quality / charges) * 1000) / 10
  const disclosureLine = disclosure === null || disclosure === 0
    ? ''
    : ` ${disclosure} refused on disclosure, which is a different failure and needs a different fix.`

  // ⚠️ THE CARD DOES NOT SAY WHICH SCRIPTS OR WHY. It reports that Twin declined
  // to charge, at what rate, against what denominator. Naming a cause would be
  // the same overreach the funnel card refuses: a refund rate is consistent with
  // a weak writer, a thin brief, an unusable reference, or a strict gate.
  return {
    card: 'refusals', state: 'ok', ownerAction: null,
    detail: `${quality} of ${charges} paid generations (${rate}%) were refunded because Twin `
      + `judged its own script not worth charging for.${disclosureLine} `
      + `This says Twin declined, never why.`,
  }
}

// ── CREATORS STUCK ON AN OLDER EXTRACTOR ────────────────────────────────────
//
// ⚠️ THIS CARD IS THE READER THAT MAKES 0214's COLUMN LEGAL. The dominant defect
// class in this repository is a column written and never read, and a version
// stamp is the easiest possible instance of it: it is metadata, it looks
// self-evidently useful, and nothing has to consult it for the write to succeed.
// So the stamp and its reader land together.
//
// ⚖️ AND THE ACTION IS A RE-MINE, WHICH COSTS MODEL CALLS. That is why the card
// names the number of VOICES rather than the number of rows: rows say how much
// material is stale, voices say what fixing it costs, and only the second is a
// decision the owner can price.
//
// ⚖️ IT NEVER REPORTS `action_needed` ON A VERSION IT CANNOT SEE. A store with no
// stamped rows at all is the state on the day 0214 lands — every row NULL, every
// voice "stale" — and shouting about a cohort of everybody before a single new
// scan has run would be reporting the migration, not a problem. The floor below
// is what keeps that from happening.

/** Below this many stale voices, a re-mine is not worth an owner interruption:
 *  the next ordinary scan will pick them up. */
export const REMINE_MIN_VOICES = 3

/**
 * @param cohort the shape returned by `remineCohort` in @twinai/shared.
 * @param currentVersion the extractor running today.
 */
export function remineCard(cohort, currentVersion) {
  // ⚠️ NULL IS NOT AN EMPTY COHORT. A query that failed is not a store with
  // nothing stale in it, and reporting it as one would tell the owner that a
  // problem they have is solved.
  if (!cohort || !Array.isArray(cohort.voices)) {
    return {
      card: 'extractor_remine', state: 'blocked', ownerAction: null,
      detail: 'The extractor cohort could not be read, which is not the same as nothing being stale.',
    }
  }
  const voices = cohort.voices.length
  const stale = typeof cohort.staleRows === 'number' ? cohort.staleRows : 0
  const current = typeof cohort.currentRows === 'number' ? cohort.currentRows : 0
  if (voices === 0) {
    return {
      card: 'extractor_remine', state: 'done', ownerAction: null,
      detail: `Every stored row was written by extractor v${currentVersion}.`,
    }
  }
  // ⚠️ NOTHING CURRENT AT ALL MEANS THE STAMP IS NEW, NOT THAT THE STORE IS OLD.
  // On the day 0214 lands, every row is NULL and every voice is in the cohort.
  // That is the migration's own shadow and is reported as such, once, instead of
  // as an emergency spanning the entire product.
  if (current === 0) {
    return {
      card: 'extractor_remine', state: 'ok', ownerAction: null,
      detail: `No row carries an extractor version yet, so all ${voices} voice${voices === 1 ? '' : 's'} `
        + `read as stale. This is the stamp being new; the next scan of each creator records it.`,
    }
  }
  const neverStamped = cohort.voices.filter((v) => v && v.oldestVersion === null).length
  const stampedOld = voices - neverStamped
  const detail = `${stale} row${stale === 1 ? '' : 's'} across ${voices} voice${voices === 1 ? '' : 's'} `
    + `predate extractor v${currentVersion}`
    + (neverStamped > 0 ? ` (${neverStamped} never stamped` + (stampedOld > 0 ? `, ${stampedOld} on an older version)` : ')') : '')
    + `. Those creators only ever get what the prompt could ask for on the day they were scanned.`
  if (voices < REMINE_MIN_VOICES) {
    return { card: 'extractor_remine', state: 'ok', ownerAction: null, detail }
  }
  return {
    card: 'extractor_remine', state: 'action_needed',
    ownerAction: `Re-mine ${voices} voice${voices === 1 ? '' : 's'} on extractor v${currentVersion}`,
    detail,
  }
}

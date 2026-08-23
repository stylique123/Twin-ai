// GENERATED FROM scripts/pilot-core.mjs — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// THE PILOT'S LOGIC, SEPARATED FROM ITS COMMAND LINE.
//
// ⚠️ THIS EXTRACTION IS NOT TIDINESS, IT IS A PREREQUISITE. label-packet.mjs and
// frame-pilot-cohort.mjs each run their CLI at module scope -- the last thing
// label-packet does with no recognised flag is `process.exit(2)`. Importing
// either one to reuse `selectCohort` or `aggregate` would therefore KILL the
// importing process. The end-to-end pilot runner cannot exist until the deciding
// logic lives somewhere with no side effects.
//
// ⚖️ AND IT IS THE SAME CODE, MOVED, NOT REWRITTEN. Retyping `aggregate` or
// `selectCohort` for the new caller would create a second authority on what a
// pass rate means, and the two would drift on the first change. The selftests
// that covered these functions now cover them here.

import { createHash } from 'node:crypto'

export const DEFAULT_SIZE = 8
/** ⚠️ TEN IS THE CEILING AND IT IS DELIBERATE. This is the step before deciding
 *  whether the visual pass is trustworthy enough to touch 332 references. A
 *  "pilot" of 40 has already made that decision by spending it. */
export const MAX_SIZE = 10

/** ⚖️ BELOW THE BACKLOG, WHICH IS ITSELF BELOW CREATOR WORK. The queue orders by
 *  priority desc. A pilot that preempts a creator's scan has cost more than it
 *  can learn. */
export const PILOT_PRIORITY = -20

/** The creator, from a TikTok reference url. ⚠️ Ten videos from one creator are
 *  ten samples of one visual situation, which is the failure mode a "random"
 *  draw hides. */
export const handleOf = (url) => {
  const m = /@([^/?#]+)/.exec(String(url ?? ''))
  return m ? m[1].toLowerCase() : null
}

/** ⚠️ TWO BANDS, NOT ONE. A transcript of exactly zero characters is a different
 *  fact from one of six: the first is silence or a failure to hear anything at
 *  all, the second is a video that made a sound we could read and it was not
 *  speech. Merging them would let the draw come entirely from the 281. */
export const bandOf = (chars) => (Number(chars) === 0 ? 'chars_zero' : 'chars_tiny')

// ── WHICH POPULATION THE PILOT DRAWS FROM ───────────────────────────────────
//
// ⚠️ THE FIRST PILOT COULD NOT ANSWER ITS OWN QUESTION, AND THE COHORT IS WHY.
// #58 asks whether frames scheduled on CONTENT BEATS support stronger claims
// than four arbitrary points. Beats come from the content profile, and a silent
// reference has no content profile -- so a cohort drawn entirely from
// `no_speech` exercises the `uniform` arm ONLY. armComparison already reports
// that honestly as NOT RUN, which is the finding: the comparison was never a
// close result, it was an absent one.
//
// Measured on run 7204de6f, the packet the owner actually opened:
//   performance.talkingHead   false on 8 of 8   -- one value, no variation
//   performance.screenInteraction false on 8 of 8
//   primaryMode               unanswered on 8 of 8
// Silent TikToks are wide shots, text cards and b-roll. A sample of them can
// show whether the visual pass reads THOSE correctly; it cannot show whether it
// RECOGNISES a person talking to camera, because there is not one to find.
//
// ⚖️ SO THE POPULATION BECOMES A NAMED CHOICE RATHER THAN A HARD-CODED FILTER,
// and each choice carries its own selection_version. The version is what makes
// two runs comparable or not; changing which rows are eligible while keeping
// the old version string would make an incomparable pair look like a pair.
export const COHORT_NO_SPEECH = 'no_speech'
export const COHORT_SPEECH = 'speech'
export const COHORTS = Object.freeze([COHORT_NO_SPEECH, COHORT_SPEECH])

/**
 * ⚠️ THE SPLIT IS PINNED, NOT COMPUTED AT DRAW TIME. 645 is the measured median
 * transcript length over the 387 clean with-speech profiles present on
 * 2026-08-23. Recomputing the median from the live pool on every draw would
 * move the band boundary as the pool grows, so two runs a month apart would
 * silently be stratified differently while both claiming the same
 * selection_version. A stated constant can be argued with; a moving one cannot
 * even be noticed.
 *
 * ⚖️ AND THE BANDS ARE NOT COSMETIC. A 200-character video and a 2000-character
 * one have different beat DENSITIES, which is precisely the variable the arm
 * comparison is about. Drawing only from one end would answer the question for
 * one density and report it as the answer.
 */
export const SPEECH_BAND_SPLIT_CHARS = 645
export const speechBandOf = (chars) =>
  (Number(chars) < SPEECH_BAND_SPLIT_CHARS ? 'speech_short' : 'speech_long')

/** The bands a cohort stratifies on, and the function that assigns them. */
export const COHORT_BANDS = Object.freeze({
  [COHORT_NO_SPEECH]: { bands: ['chars_zero', 'chars_tiny'], bandOf },
  [COHORT_SPEECH]: { bands: ['speech_short', 'speech_long'], bandOf: speechBandOf },
})

/**
 * ⚠️ A NEW POPULATION MUST NOT REUSE THE OLD VERSION STRING. selection_version
 * is the only thing a later reader has to tell whether two runs were drawn the
 * same way. `chars_zero_tiny_v1` describes bands that do not exist in the
 * speech cohort at all.
 */
export const SELECTION_VERSIONS = Object.freeze({
  [COHORT_NO_SPEECH]: 'chars_zero_tiny_v1',
  [COHORT_SPEECH]: 'speech_short_long_v1',
})

export function selectionVersionFor(cohort) {
  const v = SELECTION_VERSIONS[cohort]
  if (!v) throw new Error(`unknown cohort ${JSON.stringify(cohort)} — expected one of ${COHORTS.join(', ')}`)
  return v
}

const rank = (url) => createHash('sha256').update(String(url)).digest('hex')

/**
 * Draw the cohort.
 *
 * ⚖️ ONE PER CREATOR, ALTERNATING BANDS, ORDERED BY A DIGEST OF THE URL. The
 * digest is what makes it re-drawable: same rows and same size give the same
 * cohort on any machine, so a later argument about the sample is settleable.
 */
export function selectCohort(rows, size = DEFAULT_SIZE, cohort = COHORT_NO_SPEECH) {
  const n = Math.max(1, Math.min(MAX_SIZE, Number(size) || DEFAULT_SIZE))
  const spec = COHORT_BANDS[cohort]
  // ⚠️ AN UNKNOWN COHORT REFUSES RATHER THAN FALLING BACK. Defaulting to the
  // no-speech bands would draw a silent sample for a caller that asked for a
  // speaking one and label it with whatever version string it passed.
  if (!spec) throw new Error(`unknown cohort ${JSON.stringify(cohort)} — expected one of ${COHORTS.join(', ')}`)
  const bandFn = spec.bandOf
  const seen = new Set()
  const bands = Object.fromEntries(spec.bands.map((b) => [b, []]))
  const [BAND_A, BAND_B] = spec.bands

  for (const r of [...rows].sort((a, b) => rank(a.url).localeCompare(rank(b.url)))) {
    const h = handleOf(r.url)
    // A url with no handle is still a reference; it just cannot be deduplicated
    // by creator, so it is kept rather than silently dropped.
    if (h !== null) {
      if (seen.has(h)) continue
      seen.add(h)
    }
    bands[bandFn(r.transcript_chars)].push(r)
  }

  // ⚠️ ALTERNATE, DO NOT SPLIT IN HALF. The bands are 51 and 281 deep; a
  // proportional draw would give the zero-character band one slot out of eight
  // and call it represented.
  const out = []
  for (let i = 0; out.length < n && (bands[BAND_A].length || bands[BAND_B].length); i++) {
    const first = i % 2 === 0 ? BAND_A : BAND_B
    const second = first === BAND_A ? BAND_B : BAND_A
    const pick = bands[first].shift() ?? bands[second].shift()
    if (pick) out.push(pick)
  }
  return out
}

/**
 * ⚠️ THE FOUR ANSWERS, AND WHY THERE ARE FOUR. Three would collapse the two ways
 * a claim fails: a claim the frames CONTRADICT and a claim whose cited frame was
 * simply the wrong one are different defects with different fixes -- the first
 * is the model seeing wrongly, the second is the citation machinery. Merging
 * them would leave "the model is 30% wrong" hiding a prompt bug.
 *
 * ⚖️ AND INDETERMINATE IS NOT A SKIP. It is the finding that four frames cannot
 * settle this question, which is exactly what the pilot needs to know before
 * anyone spends 332 downloads.
 */
export const LABELS = Object.freeze({
  SUPPORTED: 'The frames show this.',
  UNSUPPORTED: 'The frames contradict this.',
  INDETERMINATE: 'These frames cannot settle it.',
  WRONG_EVIDENCE: 'The claim may be right, but this is not the frame that shows it.',
})

/** ⚠️ DECLARED, NOT WALKED. Reflecting over the object would silently stop
 *  covering a field the model returned as null, and a claim that is absent is
 *  exactly the thing worth noticing. The totality selftest holds this against
 *  the type. */
export const CLAIM_PATHS = Object.freeze([
  'primaryMode',
  'people.count',
  'setting.changes', 'setting.complexity',
  'performance.talkingHead', 'performance.walking', 'performance.acting',
  'performance.productInteraction', 'performance.screenInteraction',
  'camera.framingChanges', 'camera.positionChanges', 'camera.shotType',
  'requirements.physicalProduct', 'requirements.secondPerson',
  'requirements.multipleLocations', 'requirements.unusualProps',
])

/** For the categorical fields the human may also supply the correct value.
 *  ⚖️ A BOOLEAN NEEDS NO PICKER: UNSUPPORTED on `walking: true` already says
 *  false, and offering a second control to say it again invents disagreement
 *  between two answers to one question. */
export const CANONICAL_VALUES = Object.freeze({
  primaryMode: ['talking_head', 'demo', 'voiceover_broll', 'screen_capture', 'skit', 'other'],
  'people.count': ['one', 'multiple'],
  'setting.complexity': ['simple', 'moderate', 'complex'],
  'camera.shotType': ['close', 'medium', 'wide'],
})

const at = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)

/**
 * Turn one reference's visual profile into the list of things a human answers.
 *
 * ⚠️ A NULL FIELD IS A ROW, NOT A GAP. "The model did not answer this" is a
 * finding about the prompt, and dropping those rows would make the pass look
 * more complete the worse it did.
 */
export function flattenClaims(url, visualProfile) {
  return CLAIM_PATHS.map((path) => {
    const obs = at(visualProfile, path)
    const answered = obs != null && typeof obs === 'object' && 'value' in obs
    return {
      url,
      path,
      answered,
      value: answered ? obs.value : null,
      // ⚖️ THE CITATION IS THE WHOLE POINT OF SHOWING A FRAME. A claim with no
      // citation cannot be WRONG_EVIDENCE, because there is no evidence to be
      // wrong -- it can only be unanswered.
      frames: answered && obs.evidence?.frames ? [...obs.evidence.frames] : [],
      canonical: CANONICAL_VALUES[path] ?? null,
    }
  })
}

/** ⚠️ STABLE ACROSS RUNS. The order a human sees claims in changes how they
 *  answer, so a packet that reshuffled between sessions would make two sessions
 *  incomparable. Digest order, same reasoning as the cohort draw. */
export function orderClaims(claims) {
  return [...claims].sort((a, b) =>
    createHash('sha256').update(`${a.url}|${a.path}`).digest('hex')
      .localeCompare(createHash('sha256').update(`${b.url}|${b.path}`).digest('hex')))
}

export const isLabel = (l) => Object.prototype.hasOwnProperty.call(LABELS, l)

/**
 * ⚠️ REFUSES ON AN OPEN SESSION, AND THAT IS THE FEATURE. Seeing the running
 * accuracy while labels remain is how the last few start agreeing with the
 * first few. The lock is what makes the number evidence rather than a mood.
 */
export function aggregate(session) {
  if (session?.locked !== true) {
    return { refused: 'session is not locked — lock it before looking at the numbers' }
  }
  const labels = (session.labels ?? []).filter((l) => isLabel(l.label))
  const dist = {}
  for (const k of Object.keys(LABELS)) dist[k] = 0
  for (const l of labels) dist[l.label]++

  const answered = labels.filter((l) => l.answered)
  // ⚠️ NOT AN ANSWER, AND NOT A HUMAN'S FAULT. These are claims the model
  // declined to make. They are counted and named rather than dropped, because
  // "Twin said nothing about this" is a result about Twin.
  const notAnswered = (session.labels ?? []).filter((l) => !l.answered)
  // ⚠️ THE DENOMINATOR EXCLUDES NOTHING IT SHOULD COUNT. A claim the model never
  // made is not a claim it got right, and a denominator that quietly drops
  // non-answers turns a thin pass into a good one.
  const supported = dist.SUPPORTED
  // ⚠️ THE NUMERATOR MUST COME FROM THE SAME POPULATION AS ITS DENOMINATOR.
  // Running the pilot end to end printed "500% of what the model answered":
  // every SUPPORTED label was divided by only the claims the model actually
  // answered. A rate above 100% is at least loud -- the same mistake landing at
  // 90% would have read as a good result and nobody would have looked twice.

  return {
    claims_shown: session.labels?.length ?? 0,
    claims_labelled: labels.length,
    claims_unlabelled: (session.labels?.length ?? 0) - labels.length,
    model_answered: answered.length,
    model_did_not_answer: notAnswered.length,
    distribution: dist,
    // ⚖️ TWO RATES, BECAUSE THEY ANSWER DIFFERENT QUESTIONS. Against everything
    // the model was ASKED is "how much of the visual pass is usable". Against
    // what it ANSWERED is "when it speaks, is it right". Reporting only the
    // second is how a pass that answers three fields out of fifteen scores 100%.
    // ⚠️ THE DENOMINATOR MUST HOLD THE MODEL'S NON-ANSWERS AND NOT THE HUMAN'S.
    // These are two different reasons a row carries no label and they must not
    // be treated alike:
    //
    //   answered = false, no label   the model declined. There is nothing for a
    //                                person to judge, and it IS a claim the
    //                                visual pass failed to make -- it belongs in
    //                                the denominator. Dropping it turns "103 of
    //                                120 answered" into a rate over 103.
    //   answered = true,  no label   the reviewer has not got to it yet. We do
    //                                not know the answer, so counting it as
    //                                not-supported understates a pass for a
    //                                reason that has nothing to do with the
    //                                model.
    //
    // ⚖️ AT LOCK ONLY THE FIRST KIND CAN EXIST -- the finish gate still requires
    // a label on every answered claim -- so the two coincide in a real report.
    // They are still separated here, because aggregate() is handed sessions
    // that were not built by that gate.
    supported_of_all_asked: supportedRate(
      (session.labels ?? []).filter((l) => isLabel(l.label) || l.answered !== true),
      { answeredOnly: false },
    ),
    supported_of_answered: supportedRate(labels, { answeredOnly: true }),
    // The citation machinery is a separate defect from the seeing.
    wrong_evidence_rate: labels.length === 0 ? null : dist.WRONG_EVIDENCE / labels.length,
  }
}

/**
 * What the session cost the human, from the event log.
 *
 * ⚖️ THIS IS THE ONLY INPUT TO #69. The requirements come from what was slow and
 * repetitive, not from a design memo written before anyone had done it once.
 */
export function friction(events) {
  const answers = events.filter((e) => e.kind === 'label')
  const gaps = []
  for (let i = 0; i < answers.length; i++) {
    const prev = i === 0 ? events.find((e) => e.kind === 'session_start') : answers[i - 1]
    if (prev) gaps.push(answers[i].at - prev.at)
  }
  const sorted = [...gaps].sort((a, b) => a - b)
  // ⚠️ TWO NUMBERS, BECAUSE A RELABEL IS AN ANSWER BUT NOT A NEW CLAIM. Running
  // the packet against a stub found this: one claim answered twice reported
  // `claims_answered: 2` beside `claims_labelled: 1`, which reads as a counting
  // bug in the aggregate rather than a backtrack in the session. Effort and
  // coverage are different quantities and #69 needs both.
  const distinctClaims = new Set(answers.map((a) => a.index)).size
  return {
    answers_given: answers.length,
    claims_answered: distinctClaims,
    // ⚠️ MEDIAN, NOT MEAN. One interruption -- a phone call mid-session -- moves
    // a mean enough to invent a usability problem that was a lunch break.
    median_ms_per_claim: sorted.length === 0 ? null : sorted[Math.floor(sorted.length / 2)],
    slowest_ms: sorted.length === 0 ? null : sorted[sorted.length - 1],
    // A claim answered twice is a claim the packet made hard to answer once.
    // ⚠️ A BACKTRACK IS AN ANSWER REPLACED. A REVISIT IS A CLAIM RETURNED TO.
    // They are not the same and the spec asks for both: somebody who answers,
    // walks away, comes back and answers the SAME WAY has told you the claim was
    // hard to settle even though nothing changed. Counting only relabels would
    // score that session as frictionless.
    backtracks: events.filter((e) => e.kind === 'relabel').length,
    claims_revisited: (() => {
      const seen = new Map()
      for (const e of answers) seen.set(e.index, (seen.get(e.index) ?? 0) + 1)
      return [...seen.values()].filter((n) => n > 1).length
    })(),
    // ⚖️ AND HOW THEY MOVED, since a reviewer stepping back and forth through
    // the queue is a different signal from one answering straight through.
    navigations: events.filter((e) => e.kind === 'nav').length,
    // Keyboard vs mouse: a reviewer who never leaves the keyboard says the
    // shortcuts work; one who clicks every time says they were never found.
    keyboard_actions: events.filter((e) => e.kind === 'key').length,
    // Reaching for a different frame means the packet showed the wrong one first.
    evidence_frame_changes: events.filter((e) => e.kind === 'frame_change').length,
    skipped: events.filter((e) => e.kind === 'skip').length,
  }
}

// ─────────────────────── the frozen sample, and its states ───────────────────

/**
 * ⚠️ THE SAMPLE IS FROZEN BEFORE ANY MODEL RESULT EXISTS, AND THE DIGEST IS WHAT
 * MAKES THAT CHECKABLE. Substituting a reference after seeing results is
 * post-hoc subsetting — the same defect the #72 pre-registration was written to
 * prevent, where choosing "the worst three" after the fact would have produced a
 * number nobody could defend. A manifest that can be silently edited is not a
 * pre-registration, it is a note.
 */
export const manifestDigest = (urls) =>
  createHash('sha256').update([...urls].sort().join('\n')).digest('hex')

export function freezeManifest(cohort, size) {
  const urls = cohort.map((r) => r.url)
  return {
    size_requested: size,
    size_frozen: urls.length,
    urls,
    digest: manifestDigest(urls),
    bands: {
      chars_zero: cohort.filter((r) => bandOf(r.transcript_chars) === 'chars_zero').length,
      chars_tiny: cohort.filter((r) => bandOf(r.transcript_chars) === 'chars_tiny').length,
    },
    creators: new Set(cohort.map((r) => handleOf(r.url))).size,
  }
}

/** ⚠️ REFUSES A CHANGED SAMPLE RATHER THAN REPORTING ONE. */
export function assertManifestUnchanged(manifest, urlsNow) {
  const now = manifestDigest(urlsNow)
  if (now !== manifest.digest) {
    return `the pilot sample changed after it was frozen: manifest ${manifest.digest.slice(0, 12)} `
      + `but the rows in hand digest to ${now.slice(0, 12)}. Choosing references after seeing `
      + 'results is post-hoc subsetting; start a new pilot rather than editing this one.'
  }
  return null
}

/**
 * ⚖️ THREE TERMINAL STATES, AND `running` IS NOT ONE. A poll that treated
 * "nothing yet" as a result would report a pilot as finished the moment it
 * started. The states are read off the reference row, not off the job, because
 * the row is what survives.
 */
export const TERMINAL = ['READY_FOR_LABEL', 'FAILED', 'UNREADABLE']

export function pilotState(row) {
  if (!row) return 'running'
  // Looked, and produced claims a human can check.
  if (row.visual_profile !== null && row.visual_profile !== undefined) return 'READY_FOR_LABEL'
  // ⚠️ LOOKED AND SAW NOTHING IS NOT THE SAME AS COULD NOT LOOK. `UNREADABLE`
  // is a finding about the video; `FAILED` is a finding about the attempt. The
  // pilot's whole question is whether frames can read these references, and
  // merging the two would answer it with the box's problems.
  if (typeof row.frames_sampled === 'number') return 'UNREADABLE'
  if (row.visual_failure_code) return 'FAILED'
  return 'running'
}

export function progressOf(rows, manifest) {
  const byUrl = new Map(rows.map((r) => [r.url, r]))
  const states = manifest.urls.map((u) => ({ url: u, state: pilotState(byUrl.get(u)), row: byUrl.get(u) ?? null }))
  const count = (s) => states.filter((x) => x.state === s).length
  return {
    states,
    ready: count('READY_FOR_LABEL'),
    failed: count('FAILED'),
    unreadable: count('UNREADABLE'),
    running: count('running'),
    done: states.every((x) => TERMINAL.includes(x.state)),
  }
}

/** ⚠️ THE DENOMINATOR IS THE FROZEN SAMPLE, NOT THE SURVIVORS. Reporting rates
 *  over the references that happened to work is how a pilot that half failed
 *  reports a clean pass. */
export function attrition(progress) {
  const n = progress.states.length
  return {
    selected: n,
    ready_for_label: progress.ready,
    unreadable: progress.unreadable,
    failed: progress.failed,
    // Stated as a fraction of what was SELECTED, so a 6-of-8 pilot cannot be
    // read as 100%.
    assessed_of_selected: n === 0 ? null : progress.ready / n,
    failures_by_code: progress.states
      .filter((s) => s.state === 'FAILED' || s.state === 'UNREADABLE')
      .reduce((acc, s) => {
        const c = s.row?.visual_failure_code ?? (s.state === 'UNREADABLE' ? 'NO_CLAIMS_FROM_FRAMES' : 'UNKNOWN')
        acc[c] = (acc[c] ?? 0) + 1
        return acc
      }, {}),
  }
}

// ─────────────────────────── what #69 should be ──────────────────────────────

/**
 * Turn the measured friction into a scope, so nobody writes a design memo.
 *
 * ⚠️ IT PROPOSES ONLY WHAT THE NUMBERS SUPPORT, and says which number supports
 * each item. A brief that listed every plausible improvement would be a wish
 * list wearing evidence as a costume — and the whole reason for labelling
 * before building was to stop exactly that.
 *
 * ⚖️ IT NEVER PROPOSES AUTOMATING THE JUDGEMENT. No item here may suggest a
 * model pre-filling, ranking or agreeing with a label: that is the one thing the
 * pilot exists to keep human, and a brief generated from friction would
 * otherwise reach for it first, because judgement is always the slowest step.
 */
export function briefFor69(fr, agg, slow = []) {
  const items = []
  const sec = (ms) => Math.round((ms ?? 0) / 100) / 10

  if ((fr.median_ms_per_claim ?? 0) > 15_000) {
    items.push({
      change: 'Preload the next claim and its frames while the current one is on screen.',
      because: `median ${sec(fr.median_ms_per_claim)}s per claim — the wait is a visible share of it.`,
      evidence: 'median_ms_per_claim',
    })
  }
  if (fr.evidence_frame_changes > Math.max(2, fr.claims_answered * 0.15)) {
    items.push({
      change: 'Show every sampled frame at once, not only the cited ones.',
      because: `${fr.evidence_frame_changes} frame enlargements across ${fr.claims_answered} claims — `
        + 'the packet showed the wrong frame first often enough to matter.',
      evidence: 'evidence_frame_changes',
    })
  }
  if (fr.backtracks > Math.max(1, fr.claims_answered * 0.1)) {
    items.push({
      change: 'Let a claim be revised without leaving it, and show the previous answer.',
      because: `${fr.backtracks} claims were answered twice — the packet made them hard to answer once.`,
      evidence: 'backtracks',
    })
  }
  if (fr.skipped > 0) {
    items.push({
      change: 'Collect skipped claims into an explicit second pass instead of ending the queue.',
      because: `${fr.skipped} skipped — a skip currently disappears until somebody notices the counter.`,
      evidence: 'skipped',
    })
  }
  if ((agg?.wrong_evidence_rate ?? 0) > 0.15) {
    items.push({
      change: 'Fix the citation machinery before the prompt.',
      because: `${Math.round(agg.wrong_evidence_rate * 100)}% WRONG_EVIDENCE — the model is being `
        + 'judged on frames it did not mean, which is a different defect from seeing wrongly.',
      evidence: 'wrong_evidence_rate',
    })
  }
  if ((agg?.claims_unlabelled ?? 0) > 0) {
    items.push({
      change: 'Make the unanswered remainder visible before the lock, not after.',
      because: `${agg.claims_unlabelled} claims were locked unanswered.`,
      evidence: 'claims_unlabelled',
    })
  }

  // ⚠️ A FIELD THAT IS SLOW EVERY TIME IS A PACKET PROBLEM, NOT A MODEL ONE --
  // the question is unclear or its evidence is hard to find. That is the
  // difference between #69 rewording a prompt and #69 changing what is on
  // screen, and the overall median cannot distinguish them.
  const slowest = slow[0]
  if (slowest && slowest.labelled >= 3 && slowest.median_ms > 2 * (fr.median_ms_per_claim ?? 0)) {
    items.push({
      change: `Put ${slowest.path} last, or show more evidence for it.`,
      because: `${Math.round(slowest.median_ms / 100) / 10}s median against `
        + `${Math.round((fr.median_ms_per_claim ?? 0) / 100) / 10}s overall, across ${slowest.labelled} labels.`,
      evidence: 'slowest_fields',
    })
  }

  return {
    // ⚠️ AN EMPTY BRIEF IS A RESULT. "The packet was fine" is a finding, and
    // inventing work to look thorough would spend a day proving it wrong.
    items,
    verdict: items.length === 0
      ? 'No friction crossed a threshold. #69 does not need building yet — label the next tranche with this packet.'
      : `${items.length} change(s) earned by measurement.`,
    // Stated so a reader can disagree with the thresholds rather than the list.
    thresholds: 'median >15s/claim; frame changes >15% of claims; backtracks >10%; any skip; '
      + 'WRONG_EVIDENCE >15%; any unanswered claim at lock.',
  }
}

/**
 * ⚠️ WHAT WAS ACTUALLY REVIEWED, DIGESTED, so the locked labels stay attached to
 * the object they judged. A visual profile can be regenerated: re-run the pass
 * and `primaryMode` may come back a different value citing a different frame.
 * Without this, last week's labels would silently appear to be about this
 * week's claims, and the accuracy number would describe a comparison nobody
 * made.
 *
 * ⚖️ THE CLAIM AND ITS EVIDENCE ARE DIGESTED SEPARATELY, because they change for
 * different reasons and the difference is the finding. A claim digest that moved
 * while the evidence held means the model changed its mind about the same
 * frames; evidence moving underneath an unchanged claim means the sample was
 * re-drawn and the citation now points somewhere else.
 */
export const claimsDigest = (labels) => createHash('sha256').update(
  [...labels]
    .map((l) => `${l.url}|${l.path}|${JSON.stringify(l.value)}|${(l.frames ?? []).join(',')}`)
    .sort().join('\n'),
).digest('hex')

/** Digest of the FRAME BYTES that were on screen, via the sha256 each row
 *  already stores. ⚠️ Not the storage paths: a path is stable across a re-upload
 *  that changed the picture, which is exactly the substitution worth catching. */
export const evidenceDigest = (frames) => {
  // ⚠️ NO FRAMES DIGESTS TO `null`, NOT TO THE HASH OF THE EMPTY STRING. Running
  // the pilot printed `evidence e3b0c44298fc` when no frame rows came back --
  // the sha256 of nothing, wearing the costume of a real digest. A reader would
  // have taken it as evidence captured. Absent is not zero, and the pair of
  // digests is only worth printing if one of them cannot quietly mean nothing.
  if (!frames || frames.length === 0) return null
  return createHash('sha256').update(
    [...frames].map((f) => `${f.url}|${f.frame_index}|${f.sha256}`).sort().join('\n'),
  ).digest('hex')
}

/**
 * ⚠️ THE ONE PLACE A SUPPORTED-RATE IS COMPUTED, because getting it wrong is the
 * defect this repo keeps re-committing. `aggregate` printed 500% and
 * `bySituation` printed 350%, both by dividing EVERY supported label by only the
 * claims the model ANSWERED — a numerator and denominator from different
 * populations. Two separate fixes would have left a third site to find later.
 *
 * ⚖️ AND THE DENOMINATOR IS NAMED IN THE CALL, so a reader can see which
 * question is being answered: "of everything asked" and "of what it answered"
 * are different numbers and both are worth having.
 */
export function supportedRate(labels, { answeredOnly }) {
  const pool = answeredOnly ? labels.filter((l) => l.answered) : labels
  if (pool.length === 0) return null
  return pool.filter((l) => l.label === 'SUPPORTED').length / pool.length
}

/**
 * ⚠️ WHICH FIELDS THE MODEL GETS WRONG, not just how often it is wrong. An
 * overall 70% can be a uniformly mediocre pass or a good one with two broken
 * fields, and those have opposite fixes: retune the prompt, or drop two fields.
 * The overall rate cannot tell them apart, which is why it is not enough on its
 * own.
 */
export function byField(labels) {
  const out = {}
  for (const l of labels) {
    const f = (out[l.path] ??= { asked: 0, answered: 0, supported: 0, supportedAnswered: 0,
      unsupported: 0, indeterminate: 0, wrong_evidence: 0 })
    f.asked++
    if (l.answered) f.answered++
    if (l.label === 'SUPPORTED') f.supported++
    if (l.answered && l.label === 'SUPPORTED') f.supportedAnswered++
    if (l.label === 'UNSUPPORTED') f.unsupported++
    if (l.label === 'INDETERMINATE') f.indeterminate++
    if (l.label === 'WRONG_EVIDENCE') f.wrong_evidence++
  }
  for (const f of Object.values(out)) {
    // ⚖️ NULL WHEN THE MODEL NEVER ANSWERED THIS FIELD. Zero would say it got
    // the field wrong every time, which is a different and much worse claim
    // than never having spoken.
    f.supported_of_answered = f.answered === 0 ? null : f.supportedAnswered / f.answered
    f.never_answered = f.answered === 0
  }
  return out
}

/**
 * Accuracy grouped by what the video ACTUALLY is.
 *
 * ⚠️ ONLY FOR REFERENCES WHERE THE HUMAN CONFIRMED THE SITUATION. Grouping by
 * the model's own `primaryMode` would let a reference the model mis-typed carry
 * every other claim into the wrong bucket — the model grading itself twice over.
 * A reference whose primaryMode was not labelled SUPPORTED is reported as
 * `situation_unconfirmed` rather than guessed at.
 */
export function bySituation(labels) {
  const confirmed = new Map()
  for (const l of labels) {
    // ⚠️ AND THE CLAIM MUST HAVE BEEN ANSWERED. Running this produced a bucket
    // literally named "null": a primaryMode the model never answered, labelled
    // SUPPORTED, stringified its absent value into a situation name. A claim
    // with no value cannot confirm what a video is.
    if (l.path === 'primaryMode' && l.label === 'SUPPORTED' && l.answered) {
      const v = l.correctedValue ?? l.value
      if (v !== null && v !== undefined && v !== '') confirmed.set(l.url, String(v))
    }
  }
  const out = {}
  const byKey = new Map()
  for (const l of labels) {
    const key = confirmed.get(l.url) ?? 'situation_unconfirmed'
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(l)
    const g = (out[key] ??= { references: new Set(), asked: 0, answered: 0, supported: 0 })
    g.references.add(l.url)
    g.asked++
    if (l.answered) g.answered++
    if (l.label === 'SUPPORTED') g.supported++
  }
  for (const [key, g] of Object.entries(out)) {
    g.references = g.references.size
    // ⚖️ THROUGH THE SHARED HELPER, over the SAME population as its denominator.
    // Computing it here by hand is exactly how this bucket reported 350%.
    g.supported_of_answered = supportedRate(byKey.get(key) ?? [], { answeredOnly: true })
  }
  return out
}

/**
 * ⚠️ WHICH FIELDS COST THE REVIEWER TIME. A field that is slow every time is a
 * field whose question is unclear or whose evidence is hard to find — and that
 * is a packet problem, not a model problem. It is the difference between #69
 * rewording a prompt and #69 changing what is on screen.
 */
export function slowestFields(events, labels) {
  const answers = events.filter((e) => e.kind === 'label' && typeof e.index === 'number')
  const start = events.find((e) => e.kind === 'session_start')?.at ?? null
  const perField = {}
  for (let i = 0; i < answers.length; i++) {
    const prev = i === 0 ? start : answers[i - 1].at
    if (prev === null) continue
    const path = labels[answers[i].index]?.path
    if (!path) continue
    ;(perField[path] ??= []).push(answers[i].at - prev)
  }
  return Object.entries(perField)
    .map(([path, gaps]) => {
      const sorted = [...gaps].sort((a, b) => a - b)
      // ⚠️ `labelled`, NOT `answered`. Everywhere else in this file "answered"
      // means THE MODEL answered; here it means the reviewer gave a label. The
      // report printed "requirements.secondPerson ... (8)" beside a list of
      // fields the model NEVER answered, and the same word carrying two
      // meanings in one output is how a reader draws the wrong conclusion.
      return { path, labelled: gaps.length, median_ms: sorted[Math.floor(sorted.length / 2)] }
    })
    // ⚖️ SORTED SLOWEST FIRST, because that is the order somebody would act in.
    .sort((a, b) => b.median_ms - a.median_ms)
}

/**
 * ⚠️ THE ARM COMPARISON THE PILOT EXISTS TO MAKE. frameSampleTargets schedules
 * frames on the content beats when the profile has them and uniformly when it
 * does not, and the whole question behind #58 is whether beat-scheduled frames
 * support stronger claims than four arbitrary points. Reporting one accuracy
 * across both arms answers a question nobody asked.
 *
 * ⚖️ AND ON THE NO-SPEECH PATH THE BASIS IS ALWAYS `uniform`, because there is
 * no content profile to take beats from. A pilot drawn entirely from silent
 * video therefore has ONE arm, and saying so is the finding -- an empty
 * content_beats bucket is not a zero score, it is an absent comparison.
 */
export function byScheduleBasis(labels, frames) {
  const basisOf = new Map()
  for (const f of frames ?? []) if (f.schedule_basis) basisOf.set(f.url, f.schedule_basis)
  const out = {}
  const pool = {}
  for (const l of labels) {
    const key = basisOf.get(l.url) ?? 'basis_unknown'
    ;(pool[key] ??= []).push(l)
    const g = (out[key] ??= { references: new Set(), asked: 0, answered: 0 })
    g.references.add(l.url)
    g.asked++
    if (l.answered) g.answered++
  }
  for (const [key, g] of Object.entries(out)) {
    g.references = g.references.size
    g.supported_of_answered = supportedRate(pool[key], { answeredOnly: true })
  }
  return out
}

/** ⚠️ EVERY LABEL AS A SHARE OF WHAT WAS ASKED. Reporting SUPPORTED as a rate
 *  and the rest as raw counts invites reading four numbers on two scales. */
export function distributionRates(agg) {
  const n = agg.claims_labelled
  const r = (k) => (n === 0 ? null : agg.distribution[k] / n)
  return {
    supported: r('SUPPORTED'),
    unsupported: r('UNSUPPORTED'),
    indeterminate: r('INDETERMINATE'),
    wrong_evidence: r('WRONG_EVIDENCE'),
  }
}

export const ARMS = ['uniform', 'content_beats']

/**
 * ⚠️ AN ARM WITH NO REFERENCES IS NOT AN ARM THAT SCORED ZERO. A no-speech
 * pilot exercises `uniform` only -- silent references have no content profile,
 * so there are no beats to schedule on and content_beats CANNOT appear. Printing
 * it as 0% would be numerically tidy and scientifically false: it would read as
 * "beat-scheduled frames supported nothing", a claim this sample cannot make in
 * either direction.
 *
 * ⚖️ SO THE COMPARISON ITSELF HAS A STATE. `NOT RUN` is the honest answer when
 * only one arm is represented, and it is reported beside the arm that WAS
 * measured rather than left for a reader to infer from a missing row.
 */
export function armComparison(labels, frames) {
  const groups = byScheduleBasis(labels, frames)
  const arms = {}
  for (const arm of ARMS) {
    arms[arm] = groups[arm]
      ? { status: 'measured', ...groups[arm] }
      : { status: 'NOT REPRESENTED', references: 0, asked: 0, answered: 0, supported_of_answered: null }
  }
  const measured = ARMS.filter((a) => arms[a].status === 'measured')
  return {
    arms,
    // ⚠️ A COMPARISON NEEDS TWO SIDES. One arm is a measurement of that arm, and
    // nothing at all about the other.
    arm_comparison: measured.length === 2 ? 'measured' : 'NOT RUN',
    measured_arms: measured,
    unknown_basis: groups.basis_unknown ?? null,
  }
}

/**
 * ⚠️ THE RELATIONSHIP THE STUB WAS ALLOWED TO BREAK. A test double that ignored
 * one PostgREST filter produced six READY references and one hundred and twenty
 * review claims, where ninety was the only possible answer -- and the
 * contradiction was printed in the output, unasserted, more than once.
 *
 * ⚖️ SO THE INVARIANT LIVES AT THE ORCHESTRATION BOUNDARY, not in the mock.
 * Fixing the stub fixes one lie; asserting the relationship catches the next
 * one, whatever creative interpretation of Supabase tomorrow brings.
 */
export function checkPacketInvariants({ progress, labels, claimPaths = CLAIM_PATHS.length }) {
  const problems = []
  // ⚠️ A COUNT, NOT A LIST. Passing the CLAIM_PATHS array made the expected
  // product NaN, and `labels.length !== NaN` is always true -- the invariant
  // would have refused every packet while appearing to check one. Normalise so
  // the next call site cannot make the same slip.
  const paths = Array.isArray(claimPaths) ? claimPaths.length : Number(claimPaths)
  if (!Number.isFinite(paths) || paths <= 0) {
    return ['the packet check was given no usable claim-path count, so it checked nothing']
  }
  const readyUrls = new Set(progress.states.filter((s) => s.state === 'READY_FOR_LABEL').map((s) => s.url))
  const packetUrls = new Set(labels.map((l) => l.url))

  if (readyUrls.size !== packetUrls.size) {
    problems.push(`${readyUrls.size} references are READY_FOR_LABEL but the packet covers `
      + `${packetUrls.size}. A packet may contain exactly the references that produced claims.`)
  }
  for (const u of packetUrls) {
    if (!readyUrls.has(u)) {
      const st = progress.states.find((s) => s.url === u)?.state ?? 'unknown'
      problems.push(`${u} is ${st} but has review claims. FAILED and UNREADABLE references `
        + 'contribute ZERO claims: there is nothing for a human to judge.')
    }
  }
  const expected = readyUrls.size * paths
  if (labels.length !== expected) {
    problems.push(`the packet holds ${labels.length} claims but ${readyUrls.size} ready reference(s) `
      + `× ${paths} declared claim paths is ${expected}. A count that does not multiply out `
      + 'means the packet was built from a different set than the one reported ready.')
  }
  return problems
}

/** ⚠️ FOUR SHARES OF ONE POPULATION MUST SUM TO ONE. Anything else means a label
 *  was counted twice or a denominator moved between lines. */
export function checkRateInvariants(agg) {
  const problems = []
  const r = distributionRates(agg)
  const vals = Object.values(r)
  if (vals.every((v) => v === null)) return problems
  const sum = vals.reduce((a, b) => a + (b ?? 0), 0)
  if (Math.abs(sum - 1) > 1e-9) {
    problems.push(`the four label shares sum to ${sum.toFixed(4)}, not 1. A label was counted `
      + 'twice, or a denominator changed between lines.')
  }
  for (const [k, v] of Object.entries({ ...r, supported_of_answered: agg.supported_of_answered })) {
    if (v !== null && (v < 0 || v > 1)) {
      problems.push(`${k} is ${v}, outside 0..1 — a numerator and denominator from different populations.`)
    }
  }
  return problems
}

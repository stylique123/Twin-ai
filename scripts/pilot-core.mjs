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

const rank = (url) => createHash('sha256').update(String(url)).digest('hex')

/**
 * Draw the cohort.
 *
 * ⚖️ ONE PER CREATOR, ALTERNATING BANDS, ORDERED BY A DIGEST OF THE URL. The
 * digest is what makes it re-drawable: same rows and same size give the same
 * cohort on any machine, so a later argument about the sample is settleable.
 */
export function selectCohort(rows, size = DEFAULT_SIZE) {
  const n = Math.max(1, Math.min(MAX_SIZE, Number(size) || DEFAULT_SIZE))
  const seen = new Set()
  const bands = { chars_zero: [], chars_tiny: [] }

  for (const r of [...rows].sort((a, b) => rank(a.url).localeCompare(rank(b.url)))) {
    const h = handleOf(r.url)
    // A url with no handle is still a reference; it just cannot be deduplicated
    // by creator, so it is kept rather than silently dropped.
    if (h !== null) {
      if (seen.has(h)) continue
      seen.add(h)
    }
    bands[bandOf(r.transcript_chars)].push(r)
  }

  // ⚠️ ALTERNATE, DO NOT SPLIT IN HALF. The bands are 51 and 281 deep; a
  // proportional draw would give the zero-character band one slot out of eight
  // and call it represented.
  const out = []
  for (let i = 0; out.length < n && (bands.chars_zero.length || bands.chars_tiny.length); i++) {
    const first = i % 2 === 0 ? 'chars_zero' : 'chars_tiny'
    const second = first === 'chars_zero' ? 'chars_tiny' : 'chars_zero'
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
  'camera.framingChanges', 'camera.positionChanges',
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
  // ⚠️ THE DENOMINATOR EXCLUDES NOTHING IT SHOULD COUNT. A claim the model never
  // made is not a claim it got right, and a denominator that quietly drops
  // non-answers turns a thin pass into a good one.
  const supported = dist.SUPPORTED
  // ⚠️ THE NUMERATOR MUST COME FROM THE SAME POPULATION AS ITS DENOMINATOR.
  // Running the pilot end to end printed "500% of what the model answered":
  // every SUPPORTED label was divided by only the claims the model actually
  // answered. A rate above 100% is at least loud -- the same mistake landing at
  // 90% would have read as a good result and nobody would have looked twice.
  const supportedAmongAnswered = answered.filter((l) => l.label === 'SUPPORTED').length
  return {
    claims_shown: session.labels?.length ?? 0,
    claims_labelled: labels.length,
    claims_unlabelled: (session.labels?.length ?? 0) - labels.length,
    model_answered: answered.length,
    distribution: dist,
    // ⚖️ TWO RATES, BECAUSE THEY ANSWER DIFFERENT QUESTIONS. Against everything
    // the model was ASKED is "how much of the visual pass is usable". Against
    // what it ANSWERED is "when it speaks, is it right". Reporting only the
    // second is how a pass that answers three fields out of fifteen scores 100%.
    supported_of_all_asked: labels.length === 0 ? null : supported / labels.length,
    supported_of_answered: answered.length === 0 ? null : supportedAmongAnswered / answered.length,
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
    backtracks: events.filter((e) => e.kind === 'relabel').length,
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
export function briefFor69(fr, agg) {
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

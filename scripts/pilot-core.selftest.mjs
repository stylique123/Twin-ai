#!/usr/bin/env node
// The pilot's deciding logic, checked without credentials.
import {
  manifestDigest, freezeManifest, assertManifestUnchanged, pilotState, progressOf,
  attrition, briefFor69, TERMINAL, selectCohort, aggregate, friction, flattenClaims,
  claimsDigest, evidenceDigest, byField, bySituation, slowestFields, supportedRate,
  byScheduleBasis, distributionRates, armComparison, checkPacketInvariants,
  checkRateInvariants, CLAIM_PATHS,
  COHORT_SPEECH, COHORT_NO_SPEECH, COHORTS, speechBandOf, SPEECH_BAND_SPLIT_CHARS,
  selectionVersionFor,
} from './pilot-core.mjs'

let failed = 0
const ok = (n, c) => { if (c === true) console.log(`  ok: ${n}`); else { console.error(`selftest: ${n} — FAILED`); failed++ } }
const row = (url, chars) => ({ url, transcript_chars: chars })

// ── the frozen sample ──
const cohort = [row('https://www.tiktok.com/@a/video/1', 0), row('https://www.tiktok.com/@b/video/2', 40)]
const m = freezeManifest(cohort, 8)
ok('freezes what was drawn, not what was asked for', m.size_requested === 8 && m.size_frozen === 2)
ok('records the band split so a later reader can judge the draw',
  m.bands.chars_zero === 1 && m.bands.chars_tiny === 1)
// ⚠️ ORDER MUST NOT CHANGE THE DIGEST, or a re-read of the same sample looks edited.
ok('the digest is order-independent',
  manifestDigest(['b', 'a']) === manifestDigest(['a', 'b']))
ok('an unchanged sample passes', assertManifestUnchanged(m, m.urls) === null)
// ⚖️ THE #72 LESSON: choosing after seeing results is post-hoc subsetting.
ok('a SUBSTITUTED url is refused', assertManifestUnchanged(m, ['https://www.tiktok.com/@a/video/1', 'https://x/9']) !== null)
ok('a DROPPED url is refused', assertManifestUnchanged(m, [m.urls[0]]) !== null)
ok('the refusal explains rather than just failing',
  String(assertManifestUnchanged(m, ['x'])).includes('post-hoc'))

// ── terminal states ──
ok('nothing yet is running, not a result', pilotState(undefined) === 'running')
ok('claims present is ready', pilotState({ visual_profile: {}, frames_sampled: 4 }) === 'READY_FOR_LABEL')
// ⚠️ LOOKED-AND-SAW-NOTHING vs COULD-NOT-LOOK. Merging them answers the pilot's
// question with the box's problems.
ok('frames but no claims is UNREADABLE',
  pilotState({ visual_profile: null, frames_sampled: 4 }) === 'UNREADABLE')
ok('a failure code with no frames is FAILED',
  pilotState({ visual_profile: null, frames_sampled: null, visual_failure_code: 'FFMPEG_MISSING' }) === 'FAILED')
ok('a bare row with neither is still running', pilotState({ visual_profile: null, frames_sampled: null }) === 'running')
ok('running is not terminal', !TERMINAL.includes('running'))

const prog = progressOf([
  { url: m.urls[0], visual_profile: {}, frames_sampled: 4 },
], m)
ok('progress counts what is missing as running', prog.ready === 1 && prog.running === 1 && prog.done === false)
ok('done only when every frozen url is terminal', progressOf([
  { url: m.urls[0], visual_profile: {}, frames_sampled: 4 },
  { url: m.urls[1], visual_profile: null, frames_sampled: null, visual_failure_code: 'IP_BLOCKED' },
], m).done === true)

// ── attrition ──
const att = attrition(progressOf([
  { url: m.urls[0], visual_profile: {}, frames_sampled: 4 },
  { url: m.urls[1], visual_profile: null, frames_sampled: null, visual_failure_code: 'IP_BLOCKED' },
], m))
// ⚠️ THE DENOMINATOR IS THE FROZEN SAMPLE. 1 of 2 must not read as 100%.
ok('rates are over what was SELECTED', att.assessed_of_selected === 0.5 && att.selected === 2)
ok('failures are broken out by code', att.failures_by_code.IP_BLOCKED === 1)
ok('an unreadable reference gets its own code, not UNKNOWN',
  attrition(progressOf([{ url: m.urls[0], visual_profile: null, frames_sampled: 4 }], m))
    .failures_by_code.NO_CLAIMS_FROM_FRAMES === 1)

// ── the #69 brief ──
const quiet = briefFor69({ claims_answered: 20, median_ms_per_claim: 4000, slowest_ms: 9000,
  backtracks: 0, evidence_frame_changes: 0, skipped: 0 }, { wrong_evidence_rate: 0, claims_unlabelled: 0 })
// ⚠️ AN EMPTY BRIEF IS A RESULT, not a failure to look.
ok('a clean session proposes NOTHING', quiet.items.length === 0)
ok('and says so in words', quiet.verdict.includes('does not need building'))

const noisy = briefFor69({ claims_answered: 20, median_ms_per_claim: 30_000, slowest_ms: 60_000,
  backtracks: 5, evidence_frame_changes: 9, skipped: 2 }, { wrong_evidence_rate: 0.4, claims_unlabelled: 3 })
ok('every proposal names the number that earned it', noisy.items.every((i) => i.evidence && i.because))
ok('a high wrong-evidence rate points at the CITATION machinery, not the prompt',
  noisy.items.some((i) => i.change.includes('citation')))
// ⚖️ THE ONE THING IT MAY NEVER PROPOSE.
ok('nothing in the brief proposes automating the judgement', !/pre-?fill|auto-?label|model.*(suggest|rank|grade)/i
  .test(JSON.stringify(noisy.items)))
ok('the thresholds are stated so they can be argued with', noisy.thresholds.includes('WRONG_EVIDENCE'))

// ── the moved functions still work where they now live ──
ok('selectCohort came across intact', selectCohort([row('https://www.tiktok.com/@c/video/3', 0)], 4).length === 1)
ok('aggregate still refuses an open session', aggregate({ locked: false, labels: [] }).refused !== undefined)
ok('friction still separates effort from coverage',
  friction([{ kind: 'label', at: 1, index: 0 }, { kind: 'label', at: 2, index: 0 }]).claims_answered === 1)
ok('flattenClaims still returns one row per declared path',
  flattenClaims('u', {}).length === 15)

// ── the rate that printed 500% ──
{
  const labels = [
    ...Array.from({ length: 4 }, (_, i) => ({ index: i, answered: true, label: 'SUPPORTED' })),
    ...Array.from({ length: 11 }, (_, i) => ({ index: 4 + i, answered: false, label: 'SUPPORTED' })),
  ]
  const a = aggregate({ locked: true, labels })
  // ⚠️ FOUND BY RUNNING IT, NOT BY READING IT. Every SUPPORTED label was divided
  // by only the claims the model ANSWERED, so a full sweep reported 375%. A rate
  // above 100% is at least loud; the same error landing at 90% would have read
  // as a good result and nobody would have looked twice.
  ok('a rate can never exceed 100%', a.supported_of_answered <= 1)
  ok('supported-of-answered counts only answered claims', a.supported_of_answered === 1)
  // ⚖️ AND THE OTHER RATE STILL COUNTS EVERYTHING ASKED, which is why both exist.
  ok('supported-of-all-asked still counts the unanswered ones', a.supported_of_all_asked === 1)

  const mixed = aggregate({ locked: true, labels: [
    { index: 0, answered: true, label: 'SUPPORTED' },
    { index: 1, answered: true, label: 'UNSUPPORTED' },
    { index: 2, answered: false, label: 'INDETERMINATE' },
  ] })
  ok('a thin pass cannot score 100% by answering three fields',
    mixed.supported_of_answered === 0.5 && Math.abs(mixed.supported_of_all_asked - 1 / 3) < 1e-9)

  // ── the claim nobody can label ────────────────────────────────────────────
  // ⚠️ THE FIXTURES ABOVE ALL GIVE THE UNANSWERED CLAIMS A LABEL, which is why
  // this went unnoticed. In the first real packet 17 of 120 rows were fields
  // Twin declined to answer, and there is no honest button for them -- so they
  // carry NO label at all. Filtering the pool to labelled rows would drop them
  // out of the denominator and score a 103-of-120 pass over 103.
  const withNonAnswers = aggregate({ locked: true, labels: [
    { index: 0, answered: true, label: 'SUPPORTED' },
    { index: 1, answered: true, label: 'SUPPORTED' },
    { index: 2, answered: false, label: null },
    { index: 3, answered: false, label: null },
  ] })
  ok('an unlabelled non-answer is still in the all-asked denominator',
    withNonAnswers.supported_of_all_asked === 0.5)
  ok('and it is named rather than merely missing',
    withNonAnswers.model_did_not_answer === 2)
  ok('while the answered rate is untouched by it',
    withNonAnswers.supported_of_answered === 1)
  ok('every shown claim is still counted as shown', withNonAnswers.claims_shown === 4)
  ok('and the two that carry no label are reported as unlabelled',
    withNonAnswers.claims_unlabelled === 2)

  // ⚠️ TWO REASONS A ROW HAS NO LABEL, AND THEY ARE NOT THE SAME REASON.
  // The first version of this fix counted every unlabelled row against the
  // model, which failed label-packet's own fixture: a claim Twin DID make that
  // the reviewer simply had not reached yet is a gap in the REVIEW, not a
  // failure of the visual pass, and charging the model for it understates a
  // pass for reasons that have nothing to do with the model. The test was
  // right and the code was too broad.
  const humanSkip = aggregate({ locked: true, labels: [
    { index: 0, answered: true, label: 'SUPPORTED' },
    { index: 1, answered: true, label: null },   // reviewer has not got here
  ] })
  ok('an answered claim nobody has labelled yet is NOT charged to the model',
    humanSkip.supported_of_all_asked === 1)
  const modelSilence = aggregate({ locked: true, labels: [
    { index: 0, answered: true, label: 'SUPPORTED' },
    { index: 1, answered: false, label: null },  // Twin declined
  ] })
  ok('a claim the model declined IS in the denominator',
    modelSilence.supported_of_all_asked === 0.5)

  // ⚖️ CONTROL: with nothing unanswered the two rates agree, so the change
  // above cannot be silently altering the ordinary case.
  const allAnswered = aggregate({ locked: true, labels: [
    { index: 0, answered: true, label: 'SUPPORTED' },
    { index: 1, answered: true, label: 'UNSUPPORTED' },
  ] })
  ok('CONTROL both rates agree when the model answered everything',
    allAnswered.supported_of_all_asked === 0.5
    && allAnswered.supported_of_answered === 0.5
    && allAnswered.model_did_not_answer === 0)
}

// ── the reviewed object stays recoverable ──
{
  const L = [
    { url: 'a', path: 'primaryMode', value: 'demo', frames: [2] },
    { url: 'a', path: 'people.count', value: 'one', frames: [1] },
  ]
  ok('claim digests are order-independent', claimsDigest(L) === claimsDigest([...L].reverse()))
  // ⚠️ THE MODEL CHANGING ITS MIND MUST CHANGE THE DIGEST, or last week's labels
  // silently appear to be about this week's claims.
  ok('a changed VALUE changes the digest',
    claimsDigest(L) !== claimsDigest([{ ...L[0], value: 'skit' }, L[1]]))
  // ⚖️ AND SO MUST A RE-POINTED CITATION, which is a different failure from a
  // changed value and worth telling apart.
  ok('a changed CITATION changes the digest',
    claimsDigest(L) !== claimsDigest([{ ...L[0], frames: [3] }, L[1]]))

  const F = [{ url: 'a', frame_index: 1, sha256: 'aa' }, { url: 'a', frame_index: 2, sha256: 'bb' }]
  ok('evidence digests are order-independent', evidenceDigest(F) === evidenceDigest([...F].reverse()))
  // ⚠️ A RE-UPLOAD KEEPS THE PATH AND CHANGES THE PICTURE. Digesting paths would
  // miss exactly the substitution worth catching.
  ok('a re-uploaded frame changes the evidence digest',
    evidenceDigest(F) !== evidenceDigest([F[0], { ...F[1], sha256: 'cc' }]))
  // ⚠️ FOUND BY READING THE REAL OUTPUT: an empty frame set produced
  // e3b0c44298fc, the sha256 of the empty string, which reads as a captured
  // digest. Absent is not zero.
  ok('no frames digests to null, not to the hash of nothing', evidenceDigest([]) === null)
  ok('and null is distinguishable from any real digest', evidenceDigest(F) !== null)
  // ⚖️ THE TWO MOVE INDEPENDENTLY, which is what makes the pair informative.
  ok('claims and evidence are separate digests', claimsDigest(L) !== evidenceDigest(F))
}

// ── field-level accuracy ──
{
  const L = [
    { url: 'a', path: 'primaryMode', answered: true, label: 'SUPPORTED', value: 'demo' },
    { url: 'a', path: 'people.count', answered: true, label: 'UNSUPPORTED' },
    { url: 'b', path: 'primaryMode', answered: true, label: 'SUPPORTED', value: 'demo' },
    { url: 'b', path: 'people.count', answered: true, label: 'UNSUPPORTED' },
    { url: 'a', path: 'camera.framingChanges', answered: false, label: 'INDETERMINATE' },
  ]
  const f = byField(L)
  // ⚠️ AN OVERALL 50% HERE HIDES ONE PERFECT FIELD AND ONE BROKEN ONE, which
  // have opposite fixes.
  ok('a broken field is visible even when the overall rate is middling',
    f['primaryMode'].supported_of_answered === 1 && f['people.count'].supported_of_answered === 0)
  // ⚖️ NEVER-ANSWERED IS NOT ZERO. Zero says it got the field wrong every time.
  ok('a field the model never answered reports null, not zero',
    f['camera.framingChanges'].supported_of_answered === null
    && f['camera.framingChanges'].never_answered === true)
  ok('every asked claim is counted', f['primaryMode'].asked === 2)
}

// ── accuracy by what the video actually is ──
{
  const L = [
    { url: 'a', path: 'primaryMode', answered: true, label: 'SUPPORTED', value: 'demo' },
    { url: 'a', path: 'people.count', answered: true, label: 'SUPPORTED' },
    // b's primaryMode was WRONG, so nothing about b may be filed under a situation.
    { url: 'b', path: 'primaryMode', answered: true, label: 'UNSUPPORTED', value: 'demo' },
    { url: 'b', path: 'people.count', answered: true, label: 'UNSUPPORTED' },
  ]
  const g = bySituation(L)
  // ⚠️ THE MODEL MAY NOT GRADE ITSELF TWICE. Grouping by an unconfirmed
  // primaryMode would let a mis-typed reference drag every other claim into the
  // wrong bucket.
  ok('only human-confirmed situations become buckets', g['demo'].references === 1)
  ok('an unconfirmed reference is named, not guessed at',
    g['situation_unconfirmed'].references === 1)
  ok('the confirmed bucket carries only its own claims', g['demo'].supported_of_answered === 1)
  // ⚖️ A CORRECTED VALUE WINS over the model's, because that is the human's answer.
  const corrected = bySituation([
    { url: 'c', path: 'primaryMode', answered: true, label: 'SUPPORTED', value: 'demo', correctedValue: 'skit' },
  ])
  ok('a corrected canonical value is the situation, not the model\'s', corrected['skit'] !== undefined)
}

// ── which fields cost time ──
{
  const labels = [{ path: 'primaryMode' }, { path: 'people.count' }, { path: 'primaryMode' }]
  const ev = [
    { kind: 'session_start', at: 0 },
    { kind: 'label', at: 30_000, index: 0 },
    { kind: 'label', at: 32_000, index: 1 },
    { kind: 'label', at: 62_000, index: 2 },
  ]
  const slow = slowestFields(ev, labels)
  ok('the slowest field comes first', slow[0].path === 'primaryMode')
  ok('and it reports how many LABELS that median rests on, not model answers', slow[0].labelled === 2)
  ok('a fast field is still reported, just lower', slow[1].path === 'people.count' && slow[1].median_ms === 2000)
  ok('an empty log yields no ranking rather than throwing', slowestFields([], labels).length === 0)
}

// ── one place computes a supported-rate, and it cannot exceed 100% anywhere ──
{
  // ⚠️ THE SAME DEFECT APPEARED THREE TIMES: aggregate printed 500%,
  // bySituation printed 350%, both dividing EVERY supported label by only the
  // ANSWERED ones. Patching each site would have left a fourth to find.
  const L = [
    { url: 'a', path: 'primaryMode', answered: true, label: 'SUPPORTED', value: 'demo' },
    ...Array.from({ length: 9 }, (_, i) => ({ url: 'a', path: `f${i}`, answered: false, label: 'SUPPORTED' })),
  ]
  ok('the shared rate over answered claims cannot exceed 100%',
    supportedRate(L, { answeredOnly: true }) === 1)
  ok('the shared rate over everything asked counts everything', supportedRate(L, { answeredOnly: false }) === 1)
  ok('an empty pool is null, not zero', supportedRate([], { answeredOnly: true }) === null)

  ok('aggregate goes through it', aggregate({ locked: true, labels: L }).supported_of_answered <= 1)
  const g = bySituation(L)
  ok('bySituation goes through it too', g['demo'].supported_of_answered <= 1)

  // ⚠️ AND A NULL VALUE MAY NOT BECOME A SITUATION NAMED "null". Running the
  // pilot produced exactly that bucket, from a primaryMode the model never
  // answered but that was labelled SUPPORTED.
  const ghost = bySituation([
    { url: 'z', path: 'primaryMode', answered: false, label: 'SUPPORTED', value: null },
    { url: 'z', path: 'people.count', answered: true, label: 'SUPPORTED' },
  ])
  ok('an unanswered primaryMode cannot confirm a situation', ghost['null'] === undefined)
  ok('and its reference is filed as unconfirmed', ghost['situation_unconfirmed'].references === 1)

  const f = byField(L)
  ok('byField reports per-field rates that cannot exceed 100%',
    Object.values(f).every((v) => v.supported_of_answered === null || v.supported_of_answered <= 1))
}

// ── the arm comparison, and when there is only one arm ──
{
  const labels = [
    { url: 'a', answered: true, label: 'SUPPORTED' },
    { url: 'a', answered: true, label: 'UNSUPPORTED' },
    { url: 'b', answered: true, label: 'SUPPORTED' },
  ]
  const frames = [
    { url: 'a', frame_index: 1, schedule_basis: 'uniform' },
    { url: 'b', frame_index: 1, schedule_basis: 'content_beats' },
  ]
  const g = byScheduleBasis(labels, frames)
  // ⚠️ ONE ACCURACY ACROSS BOTH ARMS ANSWERS A QUESTION NOBODY ASKED. Whether
  // beat-scheduled frames support stronger claims than four arbitrary points is
  // the question behind #58.
  ok('the two arms are scored separately',
    g.uniform.supported_of_answered === 0.5 && g.content_beats.supported_of_answered === 1)
  ok('each arm counts its own references', g.uniform.references === 1 && g.content_beats.references === 1)

  // ⚖️ A NO-SPEECH PILOT HAS ONE ARM, and an absent bucket is an ABSENT
  // COMPARISON, not a zero score.
  const oneArm = byScheduleBasis(labels, [
    { url: 'a', frame_index: 1, schedule_basis: 'uniform' },
    { url: 'b', frame_index: 1, schedule_basis: 'uniform' },
  ])
  ok('a single-arm pilot reports one bucket, not a zero for the other',
    Object.keys(oneArm).length === 1 && oneArm.content_beats === undefined)
  ok('a reference with no frames is basis_unknown, not silently uniform',
    byScheduleBasis([{ url: 'z', answered: true, label: 'SUPPORTED' }], []).basis_unknown !== undefined)
}

// ── all four labels on one scale ──
{
  const agg = aggregate({ locked: true, labels: [
    { index: 0, answered: true, label: 'SUPPORTED' },
    { index: 1, answered: true, label: 'UNSUPPORTED' },
    { index: 2, answered: true, label: 'INDETERMINATE' },
    { index: 3, answered: true, label: 'WRONG_EVIDENCE' },
  ] })
  const r = distributionRates(agg)
  ok('every label is a share of what was asked',
    r.supported === 0.25 && r.unsupported === 0.25 && r.indeterminate === 0.25 && r.wrong_evidence === 0.25)
  ok('the four shares sum to one',
    Math.abs(r.supported + r.unsupported + r.indeterminate + r.wrong_evidence - 1) < 1e-9)
  // ⚖️ NULL, NOT ZERO, when nothing was labelled at all.
  ok('an unlabelled session reports null shares, not zeros',
    distributionRates(aggregate({ locked: true, labels: [] })).supported === null)
}

// ── an absent arm is NOT REPRESENTED, never 0% ──
{
  const labels = [
    { url: 'a', answered: true, label: 'SUPPORTED' },
    { url: 'a', answered: true, label: 'UNSUPPORTED' },
  ]
  const uniformOnly = armComparison(labels, [{ url: 'a', frame_index: 1, schedule_basis: 'uniform' }])
  // ⚠️ A 0% CONTENT_BEATS WOULD READ AS "beat-scheduled frames supported
  // nothing" — a claim this sample cannot make in either direction.
  ok('an unrepresented arm says so rather than scoring zero',
    uniformOnly.arms.content_beats.status === 'NOT REPRESENTED'
    && uniformOnly.arms.content_beats.supported_of_answered === null)
  ok('the measured arm is still measured', uniformOnly.arms.uniform.status === 'measured')
  // ⚖️ THE COMPARISON ITSELF HAS A STATE.
  ok('one arm means the comparison did NOT run', uniformOnly.arm_comparison === 'NOT RUN')

  const both = armComparison(
    [...labels, { url: 'b', answered: true, label: 'SUPPORTED' }],
    [{ url: 'a', frame_index: 1, schedule_basis: 'uniform' },
     { url: 'b', frame_index: 1, schedule_basis: 'content_beats' }])
  ok('two arms means the comparison ran', both.arm_comparison === 'measured')
  ok('and both are marked measured',
    both.arms.uniform.status === 'measured' && both.arms.content_beats.status === 'measured')
}

// ── the invariant the stub was allowed to break ──
{
  const progress = { states: [
    { url: 'r1', state: 'READY_FOR_LABEL' },
    { url: 'r2', state: 'READY_FOR_LABEL' },
    { url: 'f1', state: 'FAILED' },
    { url: 'u1', state: 'UNREADABLE' },
  ] }
  const claimsFor = (u) => CLAIM_PATHS.map((p) => ({ url: u, path: p }))
  const good = [...claimsFor('r1'), ...claimsFor('r2')]
  ok('a packet matching the ready set passes',
    checkPacketInvariants({ progress, labels: good }).length === 0)

  // ⚠️ THE EXACT SHAPE THAT PRINTED 6 READY AND 120 CLAIMS.
  const withFailed = [...good, ...claimsFor('f1'), ...claimsFor('u1')]
  const bad = checkPacketInvariants({ progress, labels: withFailed })
  ok('a packet including FAILED and UNREADABLE references is refused', bad.length > 0)
  ok('and it names the offending reference and its state',
    bad.some((p) => p.includes('f1') && p.includes('FAILED'))
    && bad.some((p) => p.includes('u1') && p.includes('UNREADABLE')))
  ok('and it says the count does not multiply out',
    bad.some((p) => p.includes('multiply out')))

  ok('a packet missing a ready reference is refused',
    checkPacketInvariants({ progress, labels: claimsFor('r1') }).length > 0)
  ok('a ready reference with the wrong claim count is refused',
    checkPacketInvariants({ progress, labels: [...good, { url: 'r1', path: 'extra' }] }).length > 0)
  ok('no ready references and an empty packet is consistent',
    checkPacketInvariants({ progress: { states: [{ url: 'f1', state: 'FAILED' }] }, labels: [] }).length === 0)
}

// ── a rate that cannot exist is refused before it is printed ──
{
  const fine = aggregate({ locked: true, labels: [
    { index: 0, answered: true, label: 'SUPPORTED' },
    { index: 1, answered: true, label: 'UNSUPPORTED' },
  ] })
  ok('honest rates pass', checkRateInvariants(fine).length === 0)
  ok('an empty session passes rather than dividing by zero',
    checkRateInvariants(aggregate({ locked: true, labels: [] })).length === 0)
  // ⚠️ THE 500% AND 350% SHAPES, CAUGHT BEFORE PRINTING.
  ok('a share above 1 is refused',
    checkRateInvariants({ ...fine, supported_of_answered: 5 }).some((p) => p.includes('outside 0..1')))
  ok('shares that do not sum to one are refused',
    checkRateInvariants({ ...fine, claims_labelled: 4 }).some((p) => p.includes('sum to')))
}

// ── a revisit is not a backtrack ──
{
  // ⚠️ SOMEBODY WHO ANSWERS, LEAVES, COMES BACK AND ANSWERS THE SAME WAY has
  // told you the claim was hard to settle even though nothing changed.
  // Counting only relabels would score that session as frictionless.
  const f = friction([
    { kind: 'session_start', at: 0 },
    { kind: 'label', at: 1000, index: 0 },
    { kind: 'nav', at: 1500, via: 'prev' },
    { kind: 'relabel', at: 2000, index: 0 },
    { kind: 'label', at: 2000, index: 0 },
    { kind: 'label', at: 3000, index: 1 },
  ])
  ok('a claim returned to is counted as revisited', f.claims_revisited === 1)
  ok('and the replaced answer is still a backtrack', f.backtracks === 1)
  ok('a claim answered once is neither',
    friction([{ kind: 'label', at: 1, index: 0 }]).claims_revisited === 0)
  ok('navigation is counted on its own', f.navigations === 1)
  ok('keyboard use is counted separately from answers',
    friction([{ kind: 'key', at: 1 }, { kind: 'label', at: 2, index: 0 }]).keyboard_actions === 1)
}

// ── the with-speech cohort ──────────────────────────────────────────────────
// ⚠️ WHY THIS EXISTS AT ALL. Run 7204de6f drew only silent references, so the
// content_beats arm could not appear and #58's question went unasked. Measured
// on that packet: talkingHead false on 8 of 8, primaryMode unanswered on 8 of 8.
ok('the split is a pinned constant, not computed at draw time',
  SPEECH_BAND_SPLIT_CHARS === 645)
ok('below the split is short', speechBandOf(644) === 'speech_short')
ok('the split itself is long', speechBandOf(645) === 'speech_long')
ok('well above the split is long', speechBandOf(43687) === 'speech_long')
// ⚠️ ABSENT IS NOT ZERO-LENGTH SPEECH. A row with no chars has no business in
// this cohort; the DRAW filters it out, and the band function must not quietly
// give it a home either.
ok('a null length lands in short rather than throwing', speechBandOf(null) === 'speech_short')

// ⚠️ THE VERSION STRING MUST DIFFER. It is the only thing a later reader has to
// tell whether two runs were drawn the same way; reusing it would make an
// incomparable pair look like a pair.
ok('each cohort carries its own selection version',
  selectionVersionFor(COHORT_NO_SPEECH) !== selectionVersionFor(COHORT_SPEECH))
ok('the no-speech version is unchanged — old runs stay comparable',
  selectionVersionFor(COHORT_NO_SPEECH) === 'chars_zero_tiny_v1')
ok('an unknown cohort has no version and refuses', (() => {
  try { selectionVersionFor('made_up'); return false } catch { return true }
})())

{
  // Two creators per band, so one-per-creator and alternation are both visible.
  const rows = [
    { url: 'https://www.tiktok.com/@a/video/1', transcript_chars: 200 },
    { url: 'https://www.tiktok.com/@b/video/2', transcript_chars: 300 },
    { url: 'https://www.tiktok.com/@c/video/3', transcript_chars: 1500 },
    { url: 'https://www.tiktok.com/@d/video/4', transcript_chars: 2500 },
  ]
  const drawn = selectCohort(rows, 4, COHORT_SPEECH)
  ok('every row is drawn when the size allows', drawn.length === 4)
  const bands = new Set(drawn.map((r) => speechBandOf(r.transcript_chars)))
  ok('BOTH bands are represented, not one end of the distribution',
    bands.has('speech_short') && bands.has('speech_long'))

  // ⚖️ ONE PER CREATOR SURVIVES THE NEW COHORT. Ten videos from one creator are
  // ten samples of one visual situation — the failure mode a "random" draw hides.
  const sameCreator = [
    { url: 'https://www.tiktok.com/@solo/video/1', transcript_chars: 200 },
    { url: 'https://www.tiktok.com/@solo/video/2', transcript_chars: 2000 },
    { url: 'https://www.tiktok.com/@other/video/3', transcript_chars: 900 },
  ]
  const deduped = selectCohort(sameCreator, 3, COHORT_SPEECH)
  ok('one video per creator, in the speech cohort too', deduped.length === 2)

  // Deterministic: same rows, same size, same draw on any machine.
  ok('the draw is reproducible',
    JSON.stringify(selectCohort(rows, 3, COHORT_SPEECH).map((r) => r.url))
    === JSON.stringify(selectCohort([...rows].reverse(), 3, COHORT_SPEECH).map((r) => r.url)))
}

// ⚠️ AN UNKNOWN COHORT REFUSES RATHER THAN FALLING BACK. Defaulting to the
// no-speech bands would draw a SILENT sample for a caller that asked for a
// speaking one, and freeze it under whatever version string it was given.
ok('selectCohort refuses an unknown cohort', (() => {
  try { selectCohort([{ url: 'https://www.tiktok.com/@a/video/1', transcript_chars: 5 }], 1, 'nope'); return false }
  catch (e) { return String(e.message).includes('nope') }
})())
ok('the closed list is exactly the two populations',
  COHORTS.length === 2 && COHORTS.includes('no_speech') && COHORTS.includes('speech'))

// ⚖️ CONTROL: the default is unchanged. Existing callers that pass no cohort
// must still draw exactly what they drew before.
{
  const silent = [
    { url: 'https://www.tiktok.com/@x/video/1', transcript_chars: 0 },
    { url: 'https://www.tiktok.com/@y/video/2', transcript_chars: 6 },
  ]
  ok('CONTROL an omitted cohort draws the no-speech bands, as before',
    JSON.stringify(selectCohort(silent, 2).map((r) => r.url))
    === JSON.stringify(selectCohort(silent, 2, COHORT_NO_SPEECH).map((r) => r.url)))
}


// ⚠️ THE CHECK ITSELF CAN BE DISARMED BY ITS CALLER. Handed the CLAIM_PATHS
// ARRAY instead of its length, the expected product was NaN and every
// comparison against it was true -- a guard that refuses everything is as
// broken as one that refuses nothing.
{
  const progress = { states: [{ url: 'u', state: 'READY_FOR_LABEL' }] }
  const labels = CLAIM_PATHS.map((p) => ({ url: 'u', path: p }))
  ok('the packet check accepts the paths array as a count',
    checkPacketInvariants({ progress, labels, claimPaths: CLAIM_PATHS }).length === 0)
  ok('and says so rather than passing when given nothing usable',
    checkPacketInvariants({ progress, labels, claimPaths: 'not a number' }).length === 1)
}

// ⚠️ THE EXIT CHECK BELONGS AT THE END, AND IT USED TO SIT IN THE MIDDLE.
// `if (failed) process.exit(1)` ran BEFORE the last two cases, so a failure in
// either of them incremented `failed`, was never re-checked, and the file went
// on to print "all cases passed" and exit 0 -- a green selftest over a failing
// case, which is the exact shape of defect this file exists to catch.
if (failed) process.exit(1)

console.log('pilot-core selftest: all cases passed')

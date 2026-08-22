#!/usr/bin/env node
// The pilot's deciding logic, checked without credentials.
import {
  manifestDigest, freezeManifest, assertManifestUnchanged, pilotState, progressOf,
  attrition, briefFor69, TERMINAL, selectCohort, aggregate, friction, flattenClaims,
  claimsDigest, evidenceDigest, byField, bySituation, slowestFields, supportedRate,
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

if (failed) process.exit(1)
console.log('pilot-core selftest: all cases passed')

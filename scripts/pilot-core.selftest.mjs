#!/usr/bin/env node
// The pilot's deciding logic, checked without credentials.
import {
  manifestDigest, freezeManifest, assertManifestUnchanged, pilotState, progressOf,
  attrition, briefFor69, TERMINAL, selectCohort, aggregate, friction, flattenClaims,
  claimsDigest, evidenceDigest,
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

if (failed) process.exit(1)
console.log('pilot-core selftest: all cases passed')

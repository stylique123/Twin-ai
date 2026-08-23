// THE FINISH PATH MUST ACTUALLY RUN, AND NOTHING EXERCISED IT.
//
// ⚠️ THE DEFECT THIS EXISTS FOR. pilot-review's `finish` action called two
// helpers with the wrong shapes:
//
//   slowestFields(fr)                  -> TypeError: events.filter is not a function
//   armComparison(byScheduleBasis(…))  -> TypeError: labels is not iterable
//
// `friction` RETURNS a summary object; `slowestFields` TAKES the raw event array.
// `armComparison` TAKES (labels, frames) and calls byScheduleBasis itself.
// Both threw on every call, so Finish & Lock was impossible for every reviewer on
// every network -- and because the throw happened BEFORE the update, the run was
// left untouched and each retry failed identically. The owner labelled 103 claims
// and could not lock one of them.
//
// ⚖️ WHY THE EXISTING SELFTESTS DID NOT CATCH IT. They call each helper directly,
// with correct arguments. The generated pilotCore.ts carries @ts-nocheck, so the
// edge function is type-checked against nothing here. Only the real sequence put
// the wrong shapes together, and nothing ran the real sequence. This does.
import {
  aggregate, friction, briefFor69, byField, bySituation, slowestFields,
  armComparison, distributionRates, checkRateInvariants, claimsDigest, evidenceDigest,
} from './pilot-core.mjs'
import { decide332 } from './pilot-decision.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
let failed = 0
const ok = (name, fn) => {
  try { fn(); console.log(`  ok    ${name}`) }
  catch (e) { failed++; console.log(`  FAIL  ${name}: ${e && e.message}`) }
}
const assert = (c, m) => { if (!c) throw new Error(m) }

// Shaped like run 7204de6f: 8 references, 4 uniform frames each except one that
// carries a single content_beats frame, claims the model declined to answer
// (answered:false, value null, no cited frames), and all four label kinds.
const URLS = Array.from({ length: 8 }, (_, i) => `https://example.test/v${i}`)
const FRAMES = URLS.flatMap((url, i) => (i === 7
  ? [{ url, frame_index: 1, sha256: 'a'.repeat(64), at_seconds: 0, schedule_basis: 'content_beats' }]
  : [1, 2, 3, 4].map((n) => ({
    url, frame_index: n, sha256: String(n).repeat(64).slice(0, 64),
    at_seconds: n * 2.5, schedule_basis: 'uniform',
  }))))
const KINDS = ['SUPPORTED', 'UNSUPPORTED', 'INDETERMINATE', 'WRONG_EVIDENCE']
const LABELS = URLS.flatMap((url, i) => [
  ...['performance.talkingHead', 'camera.positionChanges', 'people.count', 'setting.changes']
    .map((path, j) => ({
      url, path, answered: true, value: j % 2 === 0,
      frames: [1, 2], label: KINDS[(i + j) % 4], correctedValue: null,
    })),
  // The model declined this one. It stays in the denominator.
  { url, path: 'primaryMode', answered: false, value: null, frames: [], label: null, correctedValue: null },
])

/** The EXACT sequence supabase/functions/pilot-review/index.ts runs for `finish`. */
function buildReport(events) {
  const session = { locked: true, labels: LABELS }
  const agg = aggregate(session)
  const evs = events.map((e) => ({ kind: e.kind, at: e.at, ...(e.detail ?? {}) }))
  const fr = friction(evs)
  const slow = slowestFields(evs, session.labels)
  const rates = distributionRates(agg)
  const bad = checkRateInvariants(agg)
  const attrition = {
    selected: URLS.length, ready_for_label: URLS.length, failed: 0, unreadable: 0,
    turned_out_to_have_speech: 2,
  }
  attrition.assessed_of_selected = attrition.ready_for_label / attrition.selected
  const decision = decide332({ attrition, aggregate: agg, rates })
  return {
    bad,
    decision,
    report: {
      attrition, aggregate: agg, rates,
      by_field: byField(session.labels),
      by_situation: bySituation(session.labels),
      slowest_fields: slow,
      arm_comparison: armComparison(session.labels, FRAMES),
      brief_for_69: briefFor69(fr, agg, slow),
      friction: fr,
    },
    digests: { claims: claimsDigest(session.labels), evidence: evidenceDigest(FRAMES) },
  }
}

console.log('pilot-finish selftest')

ok('the finish report builds with NO events at all — the real state of run 7204de6f', () => {
  // ⚠️ visual_pilot_events was EMPTY for the real run: logPilotEvent is
  // fire-and-forget and had never persisted a row. The empty list is not an
  // edge case here, it is the observed input.
  const { report } = buildReport([])
  assert(Array.isArray(report.slowest_fields), 'slowest_fields must be an array')
  assert(report.friction.median_ms_per_claim === null, 'no events means no median')
})

ok('the finish report builds with real events', () => {
  const events = [
    { kind: 'session_start', at: 1000 },
    { kind: 'label', at: 2000, detail: { index: 0 } },
    { kind: 'label', at: 5000, detail: { index: 1 } },
    { kind: 'nav', at: 5200, detail: { dir: -1 } },
    { kind: 'relabel', at: 6000, detail: { index: 1 } },
  ]
  const { report } = buildReport(events)
  // ⚠️ TWO, NOT THREE. `friction` counts kind === 'label'; a 'relabel' is a
  // SEPARATE kind counted as a backtrack. A first draft of this assertion said
  // three and the code was right.
  assert(report.friction.answers_given === 2, `two label events, got ${report.friction.answers_given}`)
  assert(report.friction.backtracks === 1, 'one relabel')
  assert(report.slowest_fields.length > 0, 'slowest_fields must be populated')
})

ok('the rates are possible, so the lock would not be refused', () => {
  const { bad } = buildReport([])
  assert(bad.length === 0, `rate invariants violated: ${bad.join(', ')}`)
})

ok('a decision is produced', () => {
  const { decision } = buildReport([])
  assert(decision && typeof decision === 'object', 'decide332 must return a decision')
})

ok('digests are computed over the real shapes', () => {
  const { digests } = buildReport([])
  assert(/^[0-9a-f]{64}$/.test(digests.claims), `claims digest: ${digests.claims}`)
  assert(/^[0-9a-f]{64}$/.test(digests.evidence), `evidence digest: ${digests.evidence}`)
})

ok('the single content_beats reference is reported, not silently dropped', () => {
  const { report } = buildReport([])
  const arms = report.arm_comparison.arms
  assert(arms.content_beats.status === 'measured', 'content_beats must be measured')
  assert(arms.uniform.status === 'measured', 'uniform must be measured')
})

// ── the call sites themselves, so a future edit cannot re-introduce the shapes ──
const EDGE = readFileSync(
  join(HERE, '..', 'supabase', 'functions', 'pilot-review', 'index.ts'), 'utf8')
const EDGE_CODE = EDGE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

ok('the edge function never passes friction OUTPUT to slowestFields', () => {
  assert(!/slowestFields\(\s*fr\s*\)/.test(EDGE_CODE),
    'slowestFields(fr) is the defect: friction returns an object, slowestFields takes the event array')
})

ok('the edge function never passes byScheduleBasis OUTPUT to armComparison', () => {
  assert(!/armComparison\(\s*byScheduleBasis\(/.test(EDGE_CODE),
    'armComparison takes (labels, frames) and calls byScheduleBasis itself')
})

ok('the edge function calls slowestFields and armComparison with TWO arguments each', () => {
  for (const fn of ['slowestFields', 'armComparison']) {
    const m = EDGE_CODE.match(new RegExp(`${fn}\\(([^)]*(?:\\([^)]*\\))?[^)]*)\\)`))
    assert(m, `${fn} is not called in the edge function`)
    const depth0Commas = (() => {
      let d = 0, n = 0
      for (const ch of m[1]) {
        if (ch === '(') d++
        else if (ch === ')') d--
        else if (ch === ',' && d === 0) n++
      }
      return n
    })()
    assert(depth0Commas === 1, `${fn} must take 2 arguments, got ${depth0Commas + 1}: ${fn}(${m[1]})`)
  }
})

// ⚠️ THE EXIT CHECK BELONGS AT THE END.
if (failed) { console.log(`\n${failed} case(s) failed`); process.exit(1) }
console.log('\nall cases passed')

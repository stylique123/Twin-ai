#!/usr/bin/env node
// Credential-free: the sweep injects every dependency, so its logic is testable
// with fakes on a machine that has never seen staging.
import { slopeOf, zoomRequestsFor, SWEEP_ZOOM_COUNTS, runZoomSweep , missingSweepDeps, SWEEP_DEPS } from './zoomSweep.mjs'

let pass = 0, fail = 0
const eq = (what, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : (fail++, console.error(`FAIL ${what}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`))
}
const ok = (what, cond, d = '') => { cond ? pass++ : (fail++, console.error(`FAIL ${what} ${d}`)) }
const row = (zoom, delta) => ({ zoom_count: zoom, duration_delta_ms: delta })

// ── the verdict, and the case that looks like a pass ─────────────────────────
// ⚠️ THE CENTRAL CASE. Five frames lost per zoom at 30fps is ~-165ms per zoom.
// Every one of these renders could sit inside ±250ms and "pass"; the slope says
// the mechanism is still there.
eq('5 frames lost per zoom is the defect, tolerance or not',
  slopeOf([row(0, 0), row(1, -165), row(2, -330), row(3, -495)]).verdict, 'CORRELATION_PERSISTS')
eq('even ONE frame per zoom is the defect',
  slopeOf([row(0, 0), row(1, -33), row(2, -66), row(3, -99)]).verdict, 'CORRELATION_PERSISTS')
eq('a quarter frame per zoom is noise, not mechanism',
  slopeOf([row(0, 0), row(1, -8), row(2, -16), row(3, -24)]).verdict, 'CORRELATION_GONE')
eq('flat is what #445 predicts',
  slopeOf([row(0, 5), row(1, -3), row(2, 4), row(3, -2)]).verdict, 'CORRELATION_GONE')
// ⚖️ Renders getting LONGER with zooms is not this defect. The old path lost
// frames; refusing a positive slope would report an unrelated problem as this one.
eq('renders getting longer is not this defect',
  slopeOf([row(0, 0), row(1, 100), row(2, 200)]).verdict, 'CORRELATION_GONE')

// ── insufficient evidence is NOT a pass ──────────────────────────────────────
eq('one zoom count cannot show a trend', slopeOf([row(1, -500)]).verdict, 'INSUFFICIENT_EVIDENCE')
eq('no rows at all is not a pass', slopeOf([]).verdict, 'INSUFFICIENT_EVIDENCE')
eq('many rows at ONE zoom count is still one bucket',
  slopeOf([row(2, -10), row(2, -12), row(2, -11)]).verdict, 'INSUFFICIENT_EVIDENCE')

// ── absent is not zero ───────────────────────────────────────────────────────
// ⚠️ A pre-0164 row has no zoom_count. Folding it into the 0 bucket invents a
// data point at exactly the place the fit is most sensitive.
{
  const r = slopeOf([{ zoom_count: null, duration_delta_ms: -900 }, row(1, -10), row(2, -20)])
  eq('a null zoom_count is excluded', r.excluded, 1)
  eq('and does not become a 0 bucket', r.points.map((p) => p.zoom), [1, 2])
}
eq('a row with no delta is excluded too',
  slopeOf([row(0, null), row(1, -10), row(2, -20)]).excluded, 1)

// ── buckets are averaged before the fit ──────────────────────────────────────
// ⚖️ Twenty clean 1-zoom rows must not outvote the single 3-zoom row carrying
// the signal — that is how a real defect gets averaged into nothing.
{
  const many = Array.from({ length: 20 }, () => row(1, 0))
  eq('one loud bucket is not drowned by a crowded one',
    slopeOf([...many, row(3, -600)]).verdict, 'CORRELATION_PERSISTS')
}

// ── anchors index real words ─────────────────────────────────────────────────
eq('zero zooms needs no anchors', zoomRequestsFor(0, 50), [])
ok('anchors stay inside the transcript',
  zoomRequestsFor(3, 40).every((z) => z.anchorWordIndex >= 0 && z.anchorWordIndex < 40))
{
  const a = zoomRequestsFor(3, 40).map((z) => z.anchorWordIndex)
  eq('anchors are distinct — directorContract refuses duplicates', new Set(a).size, a.length)
  ok('and spread rather than packed at the front', Math.max(...a) - Math.min(...a) > 5)
}
// ⚠️ REPORT, DO NOT GUESS. A transcript too short for the anchors returns null
// so the caller records why that zoom count was skipped.
eq('too few words returns null rather than an invalid anchor', zoomRequestsFor(5, 3), null)
eq('an unknown word count returns null', zoomRequestsFor(2, undefined), null)
ok('every requested anchor carries a valid intensity and reason',
  zoomRequestsFor(2, 30).every((z) => z.intensity === 'subtle' && z.reasonCode === 'emphasis_word'))

// ── one failure must not lose the rest of the sweep ──────────────────────────
{
  let calls = 0
  const deps = {
    admin: { rpc: async () => ({ error: null }), from: () => ({ update: () => ({ eq: async () => ({}) }), select: () => ({ eq: async () => ({ data: [row(calls, -1)] }) }) }) },
    fixtures: {
      scratchProject: async () => 'p', advanceTo: async () => {}, dirBegin: async () => ({}),
      fabricateLease: async () => { calls++; if (calls === 2) throw new Error('boom'); return { jobId: 'j', worker: 'w', attempt: 1 } },
    },
    sha256: (s) => `sha(${s})`,
    newGen: async () => 'g',
    wordCountFor: async () => 100,
    runToSettled: async () => ({ status: 'completed' }),
    donorAssetId: 'a', ownerId: 'o',
  }
  const r = await runZoomSweep(deps)
  eq('a failing zoom count is recorded, not fatal', r.notes.length, 1)
  ok('the note names the zoom count', /zoom 1:/.test(r.notes[0]), r.notes[0])
  eq('the other three still produced rows', r.collected, 3)
  eq('and the sweep says how many it attempted', r.attempted, SWEEP_ZOOM_COUNTS.length)
}


// ── the dependency guard ──────────────────────────────────────────────────
//
// ⚠️ THIS IS THE BUG THAT COST A 90-MINUTE MATRIX. phase8 referenced a `sha256`
// helper it never defined. Destructuring produced `undefined` rather than an
// error, node --check passed (syntax only), these selftests passed (they inject
// their own helpers), and the ReferenceError surfaced 42 minutes in — inside the
// advisory catch, which kept the matrix green while the experiment produced
// nothing at all.
const fullDeps = () => ({
  admin: {}, fixtures: {}, sha256: () => 'x', newGen: () => {}, wordCountFor: () => 0,
  runToSettled: () => {}, donorAssetId: 'a', ownerId: 'o',
})
ok('a complete dependency set has nothing missing', missingSweepDeps(fullDeps()).length === 0)
ok('a missing sha256 is NAMED, not discovered later', (() => {
  const d = fullDeps(); delete d.sha256
  return missingSweepDeps(d).length === 1 && missingSweepDeps(d)[0] === 'sha256'
})())
ok('an explicitly undefined dependency counts as missing', (() => {
  const d = fullDeps(); d.newGen = undefined
  return missingSweepDeps(d).includes('newGen')
})())
// ⚠️ NULL IS MISSING TOO. A helper that resolved to null would fail on first
// call with a less useful message than this one.
ok('a null dependency counts as missing', (() => {
  const d = fullDeps(); d.fixtures = null
  return missingSweepDeps(d).includes('fixtures')
})())
ok('no deps at all names every one of them', missingSweepDeps({}).length === SWEEP_DEPS.length)
ok('an absent object is refused rather than throwing', missingSweepDeps(undefined).length === SWEEP_DEPS.length)
// ⚠️ `log` IS NOT REQUIRED. It is optional by design, and demanding it would
// make the guard refuse a legitimate caller.
ok('log is deliberately NOT a required dependency', !SWEEP_DEPS.includes('log'))
// The refusal must fire before any work is attempted, and must say which.
await (async () => {
  const d = fullDeps(); delete d.sha256
  try { await runZoomSweep(d); ok('runZoomSweep refuses without sha256', false) }
  catch (e) { ok('runZoomSweep refuses without sha256, naming it', e.message.includes('sha256')) }
})()

console.log(`zoom-sweep selftest: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

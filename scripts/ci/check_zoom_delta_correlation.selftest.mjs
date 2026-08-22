#!/usr/bin/env node
// ⚠️ THE CASE THIS SUITE EXISTS FOR IS THE ONE THAT LOOKS LIKE A PASS.
// A run losing five frames per zoom while every render sits inside ±250 ms is
// the ORIGINAL DEFECT wearing a tolerance-shaped hat. If this file only tested
// obvious failures it would bless exactly that.
import {
  verdict, byZoomCount, slopePerZoom, deltaFromRenderable, SLOPE_TOLERANCE_MS_PER_ZOOM,
} from './check_zoom_delta_correlation.mjs'

let pass = 0, fail = 0
const ok = (n, c) => { if (c) pass++; else { fail++; console.error(`  FAIL  ${n}`) } }

const FRAME = 1000 / 29.97   // ~33.37 ms
/** A render row as render_attempts stores it. */
const row = (zoom, deltaMs) => ({
  zoom_count: zoom, predicted_duration_ms: 6000, actual_duration_ms: 6000 + deltaMs,
})

// ── the arithmetic ────────────────────────────────────────────────────────
ok('delta is measured from the RENDERABLE duration, not the request',
  deltaFromRenderable({ predicted_duration_ms: 5967, actual_duration_ms: 5967 }) === 0)
ok('a row missing a duration yields null rather than 0',
  deltaFromRenderable({ predicted_duration_ms: null, actual_duration_ms: 1 }) === null)

// ── the fixed renderer ────────────────────────────────────────────────────
{
  const rows = [0, 1, 2, 3].flatMap((z) => [row(z, 0), row(z, 1), row(z, -1)])
  const v = verdict(rows)
  ok('a renderer with no per-zoom loss is CORRELATION_GONE', v.verdict === 'CORRELATION_GONE')
  ok('...and reports a slope near zero', Math.abs(v.slopeMsPerZoom) < 1)
  ok('...across all four zoom counts', v.summary.length === 4)
}

// ── THE TRAP: inside tolerance, still losing frames per zoom ───────────────
{
  // Five frames per zoom ≈ 167 ms/zoom. At 3 zooms that is ~500 ms — but
  // suppose the tolerance were wide enough that nothing "failed". The slope
  // still says the mechanism is alive.
  const rows = [0, 1, 2, 3].flatMap((z) => [row(z, -5 * FRAME * z), row(z, -5 * FRAME * z - 2)])
  const v = verdict(rows)
  ok('losing five frames per zoom is CORRELATION_PERSISTS even if nothing failed',
    v.verdict === 'CORRELATION_PERSISTS')
  ok('...and names the per-zoom cost', v.reason.includes('per zoom'))
  ok('...and says a passing tolerance does not rescue it',
    v.reason.includes('whether or not any individual render passed'))
}
{
  // ⚠️ THE SUBTLER TRAP: ONE frame per zoom. Small, inside any tolerance, and
  // exactly the mechanism. Must still be refused.
  const rows = [0, 1, 2, 3].map((z) => row(z, -FRAME * z))
  ok('even ONE frame per zoom is refused', verdict(rows).verdict === 'CORRELATION_PERSISTS')
}
{
  // Half a frame per zoom is below the tolerance and is called noise.
  const rows = [0, 1, 2, 3].map((z) => row(z, -(FRAME / 4) * z))
  ok('a quarter-frame per zoom is within noise and passes',
    verdict(rows).verdict === 'CORRELATION_GONE')
}

// ── insufficient evidence is not a pass ───────────────────────────────────
{
  const oneBucket = [row(1, 0), row(1, -2), row(1, 3)]
  const v = verdict(oneBucket)
  ok('a single zoom count cannot prove a trend', v.verdict === 'INSUFFICIENT_EVIDENCE')
  ok('...and it is NOT reported as gone', v.verdict !== 'CORRELATION_GONE')
  ok('...and says how many buckets it had', v.reason.includes('1 distinct zoom count'))
  ok('an empty sample is INSUFFICIENT_EVIDENCE, never a pass',
    verdict([]).verdict === 'INSUFFICIENT_EVIDENCE')
}

// ── absent is not zero ────────────────────────────────────────────────────
{
  const mixed = [row(null, -500), row(null, -500), row(0, 0), row(1, 0), row(2, 0)]
  const { summary, unattributed } = byZoomCount(mixed)
  ok('rows with no zoom_count are EXCLUDED, not folded into the 0 bucket',
    unattributed === 2 && (summary.find((s) => s.zoomCount === 0)?.n ?? 0) === 1)
  ok('...and they cannot drag the verdict', verdict(mixed).verdict === 'CORRELATION_GONE')
}

// ── one bucket cannot outvote the signal ──────────────────────────────────
{
  // Twenty clean 1-zoom renders and one badly-short 3-zoom render. An
  // unweighted mean over ROWS would drown the signal; the summary averages
  // per bucket so it does not.
  const rows = [
    ...Array.from({ length: 20 }, () => row(1, 0)),
    row(3, -6 * FRAME),
  ]
  ok('a crowded clean bucket does not hide one bad higher-zoom render',
    verdict(rows).verdict === 'CORRELATION_PERSISTS')
}

// ── a render getting LONGER with zooms is not this defect ──────────────────
{
  const rows = [0, 1, 2, 3].map((z) => row(z, +2 * FRAME * z))
  ok('positive drift is not refused — the seam loss was always negative',
    verdict(rows).verdict === 'CORRELATION_GONE')
}

ok('the tolerance is under half a frame', SLOPE_TOLERANCE_MS_PER_ZOOM < FRAME / 2)

console.log(`zoom-delta-correlation selftest: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)

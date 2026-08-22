#!/usr/bin/env node
// DID THE DEFECT DISAPPEAR, OR DID IT GET A BIGGER HAT?
//
// ── WHAT #65 ACTUALLY FOUND ───────────────────────────────────────────────
//
// One render in the 2026-08-20 matrix failed on duration. It differed from the
// fifteen that passed by exactly one thing: it had 2 zooms and they had 1. The
// decomposed renderer lost frames at every seam, so the error GREW with the
// zoom count -- 184 target, 1/2/3 zooms rendering 181/176/170.
//
// ⚠️ SO "THE RENDER PASSED" IS NOT THE ACCEPTANCE CRITERION, AND ACCEPTING IT
// WOULD RECREATE THE DEFECT WEARING A TOLERANCE-SHAPED HAT. A run that loses
// five frames per zoom and still lands inside ±250 ms has exactly the same
// mechanism as the one that failed; it just has fewer zooms. The property that
// must hold is about the SLOPE:
//
//     duration error does not grow with zoomCount
//
// ⚖️ AND THE QUANTISATION IS NOT THE ENCODER'S FAULT. Error is measured from
// renderableDurationMs -- the frame-grid duration the renderer can actually
// emit -- never from the Director's request. Measuring from the request would
// charge every render for a frame it could not produce and bury the signal in
// a constant offset.

/** A frame at 30000/1001 is ~33.37 ms. A per-zoom slope smaller than half a
 *  frame is not a seam loss; it is arithmetic noise. Deliberately tight: the
 *  measured defect was a WHOLE frame per seam and then some. */
export const SLOPE_TOLERANCE_MS_PER_ZOOM = 16

export function deltaFromRenderable(row) {
  // ⚠️ null MUST NOT BECOME 0. `Number(null)` is 0 and `Number.isFinite(0)` is
  // true, so a row missing a duration would silently compute its delta against
  // zero — a six-second "loss" that would dominate every bucket it landed in.
  // Absent is not zero, checked before the coercion rather than after it.
  const a = row?.actual_duration_ms
  const r = row?.predicted_duration_ms
  if (a === null || a === undefined || r === null || r === undefined) return null
  const actual = Number(a)
  const renderable = Number(r)
  if (!Number.isFinite(actual) || !Number.isFinite(renderable)) return null
  return actual - renderable
}

/**
 * Group by zoom count and average.
 *
 * ⚠️ A NULL zoomCount IS EXCLUDED AND COUNTED, NEVER TREATED AS 0. Rows written
 * before 0164 do not know their zoom count; folding them into the 0-zoom bucket
 * would dilute exactly the comparison this exists to make.
 */
export function byZoomCount(rows) {
  const buckets = new Map()
  let unattributed = 0
  for (const r of rows ?? []) {
    const z = r.zoom_count
    const d = deltaFromRenderable(r)
    if (z === null || z === undefined || d === null) { unattributed++; continue }
    const k = Number(z)
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k).push(d)
  }
  const summary = [...buckets.entries()]
    .map(([zoomCount, deltas]) => ({
      zoomCount,
      n: deltas.length,
      meanDeltaMs: deltas.reduce((a, b) => a + b, 0) / deltas.length,
      worstDeltaMs: Math.min(...deltas),
    }))
    .sort((a, b) => a.zoomCount - b.zoomCount)
  return { summary, unattributed }
}

/**
 * Least-squares slope of mean delta against zoom count, weighted by nothing:
 * each zoom count contributes once, so a bucket with twenty 1-zoom renders
 * cannot outvote the single 3-zoom render that carries the signal.
 */
export function slopePerZoom(summary) {
  if (summary.length < 2) return null
  const n = summary.length
  const mx = summary.reduce((a, s) => a + s.zoomCount, 0) / n
  const my = summary.reduce((a, s) => a + s.meanDeltaMs, 0) / n
  let num = 0, den = 0
  for (const s of summary) {
    num += (s.zoomCount - mx) * (s.meanDeltaMs - my)
    den += (s.zoomCount - mx) ** 2
  }
  return den === 0 ? null : num / den
}

/**
 * The verdict.
 *
 * ⚠️ INSUFFICIENT_EVIDENCE IS A REAL ANSWER AND IS NOT A PASS. One zoom count
 * cannot show a trend. Reporting "no correlation found" from a single bucket is
 * how an unrun experiment becomes a green tick.
 */
export function verdict(rows, tolerance = SLOPE_TOLERANCE_MS_PER_ZOOM) {
  const { summary, unattributed } = byZoomCount(rows)
  const zoomCounts = summary.map((s) => s.zoomCount)
  if (summary.length < 2) {
    return {
      verdict: 'INSUFFICIENT_EVIDENCE',
      reason: `only ${summary.length} distinct zoom count(s) in the sample (${zoomCounts.join(', ') || 'none'}). `
        + 'A slope needs at least two, and the claim is specifically that error does not GROW with zoom count.',
      summary, unattributed,
    }
  }
  const slope = slopePerZoom(summary)
  if (slope === null) {
    return { verdict: 'INSUFFICIENT_EVIDENCE', reason: 'the zoom counts do not vary', summary, unattributed }
  }
  // ⚠️ ONE-SIDED ON PURPOSE. Renders coming out LONGER as zooms increase is not
  // the defect and is not what this refuses; the seam loss was always negative.
  const grows = slope < -tolerance
  return {
    verdict: grows ? 'CORRELATION_PERSISTS' : 'CORRELATION_GONE',
    slopeMsPerZoom: slope,
    tolerance,
    reason: grows
      ? `duration error still grows by ${Math.abs(slope).toFixed(1)} ms per zoom — that is the seam-loss `
        + 'mechanism, whether or not any individual render passed its tolerance'
      : `duration error does not grow with zoom count (slope ${slope.toFixed(1)} ms/zoom, `
        + `within ±${tolerance})`,
    summary,
    unattributed,
  }
}

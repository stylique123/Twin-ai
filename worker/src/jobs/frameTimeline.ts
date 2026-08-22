// A DURATION THE RENDERER CANNOT PRODUCE IS NOT A TARGET, IT IS A WISH.
//
// ⚠️ MEASURED, NOT SUPPOSED. Every one of the fifteen render attempts recorded
// in `render_attempts` came out SHORT — never long, never on target:
//
//     predicted 6170  actual 6033  delta -137   (x5, identical plan)
//     predicted 5880  actual 5767  delta -113   (x7, identical plan)
//     predicted 6170  actual 5867  delta -303   (the one that failed CI)
//
// Two separate defects produce that, and only one of them is the renderer's.
//
// THE FIRST IS HERE. The compiler derives `output.durationMs` as
// `sum(segment durations) - sum(overlaps)` in integer MILLISECONDS, and the
// renderer emits whole FRAMES. 6170 ms at 30 fps is 185.1 frames: there is no
// output the renderer could ever produce that hits it. The validator was
// comparing a frame-quantised measurement against a target outside the set of
// reachable values, and then attributing the difference to the renderer.
//
// ⚖️ SO THE CREATIVE INTENT AND THE RENDERABLE TARGET ARE NAMED SEPARATELY AND
// BOTH ARE KEPT. Silently rewriting `durationMs` to the nearest frame would
// erase the Director's intent; validating against the un-rounded intent blames
// physics for arithmetic. The quantisation gap is recorded so it stays visible
// instead of being absorbed into a tolerance.

/** A half-open range of output frames. `endFrameExclusive` is exclusive so that
 *  adjacent pieces tile with no gap and no overlap -- the property millisecond
 *  boundaries could not guarantee. */
export interface FrameRange {
  readonly startFrame: number
  readonly endFrameExclusive: number
}

export interface ResolvedDuration {
  /** What the Director asked for. Never modified. */
  readonly requestedDurationMs: number
  /** What the renderer will actually emit. */
  readonly targetFrameCount: number
  readonly renderableDurationMs: number
  /** ⚠️ THE PART THAT IS NOBODY'S FAULT, KEPT VISIBLE. Negative when the request
   *  sits above the reachable frame, positive when below. Folding this into a
   *  tolerance is how a systematic bias hides for fifteen runs. */
  readonly planQuantizationDeltaMs: number
}

const bad = (m: string): never => { throw new Error(`frame timeline: ${m}`) }

export function frameDurationMs(fpsNum: number, fpsDen: number): number {
  if (!Number.isFinite(fpsNum) || !Number.isFinite(fpsDen) || fpsNum <= 0 || fpsDen <= 0) {
    bad(`fps ${fpsNum}/${fpsDen} is not a positive rate`)
  }
  return (1000 * fpsDen) / fpsNum
}

/**
 * The frame count a cut of `durationMs` contributes.
 *
 * ⚠️ FLOOR, BECAUSE THAT IS WHAT THE RENDERER DOES. `trim` passes frames whose
 * presentation time falls inside the range, so a 2710 ms cut at 30 fps yields
 * 81 frames and not 81.3. Rounding here would make the predicted total
 * unreachable in the other direction, which is the same defect mirrored.
 */
export function framesInCut(durationMs: number, fpsNum: number, fpsDen: number): number {
  if (!Number.isInteger(durationMs) || durationMs <= 0) bad(`cut duration ${durationMs} is not a positive integer ms`)
  return Math.floor((durationMs * fpsNum) / (1000 * fpsDen))
}

/**
 * Resolve what the render will actually be, from the cuts that will actually run.
 *
 * ⚠️ THE TARGET COMES FROM THE RESOLVED CUTS, NOT FROM THE PLAN'S TOTAL. Those
 * are different numbers whenever a cut boundary is not on the frame grid, and
 * the difference is exactly the bias that made every attempt come out short.
 */
export function resolveDuration(
  segmentDurationsMs: readonly number[], overlapsMs: readonly number[],
  fpsNum: number, fpsDen: number,
): ResolvedDuration {
  if (segmentDurationsMs.length === 0) bad('a timeline with no segments has no duration')
  if (overlapsMs.length !== segmentDurationsMs.length) bad('overlaps must be parallel to segments')
  const frame = frameDurationMs(fpsNum, fpsDen)

  const requestedDurationMs =
    segmentDurationsMs.reduce((a, b) => a + b, 0) - overlapsMs.reduce((a, b) => a + b, 0)
  if (requestedDurationMs <= 0) bad(`the timeline resolves to ${requestedDurationMs} ms`)

  // Each cut floors independently, because each is trimmed independently.
  let targetFrameCount = segmentDurationsMs.reduce((n, d) => n + framesInCut(d, fpsNum, fpsDen), 0)
  for (const o of overlapsMs) {
    if (o > 0) targetFrameCount -= framesInCut(o, fpsNum, fpsDen)
  }
  if (targetFrameCount <= 0) bad('the timeline resolves to no frames')

  const renderableDurationMs = targetFrameCount * frame
  return {
    requestedDurationMs,
    targetFrameCount,
    renderableDurationMs,
    planQuantizationDeltaMs: renderableDurationMs - requestedDurationMs,
  }
}

/**
 * Turn millisecond window boundaries into frame ranges that TILE the timeline.
 *
 * ⚠️ A WINDOW THAT QUANTISES TO ZERO FRAMES IS ABSORBED, NOT EMITTED. The zoom
 * ease is sliced into five steps per ramp; at 250 ms that is 50 ms a step, which
 * is 1.5 frames at 30 fps. A window shorter than one frame cannot be represented
 * on the output timeline, and emitting it as its own independently retimed piece
 * is how frames go missing at the seams.
 *
 * ⚖️ AND THE SUM IS THE CONTRACT. The returned ranges cover exactly
 * `targetFrameCount` frames, contiguously, or this throws -- a renderer that
 * silently produced fewer is the defect this module exists for.
 */
export function resolveWindows(
  boundariesMs: readonly number[], targetFrameCount: number, fpsNum: number, fpsDen: number,
): FrameRange[] {
  const frame = frameDurationMs(fpsNum, fpsDen)
  const snapped = boundariesMs.map((ms) => Math.min(targetFrameCount, Math.max(0, Math.round(ms / frame))))
  const bounds = [...new Set([0, ...snapped, targetFrameCount])].sort((a, b) => a - b)

  const ranges: FrameRange[] = []
  for (let i = 0; i < bounds.length - 1; i++) {
    // Collapsed windows are simply not emitted; the next boundary absorbs them.
    if (bounds[i + 1] > bounds[i]) ranges.push({ startFrame: bounds[i], endFrameExclusive: bounds[i + 1] })
  }
  assertTiles(ranges, targetFrameCount)
  return ranges
}

/** The invariant, asserted before ffmpeg is ever invoked. */
export function assertTiles(ranges: readonly FrameRange[], targetFrameCount: number): void {
  if (ranges.length === 0) bad('no frame ranges')
  if (ranges[0].startFrame !== 0) bad(`the timeline starts at frame ${ranges[0].startFrame}, not 0`)
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i]
    if (r.endFrameExclusive <= r.startFrame) bad(`range ${i} covers no frames`)
    if (i > 0 && ranges[i - 1].endFrameExclusive !== r.startFrame) {
      bad(`range ${i} starts at ${r.startFrame} but ${i - 1} ended at ${ranges[i - 1].endFrameExclusive}`
        + ' -- a gap or an overlap here is a frame that will be dropped or shown twice')
    }
  }
  const total = ranges.reduce((n, r) => n + (r.endFrameExclusive - r.startFrame), 0)
  if (total !== targetFrameCount) {
    bad(`the pieces cover ${total} frames but the timeline resolves to ${targetFrameCount}. `
      + 'A count that does not add up means the render will not be the length the plan says.')
  }
}

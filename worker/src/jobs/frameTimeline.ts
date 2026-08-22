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

// ── CONTINUOUS ZOOM, COMPOSED FROM INDIVIDUALLY VALIDATED GATES ─────────────
//
// ⚠️ THE DECOMPOSITION WAS THE DEFECT. Slicing the timeline into independently
// retimed `trim`+`setpts`+`concat` pieces loses frames at every seam, and the
// loss scales with the number of seams. Measured on the real fixture against a
// resolved target of 184 frames:
//
//     decomposed   1 zoom -> 181     2 zooms -> 176     3 zooms -> 170
//     continuous   1 zoom -> 184     2 zooms -> 184     3 zooms -> 184
//
// Frame-exact boundary arithmetic does not rescue the decomposition: a run with
// every piece >= 1 frame and an exact tiling sum still rendered 181 of 184. The
// seams are the mechanism, so the seams are what is removed.
//
// ⚖️ AND THE SAFETY GRAMMAR DOES NOT MOVE TO ALLOW IT. A gate is expressible
// with no comma, because ffmpeg's evaluator has single-argument functions:
//
//     d    = h - abs(in - c)           distance inside a window of half-width h
//     pos  = (d + abs(d)) / 2          d when inside, 0 when outside
//     gate = not(not(pos))             1 when inside, 0 when outside
//
// Each gate is its own value, validated on its own against the SAME 64-char
// limit the rest of the graph obeys. The renderer composes them; the planner
// never holds one enormous expression. A limit that moves because one
// implementation happened to emit 69 characters is a limit that has stopped
// being one.

/** One zoom window, as a value the filter grammar already accepts. */
export interface SafeZoomGate {
  readonly startFrame: number
  readonly endFrameExclusive: number
  /** Composed by the renderer from `cores`, which are what get validated. */
  readonly expression: string
  /** The ramp components. These are the values the grammar checks. */
  readonly cores: readonly string[]
  readonly scaleMilli: number
}

export interface ContinuousZoomPlan {
  readonly targetFrameCount: number
  readonly gates: readonly SafeZoomGate[]
}

/** The same bound the graph builder enforces, restated so this module refuses
 *  before a caller ever reaches `checkValue`. */
export const VALUE_MAX_LEN = 64
const VALUE_CHARS = /^[A-Za-z0-9_.*/+()\-]+$/

export function isSafeValue(v: string): boolean {
  return v.length > 0 && v.length <= VALUE_MAX_LEN && VALUE_CHARS.test(v)
}

/**
 * A HARD-STEP gate for `[startFrame, endFrameExclusive)`.
 *
 * ⚠️ THIS IS NOT A ZOOM. Frame-by-frame inspection of a 1080x1920 grid fixture
 * showed the scale arriving in a single frame: 82 normal, 83 already at target,
 * 84 the same. At 6% that reads as a deliberate punch; at 12% it is simply
 * broken motion. Kept and NAMED because a punch is a legitimate short-form
 * effect -- but a zoom must ease, so `zoomGateExpression` is what zooms use.
 *
 * ⚠️ CENTRE/HALF-WIDTH, NOT TWO ONE-SIDED GATES. Two gates multiplied together
 * is the obvious form and costs 57 characters; this costs 44.
 */
export function punchInGateExpression(startFrame: number, endFrameExclusive: number): string {
  if (!Number.isInteger(startFrame) || !Number.isInteger(endFrameExclusive)) {
    bad('a zoom gate needs integer frame bounds')
  }
  const span = endFrameExclusive - startFrame
  // ⚠️ A WINDOW SHORTER THAN A FRAME IS NOT RENDERABLE AND MUST NOT BE EMITTED.
  if (span < 1) bad(`a zoom window of ${span} frame(s) cannot be gated; collapse it first`)
  // ⚠️ THE WINDOW IS HALF-OPEN, SO IT COVERS start..end-1 INCLUSIVE. The
  // obvious centre/half-width form tests `h - abs(in-c) > 0`, which EXCLUDES
  // both endpoints -- the punch arrived one frame late and left one frame
  // early. Doubling keeps the centre an integer for an even span, and the +1
  // turns the strict comparison into an inclusive one.
  const C = startFrame + endFrameExclusive - 1
  const H = endFrameExclusive - 1 - startFrame + 1
  // ⚠️ `in`, NOT `n`. Inside zoompan, `n` is the filter's OUTPUT frame counter
  // and `in` is the input frame index. Emitting `n` here produced a graph
  // ffmpeg refused outright -- caught by rendering the module's own output
  // rather than a hand-written approximation of it.
  return `not(not((${H}-abs(2*in-${C})+abs(${H}-abs(2*in-${C})))/2))`
}

/**
 * The RAMP CORE: `max((in - edge)/easeFrames, 0)`, comma-free.
 *
 * ⚠️ THIS IS THE COMPONENT THAT GETS VALIDATED. 23-25 characters. The renderer
 * composes the `min(_, 1)` cap and the entry x exit product around it, so no
 * single value ever has to grow past the limit to buy smooth motion.
 */
export function rampCoreExpression(edge: number, easeFrames: number, rising: boolean): string {
  if (!Number.isInteger(edge)) bad(`ramp edge ${edge} is not an integer frame`)
  if (!Number.isInteger(easeFrames) || easeFrames < 1) {
    bad(`an ease of ${easeFrames} frame(s) cannot ramp; use the punch-in gate instead`)
  }
  const t = rising ? `in-${edge}` : `${edge}-in`
  // max(x,0) = (x + abs(x)) / 2, folded into the /easeFrames division.
  return `((${t})+abs(${t}))/${2 * easeFrames}`
}

/** `min(core, 1)`. Composed by the renderer from an already-validated core. */
// ⚠️ PARENTHESISED. Without the outer brackets `cap(a)*cap(b)` emits
// `1-X/2*1-Y/2`, which precedence reads as `1 - X/2 - Y/2`. That happens to
// equal the product whenever at most one ramp is partial -- which is every
// ordinary window -- and diverges only when the entry and exit ramps OVERLAP,
// i.e. on a short zoom. A bug the common case agrees with is the kind that
// ships.
const cap = (core: string): string => `(1-((1-${core})+abs(1-${core}))/2)`

/**
 * The EASED gate: rise over `easeFrames`, hold, fall over `easeFrames`.
 *
 * ⚖️ THE VISUAL FIXTURE FOUND WHAT THE FRAME COUNT COULD NOT. A step gate
 * passes every count assertion and still looks like a cut. Motion correctness
 * and frame correctness are different properties and both needed measuring.
 */
export function zoomGateExpression(
  startFrame: number, endFrameExclusive: number, easeFrames = 8,
): { cores: string[]; expression: string } {
  const span = endFrameExclusive - startFrame
  if (span < 1) bad(`a zoom window of ${span} frame(s) cannot be gated; collapse it first`)
  // ⚠️ A WINDOW TOO SHORT TO HOLD TWO RAMPS CANNOT EASE. Rather than silently
  // producing a step and calling it a zoom, the ease is shortened to fit, and
  // a window that cannot fit even one frame each way is refused above.
  const e = Math.max(1, Math.min(easeFrames, Math.floor(span / 2)))
  const upCore = rampCoreExpression(startFrame, e, true)
  const downCore = rampCoreExpression(endFrameExclusive, e, false)
  for (const c of [upCore, downCore]) {
    if (!isSafeValue(c)) bad(`ramp core is not a safe value: ${c.length} chars`)
  }
  return { cores: [upCore, downCore], expression: `${cap(upCore)}*${cap(downCore)}` }
}

/** Build the plan. Every gate is validated ALONE, before anything is joined. */
export function buildContinuousZoomPlan(
  zooms: ReadonlyArray<{ startFrame: number; endFrameExclusive: number; scaleMilli: number }>,
  targetFrameCount: number,
): ContinuousZoomPlan {
  const gates = zooms.map((z) => {
    const { cores, expression } = zoomGateExpression(z.startFrame, z.endFrameExclusive)
    // ⚠️ THE CORES ARE WHAT THE GRAMMAR CHECKS, not the composed product.
    for (const c of cores) if (!isSafeValue(c)) {
      // Named per gate, not per blob: a caller learns WHICH window is the
      // problem instead of being handed one rejected wall of text.
      bad(`a ramp core for frames ${z.startFrame}..${z.endFrameExclusive} is not a safe value: `
        + `${c.length} chars`)
    }
    if (z.endFrameExclusive > targetFrameCount) {
      bad(`a zoom ends at frame ${z.endFrameExclusive} but the timeline is ${targetFrameCount}`)
    }
    return { startFrame: z.startFrame, endFrameExclusive: z.endFrameExclusive, expression, cores, scaleMilli: z.scaleMilli }
  })
  return { targetFrameCount, gates }
}

/**
 * Compose the validated gates into the `zoompan` z expression.
 *
 * ⚠️ COMPOSITION IS THE RENDERER'S JOB AND HAPPENS AFTER VALIDATION. The join
 * characters are themselves inside the allowed set, so the result cannot smuggle
 * a terminator that its parts did not already contain.
 */
export function composeZoomExpression(plan: ContinuousZoomPlan): string {
  for (const g of plan.gates) {
    for (const c of g.cores) {
      if (!isSafeValue(c)) bad(`a ramp core reached composition unvalidated: ${c}`)
    }
  }
  if (plan.gates.length === 0) return '1'
  const terms = plan.gates.map((g) => {
    const amount = ((g.scaleMilli - 1000) / 1000).toFixed(3)
    return `${amount}*${g.expression}`
  })
  return `1+${terms.join('+')}`
}

/**
 * ⚠️ DEFENCE IN DEPTH, KEPT EVEN THOUGH IT SHOULD BE UNREACHABLE. If a later
 * change turns the continuous filter back into seventeen little clips, this
 * refuses to render rather than shipping a video that is quietly short.
 */
export const EFFECT_TIMELINE_NOT_FRAME_PRESERVING = 'EFFECT_TIMELINE_NOT_FRAME_PRESERVING'

export function assertFramePreserving(
  strategy: 'continuous' | 'decomposed', plan: ContinuousZoomPlan,
): void {
  if (strategy !== 'continuous') {
    throw new Error(`${EFFECT_TIMELINE_NOT_FRAME_PRESERVING}: a ${strategy} effect timeline cannot `
      + 'be proven to preserve the target frame count. Measured loss scales with seam count '
      + '(184 target: 1 zoom 181, 2 zooms 176, 3 zooms 170). Refusing to render.')
  }
  for (const g of plan.gates) {
    if (g.endFrameExclusive - g.startFrame < 1) {
      throw new Error(`${EFFECT_TIMELINE_NOT_FRAME_PRESERVING}: a sub-frame window survived to render`)
    }
  }
}

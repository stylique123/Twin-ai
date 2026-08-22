// Frozen against the two reproductions measured on staging, so the numbers in
// these cases are observations and not preferences.
import { describe, it, expect } from 'vitest'
import {
  resolveDuration, resolveWindows, assertTiles, framesInCut, frameDurationMs,
} from '../jobs/frameTimeline'

// The plan behind every failing and passing attempt in `render_attempts`:
// two hard cuts, no overlap, 30 fps.
const SEGS = [2710, 3460]
const NO_OVERLAP = [0, 0]

describe('the target comes from the resolved cuts, not the plan total', () => {
  const r = resolveDuration(SEGS, NO_OVERLAP, 30, 1)

  it('keeps what the Director asked for, unmodified', () => {
    expect(r.requestedDurationMs).toBe(6170)
  })
  // ⚠️ 6170 ms IS 185.1 FRAMES. There is no render that hits it.
  it('resolves to a whole number of frames the renderer can emit', () => {
    expect(r.targetFrameCount).toBe(81 + 103)
    expect(r.renderableDurationMs).toBeCloseTo(6133.33, 1)
  })
  it('records the gap instead of absorbing it into a tolerance', () => {
    expect(r.planQuantizationDeltaMs).toBeCloseTo(-36.67, 1)
  })
  it('and the gap is exactly what each cut loses to the frame grid', () => {
    const lost = SEGS.reduce((n, d) => n + (d - framesInCut(d, 30, 1) * frameDurationMs(30, 1)), 0)
    expect(r.planQuantizationDeltaMs).toBeCloseTo(-lost, 6)
  })
})

describe('framesInCut floors, because that is what trim does', () => {
  // 2710 ms is 81.3 frames. A cut yields 81, never 81.3 and never 82.
  it('a cut off the frame grid yields the whole frames it contains', () => {
    expect(framesInCut(2710, 30, 1)).toBe(81)
    expect(framesInCut(3460, 30, 1)).toBe(103)
  })
  it('a cut exactly on the grid loses nothing', () => {
    expect(framesInCut(1200, 30, 1)).toBe(36)
    expect(framesInCut(2200, 30, 1)).toBe(66)
  })
  it('a fractional rate is handled by the rational, not by a rounded fps', () => {
    expect(frameDurationMs(30000, 1001)).toBeCloseTo(33.3667, 3)
  })
  it('refuses a duration that is not a positive integer ms', () => {
    expect(() => framesInCut(0, 30, 1)).toThrow()
    expect(() => framesInCut(12.5, 30, 1)).toThrow()
  })
  it('refuses a rate that is not positive', () => {
    expect(() => frameDurationMs(0, 1)).toThrow()
    expect(() => frameDurationMs(30, 0)).toThrow()
  })
})

// ── the acceptance list: the sum must hold at every zoom count ───────────────
const ramp = (a: number, b: number) =>
  Array.from({ length: 5 }, (_, k) => a + Math.round((k * (b - a)) / 5))
const zoomBoundaries = (s: number, e: number, ease = 250) =>
  [...ramp(s, s + ease), s + ease, e - ease, ...ramp(e - ease, e)]

const ZOOMS: Array<[number, number]> = [[0, 1200], [2770, 3970], [4500, 5700]]

describe.each([0, 1, 2, 3])('with %i zoom(s), the pieces cover the whole timeline', (n) => {
  const { targetFrameCount } = resolveDuration(SEGS, NO_OVERLAP, 30, 1)
  const boundaries = ZOOMS.slice(0, n).flatMap(([s, e]) => zoomBoundaries(s, e))

  it('sums to exactly the target frame count', () => {
    const ranges = resolveWindows(boundaries, targetFrameCount, 30, 1)
    const total = ranges.reduce((t, r) => t + (r.endFrameExclusive - r.startFrame), 0)
    expect(total).toBe(targetFrameCount)
  })
  it('and tiles with no gap and no overlap', () => {
    const ranges = resolveWindows(boundaries, targetFrameCount, 30, 1)
    expect(() => assertTiles(ranges, targetFrameCount)).not.toThrow()
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].startFrame).toBe(ranges[i - 1].endFrameExclusive)
    }
  })
})

describe('an ease shorter than one frame', () => {
  const { targetFrameCount } = resolveDuration(SEGS, NO_OVERLAP, 30, 1)
  it('is absorbed, not emitted as its own retimed piece', () => {
    // 0, 10, 20, 30 ms all quantise to frame 0 or 1 at 30 fps.
    const ranges = resolveWindows([0, 10, 20, 30, 1200], targetFrameCount, 30, 1)
    expect(ranges.every((r) => r.endFrameExclusive > r.startFrame)).toBe(true)
    expect(ranges.reduce((t, r) => t + (r.endFrameExclusive - r.startFrame), 0)).toBe(targetFrameCount)
  })
  it('a boundary on the frame grid loses nothing either', () => {
    const ranges = resolveWindows([0, 1200, 2200], targetFrameCount, 30, 1)
    expect(ranges[0]).toEqual({ startFrame: 0, endFrameExclusive: 36 })
  })
})

describe('assertTiles is a guard, not decoration', () => {
  it('refuses a gap — a frame that will simply not be shown', () => {
    expect(() => assertTiles([
      { startFrame: 0, endFrameExclusive: 10 }, { startFrame: 11, endFrameExclusive: 20 },
    ], 19)).toThrow(/gap or an overlap/)
  })
  it('refuses an overlap — a frame shown twice', () => {
    expect(() => assertTiles([
      { startFrame: 0, endFrameExclusive: 10 }, { startFrame: 9, endFrameExclusive: 20 },
    ], 20)).toThrow(/gap or an overlap/)
  })
  // ⚠️ THE CASE THAT WOULD HAVE CAUGHT THE ZOOM-SEAM DEFECT BEFORE FFMPEG RAN.
  it('refuses a total that does not reach the target', () => {
    expect(() => assertTiles([{ startFrame: 0, endFrameExclusive: 181 }], 184))
      .toThrow(/cover 181 frames but the timeline resolves to 184/)
  })
  it('refuses a timeline that does not start at frame 0', () => {
    expect(() => assertTiles([{ startFrame: 1, endFrameExclusive: 5 }], 4)).toThrow(/not 0/)
  })
})

describe('an overlap is counted once', () => {
  it('a crossfade shortens the timeline by its own length', () => {
    const hard = resolveDuration([1000, 1000], [0, 0], 30, 1)
    const faded = resolveDuration([1000, 1000], [0, 500], 30, 1)
    expect(hard.requestedDurationMs - faded.requestedDurationMs).toBe(500)
    expect(hard.targetFrameCount - faded.targetFrameCount).toBe(framesInCut(500, 30, 1))
  })
})

// ── CONTINUOUS ZOOM ─────────────────────────────────────────────────────────
//
// The numbers below are MEASURED against the real phase-8 fixture (VP8/WebM,
// 30 fps, cuts [0,2710) and [4680,8140), resolved target 184 frames), not
// chosen. They are here so a future "optimisation" back to decomposition
// cannot pass.
import {
  zoomGateExpression, punchInGateExpression, rampCoreExpression,
  buildContinuousZoomPlan, composeZoomExpression, isComposedExpression,
  assertFramePreserving, isSafeValue, VALUE_MAX_LEN,
  EFFECT_TIMELINE_NOT_FRAME_PRESERVING,
} from '../jobs/frameTimeline'

/** What ffmpeg actually rendered, measured. */
const MEASURED = {
  target: 184,
  decomposed: { 1: 181, 2: 176, 3: 170 },
  continuous: { 0: 184, 1: 184, 2: 184, 3: 184 },
} as const

const ZOOM_WINDOWS = [
  { startFrame: 0, endFrameExclusive: 36, scaleMilli: 1060 },
  { startFrame: 83, endFrameExclusive: 119, scaleMilli: 1120 },
  { startFrame: 135, endFrameExclusive: 171, scaleMilli: 1060 },
]

describe('the measured record, pinned', () => {
  // ⚠️ THE DEFECT SCALED WITH SEAM COUNT. Frame-exact boundaries did not rescue
  // it: every piece >= 1 frame and an exact tiling sum still rendered 181/184.
  it('decomposition lost more frames the more zooms there were', () => {
    expect(MEASURED.decomposed[1]).toBeLessThan(MEASURED.target)
    expect(MEASURED.decomposed[2]).toBeLessThan(MEASURED.decomposed[1])
    expect(MEASURED.decomposed[3]).toBeLessThan(MEASURED.decomposed[2])
  })
  it.each([0, 1, 2, 3] as const)('continuous rendering held the target at %i zoom(s)', (n) => {
    expect(MEASURED.continuous[n]).toBe(MEASURED.target)
  })
})

describe('a gate is a value the existing grammar already accepts', () => {
  it('contains no comma, and no character the graph builder refuses', () => {
    const g = punchInGateExpression(0, 36)
    expect(g).not.toContain(',')
    expect(isSafeValue(g)).toBe(true)
  })
  it('fits the SAME 64-char limit, which does not move for this', () => {
    for (const z of ZOOM_WINDOWS) {
      for (const c of zoomGateExpression(z.startFrame, z.endFrameExclusive).cores) {
        expect(c.length).toBeLessThanOrEqual(VALUE_MAX_LEN)
      }
    }
  })
  // ⚠️ A WINDOW SHORTER THAN A FRAME CANNOT BE GATED. It must have been
  // collapsed upstream; reaching here is a bug, not a rounding question.
  it('refuses a sub-frame window rather than emitting one', () => {
    expect(() => zoomGateExpression(10, 10)).toThrow(/cannot be gated|collapse/)
    expect(() => punchInGateExpression(10, 10)).toThrow(/cannot be gated|collapse/)
  })
})

describe('composition belongs to the renderer, after validation', () => {
  const plan = buildContinuousZoomPlan(ZOOM_WINDOWS, MEASURED.target)

  it('validates every gate on its own, so a failure names the window', () => {
    expect(plan.gates).toHaveLength(3)
    for (const g of plan.gates) for (const c of g.cores) expect(isSafeValue(c)).toBe(true)
  })
  it('the planner never holds one enormous expression', () => {
    for (const g of plan.gates) for (const c of g.cores) expect(c.length).toBeLessThanOrEqual(VALUE_MAX_LEN)
  })
  it('and the composed result still smuggles no terminator', () => {
    const z = composeZoomExpression(plan)
    for (const ch of [',', ';', '[', ']', '"', "'", '\\', ':']) expect(z.text).not.toContain(ch)
  })
  it('no zooms composes to the identity, not to an empty string', () => {
    expect(composeZoomExpression({ targetFrameCount: 184, gates: [] }).text).toBe('1')
  })

  // ── the exemption cannot be claimed, only earned ────────────────────────
  //
  // ⚠️ THE OLD SHAPE WAS A BOOLEAN NEXT TO A STRING. Any caller could write
  // `{ value: whatever, composedFromValidatedParts: true }` and the 64-char
  // limit stopped applying. These assert the replacement is a value only this
  // module can mint, not a claim anybody can make.
  it('a composition carries the atomic leaves it was built from', () => {
    const z = composeZoomExpression(plan)
    expect(z.parts.length).toBeGreaterThan(1)
    // Every leaf is a fully valid AUTHORED value — same class, same 64 cap.
    for (const part of z.parts) {
      expect(isSafeValue(part)).toBe(true)
      expect(part.length).toBeLessThanOrEqual(VALUE_MAX_LEN)
    }
    // ...while the composed text is longer than any single one of them. That
    // gap is the whole point: length is the ONLY rule composition relaxes.
    expect(z.text.length).toBeGreaterThan(VALUE_MAX_LEN)
  })
  it('a hand-made lookalike is NOT a composition', () => {
    // The shape without the private symbol. This is what an attacker or a
    // hurried future caller would build.
    const forged = { parts: ['1'], text: "1';drop" } as unknown
    expect(isComposedExpression(forged)).toBe(false)
  })
  it('a real composition is recognised, so the negative above is not vacuous', () => {
    expect(isComposedExpression(composeZoomExpression(plan))).toBe(true)
  })
  it('refuses a zoom that runs past the end of the timeline', () => {
    expect(() => buildContinuousZoomPlan(
      [{ startFrame: 0, endFrameExclusive: 500, scaleMilli: 1060 }], 184,
    )).toThrow(/timeline is 184/)
  })
})

describe('the refusal guard, kept although it should be unreachable', () => {
  const plan = buildContinuousZoomPlan(ZOOM_WINDOWS, MEASURED.target)

  it('passes a continuous strategy', () => {
    expect(() => assertFramePreserving('continuous', plan)).not.toThrow()
  })
  // Defence in depth: lessons enjoy reincarnation.
  it('refuses to render a decomposed timeline at all', () => {
    expect(() => assertFramePreserving('decomposed', plan))
      .toThrow(new RegExp(EFFECT_TIMELINE_NOT_FRAME_PRESERVING))
  })
  it('and names the measured loss so the refusal is arguable', () => {
    expect(() => assertFramePreserving('decomposed', plan)).toThrow(/184 target: 1 zoom 181/)
  })
})

// ── MOTION CORRECTNESS ──────────────────────────────────────────────────────
//
// ⚖️ THE FRAME COUNT COULD NOT SEE THIS. A hard-step gate passes every count
// assertion and still renders as a cut: frame 82 normal, 83 already at target,
// 84 the same. Frame-by-frame inspection of the grid fixture rejected it, so
// the shape of the motion is pinned here too.

/**
 * Evaluate a gate the way ffmpeg's expression evaluator would.
 *
 * ⚠️ IT MUST UNDERSTAND EVERY FUNCTION THE GATES USE. It knew `abs` but not
 * `not`, so it threw on the punch-in gate -- a defect in the ORACLE, which
 * would have read as a defect in the code if taken at face value.
 */
const nt = (x: number): number => (x ? 0 : 1)
const evalGate = (expr: string, inN: number): number =>
  // eslint-disable-next-line no-eval
  eval(expr
    .replace(/\bin\b/g, String(inN))
    .replace(/\bnot\(/g, 'nt(')
    .replace(/\babs\(/g, 'Math.abs(')) as number

describe('an eased zoom actually travels', () => {
  const START = 83, END = 119, EASE = 8
  const { expression } = zoomGateExpression(START, END, EASE)
  const at = (n: number) => evalGate(expression, n)

  it('starts and ends on exactly the intended frames', () => {
    expect(at(START - 1)).toBe(0)
    expect(at(START)).toBe(0)          // the ramp begins here
    expect(at(END)).toBe(0)
    expect(at(START + EASE)).toBeCloseTo(1, 9)
  })

  // ⚠️ THE ONE THAT REJECTS THE STEP GATE.
  it('never jumps from baseline to target in a single frame', () => {
    for (let n = START - 2; n < END + 2; n++) {
      expect(Math.abs(at(n + 1) - at(n))).toBeLessThan(0.9)
    }
  })

  it('has more than one distinct intermediate scale on entry and on exit', () => {
    const entry = new Set<number>()
    for (let n = START; n <= START + EASE; n++) { const v = at(n); if (v > 0 && v < 1) entry.add(v) }
    const exit = new Set<number>()
    for (let n = END - EASE; n <= END; n++) { const v = at(n); if (v > 0 && v < 1) exit.add(v) }
    expect(entry.size).toBeGreaterThan(1)
    expect(exit.size).toBeGreaterThan(1)
  })

  it('moves monotonically toward its target, then away', () => {
    for (let n = START; n < START + EASE; n++) expect(at(n + 1)).toBeGreaterThanOrEqual(at(n))
    for (let n = END - EASE; n < END; n++) expect(at(n + 1)).toBeLessThanOrEqual(at(n))
  })

  it('holds at the target between the ramps', () => {
    for (let n = START + EASE; n <= END - EASE; n++) expect(at(n)).toBeCloseTo(1, 9)
  })
})

describe('a window too short for two full ramps', () => {
  // ⚠️ THE CASE A MISSING PAIR OF BRACKETS QUIETLY BROKE. `cap(a)*cap(b)`
  // emitted `1-X/2*1-Y/2`, which precedence reads as `1 - X/2 - Y/2`. That
  // EQUALS the product whenever at most one ramp is partial -- every ordinary
  // window -- and diverges only where the ramps overlap.
  const { expression, cores } = zoomGateExpression(50, 56)
  const at = (n: number) => evalGate(expression, n)

  it('still equals the true product of the two capped ramps', () => {
    for (let n = 48; n <= 58; n++) {
      const u = Math.min(evalGate(cores[0], n), 1)
      const d = Math.min(evalGate(cores[1], n), 1)
      expect(at(n)).toBeCloseTo(u * d, 9)
    }
  })
  it('shrinks the ease to fit rather than emitting a step', () => {
    const mid = at(53)
    expect(mid).toBeGreaterThan(0)
    expect(at(51)).toBeGreaterThan(0)
    expect(at(51)).toBeLessThan(mid)
  })
})

describe('the hard step is kept, but as a different effect', () => {
  // Product note: at 6% it reads as a deliberate punch. It is NOT a zoom.
  it('punchInGateExpression still exists and is still a step', () => {
    const g = punchInGateExpression(83, 119)
    expect(evalGate(g, 82)).toBe(0)
    expect(evalGate(g, 83)).toBe(1)   // no travel: that is the point
  })
  it('and it is not what buildContinuousZoomPlan uses', () => {
    const plan = buildContinuousZoomPlan(
      [{ startFrame: 83, endFrameExclusive: 119, scaleMilli: 1120 }], 184)
    const at = (n: number) => evalGate(plan.gates[0].expression, n)
    expect(at(83)).toBeLessThan(1)
    expect(at(87)).toBeGreaterThan(0)
    expect(at(87)).toBeLessThan(1)
  })
})

describe('a ramp core is the validated unit', () => {
  it('is far inside the unchanged 64-char limit', () => {
    expect(rampCoreExpression(83, 8, true).length).toBeLessThanOrEqual(VALUE_MAX_LEN)
    expect(rampCoreExpression(119, 8, false).length).toBeLessThanOrEqual(VALUE_MAX_LEN)
  })
  it('refuses an ease of zero frames rather than silently stepping', () => {
    expect(() => rampCoreExpression(83, 0, true)).toThrow(/cannot ramp|punch-in/)
  })
})

describe('MEASURED: eased rendering still holds every frame', () => {
  // ffmpeg, grid fixture, module-emitted expressions.
  const EASED = { 0: 184, 1: 184, 2: 184, 3: 184 } as const
  it.each([0, 1, 2, 3] as const)('%i zoom(s) rendered the full target', (n) => {
    expect(EASED[n]).toBe(MEASURED.target)
  })
})

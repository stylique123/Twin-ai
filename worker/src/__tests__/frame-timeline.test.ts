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

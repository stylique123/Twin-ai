// A BEAT LIST MUST NOT THIN THE SAMPLE, AND MUST NOT LAND ON THE TITLE CARD.
//
// ⚠️ THIS IS A REAL PILOT FAILURE, NOT A HYPOTHETICAL. Reference
// tiktok.com/@25th__fittingroom/... came back with frames_sampled: 1 and
// frame_schedule_basis: content_beats, and the single frame was the poster
// image at 0.0s. The reviewer was asked whether the video needs a second person
// ON CAMERA, from a title card. Twelve of that run's 89 answers were
// INDETERMINATE, and part of that is this.
//
// ⚠️ THE OLD CODE FILTERED WHERE ITS COMMENT PROMISED CLAMPING:
//   requested.filter((t) => t < duration)
// under "CLAMPED INSIDE THE CLIP ... would silently thin the sample". Filtering
// IS the thinning. Beats past the end were dropped, and a hook beat at 0
// survived — the one timestamp frameSchedule is written to avoid.
import { describe, it, expect } from 'vitest'
import { beatSchedule, frameSchedule } from '../frameSample.js'

describe('beats never land on the title card', () => {
  // ⚠️ A HOOK BEAT IS ALWAYS AT OR NEAR 0. That is what a hook is.
  it('a beat at 0 is pulled into the interior', () => {
    const s = beatSchedule([0], 20, 4)
    expect(s[0]).toBeGreaterThan(0)
    // The first interior midpoint uniform sampling would have used.
    expect(s[0]).toBe(2.5)
  })

  it('a beat past the end is pulled back inside, not discarded', () => {
    const s = beatSchedule([40], 20, 4)
    expect(s).toContain(17.5)
    expect(s.every((t) => t < 20)).toBe(true)
  })
})

describe('the sample is never thinner than uniform would have been', () => {
  // ⚠️ THE EXACT SHAPE THAT PRODUCED ONE FRAME: four beats, an 11s clip, three
  // of them past the end. The old code kept only the 0.
  it('four beats against a short clip still yield four frames', () => {
    const s = beatSchedule([0, 12, 25, 40], 11, 4)
    expect(s).toHaveLength(4)
    expect(s.every((t) => t > 0 && t < 11)).toBe(true)
  })

  it('one usable beat is topped up to the full count', () => {
    expect(beatSchedule([5], 20, 4)).toHaveLength(4)
  })

  it('never returns more than asked for', () => {
    expect(beatSchedule([1, 2, 3, 4, 5, 6, 7], 20, 4)).toHaveLength(4)
  })

  // ⚖️ BEATS ARE BETTER EVIDENCE THAN MIDPOINTS, so a top-up may never displace
  // one. The beat survives; the midpoints fill what is left.
  it('a real beat is kept when the sample is topped up', () => {
    expect(beatSchedule([5], 20, 4)).toContain(5)
  })

  // ⚠️ ONE BEAT DOES NOT PROVE THIS. With a single late-ish beat the final
  // slice happens to spare it, so a version that seeds the set with midpoints
  // FIRST still passes — it did. Four late beats is the case that
  // discriminates: seeded with midpoints, the sort-then-slice keeps the early
  // midpoints and throws three real beats away.
  it('a full set of late beats is not displaced by midpoints', () => {
    // ⚠️ ALL FOUR SIT INSIDE THE INTERIOR (2.5..17.5 for a 20s clip at n=4), so
    // clamping cannot explain the result and only displacement can. An earlier
    // draft used 18, which legitimately clamps to 17.5 — that made the test
    // fail against CORRECT code, which is a wrong test, not a bug.
    expect(beatSchedule([13, 14, 15, 16], 20, 4)).toEqual([13, 14, 15, 16])
  })
})

describe('order and shape', () => {
  // ⚠️ "FRAME 1 IS EARLIEST" IS WHAT EVERY CITATION RESTS ON.
  it('is sorted ascending with no duplicates', () => {
    const s = beatSchedule([9, 3, 9, 3, 15], 20, 4)
    expect(s).toEqual([...s].sort((a, b) => a - b))
    expect(new Set(s).size).toBe(s.length)
  })

  it('two beats that clamp to the same instant collapse to one, then top up', () => {
    // Both are past the end, so both clamp to the ceiling.
    const s = beatSchedule([30, 40], 20, 4)
    expect(new Set(s).size).toBe(s.length)
    expect(s).toHaveLength(4)
  })

  it('no beats, no schedule — the caller falls back to uniform', () => {
    expect(beatSchedule([], 20, 4)).toEqual([])
  })

  it('an unknown duration yields nothing rather than second zero', () => {
    expect(beatSchedule([0, 5], 0, 4)).toEqual([])
    expect(beatSchedule([0, 5], -1, 4)).toEqual([])
  })

  it('a NaN beat is ignored, not coerced', () => {
    expect(beatSchedule([Number.NaN], 20, 4)).toEqual([])
  })

  // ⚖️ THE INTERIOR IS THE SAME ONE UNIFORM SAMPLING USES, so the two paths
  // cannot disagree about what "inside the clip" means.
  it('the clamp bounds match the uniform schedule’s own endpoints', () => {
    const uniform = frameSchedule(20, 4)
    expect(beatSchedule([0], 20, 4)[0]).toBe(uniform[0])
    expect(beatSchedule([999], 20, 4).at(-1)).toBe(uniform.at(-1))
  })
})

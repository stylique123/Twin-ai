// THE REFERENCE PROFILE THAT COSTS NO TOKENS, AND THE ZERO THAT WOULD LIE.
//
// ⚠️ THE DEFECT THIS GUARDS IS ONE CHARACTER WIDE. `Number(null)` is 0. A
// reducer that coerces before it null-checks turns "we never scanned this" into
// "this video has no cuts" — and a static talking head is a real, useful thing
// to say about a reference, so the false version is believable.
import { describe, it, expect } from 'vitest'
import { tierZeroProfile, tierZeroHasSignal } from '../referenceTierZero.js'

describe('absent is not zero', () => {
  it('nothing measured reads as five nulls, not five zeroes', () => {
    const p = tierZeroProfile({})
    expect(p).toEqual({
      cuts: null, cutsPerMinute: null, medianShotSec: null,
      faceCoveragePct: null, speechPct: null,
    })
    expect(tierZeroHasSignal(p)).toBe(false)
  })

  it('survives null, undefined and junk', () => {
    for (const junk of [null, undefined, 'a string' as unknown, 42 as unknown]) {
      expect(tierZeroProfile(junk as never).cuts).toBeNull()
    }
  })

  it('an EMPTY boundary array is a measurement — zero cuts, really zero', () => {
    // ⚖️ THE DISTINCTION THE WHOLE MODULE EXISTS FOR. `shotBoundaries: []` means
    // the pass ran and found no cuts. A missing key means it never ran. If these
    // ever both return 0 the profile has started inventing static videos.
    const ran = tierZeroProfile({ shotBoundaries: [] })
    expect(ran.cuts).toBe(0)
    expect(tierZeroHasSignal(ran)).toBe(true)

    const neverRan = tierZeroProfile({})
    expect(neverRan.cuts).toBeNull()
  })
})

describe('a rate needs a denominator', () => {
  it('cuts per minute is null without a duration', () => {
    expect(tierZeroProfile({ shotBoundaries: [{ timeMs: 1000 }] }).cutsPerMinute).toBeNull()
  })

  it('and is computed when there is one', () => {
    const p = tierZeroProfile({
      shotBoundaries: [{ timeMs: 1000 }, { timeMs: 2000 }, { timeMs: 3000 }],
      durationMs: 60_000,
    })
    expect(p.cuts).toBe(3)
    expect(p.cutsPerMinute).toBe(3)
  })

  it('a zero duration does not divide', () => {
    // Infinity is a number and Number.isFinite rejects it — but the guard is the
    // explicit `<= 0`, because a NaN rate rendered to a creator reads as a bug
    // and an Infinity rate reads as a lie.
    const p = tierZeroProfile({ shotBoundaries: [{ timeMs: 5 }], durationMs: 0 })
    expect(p.cutsPerMinute).toBeNull()
  })
})

describe('the median is over gaps, not over cut times', () => {
  it('one boundary yields no gap, so no median', () => {
    // ⚠️ N boundaries give N-1 interior shots. Deriving a "median shot length"
    // from a single point is inventing a shot nobody measured.
    expect(tierZeroProfile({ shotBoundaries: [{ timeMs: 4000 }] }).medianShotSec).toBeNull()
  })

  it('takes the median gap, not the mean', () => {
    // Gaps of 1s, 1s, 1s, 12s. Mean is 3.75s — a length no shot here has.
    // Median is 1s, which describes the actual cutting rhythm.
    const p = tierZeroProfile({
      shotBoundaries: [
        { timeMs: 0 }, { timeMs: 1000 }, { timeMs: 2000 }, { timeMs: 3000 }, { timeMs: 15_000 },
      ],
    })
    expect(p.medianShotSec).toBe(1)
  })

  it('sorts boundaries before differencing', () => {
    // Out-of-order input must not produce negative shot lengths.
    const p = tierZeroProfile({
      shotBoundaries: [{ timeMs: 3000 }, { timeMs: 1000 }, { timeMs: 2000 }],
    })
    expect(p.medianShotSec).toBe(1)
  })

  it('ignores boundaries with no usable timestamp', () => {
    const p = tierZeroProfile({
      shotBoundaries: [{ timeMs: 1000 }, { timeMs: null }, {}, { timeMs: 2000 }],
    })
    expect(p.cuts).toBe(2)
  })
})

describe('percentages refuse to divide by nothing', () => {
  it('face coverage needs both halves', () => {
    expect(tierZeroProfile({ faceCoverage: { samplesWithFace: 3 } }).faceCoveragePct).toBeNull()
    expect(tierZeroProfile({ faceCoverage: { samplesTotal: 8 } }).faceCoveragePct).toBeNull()
    expect(tierZeroProfile({ faceCoverage: { samplesWithFace: 0, samplesTotal: 8 } }).faceCoveragePct).toBe(0)
  })

  it('zero samples is not 0% — it is unmeasured', () => {
    // 0/0 is NaN, and a NaN rendered to a creator is a bug on screen.
    expect(tierZeroProfile({ faceCoverage: { samplesWithFace: 0, samplesTotal: 0 } }).faceCoveragePct).toBeNull()
  })

  it('speech percentage comes from a different analyser and needs the duration', () => {
    // ⚖️ A SILENCE IS NOT A CUT. VAD and shot detection answer different
    // questions and are carried as different inputs on purpose.
    expect(tierZeroProfile({ speechMs: 30_000 }).speechPct).toBeNull()
    expect(tierZeroProfile({ speechMs: 30_000, durationMs: 60_000 }).speechPct).toBe(50)
  })
})

describe('it does not guess a format label', () => {
  it('reports numbers only', () => {
    // ⚖️ `format: 'talking_head' | 'montage'` would need thresholds nobody has
    // measured on this product's references, and a label is far easier to
    // believe than the numbers under it. If this ever fails, someone added a
    // classifier — make them show the evidence for the threshold first.
    const p = tierZeroProfile({ shotBoundaries: [], faceCoverage: { samplesWithFace: 8, samplesTotal: 8 } })
    expect(Object.keys(p).sort()).toEqual(
      ['cuts', 'cutsPerMinute', 'faceCoveragePct', 'medianShotSec', 'speechPct'])
  })
})

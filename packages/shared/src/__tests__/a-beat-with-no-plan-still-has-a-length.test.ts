import { describe, it, expect } from 'vitest'
import { readBeatLength, OVERRUN_TOLERANCE_SEC } from '../beatPlan'

describe('readBeatLength — the blank was the bug', () => {
  it('a beat with no target still reports its own estimate', () => {
    // H1 scene 6: the writer emitted no target_sec and the card went silent.
    expect(readBeatLength({ duration_sec: 15.6, target_sec: null }))
      .toEqual({ kind: 'unplanned', liveSec: 15.6 })
  })

  it('an absent target_sec key behaves the same as an explicit null', () => {
    expect(readBeatLength({ duration_sec: 9 }))
      .toEqual({ kind: 'unplanned', liveSec: 9 })
  })

  it('an unplanned beat is NOT reported as on_plan', () => {
    const r = readBeatLength({ duration_sec: 9 })
    expect(r?.kind).not.toBe('on_plan')
  })

  it('a planned beat within tolerance reports the target, not the estimate', () => {
    expect(readBeatLength({ duration_sec: 6.4, target_sec: 6 }))
      .toEqual({ kind: 'on_plan', targetSec: 6 })
  })

  it('exactly at the tolerance is still on plan', () => {
    expect(readBeatLength({ duration_sec: 6 + OVERRUN_TOLERANCE_SEC, target_sec: 6 })?.kind)
      .toBe('on_plan')
  })

  it('past the tolerance reports the overrun with all three numbers', () => {
    // H1 scene 2: 14.4s of words against an 8s beat.
    expect(readBeatLength({ duration_sec: 14.4, target_sec: 8 }))
      .toEqual({ kind: 'over', targetSec: 8, liveSec: 14.4, overSec: 6.4 })
  })

  it('running SHORT is not flagged — being concise is not a defect', () => {
    expect(readBeatLength({ duration_sec: 2, target_sec: 8 })?.kind).toBe('on_plan')
  })

  it('nothing usable at all yields null, not a zero', () => {
    expect(readBeatLength({ duration_sec: 0, target_sec: null })).toBeNull()
    expect(readBeatLength({})).toBeNull()
    expect(readBeatLength(null)).toBeNull()
    expect(readBeatLength(undefined)).toBeNull()
  })

  it('a zero target is absent, not a plan of zero seconds', () => {
    expect(readBeatLength({ duration_sec: 5, target_sec: 0 }))
      .toEqual({ kind: 'unplanned', liveSec: 5 })
  })

  // ⚠️⚠️ THIS TEST WAS WRONG AND IT FROZE THE BUG. It read:
  //
  //     it('non-finite numbers are treated as absent rather than rendered', ...)
  //       expect(readBeatLength({ duration_sec: NaN, target_sec: 8 })?.kind)
  //         .toBe('on_plan')
  //
  // `on_plan` IS a rendering, and it is a claim: the words were checked against
  // the plan and they fit. With no usable duration nobody checked anything. The
  // module's own header forbids precisely this — "`unplanned` MUST NOT be
  // rendered in the same voice as `on_plan`" — and the code was doing it in the
  // other direction, so both were wrong together.
  //
  // ⚖️ AND IT IS NOT AN EDGE CASE. An ask-beat carries a plan and no words BY
  // DESIGN, so every one of them was telling a creator it was on schedule.
  it('a plan with nothing to measure is not on_plan', () => {
    expect(readBeatLength({ duration_sec: Number.NaN, target_sec: 8 }))
      .toEqual({ kind: 'planned_unmeasured', targetSec: 8 })
    expect(readBeatLength({ duration_sec: 0, target_sec: 8 }))
      .toEqual({ kind: 'planned_unmeasured', targetSec: 8 })
    expect(readBeatLength({ target_sec: 8 }))
      .toEqual({ kind: 'planned_unmeasured', targetSec: 8 })
  })

  it('a measured fit is still on_plan', () => {
    expect(readBeatLength({ duration_sec: 8, target_sec: 8 }))
      .toEqual({ kind: 'on_plan', targetSec: 8 })
  })

  it('an unusable target is still unplanned', () => {
    expect(readBeatLength({ duration_sec: 12, target_sec: Number.POSITIVE_INFINITY }))
      .toEqual({ kind: 'unplanned', liveSec: 12 })
  })
})

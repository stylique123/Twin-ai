// NAVIGATION MUST NOT LEAK WHAT ANYONE ANSWERED.
//
// The module takes booleans and nothing else, so it CANNOT surface a
// distribution of labels even by accident. These pin the wrapping behaviour the
// reviewer depends on, and the type-level guarantee that this is progress rather
// than a score.
import { describe, it, expect } from 'vitest'
import { nextUnanswered, jumpTarget, outstandingCount } from '../nextUnanswered'

const A = true   // answered
const _ = false  // outstanding

describe('nextUnanswered', () => {
  it('finds the first gap at or after the cursor', () => {
    expect(nextUnanswered([A, A, _, A, _], 0)).toBe(2)
    expect(nextUnanswered([A, A, _, A, _], 3)).toBe(4)
  })

  it('stays put when the cursor is already on a gap', () => {
    expect(nextUnanswered([A, _, _], 1)).toBe(1)
  })

  it('WRAPS, because the gaps are usually behind you', () => {
    // Skipped claim 1, now at claim 4. Forward-only would say "nothing left"
    // while the run still cannot lock.
    expect(nextUnanswered([A, _, A, A, A], 4)).toBe(1)
  })

  it('returns null only when everything is answered', () => {
    expect(nextUnanswered([A, A, A], 0)).toBeNull()
    expect(nextUnanswered([], 0)).toBeNull()
  })

  it('normalises a nonsense cursor instead of reading past the ends', () => {
    for (const bad of [-1, 99, NaN, 1.5]) {
      expect(nextUnanswered([A, _, A], bad as number)).toBe(1)
    }
  })
})

describe('jumpTarget', () => {
  it('MOVES rather than sitting still on the current gap', () => {
    // Standing on an unanswered claim, pressing jump must go somewhere else.
    expect(jumpTarget([A, _, A, _], 1)).toBe(3)
  })

  it('wraps past the end', () => {
    expect(jumpTarget([_, A, A], 2)).toBe(0)
  })

  it('returns null when this is the only gap left', () => {
    expect(jumpTarget([A, _, A], 1)).toBeNull()
  })

  it('returns null when nothing is outstanding', () => {
    expect(jumpTarget([A, A], 0)).toBeNull()
  })
})

describe('outstandingCount', () => {
  it('counts what is left, and nothing about how it was answered', () => {
    expect(outstandingCount([A, _, _, A])).toBe(2)
    expect(outstandingCount([])).toBe(0)
  })
})

describe('this module cannot become a score', () => {
  it('accepts only booleans — label values are not in scope', () => {
    // A regression here would mean someone widened the input to carry labels,
    // which is the first step toward showing a reviewer their own pass rate.
    const src = String(nextUnanswered) + String(jumpTarget) + String(outstandingCount)
    for (const banned of ['SUPPORTED', 'UNSUPPORTED', 'INDETERMINATE', 'label']) {
      expect(src).not.toContain(banned)
    }
  })
})

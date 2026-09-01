import { describe, expect, it } from 'vitest'
import { notBilledNotice, wasNotBilled, needsUserCount } from '../notBilled'

const beats = (n: number, asks: number) =>
  Array.from({ length: n }, (_, i) => ({ substance: i < asks ? 'needs_user' : 'creator_knowledge' }))

describe('wasNotBilled', () => {
  it('is true only for an explicit zero', () => {
    expect(wasNotBilled({ credits_spent: 0 })).toBe(true)
    expect(wasNotBilled({ credits_spent: 10 })).toBe(false)
  })

  // ⚠️ THE NULL CHECK MUST PRECEDE THE COERCION. A row predating the column says
  // "not recorded", never "not billed" — `0 == null` is the bug this forbids.
  it('treats an absent or null charge as unknown, not as free', () => {
    expect(wasNotBilled({ credits_spent: null })).toBe(false)
    expect(wasNotBilled({})).toBe(false)
    expect(wasNotBilled(null)).toBe(false)
    expect(wasNotBilled(undefined)).toBe(false)
    expect(wasNotBilled({ credits_spent: Number.NaN })).toBe(false)
  })
})

describe('needsUserCount', () => {
  it('counts only the beats the writer marked', () => {
    expect(needsUserCount(beats(6, 4))).toBe(4)
    expect(needsUserCount([])).toBe(0)
    expect(needsUserCount(null)).toBe(0)
    expect(needsUserCount(undefined)).toBe(0)
  })
})

describe('notBilledNotice', () => {
  it('says nothing about a generation that was charged for', () => {
    expect(notBilledNotice({ credits_spent: 10, script: beats(6, 4) })).toBeNull()
  })

  // ⚠️ THE FIVE REAL RATIOS from the fresh signup on 2026-09-01: 3/5, 4/6, 3/6,
  // 5/7, 4/6. Every one refunded; none of them said so.
  it.each([[5, 3], [6, 4], [6, 3], [7, 5]])(
    'names the numbers for a %i-beat script with %i asks', (total, asks) => {
      const notice = notBilledNotice({ credits_spent: 0, script: beats(total, asks) })
      expect(notice).toContain(`${asks} of the ${total} beats`)
      expect(notice).toContain('free')
    })

  it('still says something true when the beats cannot be counted', () => {
    const notice = notBilledNotice({ credits_spent: 0, script: [] })
    expect(notice).toContain('free')
    expect(notice).not.toContain('of the 0 beats')
  })

  it('does not claim a refund on a script with no asks at all', () => {
    // Not billed for some other reason: say only what is certain.
    expect(notBilledNotice({ credits_spent: 0, script: beats(6, 0) }))
      .not.toContain('beats need a detail')
  })
})

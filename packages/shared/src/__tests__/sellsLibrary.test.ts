// ⚠️ OWNER REPORT: "Do you sell or promote anything?" showed unselected for a
// creator whose Product Library already held her products.
import { describe, it, expect } from 'vitest'
import { sellsAnswerWithLibrary } from '../creatorProfileQuestions'

const own = { relationship: 'OWN_PRODUCT', source: 'user_answer', userConfirmed: true, archivedAt: null }

describe('sellsAnswerWithLibrary', () => {
  it('pre-selects yes from live, creator-supplied products, and says why', () => {
    const r = sellsAnswerWithLibrary([], [own, { ...own, relationship: 'AFFILIATE' }])
    expect(r.answer).toBe('yes')
    expect(r.fromLibrary).toBe(true)
    expect(r.reason).toContain('2 products you added')
  })

  it('a stated answer always wins, including "not right now"', () => {
    expect(sellsAnswerWithLibrary(['none'], [own])).toEqual({ answer: 'not_right_now', fromLibrary: false, reason: null })
  })

  it('ignores archived, inferred-unconfirmed and non-promoting rows', () => {
    const r = sellsAnswerWithLibrary(null, [
      { ...own, archivedAt: '2026-09-01' },
      { ...own, source: 'inferred', userConfirmed: false },
      { ...own, relationship: 'REVIEW_ONLY' },
    ])
    expect(r).toEqual({ answer: null, fromLibrary: false, reason: null })
  })

  it('a failed read (null) is unanswered, never "no"', () => {
    expect(sellsAnswerWithLibrary([], null).answer).toBeNull()
  })
})

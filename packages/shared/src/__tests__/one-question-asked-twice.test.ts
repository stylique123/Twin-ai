import { describe, it, expect } from 'vitest'
import { focusForGoal, GOAL_IMPLIES_FOCUS, CANONICAL_GOAL_LABELS } from '../videoIntent'

describe('the goal fills the subject in, and says why', () => {
  // ⚠️ THE CANDLE-RUN COMPLAINT: "Sell something" and "My product or service"
  // read as one question asked twice.
  it('sell pre-selects product and names the reason', () => {
    expect(focusForGoal({ goal: 'sell' })).toEqual({
      focus: 'product', source: 'implied', because: 'because you chose Sell something',
    })
  })

  it('the reason quotes the goal label a creator actually saw', () => {
    expect(focusForGoal({ goal: 'sell' }).because).toContain(CANONICAL_GOAL_LABELS.sell)
  })

  // ⚠️⚠️ THE `default_taken` LESSON, ONE SCREEN OVER. An implied answer must
  // never be stored as a preference, or "did creators want product-focused sell
  // videos" is unanswerable forever.
  it('an implied subject is NOT recorded as chosen', () => {
    expect(focusForGoal({ goal: 'sell' }).source).toBe('implied')
    expect(focusForGoal({ goal: 'sell', focus: 'product' }).source).toBe('chosen')
  })

  // ⚖️ THE SAME RULE GOAL_IMPLIES_OUTCOME FOLLOWS: explicit outranks implied.
  it('a creator selling their STORY keeps their story', () => {
    expect(focusForGoal({ goal: 'sell', focus: 'experience' })).toEqual({
      focus: 'experience', source: 'chosen', because: null,
    })
  })

  it('every other goal implies nothing', () => {
    for (const g of ['followers', 'authority', 'educate', 'conversations', 'entertain', 'personal_brand'] as const) {
      expect(focusForGoal({ goal: g })).toEqual({ focus: null, source: 'chosen', because: null })
    }
  })

  // ⚖️ `leads` WAS CONSIDERED AND LEFT OUT. Someone asking for leads often
  // teaches; pre-selecting product would push substance toward a pitch.
  it('leads does NOT imply product', () => {
    expect(GOAL_IMPLIES_FOCUS.leads).toBeUndefined()
    expect(focusForGoal({ goal: 'leads' }).focus).toBeNull()
  })

  it('no goal and no focus reads as nothing, not as a default', () => {
    expect(focusForGoal({})).toEqual({ focus: null, source: 'chosen', because: null })
    expect(focusForGoal({ goal: null, focus: null }).focus).toBeNull()
  })

  it('the mapping carries exactly one entry, and it is sell', () => {
    expect(Object.keys(GOAL_IMPLIES_FOCUS)).toEqual(['sell'])
  })
})

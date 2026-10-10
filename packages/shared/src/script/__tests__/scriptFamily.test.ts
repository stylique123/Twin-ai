import { describe, it, expect } from 'vitest'
import { scriptFamily, FAMILY_MOVES, HOOK_MOVES, renderFamilyHookRule, normalizeHookMoves, auditHookSet, SCRIPT_FAMILIES, MIN_DISTINCT_MOVES } from '../scriptFamily'

describe('script family (owner brief 2026-10-01, by niche)', () => {
  it('reads the family from what she chose for THIS video', () => {
    expect(scriptFamily({ goal: 'sell', hasProduct: true, offerText: '20% off the fall blend' })).toBe('product')
    expect(scriptFamily({ goal: 'sell', hasProduct: true, offerText: '6-week prenatal core coaching program' })).toBe('coach_expert')
    expect(scriptFamily({ goal: 'authority', focus: 'expertise' })).toBe('coach_expert')
    expect(scriptFamily({ goal: 'educate' })).toBe('educator')
    expect(scriptFamily({ goal: 'community', focus: 'story' })).toBe('community')
    expect(scriptFamily({ goal: 'entertain', hasProduct: true })).toBe('entertainer')
    expect(scriptFamily({ focus: 'story' })).toBe('community')
  })

  it('the coach and the candle seller get structurally different moves', () => {
    const shared = FAMILY_MOVES.product.slice(0, 3).filter((m) => FAMILY_MOVES.coach_expert.slice(0, 3).includes(m))
    expect(shared).toEqual([])
  })

  it('every family has enough moves, each defined, with two real examples, and a shape', () => {
    for (const f of SCRIPT_FAMILIES) {
      expect(FAMILY_MOVES[f].length).toBeGreaterThanOrEqual(MIN_DISTINCT_MOVES + 1)
      for (const id of FAMILY_MOVES[f]) expect(HOOK_MOVES[id]?.examples.length).toBe(2)
      const rule = renderFamilyHookRule(f)
      expect(rule).toContain('hook_moves')
      expect(rule).toContain('OPEN, NEVER CLOSED')
      expect(rule).toContain('hook_promise')
      expect(rule).toContain('SHAPE FOR THIS FAMILY')
    }
  })

  it('normalizes labels and measures distinctness', () => {
    const moves = normalizeHookMoves(['reveal_verdict', 'Someone Result', 'nonsense', 'reveal_verdict'], 5, 'product')
    expect(moves).toEqual(['reveal_verdict', 'someone_result', 'other', 'reveal_verdict', 'other'])
    const a = auditHookSet(moves, 'product')
    expect(a.distinctMoves).toBe(2)
    expect(a.inFamily).toBe(3)
  })
})

import { describe, it, expect } from 'vitest'
import { substanceBudget, referencePointsFrom, POINT_ROLES } from '../substanceBudget'
import { BEAT_ROLES } from '../../referenceContentProfile'

describe('the budget, and the third state', () => {
  it('counts points from every source it was given', () => {
    const b = substanceBudget({ referencePoints: 3, storeItems: 1, productFacts: 2 })
    expect(b.enforceable).toBe(true)
    expect(b.beats).toBe(8) // 6 points + hook + cta
  })

  // ⚠️⚠️ THE CASE THE WHOLE MODULE EXISTS FOR. Nobody counted, so nothing may
  // be claimed — not "they have nothing" and not "write as much as you like".
  it('nothing counted is UNKNOWN, not zero and not unlimited', () => {
    const b = substanceBudget({})
    expect(b.beats).toBeNull()
    expect(b.enforceable).toBe(false)
    expect(b.counted).toBeNull()
    expect(substanceBudget(null).enforceable).toBe(false)
    expect(substanceBudget(undefined).enforceable).toBe(false)
  })

  // ⚖️ ONE KNOWN SOURCE IS ENOUGH TO COUNT WITH. An uncounted store does not
  // make a counted reference worthless.
  it('one known source is enforceable, with the unknown ones at zero', () => {
    const b = substanceBudget({ referencePoints: 4, storeItems: null })
    expect(b.enforceable).toBe(true)
    expect(b.beats).toBe(6)
    expect(b.counted).toEqual({ referencePoints: 4, storeItems: 0, productFacts: 0 })
  })

  // ⚠️ A REAL, COUNTED ZERO IS NOT THE UNKNOWN STATE.
  it('a counted zero is enforceable and means empty', () => {
    const b = substanceBudget({ referencePoints: 0, storeItems: 0, productFacts: 0 })
    expect(b.enforceable).toBe(true)
    expect(b.beats).toBe(2)
  })

  it('rejects nonsense without turning it into zero', () => {
    expect(substanceBudget({ referencePoints: Number.NaN }).enforceable).toBe(false)
    expect(substanceBudget({ referencePoints: -3 }).enforceable).toBe(false)
    expect(substanceBudget({ referencePoints: 'lots' as unknown as number }).enforceable).toBe(false)
  })
})


describe('which beats count as points', () => {
  // ⚠️ ASSERTED AGAINST THE REAL ROLE LIST, NOT A COPY OF ITSELF. If a role is
  // added to BEAT_ROLES and not considered here it silently stops counting, and
  // a budget that quietly ignores a whole kind of beat is worse than none.
  it('every point role is a real beat role', () => {
    for (const r of POINT_ROLES) expect(BEAT_ROLES).toContain(r)
  })

  // ⚖️ HOOK AND CTA ARE EXCLUDED ON PURPOSE: every script gets both however
  // little there is to say, so counting them would credit an empty reference.
  it('excludes the structural beats', () => {
    for (const r of ['hook', 'cta', 'rehook']) expect(POINT_ROLES).not.toContain(r)
  })

  it('counts only the points', () => {
    expect(referencePointsFrom([
      { role: 'hook' }, { role: 'setup' }, { role: 'item' },
      { role: 'rehook' }, { role: 'payoff' }, { role: 'cta' },
    ])).toBe(3)
  })

  // ⚠️⚠️ NULL, NOT ZERO, WHEN NOBODY COUNTED. `structure.beats` is Assessed:
  // not_checked and indeterminate are findings nobody made, and reading either
  // as "this reference makes no points" caps every script at two beats.
  it('an absent beat list is unknown, never empty', () => {
    expect(referencePointsFrom(null)).toBeNull()
    expect(referencePointsFrom(undefined)).toBeNull()
    expect(referencePointsFrom('beats' as unknown as [])).toBeNull()
  })

  it('a genuinely empty list is a counted zero', () => {
    expect(referencePointsFrom([])).toBe(0)
  })
})

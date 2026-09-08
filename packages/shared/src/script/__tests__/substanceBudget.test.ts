import { describe, it, expect } from 'vitest'
import {
  substanceBudget, referencePointsFrom, POINT_ROLES,
  planLength, asTarget, shapeFor, beatsFor, TARGET_SECONDS, DEFAULT_TARGET_SECONDS,
} from '../substanceBudget'
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

describe('the picker and the beat-count mapping', () => {
  it('adds beats, not longer beats', () => {
    expect(beatsFor(30)).toBe(4)
    expect(beatsFor(60)).toBe(6)
    expect(beatsFor(90)).toBe(8)
  })

  // ⚖️ A 30-SECOND SCRIPT IS AN EXPLAINER AND THE PICKER SAYS SO.
  it('the episode slot exists only at 60 and above', () => {
    expect(shapeFor(30)).not.toContain('episode')
    expect(shapeFor(60)).toContain('episode')
    expect(shapeFor(90)).toContain('episode')
  })

  it('every shape opens on a hook and closes on a CTA', () => {
    for (const t of TARGET_SECONDS) {
      expect(shapeFor(t)[0]).toBe('hook')
      expect(shapeFor(t)[shapeFor(t).length - 1]).toBe('cta')
    }
  })

  // ⚠️ DEFAULTING TO 30 WOULD PUSH THE MEASURED FAILURE FURTHER. The twelve runs
  // are thin, not long.
  it('defaults to 60', () => { expect(DEFAULT_TARGET_SECONDS).toBe(60) })

  it('accepts only the three real lengths', () => {
    expect(asTarget(30)).toBe(30)
    expect(asTarget('90')).toBe(90)
    expect(asTarget(45)).toBeNull()
  })

  // ⚠️ A CALLER THAT NEVER ASKED MUST NOT BE RECORDED AS HAVING CHOSEN.
  it('absent is null, never the default', () => {
    expect(asTarget(null)).toBeNull()
    expect(asTarget(undefined)).toBeNull()
    expect(asTarget('')).toBeNull()
  })
})

describe('THE EXPANSION BAN', () => {
  // ⚠️⚠️ THE 25s -> 40s CASE, WHICH INVENTED FIFTEEN SECONDS OF CONTENT.
  it('a target above the budget allows FEWER beats and never pads', () => {
    const budget = substanceBudget({ referencePoints: 2, storeItems: 0, productFacts: 0 }) // 4
    const plan = planLength(90, budget) // asks for 8
    expect(plan.beats).toBe(4)
    expect(plan.short).toBe(true)
    expect(plan.enforced).toBe(true)
  })

  it('the plan may never exceed the budget at any target', () => {
    for (const t of TARGET_SECONDS) {
      for (let points = 0; points <= 12; points++) {
        const budget = substanceBudget({ referencePoints: points, storeItems: 0, productFacts: 0 })
        const plan = planLength(t, budget)
        expect(plan.beats).toBeLessThanOrEqual(budget.beats as number)
        expect(plan.beats).toBeLessThanOrEqual(plan.targetBeats)
      }
    }
  })

  // ⚠️⚠️ THE 168s -> 26s CASE: SUBSTANCE EXCEEDED THE TARGET AND NOTHING SAID SO.
  it('substance beyond the target is counted, not silently dropped', () => {
    const plan = planLength(30, substanceBudget({ referencePoints: 8, storeItems: 0, productFacts: 0 }))
    expect(plan.beats).toBe(4)
    expect(plan.dropped).toBe(6)
    expect(plan.short).toBe(false)
  })

  // ⚠️ "WE COULD NOT CHECK" MUST NOT BE REPORTABLE AS "WE CHECKED AND IT PASSED".
  it('an unknown budget leaves the target alone and says the ban did not run', () => {
    const plan = planLength(60, substanceBudget({}))
    expect(plan.beats).toBe(6)
    expect(plan.enforced).toBe(false)
    expect(plan.short).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import {
  substanceBudget, planLength, lengthMessage, asTarget,
  beatsFor, shapeFor, wordsFor, TARGET_SECONDS, DEFAULT_TARGET_SECONDS,
} from '../substanceBudget'

describe('the beat-count mapping', () => {
  it('adds beats, not longer beats', () => {
    expect(beatsFor(30)).toBe(4)
    expect(beatsFor(60)).toBe(6)
    expect(beatsFor(90)).toBe(8)
  })

  // ⚖️ A 30-SECOND SCRIPT IS AN EXPLAINER AND A SCREEN SHOULD BE ABLE TO SAY SO.
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

  it('word targets follow ~2.5 words a second', () => {
    for (const t of TARGET_SECONDS) expect(wordsFor(t)).toBe(t * 2.5)
  })

  // ⚠️ DEFAULTING TO 30 WOULD MAKE THE MEASURED FAILURE WORSE. The twelve runs
  // are thin, not long.
  it('defaults to 60', () => { expect(DEFAULT_TARGET_SECONDS).toBe(60) })
})

describe('asTarget refuses to invent a choice', () => {
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

describe('THE EXPANSION BAN', () => {
  // ⚠️⚠️ THE 25s → 40s CASE, WHICH INVENTED FIFTEEN SECONDS OF CONTENT AND IS
  // WHERE "$1.50 in ingredients" AND "a four-loaf licence limit" CAME FROM.
  it('a target above the budget emits FEWER beats and never pads', () => {
    const budget = substanceBudget({ referencePoints: 2, storeItems: 0, productFacts: 0 }) // 4 beats
    const plan = planLength(90, budget) // asks for 8
    expect(plan.beats).toBe(4)
    expect(plan.beats).toBeLessThan(plan.targetBeats)
    expect(plan.short).toBe(true)
    expect(plan.enforced).toBe(true)
  })

  it('the script may never exceed the budget at any target', () => {
    for (const t of TARGET_SECONDS) {
      for (let points = 0; points <= 12; points++) {
        const budget = substanceBudget({ referencePoints: points, storeItems: 0, productFacts: 0 })
        const plan = planLength(t, budget)
        expect(plan.beats).toBeLessThanOrEqual(budget.beats as number)
        expect(plan.beats).toBeLessThanOrEqual(plan.targetBeats)
      }
    }
  })

  // ⚠️⚠️ THE 168s → 26s CASE: SUBSTANCE EXCEEDED THE TARGET AND NOTHING SAID SO.
  it('substance beyond the target is named, not silently dropped', () => {
    const budget = substanceBudget({ referencePoints: 8, storeItems: 0, productFacts: 0 }) // 10
    const plan = planLength(30, budget) // asks for 4
    expect(plan.beats).toBe(4)
    expect(plan.dropped).toBe(6)
    expect(plan.short).toBe(false)
    expect(lengthMessage(plan, 30)).toContain('6 points')
  })

  // ⚠️ "WE COULD NOT CHECK" MUST NOT BE REPORTABLE AS "WE CHECKED AND IT PASSED".
  it('an unknown budget leaves the target alone and says the ban did not run', () => {
    const plan = planLength(60, substanceBudget({}))
    expect(plan.beats).toBe(6)
    expect(plan.enforced).toBe(false)
    expect(plan.short).toBe(false)
    expect(lengthMessage(plan, 60)).toBeNull()
  })
})

describe('what the creator is told', () => {
  it('names the shortfall in seconds and offers the way out', () => {
    const plan = planLength(60, substanceBudget({ referencePoints: 1, storeItems: 0, productFacts: 0 }))
    const msg = lengthMessage(plan, 60) as string
    expect(msg).toContain('You asked for 60 seconds')
    expect(msg).toMatch(/about \d+ seconds of substance/)
    expect(msg).toContain("I don't have a story from you")
  })

  // ⚠️ PLAIN EVERYDAY ENGLISH EVERYWHERE A CREATOR READS. Our words for our
  // problem stay on our side of the screen.
  it('uses none of our internal vocabulary', () => {
    const cases = [
      planLength(60, substanceBudget({ referencePoints: 1 })),
      planLength(30, substanceBudget({ referencePoints: 9 })),
    ]
    for (const p of cases) {
      const msg = (lengthMessage(p, 60) ?? '') + (lengthMessage(p, 30) ?? '')
      expect(msg).not.toMatch(/\bbeat|\bbudget|\benforce|\btarget\b|\bsubstance budget\b/i)
    }
  })

  it('says nothing when the length fits', () => {
    const plan = planLength(60, substanceBudget({ referencePoints: 4, storeItems: 0, productFacts: 0 }))
    expect(plan.dropped).toBe(0)
    expect(plan.short).toBe(false)
    expect(lengthMessage(plan, 60)).toBeNull()
  })
})

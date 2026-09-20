// STEP 6 — THE RE-TEST, AGAINST THE PRODUCT THAT ACTUALLY PRODUCED THE BUG.
//
// ⚖️ `Weekly Meal Prep` is a real row in production (product_entities
// fa34ac8f): type SERVICE, showability NEVER, relationship OWN_PRODUCT,
// "Five days of fresh meals, cooked in your kitchen". Its creator was directed
// to "Hold a clean glass of water in one hand". These are its REAL stored
// values, not a fixture invented to pass.
import { describe, expect, it } from 'vitest'
import { directionsFor, renderDirectionGuidance } from '../script/performanceDirection'

const WEEKLY_MEAL_PREP = { kind: 'SERVICE', showability: 'NEVER' } as const

describe('Weekly Meal Prep, with its real stored values', () => {
  const text = renderDirectionGuidance(WEEKLY_MEAL_PREP)

  it('is never offered a thing to hold', () => {
    // ⚖️ MATCHED AS OPTION IDS, NOT AS WORDS. A looser regex failed here on
    // "Open both hands, palms up" — the word `palm` inside a body-direction
    // line, which is exactly the cue this product SHOULD get. The assertion
    // has to name the id at the start of its line or it tests prose.
    for (const id of ['hold_up', 'twist_open', 'unbox', 'palm', 'rotate', 'demonstrate', 'compare']) {
      expect(text).not.toMatch(new RegExp(`^\\s+- ${id}:`, 'm'))
    }
  })

  it('is told in the prompt that inventing a prop is the failure', () => {
    expect(text).toMatch(/glass of water/i)
  })

  it('gets real alternatives, not an empty instruction', () => {
    // The original bug was not that a prop was allowed — it was that nothing
    // else was offered, and a blank is not an option a model takes.
    const set = directionsFor(WEEKLY_MEAL_PREP)
    expect(set.options.length).toBeGreaterThanOrEqual(5)
    expect(text).toMatch(/Lean in toward the lens/)
    expect(text).toMatch(/Count the points off on your fingers/)
  })

  it('is framed as a Talking Review, the format that matches having nothing to show', () => {
    expect(directionsFor(WEEKLY_MEAL_PREP).format).toBe('Talking Review')
  })

  it('may name no screen either — it is not a screen product', () => {
    expect(directionsFor(WEEKLY_MEAL_PREP).nameableSections).toEqual([])
    expect(text).not.toMatch(/SECTIONS YOU MAY NAME/)
  })
})

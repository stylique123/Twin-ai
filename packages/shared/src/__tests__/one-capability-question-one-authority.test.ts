// ONE FACT, ONE QUESTION, ONE PLACE THAT DECIDES WHICH.
//
// ⚠️ THE SHAPE, NOT A LIVE WRONG ANSWER. The add form asked
// `capabilityQuestion(...)` which branch to show; the Product Library card
// decided for itself with `type === 'PHYSICAL_PRODUCT' ? 'physical' : 'screen'`
// behind a separate `capabilityAnswerIsUsed` gate. Enumerated 2026-09-08 over
// every EntityType × EntityRelationship, the two agreed everywhere — so nothing
// was wrong on screen that day.
//
// ⚖️ WHICH IS EXACTLY WHY IT IS WORTH FIXING NOW. A rule written twice and held
// together by nothing is not a bug yet; it is the thing that becomes one the
// next time the authority learns something the copy does not. `capabilityQuestion`
// has already changed once — MARKETPLACE and OTHER moved onto the screen branch
// after a creator answered on one surface and was never asked on the other.
import { describe, expect, it } from 'vitest'
import {
  capabilityQuestion, capabilityAnswerIsUsed, CAPABILITY_PROMPT,
  ENTITY_TYPES, ENTITY_RELATIONSHIPS,
} from '../index'

describe('the two surfaces cannot ask different capability questions', () => {
  it('agrees with the retired card-local rule across the whole product', () => {
    // ⚠️ THE OLD LOCAL RULE, KEPT HERE AS THE COMPARISON — this is the only
    // place it still exists. If a future change to `capabilityQuestion` makes
    // these diverge, that divergence is a DECISION, and this test is where it
    // has to be made deliberately instead of shipping as a surface mismatch.
    const cardLocal = (t: (typeof ENTITY_TYPES)[number]) =>
      capabilityAnswerIsUsed(t) ? (t === 'PHYSICAL_PRODUCT' ? 'physical' : 'screen') : null
    const disagreements: string[] = []
    for (const type of ENTITY_TYPES) {
      for (const relationship of ENTITY_RELATIONSHIPS) {
        const authority = capabilityQuestion({ type, relationship })
        if (authority !== cardLocal(type)) {
          disagreements.push(`${type}/${relationship}: authority=${authority} card=${cardLocal(type)}`)
        }
      }
    }
    expect(disagreements).toEqual([])
  })

  it('every branch it can return has words to render', () => {
    // ⚖️ A NULL PROMPT WOULD RENDER AN EMPTY LEGEND above a live radio group —
    // a question with no question in it, which is worse than not asking.
    for (const type of ENTITY_TYPES) {
      for (const relationship of ENTITY_RELATIONSHIPS) {
        const q = capabilityQuestion({ type, relationship })
        if (q === null) continue
        expect(CAPABILITY_PROMPT[q], `${type}/${relationship}`).toBeTruthy()
      }
    }
  })

  it('asks nothing where the answer would be thrown away', () => {
    // ⚠️ THE FOUNDING DEFECT OF THIS REBUILD, IN MINIATURE: COMMUNITY was asked
    // "can you record your screen?" and `inferShowability` returns NEVER for a
    // community whatever they answer. Collected and discarded.
    for (const relationship of ENTITY_RELATIONSHIPS) {
      expect(capabilityQuestion({ type: 'SERVICE', relationship })).toBeNull()
      expect(capabilityQuestion({ type: 'COMMUNITY', relationship })).toBeNull()
    }
  })
})

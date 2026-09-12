// OWNING A THING IS NOT USING IT, AND THE DIFFERENCE IS A PERMISSION.
//
// ⚠️ MEASURED IN PRODUCTION, 2026-09-11. Both products on a newly scanned
// account carried `personal_use: NOT_CONFIRMED` while their creator reported
// answering "Used: Yes". Nothing dropped the write — the question was never
// asked. `NEEDS_PERSONAL_USE` excluded `owned`, and the link-paste path then
// hardcoded the RESTRICTIVE answer for anyone the registry did not ask:
//
//     personalUse: asksPersonalUse(ctx) ? personalUse! : 'NOT_CONFIRMED'
//
// The claim rule then told her "you have not told us you use it, so the script
// cannot say what it did for you". She could not tell it. The only path that
// would ask was disabled for owners, and the value was manufactured.
//
// ⚖️ THE COST IS ASYMMETRIC AND THAT IS WHAT SETTLES IT. Wrongly RESTRICTING
// costs a slightly weaker script. Wrongly PERMITTING puts a first-person
// testimonial she never earned in her own mouth, about her own product. So the
// answer is ASKED, never inferred from ownership.
import { describe, it, expect } from 'vitest'
import { asksPersonalUse, ownsIt } from '../productQuestions'
import type { EntityRelationship } from '../productEntity'
import { ENTITY_RELATIONSHIPS } from '../productEntity'

const ctx = (relationship: EntityRelationship | null) =>
  ({ type: 'DIGITAL_PRODUCT' as const, relationship, hasSourceUrl: true })

describe('an owner is asked whether they use it', () => {
  it('asks the seller of their own product', () => {
    expect(asksPersonalUse(ctx('OWN_PRODUCT'))).toBe(true)
  })
  // ⚠️ THE SECOND OWNING RELATIONSHIP, AND IT IS EASY TO MISS. `OWN_SERVICE`
  // maps to the same registry `owned`; a check written against OWN_PRODUCT
  // alone would silently give a service-seller the affiliate's wording.
  it('asks the seller of their own service too', () => {
    expect(asksPersonalUse(ctx('OWN_SERVICE'))).toBe(true)
  })
  it('still asks an affiliate, a sponsor and a reviewer', () => {
    for (const r of ['AFFILIATE', 'SPONSOR', 'REVIEW_ONLY'] as const) {
      expect(asksPersonalUse(ctx(r)), r).toBe(true)
    }
  })
  // ⚖️ THE NEGATIVE CONTROL. Without this the rule is "ask everybody", which
  // would pass every assertion above while being a different rule entirely.
  it('does not ask someone with no relationship to the thing', () => {
    expect(asksPersonalUse(ctx('NONE'))).toBe(false)
    expect(asksPersonalUse(ctx(null))).toBe(false)
  })
})

describe('ownsIt', () => {
  it('is true for exactly the two owning relationships', () => {
    const owning = ENTITY_RELATIONSHIPS.filter((r) => ownsIt(r))
    expect([...owning].sort()).toEqual(['OWN_PRODUCT', 'OWN_SERVICE'])
  })
  it('is false for null rather than throwing', () => {
    expect(ownsIt(null)).toBe(false)
  })
})

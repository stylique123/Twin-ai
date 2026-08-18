// THE DECISIONS THAT HAVE TO EXIST BEFORE A WORD IS WRITTEN.
//
// ⚠️ THE DIAGNOSIS THIS TRACK IS BUILT ON: a generic script is rarely bad prose.
// It is prose with nothing specific inside it, because nobody decided what the
// video was or supplied what it should contain. So the plan grew the decisions
// it was missing — audience level, topic, angle, format, length, structure, hook
// and how present the product may be — and each one is a DECISION, never a
// sentence.
import { describe, expect, it } from 'vitest'
import {
  blankPlan, validateCreativeDecisionPlan, isCertified, PRODUCT_ROLES,
  type CreativeDecisionPlan,
} from '../creativeDecisionPlan'
import { assembleCreatorProfile, toPlannerView } from '../profileAssembler'

const AT = '2026-01-01T00:00:00.000Z'
const creator = (rel: 'own_product' | 'affiliate' | 'none') =>
  toPlannerView(assembleCreatorProfile({
    answers: { commercialTies: [rel] } as never, now: AT,
  }))

const plan = (over: Partial<CreativeDecisionPlan> = {}): CreativeDecisionPlan =>
  ({ ...blankPlan('educate'), ...over })

describe('a plan starts undecided rather than opinionated', () => {
  it('every new decision begins null, and the product role begins none', () => {
    // ⚖️ SELECTING A PRODUCT MAKES IT AVAILABLE; IT DOES NOT ASK FOR A VIDEO
    // ABOUT IT. If `productRole` defaulted from the products list, every plan
    // that named a product would quietly become a commercial.
    const p = blankPlan('educate')
    expect(p.productRole).toBe('none')
    expect([p.audienceLevel, p.topic, p.angle, p.format, p.targetSeconds, p.structure, p.hookStrategy])
      .toEqual([null, null, null, null, null, null, null])
    expect(p.restrictions).toEqual([])
  })

  it('and an undecided plan is still certifiable', () => {
    // ⚠️ THE NEW FIELDS MUST NOT BLOCK A VIDEO. They are decisions the pipeline
    // fills in; a plan that has not reached them yet is incomplete, not illegal.
    expect(isCertified(blankPlan('educate'), creator('none'))).toBe(true)
  })
})

describe('the field that stops every founder video becoming an advert', () => {
  it('refuses a plan built around a product it was never given', () => {
    // ⚠️ THE LIKELIEST REPAIR IS THE WORST ONE. A writer told to build the video
    // around a product it has no record of will invent one.
    const v = validateCreativeDecisionPlan(plan({ productRole: 'primary' }), creator('own_product'))
    expect(v.map((x) => x.code)).toContain('PRODUCT_ROLE_WITHOUT_PRODUCT')
  })

  it('but allows a product to be present without being the subject', () => {
    // ⚖️ "OWN SAAS + AUTHORITY MUST NOT BECOME AN ADVERTISEMENT" is expressible
    // now: the product is selected, and its role is one example among others.
    const v = validateCreativeDecisionPlan(
      plan({ objective: 'authority', products: ['p1'], productRole: 'example' }),
      creator('own_product'))
    expect(v).toEqual([])
  })

  it('and a teaching video with a library and no product role is fine', () => {
    const v = validateCreativeDecisionPlan(
      plan({ products: ['p1'], productRole: 'none' }), creator('own_product'))
    expect(v).toEqual([])
  })

  it('the four roles are a range, not a boolean', () => {
    // ⚖️ "MENTION IT OR DO NOT" IS NOT THE REAL SPREAD. One example among three
    // is a different video from one the whole script is about.
    expect([...PRODUCT_ROLES]).toEqual(['none', 'example', 'supporting', 'primary'])
  })
})

describe('what a plan may never contain', () => {
  it('carries restrictions as a list both the writer and the validator read', () => {
    // ⚠️ ONE LIST, TWO READERS. A restriction the writer honours and the
    // validator cannot see is a rule nobody can prove was followed.
    const p = plan({ restrictions: ['never say it doubles conversions'] })
    expect(p.restrictions).toHaveLength(1)
    expect(isCertified(p, creator('none'))).toBe(true)
  })
})

describe('the old refusals still stand', () => {
  it('sell with nothing to sell is still refused', () => {
    const v = validateCreativeDecisionPlan(plan({ objective: 'sell' }), creator('none'))
    expect(v.map((x) => x.code)).toContain('SELL_WITHOUT_COMMERCIAL_TARGET')
  })

  it('and a paid tie still owes a disclosure', () => {
    const v = validateCreativeDecisionPlan(
      plan({ products: ['p1'], disclosureRequired: false }), creator('affiliate'))
    expect(v.map((x) => x.code)).toContain('DISCLOSURE_MISSING_FOR_PAID_TIE')
  })
})

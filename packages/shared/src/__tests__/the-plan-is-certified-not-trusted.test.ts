// A SCHEMA-VALID PLAN CAN STILL BE AN IMPOSSIBLE ONE.
//
// ⚠️ STRUCTURED OUTPUT GUARANTEES THE SHAPE AND SAYS NOTHING ABOUT PERMISSION. A
// plan can name a product the creator never claimed, or instruct a pitch on a
// video that may not carry one, and satisfy every type while doing it. The model
// suggests; this file is code certifying.
//
// ⚖️ AND THIS IS WHERE THE SELL/NO-OFFER CONTRADICTION IS FINALLY DECIDABLE.
// `pipeline-scenarios.test.ts` pins today's behaviour: the goal directive
// instructs a pitch on its own authority while the relationship forbids any
// commercial ask, both reaching one prompt. Refusing the COMBINATION is a
// decision, and it belongs before a writer is called and before anyone is
// charged — not in a prompt the model may weigh against a contradicting line.
import { describe, expect, it } from 'vitest'
import {
  blankPlan,
  validateCreativeDecisionPlan, isCertified, CDP_ERRORS,
  type CreativeDecisionPlan,
} from '../creativeDecisionPlan'
import { assembleCreatorProfile, toPlannerView } from '../profileAssembler'
import { VIDEO_GOALS } from '../videoIntent'

const now = '2026-08-17T00:00:00.000Z'
const creatorWith = (ties: string[]) =>
  toPlannerView(assembleCreatorProfile({ answers: { commercialTies: ties } as never, now }))

const plan = (over: Partial<CreativeDecisionPlan> = {}): CreativeDecisionPlan => ({
  ...blankPlan('educate'),
  focus: 'expertise',
  ...over,
})

describe('sell with nothing to sell is refused, not softened', () => {
  it('fails validation with a named code', () => {
    const v = validateCreativeDecisionPlan(plan({ objective: 'sell' }), creatorWith(['none']))
    expect(v.map((x) => x.code)).toContain('SELL_WITHOUT_COMMERCIAL_TARGET')
  })

  it('passes the moment there is something to sell', () => {
    const v = validateCreativeDecisionPlan(
      plan({ objective: 'sell', products: ['prod-1'] }), creatorWith(['own_product']))
    expect(v.map((x) => x.code)).not.toContain('SELL_WITHOUT_COMMERCIAL_TARGET')
  })

  it('tells the creator what to do, in their words', () => {
    // ⚖️ THIS MESSAGE REACHES A SCREEN. "Plan validation failed" is a sentence
    // written for the system rather than the person in front of it.
    const [v] = validateCreativeDecisionPlan(plan({ objective: 'sell' }), creatorWith(['none']))
    expect(v.message).toMatch(/nothing is selected to sell/)
    expect(v.remedies.join(' ')).toMatch(/Pick a product|Change what this video is for/)
    for (const r of v.remedies) expect(r).not.toMatch(/plan|validation|CDP/i)
  })
})

describe('getting leads does NOT require a product', () => {
  it('lets a coach or consultant ask for a conversation with nothing in the library', () => {
    // ⚠️ THE TRAP THIS RULE EXISTS TO AVOID. Gating on a "commercial" flag would
    // block every realtor, freelancer and consultant — "DM me" and "book a call"
    // need no product entity. `sell` asks the viewer to buy a THING; `leads` does
    // not, and a thing that does not exist cannot be bought.
    const v = validateCreativeDecisionPlan(
      plan({ objective: 'leads', products: [] }), creatorWith(['own_service']))
    expect(v.map((x) => x.code)).not.toContain('SELL_WITHOUT_COMMERCIAL_TARGET')
  })

  it('and no other goal requires one either', () => {
    for (const goal of VIDEO_GOALS.filter((g) => g !== 'sell')) {
      const v = validateCreativeDecisionPlan(plan({ objective: goal }), creatorWith(['none']))
      expect(v.map((x) => x.code), goal).not.toContain('SELL_WITHOUT_COMMERCIAL_TARGET')
    }
  })
})

describe('a goal may narrow a permission and never grant one', () => {
  it('refuses ownership language for an affiliate', () => {
    const v = validateCreativeDecisionPlan(
      plan({ ownershipLanguage: true }), creatorWith(['affiliate']))
    expect(v.map((x) => x.code)).toContain('OWNERSHIP_WITHOUT_OWNED_PRODUCT')
  })

  it('refuses it for a creator who answered nothing', () => {
    // ⚖️ Silence is not permission, here as everywhere.
    const v = validateCreativeDecisionPlan(plan({ ownershipLanguage: true }), creatorWith([]))
    expect(v.map((x) => x.code)).toContain('OWNERSHIP_WITHOUT_OWNED_PRODUCT')
  })

  it('permits it for an owner', () => {
    const v = validateCreativeDecisionPlan(
      plan({ ownershipLanguage: true }), creatorWith(['own_product']))
    expect(v.map((x) => x.code)).not.toContain('OWNERSHIP_WITHOUT_OWNED_PRODUCT')
  })

  it('refuses a purchase ask from somebody with no stake', () => {
    const v = validateCreativeDecisionPlan(
      plan({ commercialCta: true }), creatorWith(['review']))
    expect(v.map((x) => x.code)).toContain('COMMERCIAL_CTA_WITHOUT_RELATIONSHIP')
  })

  it('but permits one from an affiliate, who has a real tie', () => {
    // ⚠️ AN AFFILIATE CANNOT SAY "OURS" AND CAN SAY "GO AND GET IT". Refusing
    // both would be as wrong as allowing both, in the other direction.
    const v = validateCreativeDecisionPlan(
      plan({ commercialCta: true, disclosureRequired: true }), creatorWith(['affiliate']))
    expect(v).toEqual([])
  })
})

describe('a paid tie owes a disclosure whatever the plan decided', () => {
  it('catches a sponsored plan that dropped it', () => {
    // ⚖️ A PROPERTY OF THE ARRANGEMENT, not a pacing decision the writer may
    // weigh against flow.
    const v = validateCreativeDecisionPlan(
      plan({ commercialCta: true, disclosureRequired: false }), creatorWith(['sponsor']))
    expect(v.map((x) => x.code)).toContain('DISCLOSURE_MISSING_FOR_PAID_TIE')
  })

  it('does not demand one from an owner', () => {
    const v = validateCreativeDecisionPlan(
      plan({ objective: 'sell', products: ['p'], commercialCta: true }),
      creatorWith(['own_product']))
    expect(v.map((x) => x.code)).not.toContain('DISCLOSURE_MISSING_FOR_PAID_TIE')
  })
})

describe('one pass, one complete answer', () => {
  it('returns every violation rather than the first', () => {
    // ⚠️ A CREATOR TOLD TO FIX ONE THING, WHO THEN HITS THE NEXT, LEARNS THAT THE
    // PRODUCT CANNOT COUNT.
    const v = validateCreativeDecisionPlan(
      plan({ objective: 'sell', ownershipLanguage: true, commercialCta: true }),
      creatorWith(['none']))
    expect(v.length).toBeGreaterThanOrEqual(3)
    expect(new Set(v.map((x) => x.code)).size).toBe(v.length)
  })

  it('certification is binary', () => {
    // ⚖️ NO "MOSTLY VALID". A caller handed that would have to decide which
    // violations it could live with, and that decision would then live in the
    // caller — which is what this whole architecture is stopping.
    expect(isCertified(plan(), creatorWith(['none']))).toBe(true)
    expect(isCertified(plan({ objective: 'sell' }), creatorWith(['none']))).toBe(false)
  })

  it('every code it can emit is declared', () => {
    const emitted = new Set(validateCreativeDecisionPlan(
      plan({ objective: 'sell', ownershipLanguage: true, commercialCta: true }),
      creatorWith(['sponsor'])).map((x) => x.code))
    for (const c of emitted) expect(CDP_ERRORS).toContain(c)
  })
})

describe('validation reads the planner view, not the whole profile', () => {
  it('cannot consult a field the planner was never entitled to see', () => {
    // ⚖️ THE PROJECTION IS THE ENFORCEMENT. If validation ever needs more, the
    // VIEW is what should change — visibly, in one place — rather than the
    // validator quietly reaching past it.
    const view = creatorWith(['own_product'])
    expect(view).not.toHaveProperty('rawValue')
    expect(view).not.toHaveProperty('role.source')
    expect(typeof view.mayUseOwnershipLanguage).toBe('boolean')
  })
})

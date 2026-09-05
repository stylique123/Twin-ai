import { describe, it, expect } from 'vitest'
import { commercialConsistency, saysSellsNothing, requiresDisclosure } from '../commercialConsistency'
import type { CommercialTie } from '../creatorProfileQuestions'

// ⚠️ THE SEVEN REAL PAIRS, READ OUT OF PRODUCTION 2026-09-05. Every voice that
// has answered, with the entity actually stored against it.
const PRODUCTION: ReadonlyArray<{
  ties: CommercialTie[]; entity: string | null; expect: 'agrees' | 'contradicts' | 'unrecorded'
}> = [
  { ties: ['none'], entity: null, expect: 'agrees' },
  { ties: ['none'], entity: 'OWN_SERVICE', expect: 'contradicts' },
  { ties: ['own_service'], entity: 'OWN_PRODUCT', expect: 'contradicts' },
  { ties: ['own_service'], entity: 'OWN_PRODUCT', expect: 'contradicts' },
  { ties: ['unspecified'], entity: 'OWN_PRODUCT', expect: 'agrees' },
  { ties: ['unspecified'], entity: 'OWN_PRODUCT', expect: 'agrees' },
  { ties: ['unspecified', 'own_product'], entity: 'OWN_PRODUCT', expect: 'agrees' },
]

describe('the production disagreement, pinned', () => {
  it('classifies all seven real voices as measured', () => {
    const verdicts = PRODUCTION.map((p) => commercialConsistency(p.ties, p.entity).verdict)
    expect(verdicts).toEqual(PRODUCTION.map((p) => p.expect))
  })

  it('finds exactly three contradictions among them', () => {
    const n = PRODUCTION.filter((p) => commercialConsistency(p.ties, p.entity).verdict === 'contradicts').length
    expect(n).toBe(3)
  })

  // ⚖️ `unspecified` ASSERTS NOTHING, so it cannot disagree with anything. Three
  // of the seven are only "agrees" because of this; treating it as a claim would
  // manufacture three more contradictions out of silence.
  it('never lets `unspecified` contradict a stored entity', () => {
    const c = commercialConsistency(['unspecified'], 'OWN_PRODUCT')
    expect(c.fromTies).toBeNull()
    expect(c.verdict).toBe('agrees')
    expect(c.safe).toBe('OWN_PRODUCT')
  })
})

describe('a contradiction resolves to the smaller claim, never the larger', () => {
  it('"I sell nothing" against an OWN_SERVICE entity resolves to NONE', () => {
    const c = commercialConsistency(['none'], 'OWN_SERVICE')
    expect(c.verdict).toBe('contradicts')
    expect(c.safe).toBe('NONE')
  })

  it('a service answer against a product entity resolves to the service', () => {
    expect(commercialConsistency(['own_service'], 'OWN_PRODUCT').safe).toBe('OWN_SERVICE')
  })

  // ⚠️ AND IT IS SYMMETRIC — the rule is about the CLAIM, not about which store
  // it came from. Preferring one source would encode a guess about which
  // surface creators answer more carefully, which nobody has measured.
  it('resolves the same way whichever store holds the larger claim', () => {
    expect(commercialConsistency(['own_product'], 'REVIEW_ONLY').safe).toBe('REVIEW_ONLY')
    expect(commercialConsistency(['review'], 'OWN_PRODUCT').safe).toBe('REVIEW_ONLY')
  })

  it('never resolves to something neither store said', () => {
    for (const p of PRODUCTION) {
      const c = commercialConsistency(p.ties, p.entity)
      if (c.safe === null) continue
      expect([c.fromTies, c.fromEntity]).toContain(c.safe)
    }
  })
})

describe('unrecorded is not NONE', () => {
  it('reports unrecorded when both stores are silent', () => {
    const c = commercialConsistency(null, null)
    expect(c.verdict).toBe('unrecorded')
    expect(c.safe).toBeNull()
    // ⚠️ THE WHOLE POINT. generate-blueprint keeps a separate, weaker refusal
    // for the unrecorded case; returning 'NONE' here would collapse them and
    // re-introduce the bug that branch exists to prevent.
    expect(c.safe).not.toBe('NONE')
  })

  it('treats an empty tie list as silence, not as an answer', () => {
    expect(commercialConsistency([], null).verdict).toBe('unrecorded')
  })

  it('ignores an entity relationship it does not recognise', () => {
    expect(commercialConsistency(null, 'SOMETHING_ELSE').verdict).toBe('unrecorded')
    expect(commercialConsistency(null, 42).verdict).toBe('unrecorded')
  })
})

describe('saysSellsNothing — the answer the writer cannot currently see', () => {
  // ⚠️ generate-blueprint's `recordedNoProduct` reads ONLY
  // `ownedEntity.relationship === 'NONE'`, and ZERO production entities carry
  // NONE. The "I sell nothing" answer writes `commercialTies`, which that
  // function never reads. This is the route that reaches it.
  it('is true for the onboarding answer with no entity at all', () => {
    expect(saysSellsNothing(['none'], null)).toBe(true)
  })

  it('is true when an entity agrees', () => {
    expect(saysSellsNothing(['none'], 'NONE')).toBe(true)
  })

  // ⚖️ A DISPUTED "NONE" IS NOT A REFUSAL. One production voice says `none` and
  // carries an OWN_SERVICE entity; the strongest refusal must not rest on a
  // fact the account itself disputes.
  it('is FALSE when the entity contradicts the answer', () => {
    expect(saysSellsNothing(['none'], 'OWN_SERVICE')).toBe(false)
  })

  it('is false for silence, and false for anyone who sells something', () => {
    expect(saysSellsNothing(null, null)).toBe(false)
    expect(saysSellsNothing([], null)).toBe(false)
    expect(saysSellsNothing(['own_product'], 'OWN_PRODUCT')).toBe(false)
    expect(saysSellsNothing(['unspecified'], null)).toBe(false)
  })
})

describe('disclosure is a union, not a resolution', () => {
  // ⚠️ THE ONE ASYMMETRY. Every other permission resolves DOWN on a conflict,
  // which withholds a claim and is recoverable. Resolving disclosure down
  // suppresses a notice a viewer was owed.
  it('requires disclosure when only the onboarding answer says affiliate', () => {
    expect(requiresDisclosure(['affiliate'], null)).toBe(true)
    expect(requiresDisclosure(['affiliate'], 'OWN_PRODUCT')).toBe(true)
  })

  it('requires disclosure when only the entity says sponsor', () => {
    expect(requiresDisclosure(null, 'SPONSOR')).toBe(true)
    expect(requiresDisclosure(['none'], 'SPONSOR')).toBe(true)
  })

  // ⚖️ AND IT SURVIVES THE RESOLUTION THAT WOULD HAVE HIDDEN IT. `['none']` vs
  // SPONSOR resolves to NONE under the safe-claim rule — which is right for
  // what may be CLAIMED and would silently drop the disclosure.
  it('still requires it where the safe claim resolves to NONE', () => {
    expect(commercialConsistency(['none'], 'SPONSOR').safe).toBe('NONE')
    expect(requiresDisclosure(['none'], 'SPONSOR')).toBe(true)
  })

  it('does not require it when neither store says affiliate or sponsor', () => {
    expect(requiresDisclosure(['own_product'], 'OWN_PRODUCT')).toBe(false)
    expect(requiresDisclosure(['none'], null)).toBe(false)
    expect(requiresDisclosure(null, null)).toBe(false)
    expect(requiresDisclosure(['review'], 'REVIEW_ONLY')).toBe(false)
  })

  it('is false for all seven production voices, which is why this is latent', () => {
    for (const p of PRODUCTION) expect(requiresDisclosure(p.ties, p.entity)).toBe(false)
  })
})

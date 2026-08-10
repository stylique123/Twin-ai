// THE GATE THAT CAN SAY NO.
//
// §16b. Its reason for existing is one scene: "Show the product", generated for
// a COACH WITH NO PRODUCT, transferred from a reference that had one. Every fact
// needed to refuse it was already in the system — `workKind` was coaching, the
// CTA was "apply for my one-on-one coaching program" — and nothing was holding a
// place to do the refusing.
//
// So the first test below is that coach, and it is the one that must never go
// green by accident.
import { describe, expect, it } from 'vitest'
import {
  REFERENCE_DIMENSIONS, TRANSFER_VERDICTS, compatibilityVerdicts, doNotUse,
  hasBlockingRejection, compatibilityPromptLine,
  type CompatibilityInput, type ReferenceDimension,
} from '../compatibilityGate'

const ALL = [...REFERENCE_DIMENSIONS] as ReferenceDimension[]
const verdictFor = (input: CompatibilityInput, d: ReferenceDimension) =>
  compatibilityVerdicts(input).find((v) => v.dimension === d)!

describe('THE COACH WITH NO PRODUCT', () => {
  const coach: CompatibilityInput = {
    observed: ALL,
    referenceShowsProduct: true,
    entity: null,
  }

  it('REJECTS the product demonstration rather than rationalising it', () => {
    const v = verdictFor(coach, 'product_demonstration')
    expect(v.verdict).toBe('REJECT')
    expect(v.reason).toMatch(/has none|cannot be filled/i)
  })

  it('is a BLOCKING rejection — the Gallery must know before a remix is spent', () => {
    expect(hasBlockingRejection(compatibilityVerdicts(coach))).toBe(true)
  })

  it('puts it in DO NOT USE, derived rather than hand-written', () => {
    const rejected = doNotUse(compatibilityVerdicts(coach)).map((v) => v.dimension)
    expect(rejected).toContain('product_demonstration')
  })
})

describe('product demonstration — every case', () => {
  it('transfers when the creator owns it AND can always show it', () => {
    expect(verdictFor({
      observed: ALL, referenceShowsProduct: true,
      entity: { relationship: 'OWN_PRODUCT', showability: 'ALWAYS' },
    }, 'product_demonstration').verdict).toBe('TRANSFER')
  })

  it('REJECTS when the product cannot be dependably shown', () => {
    // A script is written once and filmed later, so "sometimes" is a scene that
    // sometimes cannot be filmed — and UNKNOWN was never answered at all.
    for (const showability of ['SOMETIMES', 'NEVER', 'UNKNOWN'] as const) {
      expect(verdictFor({
        observed: ALL, referenceShowsProduct: true,
        entity: { relationship: 'OWN_PRODUCT', showability },
      }, 'product_demonstration').verdict).toBe('REJECT')
    }
  })

  it('REJECTS for a creator whose relationship is NONE', () => {
    expect(verdictFor({
      observed: ALL, referenceShowsProduct: true,
      entity: { relationship: 'NONE', showability: 'ALWAYS' },
    }, 'product_demonstration').verdict).toBe('REJECT')
  })

  it('says NOT OBSERVED when the reference shows no product at all', () => {
    // Nothing to transfer is not the same as refusing to transfer.
    expect(verdictFor({ observed: ALL, referenceShowsProduct: false }, 'product_demonstration')
      .verdict).toBe('NOT_OBSERVED')
  })
})

describe('the dimensions that always refuse', () => {
  it('product claims never carry from one product to another', () => {
    // The dimension whose failure mode is regulatory rather than aesthetic.
    const v = verdictFor({
      observed: ALL, referenceMakesProductClaims: true,
      entity: { relationship: 'OWN_PRODUCT', showability: 'ALWAYS' },
    }, 'product_claims')
    expect(v.verdict).toBe('REJECT')
  })

  it('the reference creator’s identity is never transferable', () => {
    expect(verdictFor({ observed: ALL }, 'creator_identity').verdict).toBe('REJECT')
  })

  it('rejects the delivery when the two energies genuinely conflict', () => {
    expect(verdictFor({ observed: ALL, referenceEnergy: 'high', creatorEnergy: 'calm' },
      'performance_energy').verdict).toBe('REJECT')
    // And merely adapts when they do not, or when one is unknown.
    expect(verdictFor({ observed: ALL, referenceEnergy: 'high', creatorEnergy: 'high' },
      'performance_energy').verdict).toBe('ADAPT')
    expect(verdictFor({ observed: ALL, referenceEnergy: 'high' },
      'performance_energy').verdict).toBe('ADAPT')
  })
})

describe('b-roll density is gated on what the creator can produce', () => {
  const heavy = { observed: ALL, referenceIsBRollHeavy: true }

  it('adapts on an explicit yes', () => {
    expect(verdictFor({ ...heavy, canProduceBRoll: true }, 'b_roll_density').verdict).toBe('ADAPT')
  })

  it('REJECTS on no, and REJECTS on unanswered', () => {
    // The renovation timelapse and the animated line graph. Silence cannot be a
    // yes when the question is whether a beat DEPENDS on footage.
    expect(verdictFor({ ...heavy, canProduceBRoll: false }, 'b_roll_density').verdict).toBe('REJECT')
    expect(verdictFor({ ...heavy, canProduceBRoll: null }, 'b_roll_density').verdict).toBe('REJECT')
    expect(verdictFor(heavy, 'b_roll_density').verdict).toBe('REJECT')
  })

  it('transfers when the format does not lean on b-roll at all', () => {
    expect(verdictFor({ observed: ALL, referenceIsBRollHeavy: false }, 'b_roll_density')
      .verdict).toBe('TRANSFER')
  })
})

describe('NOT OBSERVED is the honest fourth answer', () => {
  it('every unmeasured dimension comes back NOT_OBSERVED, never REJECT', () => {
    // The reader sees transcripts and never pixels, and emits nine visual facts
    // as `unknown` rather than guessing. Refusing them would refuse things that
    // might be fine; transferring them would carry across something nobody saw.
    const verdicts = compatibilityVerdicts({ observed: [] })
    expect(verdicts).toHaveLength(REFERENCE_DIMENSIONS.length)
    expect(verdicts.every((v) => v.verdict === 'NOT_OBSERVED')).toBe(true)
  })

  it('NOT OBSERVED wins over every other rule', () => {
    // Even the always-reject dimensions: we cannot rule on what we never read.
    const v = compatibilityVerdicts({
      observed: ['structure'], referenceShowsProduct: true, entity: null,
    })
    expect(v.find((x) => x.dimension === 'product_demonstration')!.verdict).toBe('NOT_OBSERVED')
    expect(v.find((x) => x.dimension === 'creator_identity')!.verdict).toBe('NOT_OBSERVED')
    expect(v.find((x) => x.dimension === 'structure')!.verdict).toBe('TRANSFER')
  })

  it('an unobserved product demonstration is NOT a blocking rejection', () => {
    expect(hasBlockingRejection(compatibilityVerdicts({ observed: [] }))).toBe(false)
  })
})

describe('the gate rules on everything, and says why', () => {
  it('returns exactly one verdict per dimension, in order', () => {
    // A gate that silently omits a dimension has not ruled on it — which is
    // precisely the state "product demonstration" was in.
    const verdicts = compatibilityVerdicts({ observed: ALL })
    expect(verdicts.map((v) => v.dimension)).toEqual(ALL)
  })

  it('every verdict is in the vocabulary and carries a real reason', () => {
    for (const v of compatibilityVerdicts({ observed: ALL })) {
      expect(TRANSFER_VERDICTS).toContain(v.verdict)
      // A verdict without a reason is indistinguishable from a default.
      expect(v.reason.length).toBeGreaterThan(20)
    }
  })

  it('the structural mechanics — the reason anyone picked the reference — transfer', () => {
    for (const d of ['hook_mechanism', 'structure', 'sequencing'] as const) {
      expect(verdictFor({ observed: ALL }, d).verdict).toBe('TRANSFER')
    }
  })
})

describe('the DO NOT USE block is derived, not written', () => {
  it('names each refusal and its reason', () => {
    const line = compatibilityPromptLine(compatibilityVerdicts({
      observed: ALL, referenceShowsProduct: true, entity: null,
    }))
    expect(line).toContain('DO NOT USE')
    expect(line).toContain('product demonstration')
    expect(line).toContain('creator identity')
  })

  it('is empty when nothing was refused', () => {
    expect(compatibilityPromptLine([])).toBe('')
    // A reference with nothing observed refuses nothing — it simply has no
    // opinion, and an empty DO NOT USE is the correct output for that.
    expect(compatibilityPromptLine(compatibilityVerdicts({ observed: [] }))).toBe('')
  })
})

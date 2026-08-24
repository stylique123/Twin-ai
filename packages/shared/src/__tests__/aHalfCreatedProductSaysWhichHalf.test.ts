import { describe, it, expect } from 'vitest'
import {
  productLifecycle, LIFECYCLE_MESSAGE, factsAreQuotable,
  IMPORT_FAILED_IS_NOT_DERIVABLE, type ProductLifecycle,
} from '../productLifecycle'
import { emptyRestrictions, type ProductEntityRecord } from '../productEntity'
import type { ExtractedFact } from '../productExtraction'
import * as shared from '../index'

// ⚠️ THE REPORT THIS EXISTS TO ANSWER: "Added, but we could not start reading
// that page." A creator was left with a card that did not say whether Twin was
// working, had finished, or had never begun — because all three look the same
// from `knowledge === null` alone.

const fact = (trust: 'usable' | 'needs_confirmation'): ExtractedFact => ({
  field: 'category', value: 'a thing', source: 'official_product_page',
  sourceUrl: 'https://example.com', trust, extractedAt: '2026-08-24T00:00:00Z',
})

const entity = (over: Partial<ProductEntityRecord> = {}): ProductEntityRecord => ({
  id: 'e1', name: 'Thing', type: 'SAAS', relationship: 'OWN_PRODUCT',
  personalUse: 'NOT_CONFIRMED', showability: 'UNKNOWN',
  productUrl: null, affiliateUrl: null, evidence: null,
  restrictions: emptyRestrictions(), source: 'user_answer', userConfirmed: true,
  updated: '2026-08-24T00:00:00Z',
  archivedAt: null, knowledge: null, knowledgeExtractedAt: null,
  knowledgeSourceUrl: null,
  ...over,
})

describe('the three states that used to look alike', () => {
  it('no link and no photo is NEEDS_SOURCE, not "reading"', () => {
    expect(productLifecycle(entity())).toBe('NEEDS_SOURCE')
  })

  it('a link with no extraction yet is READING', () => {
    expect(productLifecycle(entity({ productUrl: 'https://example.com' }))).toBe('READING')
  })

  // ⚠️ null AND [] ARE DIFFERENT ANSWERS. Collapsing them is the exact mistake
  // the record's own comment warns about, and it is why this test names both.
  it('an extraction that found nothing is NOTHING_FOUND, never READING', () => {
    const e = entity({ productUrl: 'https://example.com', knowledge: [] })
    expect(productLifecycle(e)).toBe('NOTHING_FOUND')
    expect(productLifecycle(e)).not.toBe('READING')
  })

  // ⚖️ A PHOTO IS A SOURCE TOO. A physical product with no page still has
  // something to read, and telling its owner to "add a link" would be wrong.
  it('photographs alone count as a source', () => {
    expect(productLifecycle(entity(), 0)).toBe('NEEDS_SOURCE')
    expect(productLifecycle(entity(), 2)).toBe('READING')
  })

  it('a whitespace-only url is not a source', () => {
    expect(productLifecycle(entity({ productUrl: '   ' }))).toBe('NEEDS_SOURCE')
  })
})

describe('facts decide the rest', () => {
  it('all-usable facts are READY', () => {
    expect(productLifecycle(entity({ knowledge: [fact('usable'), fact('usable')] }))).toBe('READY')
  })

  it('one unchecked guess among usable facts still needs a human', () => {
    expect(productLifecycle(entity({ knowledge: [fact('usable'), fact('needs_confirmation')] })))
      .toBe('REVIEW_REQUIRED')
  })

  it('facts that are all guesses are REVIEW_REQUIRED, not NOTHING_FOUND', () => {
    expect(productLifecycle(entity({ knowledge: [fact('needs_confirmation')] })))
      .toBe('REVIEW_REQUIRED')
  })
})

describe('archived outranks everything', () => {
  // ⚖️ A PUT-AWAY PRODUCT'S KNOWLEDGE STATE IS IRRELEVANT to what a creator
  // should read. Reporting "Twin is reading the page" about something they
  // withdrew last month would be true and useless.
  it('an archived product reports ARCHIVED whatever its knowledge says', () => {
    for (const k of [null, [], [fact('usable')], [fact('needs_confirmation')]]) {
      expect(productLifecycle(entity({ archivedAt: '2026-01-01T00:00:00Z', knowledge: k, productUrl: 'https://x.co' })))
        .toBe('ARCHIVED')
    }
  })
})

describe('only confirmed facts may be spoken in a script', () => {
  const ALL: ProductLifecycle[] = [
    'ARCHIVED', 'NEEDS_SOURCE', 'READING', 'NOTHING_FOUND', 'REVIEW_REQUIRED', 'READY',
  ]

  it('READY is the only quotable state', () => {
    expect(ALL.filter(factsAreQuotable)).toEqual(['READY'])
  })

  // ⚠️ REVIEW_REQUIRED IS THE ONE THAT MATTERS HERE: it HAS facts, so a lazier
  // rule ("any facts at all") would let a model quote an unchecked guess about
  // a real product's price into a real creator's video.
  it('a product with unchecked guesses is not quotable', () => {
    expect(factsAreQuotable('REVIEW_REQUIRED')).toBe(false)
  })
})

describe('what the creator reads', () => {
  it('every state has a message and none blames them', () => {
    for (const [state, msg] of Object.entries(LIFECYCLE_MESSAGE)) {
      expect(msg.length, state).toBeGreaterThan(10)
      expect(msg, state).not.toMatch(/you (failed|forgot|did not|must)/i)
    }
  })

  it('the message never mentions Twin internals', () => {
    for (const [state, msg] of Object.entries(LIFECYCLE_MESSAGE)) {
      expect(msg, state).not.toMatch(/extraction|entity|null|knowledge_|column|schema/i)
    }
  })
})

describe('the state that is honestly missing', () => {
  // ⚠️ VERIFIED AT SOURCE, NOT ASSUMED: worker/src/jobs/extractProduct.ts writes
  // `knowledge: []` on the nothing-to-read path, and writes NOTHING AT ALL when
  // an extraction fails. So a failure is byte-identical to never-attempted.
  it('IMPORT_FAILED is absent from the union rather than guessed', () => {
    const states = new Set<string>()
    for (const url of [null, 'https://x.co']) {
      for (const k of [null, [], [fact('usable')], [fact('needs_confirmation')]]) {
        states.add(productLifecycle(entity({ productUrl: url, knowledge: k })))
      }
    }
    states.add(productLifecycle(entity({ archivedAt: 'x' })))
    expect(states.has('IMPORT_FAILED')).toBe(false)
    expect(states.size).toBe(6)
  })

  it('and the reason is recorded in code, not only in a commit message', () => {
    expect(IMPORT_FAILED_IS_NOT_DERIVABLE).toMatch(/writes nothing back/i)
  })
})

describe('the module is reachable at all', () => {
  // ⚠️ THE DEFECT I SHIPPED ONCE ALREADY: four modules written, tested, merged
  // and NOT EXPORTED FROM THE INDEX, so no app could import them even by trying.
  it('is exported from the package index', () => {
    expect(typeof shared.productLifecycle).toBe('function')
    expect(typeof shared.factsAreQuotable).toBe('function')
    expect(typeof shared.LIFECYCLE_MESSAGE).toBe('object')
  })
})

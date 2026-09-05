import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  productLifecycle, LIFECYCLE_MESSAGE, factsAreQuotable,
  IMPORT_FAILED_IS_DERIVABLE_SINCE_0169, type ProductLifecycle,
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

const entityBase = (): ProductEntityRecord => ({
  id: 'e1', name: 'Thing', creatorSummary: null, type: 'SAAS', relationship: 'OWN_PRODUCT',
  personalUse: 'NOT_CONFIRMED', showability: 'UNKNOWN',
  productUrl: null, affiliateUrl: null, evidence: null,
  restrictions: emptyRestrictions(), source: 'user_answer', userConfirmed: true,
  updated: '2026-08-24T00:00:00Z',
  archivedAt: null, knowledge: null, knowledgeExtractedAt: null,
  knowledgeSourceUrl: null, knowledgeFailedAt: null, knowledgeError: null,
  // ⚠️ NEVER SET HERE UNTIL NOW, AND THE SPREAD IS WHAT HID IT. `communityMap` is
  //  `CommunityMap | null` — required, nullable — and this base simply omitted
  //  it, so every entity the file built carried `undefined`. `null` is what a
  //  non-community product actually holds; `undefined` is what nothing holds.
  communityMap: null,
})

/**
 * ⚠️ THE OVERRIDE USED TO BE SPREAD INTO THE LITERAL — `{ ...base, ...over }` —
 * and that does not typecheck. `Partial<T>` makes every property `| undefined`,
 * so the spread's result type has `communityMap: CommunityMap | null | undefined`
 * where the record requires `CommunityMap | null`. TypeScript is right: written
 * that way, `entity({ communityMap: undefined })` compiles and produces a record
 * production can never hold.
 *
 * ⚖️ `Object.assign` IS NOT A CAST. It is typed `<T, U>(t: T, u: U) => T & U`, so
 * the result is `ProductEntityRecord & Partial<ProductEntityRecord>` — which IS
 * `ProductEntityRecord`. Every override is still checked against the real field
 * type; what goes away is only the phantom `undefined` the spread introduced.
 * Silencing this with a cast would have been the easy move and would have let a
 * genuinely impossible record through.
 */
const entity = (over: Partial<ProductEntityRecord> = {}): ProductEntityRecord =>
  Object.assign(entityBase(), over)

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
    'ARCHIVED', 'NEEDS_SOURCE', 'IMPORT_FAILED', 'READING', 'NOTHING_FOUND',
    'REVIEW_REQUIRED', 'READY',
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

describe('the state that used to be missing, and now is not', () => {
  // ⚠️ THIS BLOCK ASSERTED THE OPPOSITE AND WAS RIGHT TO. IMPORT_FAILED was
  // absent from the union because a failed extraction wrote NOTHING back, so it
  // was byte-identical to never-attempted. Migration 0169 records the attempt
  // outcome, the worker writes it and clears it on success, and the state is
  // now derivable. The case is rewritten rather than deleted, because the
  // history is the useful part: this is what "the fix is a column, not a
  // cleverer derivation" looked like when it was done.
  it('a failed read with nothing learned is IMPORT_FAILED, not READING', () => {
    const e = entity({
      productUrl: 'https://example.com',
      knowledge: null,
      knowledgeFailedAt: '2026-08-24T10:00:00Z',
      knowledgeError: 'That page would not let Twin read it.',
    })
    expect(productLifecycle(e)).toBe('IMPORT_FAILED')
    expect(productLifecycle(e)).not.toBe('READING')
  })

  // ⚖️ AND A FAILURE THAT LEARNED NOTHING IS NOT THE SAME AS A FAILURE ON TOP OF
  // FACTS. A product with usable facts and a stale failed re-read is not broken;
  // telling its owner it failed would be a worse lie than saying nothing.
  it('a failed re-read over existing facts does not erase them', () => {
    const e = entity({
      productUrl: 'https://example.com',
      knowledge: [fact('usable')],
      knowledgeFailedAt: '2026-08-24T10:00:00Z',
      knowledgeError: 'That page took too long to answer.',
    })
    expect(productLifecycle(e)).toBe('READY')
  })

  it('no recorded failure still means READING while a source exists', () => {
    expect(productLifecycle(entity({ productUrl: 'https://example.com' }))).toBe('READING')
  })

  it('the union now has seven states', () => {
    const states = new Set<string>()
    for (const url of [null, 'https://x.co']) {
      for (const k of [null, [], [fact('usable')], [fact('needs_confirmation')]]) {
        states.add(productLifecycle(entity({ productUrl: url, knowledge: k })))
      }
    }
    states.add(productLifecycle(entity({ archivedAt: 'x' })))
    states.add(productLifecycle(entity({
      productUrl: 'https://x.co', knowledge: null,
      knowledgeFailedAt: 'now', knowledgeError: 'nope',
    })))
    expect(states.has('IMPORT_FAILED')).toBe(true)
    expect(states.size).toBe(7)
  })

  it('and what changed is recorded in code, not only in a commit message', () => {
    expect(IMPORT_FAILED_IS_DERIVABLE_SINCE_0169).toMatch(/knowledge_failed_at/)
  })
})

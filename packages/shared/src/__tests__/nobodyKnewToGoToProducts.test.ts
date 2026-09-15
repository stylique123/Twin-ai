// THE NAV NEVER SAID ANYTHING WAS WAITING, SO NOBODY WENT.
//
// Part 7 defect 7. `productLifecycle` has derived the state correctly all along
// and exactly one screen read it: the Product Library, which a creator only
// opens if she already suspects something is there.
//
// ⚠️ THE MUTANT THAT MATTERS IS "THE BADGE IS NEVER SHOWN" — the shipped state.
// Any test that only checks the happy count would pass just as cheerfully with
// the nav unwired, so the READING and ARCHIVED exclusions are asserted
// separately from the inclusions: a rule that badges everything and a rule that
// badges nothing are both wrong, and one assertion cannot tell them apart.

import { describe, it, expect } from 'vitest'
import {
  NEEDS_CREATOR_ACTION,
  productNeedsAttention,
  productsNeedingAttention,
} from '../productAttention'
import { productLifecycle, factsAreQuotable, type ProductLifecycle } from '../productLifecycle'
import type { ProductEntityRecord } from '../productEntity'

function entity(over: Partial<ProductEntityRecord> = {}): ProductEntityRecord {
  return {
    id: 'e1',
    ownerId: 'o1',
    name: 'Custom Bible Rebind',
    type: 'PHYSICAL_PRODUCT',
    relationship: 'OWN_PRODUCT',
    productUrl: null,
    affiliateUrl: null,
    creatorSummary: null,
    showability: null,
    knowledge: null,
    knowledgeFailedAt: null,
    archivedAt: null,
    evidence: null,
    ...over,
  } as ProductEntityRecord
}

const usableFact = { trust: 'usable', label: 'price', value: '£180' } as never
const guessFact = { trust: 'guess', label: 'price', value: '£180' } as never

describe('a product that wants something from its owner', () => {
  it('badges the four states where she can change what scripts may say', () => {
    // no link, no photos, never extracted → NEEDS_SOURCE
    expect(productNeedsAttention(entity())).toBe(true)
    // a recorded failure with nothing learned → IMPORT_FAILED
    expect(
      productNeedsAttention(entity({ productUrl: 'https://x.com/p', knowledgeFailedAt: '2026-09-15' })),
    ).toBe(true)
    // read and found nothing → NOTHING_FOUND
    expect(productNeedsAttention(entity({ productUrl: 'https://x.com/p', knowledge: [] }))).toBe(true)
    // facts exist but some are unchecked guesses → REVIEW_REQUIRED
    expect(
      productNeedsAttention(entity({ productUrl: 'https://x.com/p', knowledge: [usableFact, guessFact] })),
    ).toBe(true)
  })

  it('does NOT badge a product that is mid-read, because there is nothing to do', () => {
    const reading = entity({ productUrl: 'https://x.com/p' })
    expect(productLifecycle(reading)).toBe('READING')
    expect(productNeedsAttention(reading)).toBe(false)
  })

  it('does NOT badge an archived product, because that decision was already made', () => {
    const archived = entity({ archivedAt: '2026-09-01' })
    expect(productLifecycle(archived)).toBe('ARCHIVED')
    expect(productNeedsAttention(archived)).toBe(false)
  })

  it('does NOT badge a ready product', () => {
    const ready = entity({ productUrl: 'https://x.com/p', knowledge: [usableFact] })
    expect(productLifecycle(ready)).toBe('READY')
    expect(productNeedsAttention(ready)).toBe(false)
  })

  // ⚠️ THIS IS THE ASSERTION THAT STOPS THE TWO RULES DRIFTING. Every badged
  // state must be one whose facts a script may not quote; if someone later adds
  // a quotable state to the set, the badge would be summoning her to fix
  // something that is already working.
  it('never badges a state whose facts a script may already quote', () => {
    for (const s of NEEDS_CREATOR_ACTION) {
      expect(factsAreQuotable(s as ProductLifecycle)).toBe(false)
    }
  })

  it('photographs count as a source, so the badge and the page agree', () => {
    // The SQL measurement could not see image evidence and so overstated
    // NEEDS_SOURCE at 12 of 22. A row with photos and no link is READING.
    const withPhotos = entity()
    expect(productNeedsAttention(withPhotos, 0)).toBe(true)
    expect(productNeedsAttention(withPhotos, 2)).toBe(false)
  })
})

describe('the count', () => {
  it('counts products rather than answering yes or no', () => {
    const rows = [
      entity({ id: 'a' }), // NEEDS_SOURCE
      entity({ id: 'b', knowledgeFailedAt: '2026-09-15', productUrl: 'https://x/p' }), // IMPORT_FAILED
      entity({ id: 'c', productUrl: 'https://x/p', knowledge: [usableFact] }), // READY
      entity({ id: 'd', productUrl: 'https://x/p' }), // READING
    ]
    expect(productsNeedingAttention(rows)).toBe(2)
  })

  it('is zero for an empty library, so a new account gets no badge', () => {
    expect(productsNeedingAttention([])).toBe(0)
  })

  it('uses the injected photo count for every row', () => {
    const rows = [entity({ id: 'a' }), entity({ id: 'b' })]
    expect(productsNeedingAttention(rows)).toBe(2)
    // both have photographs → both are READING → nothing waiting
    expect(productsNeedingAttention(rows, () => 1)).toBe(0)
  })
})

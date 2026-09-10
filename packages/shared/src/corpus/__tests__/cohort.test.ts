// SILENCE IS THE DEFAULT, AND THESE ARE THE CASES THAT PROVE IT.
//
// ⚠️ The spec's own pass conditions are the tests here: give a cohort n=5 and
// the SHAPE block must be ABSENT; insert one 18M-view outlier and the
// recommendation must not change; change her facets and a different cohort must
// be cited BY NAME.
import { describe, it, expect } from 'vitest'
import { selectEvidenceCohort, shapeBlock, FACET_AGREEMENT, type CohortCard } from '../cohort'
import { MIN_COHORT, type FacetVector } from '../facets'

const HER: FacetVector = {
  domain: 'business', subDomain: 'wedding photography',
  customer: 'consumer', stageBand: '1k_10k',
}

/** A card by a creator whose own median is 5K, so reach 5K == 1.0x lift. */
const card = (over: Partial<CohortCard> = {}): CohortCard => ({
  facets: { ...HER },
  reach: '5K',
  creatorReaches: ['5K', '4K', '6K', '5.5K', '5K'],
  shape: 'story',
  ...over,
})

const many = (n: number, over: Partial<CohortCard> = {}): CohortCard[] =>
  Array.from({ length: n }, () => card(over))

describe('the cohort states which rung it came from', () => {
  it('prefers an exact sub-domain when it clears the floor', () => {
    const r = selectEvidenceCohort(HER, many(MIN_COHORT))
    expect(r.rung).toBe('sub_domain')
    expect(r.basis).toContain('wedding photography')
    expect(r.size).toBe(MIN_COHORT)
  })

  // ⚠️⚠️ THE SPEC'S HEADLINE EXAMPLE IS NOT ACHIEVABLE ON THIS DATA, AND THIS
  // TEST RECORDS THAT RATHER THAN LOWERING THE BAR TO FAKE IT.
  //
  // The spec's case for the facets rung is that "a photographer and a physio
  // share service · consumer · in_person, so what works for one is real
  // evidence for the other despite different domains". Those three facets are
  // `sells`, `customer` and `delivery`.
  //
  // ⚠️ TWO OF THE THREE ARE NOT IN THE VECTOR, and correctly so: `sells`,
  // `delivery` and `price_band` all come from the products table, and only TEN
  // owners of fifty-one have a single product row. Carrying them would score
  // cohorts on fields ~80% of creators do not have.
  //
  // ⚖️ SO WITH FOUR FACETS A PHOTOGRAPHER AND A PHYSIO CAN AGREE ON AT MOST TWO
  // — customer and stage band. Requiring three forces `domain` or `sub_domain`
  // to match, which collapses the cross-domain rung into the domain rung.
  // Lowering FACET_AGREEMENT to 2 would instead admit "any consumer creator at
  // the same follower stage", which is not a cohort, it is a demographic.
  //
  // ⚠️ WHAT WOULD CHANGE THIS: `sells` and `delivery` populated for a real
  // share of creators. Until then the cross-domain match is UNAVAILABLE, not
  // broken, and this test asserts the limitation so nobody reads the spec and
  // assumes it works.
  it('a physio does NOT yet qualify as a photographer’s cohort — sells/delivery are unpopulated', () => {
    const physios = many(MIN_COHORT, {
      facets: { domain: 'health', subDomain: 'physiotherapy', customer: 'consumer', stageBand: '1k_10k' },
    })
    const r = selectEvidenceCohort(HER, physios)
    expect(r.rung).toBe('none')
    expect(FACET_AGREEMENT).toBe(3)
  })

  // ⚖️ AND THE RUNG ITSELF WORKS — it just needs three facets to actually line
  // up, which today means sharing a domain and differing on sub-domain.
  it('the facets rung fires for a same-domain, different-sub-domain cohort', () => {
    const nearby = many(MIN_COHORT, {
      facets: { domain: 'business', subDomain: 'portrait photography', customer: 'consumer', stageBand: '1k_10k' },
    })
    const r = selectEvidenceCohort(HER, nearby)
    expect(r.rung).toBe('facets')
  })

  it('falls back to domain only, and says so', () => {
    const sameDomainOnly = many(MIN_COHORT, {
      facets: { domain: 'business', subDomain: 'saas', customer: 'business', stageBand: 'over_100k' },
    })
    const r = selectEvidenceCohort(HER, sameDomainOnly)
    expect(r.rung).toBe('domain')
  })

  // ⚠️ DESCENDING ONLY ON SIZE, NEVER ON PREFERENCE.
  it('never picks a weaker rung while a stronger one clears the floor', () => {
    const cards = [...many(MIN_COHORT), ...many(200, {
      facets: { domain: 'business', subDomain: 'saas', customer: 'business', stageBand: 'over_100k' },
    })]
    expect(selectEvidenceCohort(HER, cards).rung).toBe('sub_domain')
  })

  // ⚖️ CHANGING HER FACETS MUST CITE A DIFFERENT COHORT BY NAME.
  it('a different creator gets a differently-named cohort', () => {
    const baker: FacetVector = { domain: 'food', subDomain: 'microbakery', customer: 'consumer', stageBand: 'under_1k' }
    const a = selectEvidenceCohort(HER, many(MIN_COHORT)).basis
    const b = selectEvidenceCohort(baker, many(MIN_COHORT, { facets: { ...baker } })).basis
    expect(a).not.toBe(b)
    expect(b).toContain('microbakery')
    expect(b).toContain('under 1k followers')
  })
})

describe('the SHAPE block is ABSENT, not weakened', () => {
  // ⚠️⚠️ THE SPEC'S OWN PASS CONDITION: give a cohort n=5 and the block goes.
  it('a cohort of five yields no block at all', () => {
    const r = selectEvidenceCohort(HER, many(5))
    expect(r.rung).toBe('none')
    expect(r.size).toBe(0)
    expect(r.shapes).toEqual([])
    expect(shapeBlock(r)).toBeNull()
  })

  it('a tie yields no block even on a large cohort', () => {
    const r = selectEvidenceCohort(HER, [...many(30, { shape: 'story' }), ...many(28, { shape: 'tutorial' })])
    expect(r.size).toBe(58)
    expect(r.decisive).toBe(false)
    expect(shapeBlock(r)).toBeNull()
    // ⚖️ but the shapes ARE reported, so a caller can say "we looked, it tied"
    expect(r.shapes.map((s) => s.shape)).toEqual(['story', 'tutorial'])
  })

  it('a decisive lead yields a block that names its own basis', () => {
    const r = selectEvidenceCohort(HER, [...many(60, { shape: 'story' }), ...many(20, { shape: 'tutorial' })])
    expect(r.decisive).toBe(true)
    const b = shapeBlock(r)
    expect(b).not.toBeNull()
    expect(b!.shape).toBe('story')
    expect(b!.n).toBe(60)
    expect(b!.basis).toContain('wedding photography')
    expect(b!.rung).toBe('sub_domain')
  })

  // ⚠️⚠️ THE COHORT SIZE IS NOT THE SHAPE'S n. A cohort of 340 can still carry
  // a leading shape on four cards, and four cards is an anecdote.
  it('a big cohort whose leading shape is tiny yields no block', () => {
    const cards = [
      ...many(4, { shape: 'confession' }),
      ...many(50, { shape: null }), // classified as nothing
    ]
    const r = selectEvidenceCohort(HER, cards)
    expect(r.size).toBe(54)
    expect(r.shapes[0].n).toBe(4)
    expect(shapeBlock(r)).toBeNull()
  })

  // ⚠️⚠️ THE CASE A SURVIVING MUTANT EXPOSED. My first version of the test above
  // used 4 cards, where separates(4, 0) is exactly 2.0 and NOT > 2 — so
  // `decisive` was already false and the leading-shape floor was never reached.
  // Removing the floor entirely failed nothing. The code was right; the test
  // was not testing it.
  //
  // ⚖️ THIS IS THE REAL GAP: a shape that PASSES the separation test on its own
  // count while sitting below MIN_COHORT. separates(15, 0) is 3.87, decisive by
  // the gap rule — and fifteen cards is still fifteen cards.
  it('a shape that separates but sits below the floor still yields no block', () => {
    const r = selectEvidenceCohort(HER, [
      ...many(15, { shape: 'story' }),
      ...many(10, { shape: null }),
    ])
    expect(r.size).toBe(25)          // the COHORT clears MIN_COHORT
    expect(r.shapes[0].n).toBe(15)   // the SHAPE does not
    expect(r.decisive).toBe(true)    // and it passes the separation test
    expect(shapeBlock(r)).toBeNull() // so only the floor can stop it, and does
  })
})

describe('one video cannot carry a shape', () => {
  // ⚠️⚠️ THE SPEC'S PASS CONDITION: insert one 18M-view outlier and the
  // recommendation must not change.
  it('an 18M outlier does not change the recommendation', () => {
    const base = [...many(60, { shape: 'story' }), ...many(20, { shape: 'tutorial' })]
    const before = shapeBlock(selectEvidenceCohort(HER, base))
    const withOutlier = [...base, card({ shape: 'tutorial', reach: '18M' })]
    const after = shapeBlock(selectEvidenceCohort(HER, withOutlier))
    expect(after!.shape).toBe(before!.shape)
    expect(after!.shape).toBe('story')
  })

  // ⚖️ AND IT CANNOT PROMOTE ITS OWN SHAPE TO THE LEAD EITHER.
  it('a single enormous card does not make its shape decisive', () => {
    const r = selectEvidenceCohort(HER, [...many(25, { shape: 'story' }), card({ shape: 'reaction', reach: '18M' })])
    expect(shapeBlock(r)!.shape).toBe('story')
  })
})

describe('an unmeasurable card is not evidence about performance', () => {
  // ⚠️ NOT ENTERED WITH A DEFAULT. A default of "average" floods the ranking
  // with cards nobody measured, outranking measured below-average ones.
  it('cards with unknown reach stay out of the shape tally', () => {
    const r = selectEvidenceCohort(HER, [
      ...many(25, { shape: 'story' }),
      ...many(40, { shape: 'tutorial', reach: '0' }), // "0" is UNKNOWN in this corpus
    ])
    expect(r.size).toBe(65)
    expect(r.shapes.map((s) => s.shape)).toEqual(['story'])
  })

  it('cards with too small a creator baseline stay out too', () => {
    const r = selectEvidenceCohort(HER, [
      ...many(25, { shape: 'story' }),
      ...many(40, { shape: 'tutorial', creatorReaches: ['5K', '4K'] }), // below the 5-video floor
    ])
    expect(r.shapes.map((s) => s.shape)).toEqual(['story'])
  })

  it('unclassified cards are counted in the cohort but never as a shape', () => {
    const r = selectEvidenceCohort(HER, many(MIN_COHORT, { shape: null }))
    expect(r.size).toBe(MIN_COHORT)
    expect(r.shapes).toEqual([])
    expect(shapeBlock(r)).toBeNull()
  })
})

describe('nothing still states its basis', () => {
  it('an empty corpus returns the none rung with a sentence', () => {
    const r = selectEvidenceCohort(HER, [])
    expect(r.rung).toBe('none')
    expect(r.basis).toContain('0 videos')
    expect(shapeBlock(r)).toBeNull()
  })
})

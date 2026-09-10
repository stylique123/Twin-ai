// A CREATOR IS A VECTOR, NOT A NICHE WORD — AND UNKNOWN IS NOT AGREEMENT.
//
// ⚠️ EVERY FIXTURE IS A REAL `profile.audience` STRING from brand_voices. The
// most important one is the ambiguous case, which is also the most common single
// audience value in the corpus (4 of 45).
import { describe, it, expect } from 'vitest'
import {
  facetsOf, customerOf, stageBandOf, facetMatch, describeCohort,
  cohortMayRecommend, MIN_COHORT, knownFacets,
} from '../facets'

describe('customer is read, and ambiguity is refused', () => {
  it('reads a business audience', () => {
    expect(customerOf('Startup founders and tech entrepreneurs')).toBe('business')
  })

  it('reads a consumer audience', () => {
    expect(customerOf('Young women looking for affordable, natural ways to achieve their beauty goals.'))
      .toBe('consumer')
  })

  // ⚠️⚠️ THE REAL ONE, AND THE MOST COMMON. "Fashion e-commerce brand owners and
  // frequent online shoppers" is BOTH. Picking one would place four voices in a
  // cohort they half belong to, and nothing downstream could tell.
  it('refuses an audience that is genuinely both', () => {
    expect(customerOf('Fashion e-commerce brand owners and frequent online shoppers')).toBeNull()
  })

  it('an audience naming no group it can read is unknown, not consumer', () => {
    expect(customerOf('People who like interesting things')).toBeNull()
    expect(customerOf('')).toBeNull()
    expect(customerOf(null)).toBeNull()
  })
})

describe('the null check precedes the coercion', () => {
  // ⚠️⚠️ `Number(null)` IS 0, which would file every creator with no follower
  // count into `under_1k` — a real cohort, silently populated by absence.
  it('absent followers is unknown, NOT under_1k', () => {
    expect(stageBandOf(null)).toBeNull()
    expect(stageBandOf(undefined)).toBeNull()
    expect(stageBandOf('')).toBeNull()
  })

  it('but a real zero is a real band', () => {
    expect(stageBandOf(0)).toBe('under_1k')
  })

  it.each([[999, 'under_1k'], [1000, '1k_10k'], [9999, '1k_10k'],
    [10000, '10k_100k'], [250000, 'over_100k']] as const)('%i → %s', (n, band) => {
    expect(stageBandOf(n)).toBe(band)
  })
})

describe('sub_domain is READ, never extracted', () => {
  // ⚠️ THE SPEC CALLS THIS "the only new work — one extraction pass over stored
  // text". It is already stored on 46 of 51 voices as `profile.sub_niche`.
  it('reads profile.sub_niche as it stands', () => {
    expect(facetsOf({ sub_niche: ' Wedding Photography ' }, {}).subDomain).toBe('Wedding Photography')
  })

  it('and an absent sub_niche is null, not an empty string', () => {
    expect(facetsOf({}, {}).subDomain).toBeNull()
    expect(facetsOf({ sub_niche: '   ' }, {}).subDomain).toBeNull()
  })
})

describe('unknown never counts as agreement', () => {
  const empty = { domain: null, subDomain: null, customer: null, stageBand: null } as const

  // ⚠️⚠️ THE BUG A NAIVE IMPLEMENTATION SHIPS. Scoring null === null as a match
  // ranks the EMPTIEST profiles as the best matches — precisely backwards.
  it('two empty vectors match on nothing, with a null score', () => {
    const m = facetMatch({ ...empty }, { ...empty })
    expect(m.comparable).toBe(0)
    expect(m.agreed).toBe(0)
    expect(m.score).toBeNull()
  })

  it('an unknown facet on one side is not comparable', () => {
    const m = facetMatch(
      { ...empty, customer: 'consumer', stageBand: '1k_10k' },
      { ...empty, customer: 'consumer' })
    expect(m.comparable).toBe(1)
    expect(m.agreed).toBe(1)
    expect(m.score).toBe(1)
  })

  // ⚖️ THE CASE THE WHOLE VECTOR EXISTS FOR: different domains, real evidence.
  it('a photographer and a physio match on what they share', () => {
    const m = facetMatch(
      { domain: 'business', subDomain: 'wedding photography', customer: 'consumer', stageBand: '1k_10k' },
      { domain: 'health', subDomain: 'physiotherapy', customer: 'consumer', stageBand: '1k_10k' })
    expect(m.comparable).toBe(4)
    expect(m.agreed).toBe(2)
    expect(m.score).toBe(0.5)
  })

  it('sub-domain compares case- and space-insensitively', () => {
    expect(facetMatch(
      { ...empty, subDomain: 'Wedding Photography' },
      { ...empty, subDomain: ' wedding photography ' }).agreed).toBe(1)
  })

  it('knownFacets lists only what is set', () => {
    expect(knownFacets({ ...empty, customer: 'business' })).toEqual(['customer'])
  })
})

describe('the cohort declares its own basis', () => {
  it('names what is known, in a creator’s words', () => {
    expect(describeCohort({
      domain: 'business', subDomain: 'wedding photography',
      customer: 'consumer', stageBand: '1k_10k',
    }, 340)).toBe('From 340 videos by wedding photography, selling to consumers, under 10k followers.')
  })

  it('falls back to the domain when there is no sub-domain', () => {
    expect(describeCohort({ domain: 'beauty_fashion', subDomain: null, customer: null, stageBand: null }, 12))
      .toBe('From 12 videos by beauty fashion.')
  })

  // ⚠️ A COHORT WITH NO FACETS MUST SAY SO rather than imply a match nobody made.
  it('says plainly when nothing is known about who made them', () => {
    expect(describeCohort({ domain: null, subDomain: null, customer: null, stageBand: null }, 5))
      .toBe('From 5 videos, with nothing known about who made them.')
  })

  it('one video reads as "video"', () => {
    expect(describeCohort({ domain: null, subDomain: null, customer: null, stageBand: null }, 1))
      .toContain('1 video,')
  })
})

describe('silence is the default below n = 20', () => {
  // ⚖️ MEASURED PRECEDENT: entry_impressions is 45 rows across 4 owners, two of
  // them nearly all of it. A reader built on that tunes the product for two
  // people. The stakes floor fires on 3.2% at n=3 and cannot be calibrated.
  it('refuses a cohort smaller than the floor', () => {
    expect(cohortMayRecommend(19)).toBe(false)
    expect(cohortMayRecommend(MIN_COHORT)).toBe(true)
    expect(MIN_COHORT).toBe(20)
  })

  it('refuses zero and negative sizes', () => {
    expect(cohortMayRecommend(0)).toBe(false)
    expect(cohortMayRecommend(-1)).toBe(false)
  })
})

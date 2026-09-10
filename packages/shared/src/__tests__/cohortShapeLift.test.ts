// A SHAPE AT THE CREATOR'S OWN MEDIAN IS NOT EVIDENCE.
//
// ⚠️ MEASURED AGAINST THE WHOLE PRODUCTION CORPUS, 2026-09-10, 2,116 classified
// cards. `shapeBlock` returned a block for four of seven niche buckets and every
// one carried medianLift of exactly 1.0000:
//
//     business        how_to          n=297   lift 1.0000
//     tech            how_to          n=169   lift 1.0000
//     food            number_promise  n= 50   lift 1.0000
//     beauty_fashion  number_promise  n= 48   lift 1.0000
//
// Every gate before the lift gate counts CARDS. None asked whether the shape
// beat the creator's ordinary video — so a shape sitting exactly at the median
// was about to reach the model as evidence of what works, and `shapeBlock`'s own
// header says why that is worse than silence.
import { describe, expect, it } from 'vitest'
import { selectEvidenceCohort, shapeBlock, MIN_MEDIAN_LIFT, type CohortCard, type CohortRead }
  from '../corpus/cohort'
import { MIN_COHORT, type FacetVector } from '../corpus/facets'

const HER: FacetVector = { domain: 'health', subDomain: null, customer: null, stageBand: null }

/** A read that clears every OTHER gate, so only the lift is under test. */
function readWith(medianLift: number, n = MIN_COHORT + 40): CohortRead {
  return {
    rung: 'domain',
    basis: 'creators in health',
    size: n + 40,
    shapes: [{ shape: 'how_to', n, medianLift }, { shape: 'myth_bust', n: 2, medianLift: 3 }],
    decisive: true,
  }
}

describe('the lift gate', () => {
  it('refuses a shape at exactly the median — the measured case', () => {
    // 297 cards and 1.0000 lift: the business bucket, verbatim.
    expect(shapeBlock({ ...readWith(1.0, 297) })).toBeNull()
  })

  it('refuses a shape BELOW the median, however many cards carry it', () => {
    expect(shapeBlock(readWith(0.62, 400))).toBeNull()
  })

  it('refuses a shape just under the floor', () => {
    expect(shapeBlock(readWith(MIN_MEDIAN_LIFT - 0.001))).toBeNull()
  })

  it('admits one at the floor', () => {
    const b = shapeBlock(readWith(MIN_MEDIAN_LIFT))
    expect(b).not.toBeNull()
    expect(b?.shape).toBe('how_to')
  })

  it('carries the lift, so the prompt can say the number and not just the shape', () => {
    // ⚠️ A CONSUMER THAT RENDERS THE SHAPE AND DROPS THIS TURNS EVIDENCE BACK
    // INTO AN INSTRUCTION. "how_to" is a instruction; "how_to, 4.2x median
    // across 60 cards" is a claim a reader can weigh and disagree with.
    const b = shapeBlock(readWith(4.2))
    expect(b?.medianLift).toBe(4.2)
    expect(b?.n).toBe(MIN_COHORT + 40)
  })

  it('is a LIFT threshold, not a rank threshold', () => {
    // Being the leading shape is not the same as being a good one. The leader
    // here is decisively ahead on count and still average on performance.
    const leaderButAverage: CohortRead = {
      rung: 'domain', basis: 'creators in health', size: 500,
      shapes: [{ shape: 'how_to', n: 300, medianLift: 1.0 },
               { shape: 'number_promise', n: 20, medianLift: 9.0 }],
      decisive: true,
    }
    expect(shapeBlock(leaderButAverage)).toBeNull()
  })
})

describe('the gate does not replace the gates before it', () => {
  it('a huge lift cannot rescue a thin leading shape', () => {
    expect(shapeBlock(readWith(9.0, MIN_COHORT - 1))).toBeNull()
  })

  it('a huge lift cannot rescue an undecided read', () => {
    expect(shapeBlock({ ...readWith(9.0), decisive: false })).toBeNull()
  })

  it('a huge lift cannot rescue a cohort below the floor', () => {
    expect(shapeBlock({ ...readWith(9.0), size: 3 })).toBeNull()
  })
})

describe('against real card shapes', () => {
  it('a corpus whose reach is constant per creator yields no block', () => {
    // ⚠️ THIS IS THE PRODUCTION SHAPE OF THE DATA, not a contrived one.
    // `gallery_items.reach` is audience size: 40.6% of a creator's cards share
    // one identical value. Constant reach divides to a lift of exactly 1.
    const cards: CohortCard[] = Array.from({ length: 60 }, () => ({
      facets: { domain: 'health', subDomain: null, customer: null, stageBand: null },
      reach: '1.1M',
      creatorReaches: ['1.1M', '1.1M', '1.1M', '1.1M', '1.1M'],
      shape: 'how_to',
    }))
    const read = selectEvidenceCohort(HER, cards)
    expect(read.shapes[0]?.medianLift).toBe(1)
    expect(shapeBlock(read)).toBeNull()
  })
})

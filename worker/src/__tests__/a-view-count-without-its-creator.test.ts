// A VIEW COUNT WITHOUT ITS CREATOR IS NOT A SIGNAL.
//
// The spec's proof, stated as a test: two references, the same absolute views,
// different creator sizes — they must not be worth the same.
//
// ⚠️ MEASURED IN PRODUCTION 2026-09-12 BEFORE ANY OF THIS WAS BUILT: 422 rows in
// `transcripts`, 125 of them references, every one carrying the words and NOT
// ONE carrying a view count. The numbers below are the first this product has
// ever computed about a pasted video.
import { describe, it, expect } from 'vitest'
import {
  workerReferenceMetrics, EMPTY_WORKER_REFERENCE_METRICS, MIN_VIDEOS_FOR_BASELINE,
} from '../referenceMetrics.js'

const five = ['5000', '4000', '6000', '5500', '4500']

describe('THE PROOF: the same views are worth different amounts', () => {
  it('50k from a small account beats 500k from a huge one', () => {
    const small = workerReferenceMetrics({
      views: 50_000, creatorHandle: 'smallcreator', creatorAudience: 2_000,
      siblingReaches: five,
    })
    const huge = workerReferenceMetrics({
      views: 500_000, creatorHandle: 'hugecreator', creatorAudience: 5_000_000,
      siblingReaches: ['1M', '900K', '1.1M', '1.05M', '950K'],
    })
    // TEN TIMES the absolute views…
    expect(huge.views).toBe(10 * small.views!)
    // …and a tenth of the achievement.
    expect(small.relativeLift).toBeGreaterThan(huge.relativeLift!)
    expect(small.relativeLift).toBeCloseTo(10, 5)
    expect(huge.relativeLift).toBeCloseTo(0.5, 5)
  })

  it('identical views separate on the creator alone', () => {
    const a = workerReferenceMetrics({ views: 100_000, creatorHandle: 'a', siblingReaches: five })
    const b = workerReferenceMetrics({
      views: 100_000, creatorHandle: 'b', siblingReaches: ['500K', '400K', '600K', '550K', '450K'],
    })
    expect(a.views).toBe(b.views)
    expect(a.relativeLift).toBeGreaterThan(b.relativeLift!)
  })
})

describe('a lift must belong to a named creator', () => {
  it('siblings with no uploader produce NO lift, however many there are', () => {
    // A confident multiple of the WRONG creator's normal is the worst outcome
    // available here, because it looks exactly like a right one.
    const m = workerReferenceMetrics({ views: 50_000, siblingReaches: five })
    expect(m.relativeLift).toBeNull()
    expect(m.relativeBasis).toBeNull()
    // …and the facts that ARE attributable survive it.
    expect(m.views).toBe(50_000)
  })

  it('a blank or "@"-only handle is not a name', () => {
    for (const who of ['', '   ', '@', '@@']) {
      expect(workerReferenceMetrics({ views: 50_000, creatorHandle: who, siblingReaches: five })
        .relativeLift).toBeNull()
    }
  })

  it('the handle is stored without its @, so two spellings are one creator', () => {
    expect(workerReferenceMetrics({ creatorHandle: '@physio' }).creatorHandle).toBe('physio')
    expect(workerReferenceMetrics({ creatorHandle: ' physio ' }).creatorHandle).toBe('physio')
  })
})

describe('null means not read, and never zero', () => {
  it('zero, negative, absent and junk are the same answer: unknown', () => {
    for (const v of [0, '0', null, undefined, -5, 'nonsense', {}]) {
      const m = workerReferenceMetrics({ views: v, creatorAudience: v })
      expect(m.views).toBeNull()
      expect(m.creatorAudience).toBeNull()
    }
  })

  it('a reference with nothing readable is empty, not zeroed', () => {
    expect(workerReferenceMetrics({})).toEqual(EMPTY_WORKER_REFERENCE_METRICS)
  })

  it('a below-average video is still MEASURED, and says so', () => {
    // The floor's job is to refuse guesses, not to refuse bad news.
    const m = workerReferenceMetrics({ views: 500, creatorHandle: 'a', siblingReaches: five })
    expect(m.relativeLift).toBeLessThan(1)
    expect(m.relativeBasis).toBe(MIN_VIDEOS_FOR_BASELINE)
  })
})

describe('the baseline needs enough videos to be a baseline', () => {
  it('one under the floor yields no lift; the floor itself yields one', () => {
    expect(workerReferenceMetrics({
      views: 50_000, creatorHandle: 'a', siblingReaches: five.slice(0, MIN_VIDEOS_FOR_BASELINE - 1),
    }).relativeLift).toBeNull()
    expect(workerReferenceMetrics({ views: 50_000, creatorHandle: 'a', siblingReaches: five })
      .relativeBasis).toBe(MIN_VIDEOS_FOR_BASELINE)
  })

  it('"0" siblings are DROPPED, not counted — so six of them are not a baseline', () => {
    // 945 rows of the scraped corpus carry reach "0" from a scrape that captured
    // nothing. Counting those would let a creator with one real video clear the
    // floor and be measured against a median of zero.
    expect(workerReferenceMetrics({
      views: 50_000, creatorHandle: 'a', siblingReaches: ['5K', '0', '0', '0', '0', '0'],
    }).relativeLift).toBeNull()
  })

  it('abbreviated strings are real values, not text — "11.3M" is not less than "9.8M"', () => {
    // They sort alphabetically, so any ranking done on the raw column is
    // silently wrong.
    const m = workerReferenceMetrics({
      views: '1.2M', creatorHandle: 'a',
      siblingReaches: ['1.2M', '965.6K', '11.3M', '9.8M', '5K', '4K'],
    })
    expect(m.views).toBe(1_200_000)
    // Median of [4K, 5K, 965.6K, 1.2M, 9.8M, 11.3M] = (965.6K + 1.2M) / 2.
    expect(m.relativeLift).toBeCloseTo(1_200_000 / ((965_600 + 1_200_000) / 2), 5)
  })
})

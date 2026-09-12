// The proof the spec asked for, stated as a test:
//
//   "Two references, same absolute views, different creator sizes.
//    They rank differently."
//
// Everything else here defends the three-state discipline that makes that
// ranking honest — because the failure mode is not "no lift", it is a confident
// lift belonging to somebody else.
import { describe, expect, it } from 'vitest'
import {
  referenceMetricsFrom, readReferenceMetrics, byRelativeStrength,
  EMPTY_REFERENCE_METRICS, type ReferenceMetrics,
} from '../referenceMetrics'
import { MIN_VIDEOS_FOR_BASELINE } from '../relativePerformance'

const five = ['5000', '4000', '6000', '5500', '4500']

describe('THE PROOF: same views, different creator, different rank', () => {
  it('50k from a small account outranks 500k from a huge one', () => {
    // Small account: median ~5,000 → 10×.
    const small = referenceMetricsFrom({
      views: 50_000, creatorHandle: 'smallcreator', creatorAudience: 2_000,
      siblingReaches: five,
    })
    // Huge account: median ~1,000,000 → 0.5×. TEN TIMES the absolute views.
    const huge = referenceMetricsFrom({
      views: 500_000, creatorHandle: 'hugecreator', creatorAudience: 5_000_000,
      siblingReaches: ['1M', '900K', '1.1M', '1.05M', '950K'],
    })
    expect(huge.views).toBeGreaterThan(small.views!)
    expect([huge, small].sort(byRelativeStrength)[0]).toBe(small)
  })

  it('identical views rank by the creator they came from, nothing else', () => {
    const a = referenceMetricsFrom({ views: 100_000, creatorHandle: 'a', siblingReaches: five })
    const b = referenceMetricsFrom({
      views: 100_000, creatorHandle: 'b', siblingReaches: ['500K', '400K', '600K', '550K', '450K'],
    })
    expect(a.views).toBe(b.views)
    expect(byRelativeStrength(a, b)).toBeLessThan(0)
  })
})

describe('a lift must belong to a named creator', () => {
  it('siblings with no uploader produce NO lift, however many there are', () => {
    // The worst available outcome is a confident multiple of the wrong
    // creator's normal, because it looks exactly like a right one.
    const m = referenceMetricsFrom({ views: 50_000, siblingReaches: five })
    expect(m.relativeLift).toBeNull()
    expect(m.relativeBasis).toBeNull()
    // …and the facts that ARE attributable survive it.
    expect(m.views).toBe(50_000)
  })

  it('a blank or "@"-only handle is not a name', () => {
    for (const who of ['', '   ', '@', '@@']) {
      expect(referenceMetricsFrom({ views: 50_000, creatorHandle: who, siblingReaches: five })
        .relativeLift).toBeNull()
    }
  })

  it('the handle is stored without its @, so two spellings are one creator', () => {
    expect(referenceMetricsFrom({ creatorHandle: '@physio' }).creatorHandle).toBe('physio')
    expect(referenceMetricsFrom({ creatorHandle: ' physio ' }).creatorHandle).toBe('physio')
  })
})

describe('null means not read, and never zero', () => {
  it('zero views, zero followers and absent are the same answer: unknown', () => {
    for (const v of [0, '0', null, undefined, -5, 'nonsense', {}]) {
      expect(referenceMetricsFrom({ views: v, creatorAudience: v }).views).toBeNull()
      expect(referenceMetricsFrom({ views: v, creatorAudience: v }).creatorAudience).toBeNull()
    }
  })

  it('a reference with nothing readable is empty, not zeroed', () => {
    expect(referenceMetricsFrom({})).toEqual(EMPTY_REFERENCE_METRICS)
  })

  it('an unmeasured reference sorts LAST, not first', () => {
    // Defaulting it to "average" would let everything nobody could measure
    // outrank the below-average videos somebody did.
    const measuredBadly = referenceMetricsFrom({
      views: 500, creatorHandle: 'a', siblingReaches: five,   // 0.1x
    })
    expect(measuredBadly.relativeLift).toBeLessThan(1)
    const unmeasured = referenceMetricsFrom({ views: 9_000_000 })
    expect([unmeasured, measuredBadly].sort(byRelativeStrength)[0]).toBe(measuredBadly)
  })
})

describe('the basis floor is relativePerformance\'s, not a second opinion', () => {
  it('one video under the floor yields no lift; the floor itself yields one', () => {
    const under = five.slice(0, MIN_VIDEOS_FOR_BASELINE - 1)
    expect(referenceMetricsFrom({ views: 50_000, creatorHandle: 'a', siblingReaches: under })
      .relativeLift).toBeNull()
    expect(referenceMetricsFrom({ views: 50_000, creatorHandle: 'a', siblingReaches: five })
      .relativeBasis).toBe(MIN_VIDEOS_FOR_BASELINE)
  })
})

describe('reading a stored row back', () => {
  it('accepts the snake_case column names the row actually has', () => {
    const m = readReferenceMetrics({
      views: 50_000, creator_audience: 2_000, creator_handle: '@a',
      relative_lift: 10, relative_basis: 5,
    })
    expect(m).toEqual({
      views: 50_000, creatorAudience: 2_000, creatorHandle: 'a',
      relativeLift: 10, relativeBasis: 5,
    } satisfies ReferenceMetrics)
  })

  it('a lift with no basis is dropped, not shown unqualified', () => {
    const m = readReferenceMetrics({ views: 50_000, relative_lift: 10 })
    expect(m.relativeLift).toBeNull()
    expect(m.views).toBe(50_000)
  })

  it('a basis with no lift claims nothing', () => {
    expect(readReferenceMetrics({ relative_basis: 5 }).relativeBasis).toBeNull()
  })

  it('keeps the fraction — a 3.4x lift is not a 3x one', () => {
    expect(readReferenceMetrics({ relative_lift: 3.4, relative_basis: 5 }).relativeLift).toBe(3.4)
  })

  it('survives every junk value a nullable column can hold', () => {
    for (const junk of [null, undefined, 'a string', 42, ['x'], true]) {
      expect(readReferenceMetrics(junk)).toEqual(EMPTY_REFERENCE_METRICS)
    }
  })
})

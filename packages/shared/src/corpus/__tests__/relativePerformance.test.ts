// EVERY FIXTURE HERE IS A REAL VALUE FROM gallery_items.
//
// ⚠️ The corpus stores reach as abbreviated strings — "1.2M", "965.6K",
// "77.8M" — and 945 rows carry "0", 940 of them under the creator literally
// named "@". Those are scrapes that captured nothing, not zero-view videos.
import { describe, it, expect } from 'vitest'
import {
  parseReach, medianOf, relativePerformance, cappedLift, medianLift,
  MIN_VIDEOS_FOR_BASELINE, MAX_SINGLE_CARD_LIFT,
} from '../relativePerformance'

describe('parsing the real strings', () => {
  it.each([
    ['1.2M', 1_200_000], ['7M', 7_000_000], ['965.6K', 965_600],
    ['11.9M', 11_900_000], ['1.1K', 1_100], ['77.8M', 77_800_000],
    ['1234', 1234], ['1,234', 1234],
  ])('%s → %i', (raw, want) => {
    expect(parseReach(raw)).toBe(want)
  })

  // ⚠️⚠️ THE ONE THAT MATTERS MOST. 945 rows carry "0". Treating them as zero
  // views drags every median they touch toward zero and makes ordinary videos
  // look like breakout hits.
  it('"0" is UNKNOWN, not zero views', () => {
    expect(parseReach('0')).toBeNull()
    expect(parseReach(0)).toBeNull()
  })

  it('junk and absence are null, never a number', () => {
    for (const x of ['', '  ', 'n/a', '—', null, undefined, {}, [], NaN]) {
      expect(parseReach(x)).toBeNull()
    }
  })

  // ⚠️ THE COLUMN IS TEXT, so SQL sorts "11.3M" BELOW "9.8M". Any ranking done
  // on the raw column is silently wrong; this is why parsing exists.
  it('orders correctly once parsed, unlike the raw strings', () => {
    expect(parseReach('11.3M')!).toBeGreaterThan(parseReach('9.8M')!)
    expect('11.3M' < '9.8M').toBe(true) // the bug, asserted so it stays visible
  })
})

describe('the median, never the mean', () => {
  it('is unmoved by a single enormous outlier', () => {
    // ⚠️ THE PHYSIO'S LEGO PARODY: 543,300 against a ~5,000 normal.
    const ordinary = [4000, 5000, 5000, 6000, 5500]
    const withOutlier = [...ordinary, 543_300]
    expect(medianOf(ordinary)).toBe(5000)
    expect(medianOf(withOutlier)).toBe(5250)
    const mean = withOutlier.reduce((a, b) => a + b, 0) / withOutlier.length
    expect(mean).toBeGreaterThan(90_000) // what a mean would have done
  })

  it('averages the middle two on an even count', () => {
    expect(medianOf([10, 20, 30, 40])).toBe(25)
  })

  it('is null when there is nothing to measure', () => {
    expect(medianOf([])).toBeNull()
    expect(medianOf([0, -1])).toBeNull()
  })
})

describe('a baseline needs enough videos to be a baseline', () => {
  const five = ['5K', '4K', '6K', '5.5K', '5K']

  it('reports lift against the creator’s own normal', () => {
    const r = relativePerformance('20K', five)
    expect(r).not.toBeNull()
    expect(r!.lift).toBeCloseTo(4, 5)
    expect(r!.basedOn).toBe(5)
  })

  // ⚠️⚠️ WITH THREE VIDEOS THE MEDIAN *IS* ONE OF THEM, and every card is then
  // measured against a number it helped set.
  it('refuses below the floor rather than guessing', () => {
    expect(relativePerformance('20K', ['5K', '4K', '6K'])).toBeNull()
    expect(MIN_VIDEOS_FOR_BASELINE).toBe(5)
  })

  // ⚠️ A DEFAULT OF 1.0 WOULD FLOOD EVERY RANKING with cards nobody measured,
  // outranking genuinely below-average videos that WERE measured.
  it('returns null, never a polite 1.0, when it cannot tell', () => {
    expect(relativePerformance('0', five)).toBeNull()
    expect(relativePerformance(null, five)).toBeNull()
  })

  // ⚖️ THE "0" ROWS MUST NOT COUNT TOWARD THE FLOOR EITHER.
  it('unknown reaches do not pad the baseline count', () => {
    expect(relativePerformance('20K', ['5K', '0', '0', '0', '0', '0'])).toBeNull()
  })
})

describe('one video must not carry a shape', () => {
  it('caps an extreme lift instead of discarding the row', () => {
    // the parody is 108× — capped to 10, still the strongest possible vote
    expect(cappedLift(108.66)).toBe(MAX_SINGLE_CARD_LIFT)
    expect(cappedLift(4.2)).toBeCloseTo(4.2, 5)
  })

  it('treats a nonsense lift as no vote at all', () => {
    expect(cappedLift(Number.NaN)).toBe(0)
    expect(cappedLift(-3)).toBe(0)
  })

  // ⚖️ TWO DEFENCES AGAINST THE SAME FAILURE: the cap stops one card carrying
  // the shape, the median stops a handful of capped cards doing it between them.
  it('a single outlier cannot move the shape’s median lift', () => {
    const ordinary = [1.0, 1.1, 0.9, 1.2, 1.0]
    expect(medianLift(ordinary)).toBeCloseTo(1.0, 5)
    expect(medianLift([...ordinary, 108])).toBeCloseTo(1.05, 5)
  })
})

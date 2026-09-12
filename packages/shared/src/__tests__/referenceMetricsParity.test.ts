// TWO COPIES OF ONE RULE, EXECUTED SIDE BY SIDE.
//
// ⚠️ THE WORKER HAS NO DEPENDENCY ON @twinai/shared AND MUST NOT GAIN ONE. That
// is a deliberate boundary — `earlyLookRules.ts` and `visualExtractionRules.ts`
// are mirrors for the same reason. The cost of a mirror is drift, and the only
// defence that actually works is running both over the same inputs.
//
// ⚖️ EXECUTED, NEVER PATTERN-MATCHED. A floor that differs by one, or a `>=`
// that became a `>`, is invisible to a text comparison and changes which
// references a creator is shown.
import { describe, expect, it } from 'vitest'
import { referenceMetricsFrom } from '../corpus/referenceMetrics'
import { MIN_VIDEOS_FOR_BASELINE } from '../corpus/relativePerformance'
import {
  workerReferenceMetrics, MIN_VIDEOS_FOR_BASELINE as WORKER_FLOOR,
} from '../../../../worker/src/referenceMetrics'

const CASES: { name: string; input: Parameters<typeof referenceMetricsFrom>[0] }[] = [
  { name: 'nothing readable', input: {} },
  { name: 'views only', input: { views: 50_000 } },
  { name: 'zero views', input: { views: 0, creatorAudience: 0 } },
  { name: 'string views', input: { views: '50000', creatorAudience: '2000' } },
  { name: 'negative', input: { views: -5, creatorAudience: -1 } },
  { name: 'junk', input: { views: 'nonsense', creatorAudience: {}, creatorHandle: 42 } },
  { name: 'handle with @', input: { creatorHandle: '@physio' } },
  { name: 'blank handle', input: { creatorHandle: '   ' } },
  { name: '@@ only', input: { creatorHandle: '@@' } },
  {
    name: 'siblings but no handle',
    input: { views: 50_000, siblingReaches: ['5K', '4K', '6K', '5.5K', '4.5K'] },
  },
  {
    name: 'one under the floor',
    input: { views: 50_000, creatorHandle: 'a', siblingReaches: ['5K', '4K', '6K', '5.5K'] },
  },
  {
    name: 'exactly the floor',
    input: { views: 50_000, creatorHandle: 'a', siblingReaches: ['5K', '4K', '6K', '5.5K', '4.5K'] },
  },
  {
    name: 'abbreviated strings, even count (median averages two)',
    input: { views: 50_000, creatorHandle: 'a', siblingReaches: ['1.2M', '965.6K', '11.3M', '9.8M', '5K', '4K'] },
  },
  {
    name: 'zeroes among the siblings drop below the floor',
    input: { views: 50_000, creatorHandle: 'a', siblingReaches: ['5K', '0', '0', '0', '0', '0'] },
  },
  {
    name: 'a below-average video is still measured',
    input: { views: 500, creatorHandle: 'a', siblingReaches: ['5K', '4K', '6K', '5.5K', '4.5K'] },
  },
  {
    name: 'no views but plenty of siblings',
    input: { views: null, creatorHandle: 'a', siblingReaches: ['5K', '4K', '6K', '5.5K', '4.5K'] },
  },
]

describe('the worker mirror and the shared rule agree, value for value', () => {
  it('the floor is the same number in both files', () => {
    expect(WORKER_FLOOR).toBe(MIN_VIDEOS_FOR_BASELINE)
  })

  for (const c of CASES) {
    it(`agrees on: ${c.name}`, () => {
      const mine = referenceMetricsFrom(c.input)
      const theirs = workerReferenceMetrics(c.input)
      expect(theirs).toEqual(mine)
    })
  }

  it('the case table actually exercises a real lift, or it proves nothing', () => {
    // A parity table where every row answers null would pass against a mirror
    // that returns null unconditionally.
    const lifts = CASES.map((c) => referenceMetricsFrom(c.input).relativeLift)
    expect(lifts.filter((l) => l !== null).length).toBeGreaterThanOrEqual(3)
  })
})

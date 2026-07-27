import { describe, expect, it } from 'vitest'
import {
  type CandidateScoresV1,
  ConflictError,
  assertNoBlending,
  assertWinnersAreEvidenced,
  conflictRecords,
  resolveConflicts,
  resolveDimension,
} from '../transferConflicts'
import { CONFIDENCE_THRESHOLD_MILLI } from '../creativeTransferPlan'
import { TRANSFER_DIMENSIONS } from '../campaignIntent'

const HIGH = CONFIDENCE_THRESHOLD_MILLI + 100

const c = (
  referenceId: string, brandFitMilli: number, goalFitMilli: number,
  evidenceConfidenceMilli = HIGH,
): CandidateScoresV1 => ({ referenceId, brandFitMilli, goalFitMilli, evidenceConfidenceMilli })

describe('§7 Step 6: the higher brand/goal fit wins', () => {
  it('a strictly higher BRAND fit wins, whatever goal fit says', () => {
    // B has the better goal fit and still loses: brand fit is the primary key.
    const r = resolveDimension('pacing', [c('ref-a', 900, 100), c('ref-b', 800, 999)])
    expect(r.primaryReferenceId).toBe('ref-a')
    expect(r.resolution).toBe('selected_primary')
    expect(r.reasonCode).toBe('higher_brand_fit')
  })

  it('brand fit tied -> the higher GOAL fit wins', () => {
    const r = resolveDimension('pacing', [c('ref-a', 800, 100), c('ref-b', 800, 700)])
    expect(r.primaryReferenceId).toBe('ref-b')
    expect(r.reasonCode).toBe('higher_goal_fit')
  })

  // The contract orders by brand then goal and stops. Breaking a true tie by
  // array order would be an arbitrary authority hidden in a sort.
  it('both tied exactly -> brand_default, and NO reference leads', () => {
    const r = resolveDimension('pacing', [c('ref-a', 800, 700), c('ref-b', 800, 700)])
    expect(r.resolution).toBe('brand_default')
    expect(r.reasonCode).toBe('unbroken_tie')
    expect(r.primaryReferenceId).toBeNull()
  })

  // THE DETERMINISM CLAIM, TESTED RATHER THAN ASSERTED.
  it('the result does not depend on the order candidates arrive in', () => {
    const set = [c('ref-a', 800, 700), c('ref-b', 900, 100), c('ref-c', 900, 400)]
    const base = resolveDimension('pacing', set)
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
    for (const p of perms) {
      const r = resolveDimension('pacing', p.map((i) => set[i]))
      expect(r.primaryReferenceId, `order ${p.join('')}`).toBe(base.primaryReferenceId)
      expect(r.reasonCode).toBe(base.reasonCode)
      expect(r.referenceIds).toEqual(base.referenceIds)
    }
    // …and the winner is the one the rule names, not merely a stable one.
    expect(base.primaryReferenceId).toBe('ref-c')
    expect(base.reasonCode).toBe('higher_goal_fit')
  })

  it('a single uncontested candidate still wins on the stated rule', () => {
    const r = resolveDimension('pacing', [c('ref-a', 10, 10)])
    expect(r.primaryReferenceId).toBe('ref-a')
    expect(r.contested).toBe(false)
  })
})

describe('confidence gates entry, it does not merely downgrade the winner', () => {
  it('a low-confidence candidate cannot lead even with the best fit', () => {
    const r = resolveDimension('pacing', [
      c('ref-a', 1000, 1000, CONFIDENCE_THRESHOLD_MILLI - 1),
      c('ref-b', 100, 100, HIGH),
    ])
    expect(r.primaryReferenceId).toBe('ref-b')
  })

  it('all below threshold -> brand_default with the reason named', () => {
    const r = resolveDimension('pacing', [
      c('ref-a', 900, 900, CONFIDENCE_THRESHOLD_MILLI - 1),
      c('ref-b', 800, 800, 0),
    ])
    expect(r.resolution).toBe('brand_default')
    expect(r.reasonCode).toBe('below_confidence_threshold')
    expect(r.primaryReferenceId).toBeNull()
  })

  it('BOUNDARY: exactly at the threshold is eligible', () => {
    const r = resolveDimension('pacing', [c('ref-a', 500, 500, CONFIDENCE_THRESHOLD_MILLI)])
    expect(r.primaryReferenceId).toBe('ref-a')
  })

  it('BOUNDARY: one milli below is not', () => {
    const r = resolveDimension('pacing', [c('ref-a', 500, 500, CONFIDENCE_THRESHOLD_MILLI - 1)])
    expect(r.primaryReferenceId).toBeNull()
  })
})

describe('malformed input is refused, never silently ordered', () => {
  it('a duplicate reference in one dimension is refused', () => {
    expect(() => resolveDimension('pacing', [c('ref-a', 900, 1), c('ref-a', 100, 1)]))
      .toThrow(/appears twice/)
  })

  it.each([
    ['a fractional score', { referenceId: 'r', brandFitMilli: 0.5, goalFitMilli: 1, evidenceConfidenceMilli: HIGH }],
    ['a score above 1000', { referenceId: 'r', brandFitMilli: 1001, goalFitMilli: 1, evidenceConfidenceMilli: HIGH }],
    ['a negative score', { referenceId: 'r', brandFitMilli: -1, goalFitMilli: 1, evidenceConfidenceMilli: HIGH }],
    ['a missing score', { referenceId: 'r', goalFitMilli: 1, evidenceConfidenceMilli: HIGH }],
    ['an empty referenceId', { referenceId: '', brandFitMilli: 1, goalFitMilli: 1, evidenceConfidenceMilli: HIGH }],
  ])('%s is refused', (_label, bad) => {
    expect(() => resolveDimension('pacing', [bad as CandidateScoresV1])).toThrow(ConflictError)
  })

  it('an unknown dimension key is refused', () => {
    // @ts-expect-error deliberately wrong key
    expect(() => resolveConflicts({ not_a_dimension: [] })).toThrow(/unknown transfer dimension/)
  })
})

describe('§6 invariant: exactly one decision for every supported dimension', () => {
  const resolved = resolveConflicts({ pacing: [c('ref-a', 900, 1)] })

  it('every frozen dimension is resolved, including the ones nobody bid on', () => {
    expect(resolved.map((r) => r.dimension)).toEqual([...TRANSFER_DIMENSIONS])
  })

  it('a dimension with no candidate falls to the brand default, not to silence', () => {
    const r = resolved.find((x) => x.dimension === 'payoff')!
    expect(r.resolution).toBe('brand_default')
    expect(r.reasonCode).toBe('no_candidates')
  })

  it('assertNoBlending accepts a well-formed resolution set', () => {
    expect(() => assertNoBlending(resolved)).not.toThrow()
  })

  // CONTROLS: the assertion can actually fail, in both directions.
  it('CONTROL: a brand_default that still names a primary is refused', () => {
    const bad = resolved.map((r) => (r.dimension === 'payoff'
      ? { ...r, primaryReferenceId: 'ref-smuggled' } : r))
    expect(() => assertNoBlending(bad)).toThrow(/has no reference leading it/)
  })

  it('CONTROL: a selected_primary that names none is refused', () => {
    const bad = resolved.map((r) => (r.dimension === 'pacing'
      ? { ...r, primaryReferenceId: null } : r))
    expect(() => assertNoBlending(bad)).toThrow(/names none/)
  })

  it('CONTROL: a missing dimension is refused', () => {
    expect(() => assertNoBlending(resolved.filter((r) => r.dimension !== 'pacing')))
      .toThrow(/has no decision/)
  })

  it('CONTROL: the same dimension twice is refused', () => {
    expect(() => assertNoBlending([...resolved, resolved[0]])).toThrow(/more than once/)
  })
})

describe('the conflict log records conflicts, not everything', () => {
  const resolved = resolveConflicts({
    pacing: [c('ref-a', 900, 1), c('ref-b', 100, 1)],   // contested
    payoff: [c('ref-a', 900, 1)],                        // one bidder, no conflict
  })
  const records = conflictRecords(resolved)

  it('a contested dimension is recorded', () => {
    expect(records.map((r) => r.dimension)).toEqual(['pacing'])
  })

  it('…with every reference that was in contention, sorted', () => {
    expect(records[0].referenceIds).toEqual(['ref-a', 'ref-b'])
  })

  it('an uncontested dimension is NOT recorded as a conflict', () => {
    expect(records.some((r) => r.dimension === 'payoff')).toBe(false)
  })

  it('a dimension nobody bid on is not recorded either', () => {
    expect(records.some((r) => r.dimension === 'zoom_style')).toBe(false)
  })

  it('the record shape matches the frozen contract', () => {
    expect(Object.keys(records[0]).sort()).toEqual(['dimension', 'reasonCode', 'referenceIds', 'resolution'])
  })
})

// THE SEAM. Step 3 filters the pool; Step 6 picks from scores. Neither on its
// own stops a reference winning on material Step 3 removed.
describe('a winner must have survived the candidate pool', () => {
  const resolved = resolveConflicts({ pacing: [c('ref-a', 900, 1)] })

  it('CONTROL: a winner with usable evidence is accepted', () => {
    expect(() => assertWinnersAreEvidenced(resolved, { 'ref-a': [{ evidenceId: 'e1' }] })).not.toThrow()
  })

  it('a winner whose evidence was ALL filtered out is refused', () => {
    expect(() => assertWinnersAreEvidenced(resolved, { 'ref-a': [] }))
      .toThrow(/no usable evidence in the candidate pool/)
  })

  it('a winner absent from the pool entirely is refused', () => {
    expect(() => assertWinnersAreEvidenced(resolved, {})).toThrow(ConflictError)
  })

  it('a brand_default dimension needs no evidence — nothing leads it', () => {
    const none = resolveConflicts({})
    expect(() => assertWinnersAreEvidenced(none, {})).not.toThrow()
  })

  it('a non-object pool is refused', () => {
    // @ts-expect-error deliberately wrong shape
    expect(() => assertWinnersAreEvidenced(resolved, [])).toThrow(/must be an object/)
  })
})

describe('§7 Step 6: do not blend', () => {
  it('two strong candidates yield ONE primary, never both', () => {
    const r = resolveDimension('visual_language', [c('ref-a', 900, 900), c('ref-b', 890, 890)])
    expect(r.primaryReferenceId).toBe('ref-a')
    // The result carries a single primary field; there is no shape in which two
    // references can lead one dimension.
    expect(Object.keys(r)).not.toContain('secondaryReferenceId')
    expect(r.contested).toBe(true)
  })

  it('a losing reference on one dimension may still lead another', () => {
    const resolved = resolveConflicts({
      pacing: [c('ref-a', 900, 1), c('ref-b', 100, 1)],
      visual_language: [c('ref-a', 100, 1), c('ref-b', 900, 1)],
    })
    expect(resolved.find((r) => r.dimension === 'pacing')!.primaryReferenceId).toBe('ref-a')
    expect(resolved.find((r) => r.dimension === 'visual_language')!.primaryReferenceId).toBe('ref-b')
  })
})

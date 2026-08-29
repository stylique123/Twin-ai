import { describe, expect, it } from 'vitest'
import { compareRuntime, runtimeComparisonSentence, RUNTIME_CEILING_SEC } from '../runtimeCompare'
import { DEFAULT_REFERENCE_BOUNDS } from '../../editor/referenceCheck'

function words(n: number): string {
  return Array(n).fill('word').join(' ')
}

describe('the ceiling is reused, not invented', () => {
  it('equals the reference-eligibility bound', () => {
    expect(RUNTIME_CEILING_SEC).toBe(DEFAULT_REFERENCE_BOUNDS.maxDurationSec)
  })
})

describe('compareRuntime: computed from the FINAL script, not a stale figure', () => {
  it('the audited case: run-a\'s script comes to ~33s, not the stale "47s" header', () => {
    // packages/shared/src/__tests__/liveRunFixtures.test.ts run-a: 82 words
    // across 5 beats, header claimed 47s.
    const script = [
      { line: words(10) },
      { line: words(24) },
      { line: words(20) },
      { line: words(17) },
      { line: words(15) },
    ]
    const cmp = compareRuntime(script, null)
    expect(cmp.computedSec).toBeCloseTo(34.4, 1)
    expect(cmp.computedSec).not.toBeCloseTo(47, 0)
  })

  it('a script with no words computes to 0, not a fabricated figure', () => {
    expect(compareRuntime([], null).computedSec).toBe(0)
    expect(compareRuntime(null, null).computedSec).toBe(0)
  })
})

describe('compareRuntime: reference comparison', () => {
  it('referenceSec absent (no known reference duration) is null, not zero', () => {
    const cmp = compareRuntime([{ line: words(15) }], null)
    expect(cmp.referenceSec).toBeNull()
    expect(cmp.diffFromReferenceSec).toBeNull()
  })

  it('referenceSec present: diff is computed vs the known reference duration', () => {
    // 15 words at 150wpm = 6s.
    const cmp = compareRuntime([{ line: words(15) }], 20)
    expect(cmp.computedSec).toBe(6)
    expect(cmp.referenceSec).toBe(20)
    expect(cmp.diffFromReferenceSec).toBe(-14)
  })

  it('a non-finite or non-positive referenceSec is treated as unknown, never as zero', () => {
    for (const v of [0, -5, NaN, Infinity, undefined, null]) {
      expect(compareRuntime([{ line: words(15) }], v as number | null).referenceSec).toBeNull()
    }
  })
})

describe('compareRuntime: the ceiling warning', () => {
  it('does not fire under the ceiling', () => {
    const cmp = compareRuntime([{ line: words(15) }], null)
    expect(cmp.exceedsCeiling).toBe(false)
  })

  it('fires when the computed runtime exceeds the ceiling', () => {
    // 500 words at 150wpm = 200s > 180s ceiling.
    const cmp = compareRuntime([{ line: words(500) }], null)
    expect(cmp.computedSec).toBeGreaterThan(RUNTIME_CEILING_SEC)
    expect(cmp.exceedsCeiling).toBe(true)
  })

  it('a custom ceiling is honoured', () => {
    const cmp = compareRuntime([{ line: words(15) }], null, 'natural', 5)
    expect(cmp.exceedsCeiling).toBe(true)
  })
})

describe('runtimeComparisonSentence', () => {
  it('states the computed runtime alone when there is no reference and no overage', () => {
    const cmp = compareRuntime([{ line: words(15) }], null)
    expect(runtimeComparisonSentence(cmp)).toBe('About 6 seconds of talking.')
  })

  it('adds the reference length when known', () => {
    const cmp = compareRuntime([{ line: words(15) }], 20)
    expect(runtimeComparisonSentence(cmp)).toBe(
      'About 6 seconds of talking. The reference runs about 20 seconds.',
    )
  })

  it('adds the ceiling warning when exceeded', () => {
    const cmp = compareRuntime([{ line: words(500) }], null)
    expect(runtimeComparisonSentence(cmp)).toContain('worth trimming before you record')
  })

  it('never warns when under the ceiling, even with a long reference', () => {
    const cmp = compareRuntime([{ line: words(15) }], 20)
    expect(runtimeComparisonSentence(cmp)).not.toContain('worth trimming')
  })
})

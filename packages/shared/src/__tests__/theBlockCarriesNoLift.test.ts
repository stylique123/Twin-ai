// THE BLOCK CARRIES A SHAPE AND A COUNT, AND NO LIFT AT ALL.
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
// Exactly 1.0000 at n=297 is arithmetic, not measurement: you get exactly one
// when you divide a constant by its own median. 40.6% of a creator's cards share
// one identical `reach`, and the modal value is unique to the creator in 61.4%
// of cases — so `reach` is AUDIENCE SIZE, not per-video views.
//
// ⚖️ THE FIRST ANSWER WAS A LIFT GATE AT 1.2, WHICH REFUSED ALL FOUR. That kept
// a meaningless number out of the prompt and also kept everything else out with
// it — seven built modules reached no script for as long as it stood. The answer
// now is to emit the half that is true (frequency) and delete the half that is
// not, rather than hedge it. `lift: unknown` and `lift: 1.0` are the same
// failure: a hedged field in the model's context is still a field.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { selectEvidenceCohort, shapeBlock, type CohortCard, type CohortRead }
  from '../corpus/cohort'
import { MIN_COHORT, type FacetVector } from '../corpus/facets'

const HER: FacetVector = { domain: 'health', subDomain: null, customer: null, stageBand: null }

/** A read that clears every count gate, so only the emitted shape is under test. */
function readWith(medianLift: number | null, n = MIN_COHORT + 40): CohortRead {
  return {
    rung: 'domain',
    basis: 'creators in health',
    size: n + 40,
    shapes: [{ shape: 'how_to', n, medianLift }, { shape: 'myth_bust', n: 2, medianLift: 3 }],
    decisive: true,
  }
}

describe('no lift reaches the prompt, at any value', () => {
  it('the emitted block has no lift key — not absent-valued, ABSENT', () => {
    // `toBeUndefined` would pass on `{ medianLift: undefined }`, which still
    // serialises into some renderers. The key itself must not exist.
    for (const lift of [1.0, 0.62, 4.2, null]) {
      const b = shapeBlock(readWith(lift))
      expect(b).not.toBeNull()
      expect(Object.keys(b!).sort()).toEqual(['basis', 'n', 'rung', 'shape'])
      expect(JSON.stringify(b)).not.toMatch(/lift/i)
    }
  })

  it('the four measured cohorts now emit, and say only what is true', () => {
    // Verbatim: the business bucket that the lift gate refused.
    const b = shapeBlock(readWith(1.0, 297))
    expect(b).not.toBeNull()
    expect(b!.shape).toBe('how_to')
    expect(b!.n).toBe(297)
  })

  it('a shape whose lift was never measurable emits identically', () => {
    // Under the old rule this shape was not even in the tally.
    expect(shapeBlock(readWith(null, 297))!.n).toBe(297)
  })
})

describe('the count gates are unchanged, and they still refuse', () => {
  it('a leading shape under MIN_COHORT is refused however large the cohort', () => {
    expect(shapeBlock(readWith(4.2, MIN_COHORT - 1))).toBeNull()
  })

  it('a cohort that does not separate is refused', () => {
    // `decisive` is the two-sigma separation on counts; without it, nothing.
    expect(shapeBlock({ ...readWith(4.2), decisive: false })).toBeNull()
  })

  it('an empty shape list is refused', () => {
    expect(shapeBlock({ ...readWith(4.2), shapes: [] })).toBeNull()
  })
})

describe('against real cards, end to end', () => {
  const card = (o: Partial<CohortCard> = {}): CohortCard => ({
    facets: { domain: 'health', subDomain: null, customer: null, stageBand: null },
    reach: '10K', creatorReaches: ['9K', '10K', '11K', '12K', '8K'], shape: 'how_to', ...o,
  })
  const many = (n: number, o: Partial<CohortCard> = {}) =>
    Array.from({ length: n }, () => card(o))

  it('a corpus whose reach is constant per creator STILL yields a block', () => {
    // ⚠️ THIS IS THE REVERSAL, STATED AS A TEST. The identical corpus produced
    // null while the lift gate stood — every lift is exactly 1.0 — and the
    // frequency claim was true the whole time.
    const flat = { reach: '1.1M', creatorReaches: ['1.1M', '1.1M', '1.1M', '1.1M', '1.1M'] }
    const r = selectEvidenceCohort(HER, [
      ...many(40, { ...flat, shape: 'how_to' }),
      ...many(3, { ...flat, shape: 'myth_bust' }),
    ])
    const b = shapeBlock(r)
    expect(b).not.toBeNull()
    expect(b!.shape).toBe('how_to')
    expect(b!.n).toBe(40)
    expect(JSON.stringify(b)).not.toMatch(/lift/i)
  })

  it('two shapes too close to separate still yield nothing', () => {
    const r = selectEvidenceCohort(HER, [
      ...many(30, { shape: 'how_to' }), ...many(29, { shape: 'story' }),
    ])
    expect(shapeBlock(r)).toBeNull()
  })
})

describe('the removed threshold is gone from the source, not just unused', () => {
  const src = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '..', 'corpus', 'cohort.ts'), 'utf8')
  const code = src.split('\n')
    .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.trim().startsWith('/*'))
    .join('\n')

  it('no lift threshold is declared or compared in code', () => {
    expect(code).not.toMatch(/MIN_MEDIAN_LIFT/)
    // A reinstated gate would compare the leading shape's lift to something.
    expect(code).not.toMatch(/top\.medianLift\s*[<>]/)
  })

  it('but the measurement that justified removing it is still written down', () => {
    // Deleting the reasoning would leave the next reader free to re-add the
    // gate for the same wrong reason.
    expect(src).toMatch(/1\.0000/)
    expect(src).toMatch(/40\.6%/)
    expect(src).toMatch(/AUDIENCE SIZE/)
  })
})

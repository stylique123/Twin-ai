// THE FLOOR WAS SET SIX WORDS ABOVE THE PHRASES IT WAS SET TO PROTECT.
//
// `MIN_OVERLAP_CONTENT_WORDS` was 6, justified by two phrases said to read as
// coincidence below that: "the risk of doing" and "more shots on". Both are TWO
// content words once `contentSkeleton` has dropped stopwords and short words —
// so neither was ever at risk at four, or even at three.
//
// These pin the evidence the new floor was measured against, so that moving it
// again requires facing the same runs.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { longestContentRun, findPhraseOverlaps, MIN_OVERLAP_CONTENT_WORDS } from '../phraseOverlap.js'
import { HIGH_OVERLAP_RUN_WORDS } from '../verbatimOverlap.js'

function loadRun(id: 'a' | 'b' | 'c' | 'd') {
  const path = fileURLToPath(
    new URL(`../../../../../eval/fixtures/live-runs/run-${id}.json`, import.meta.url),
  )
  return JSON.parse(readFileSync(path, 'utf8')) as {
    reference: { text: string }
    generation: { blueprint: { script: Array<{ line?: unknown }> } }
  }
}

describe('the floor was calibrated against a worry the skeletoniser had handled', () => {
  it('both phrases cited to justify six are two content words, not five', () => {
    // ⚠️ THE WHOLE ARGUMENT FOR SIX, MEASURED. If either of these were really
    // near the floor, lowering it would be reckless. They are nowhere near it.
    const reference =
      'people spend their whole lives measuring the risk of doing something new'
      + ' when they should take more shots on goal'
    expect(longestContentRun('the risk of doing', reference)).toBeLessThanOrEqual(2)
    expect(longestContentRun('more shots on', reference)).toBeLessThanOrEqual(2)
  })

  it('the clean run stays clean at the new floor — the control that makes this safe', () => {
    // ⚖️ RUN B IS THE NEGATIVE CONTROL. Its defects are elsewhere; on this axis
    // it is genuinely zero, and it stays zero down to a two-word floor. A
    // threshold change that flooded it would be a threshold change that had
    // stopped measuring copying and started measuring shared topic.
    const b = loadRun('b')
    expect(findPhraseOverlaps(b.generation.blueprint.script, b.reference.text)).toEqual([])
  })

  it('catches the two borrowed runs in run A that six let through', () => {
    const a = loadRun('a')
    const runs = findPhraseOverlaps(a.generation.blueprint.script, a.reference.text)
    // The nine-word lift was always caught. These two were not.
    expect(runs.map((r) => r.run)).toEqual(
      expect.arrayContaining([
        'never tracked what customer',
        'those three things order',
      ]),
    )
  })

  it('still refuses the three-word and two-word runs', () => {
    // ⚖️ FOUR, NOT THREE. "market moved without" is real but thin, and two would
    // admit "exactly what" and "number three" — pairs a creator discussing the
    // same subject would trip without copying anyone.
    const a = loadRun('a')
    const runs = findPhraseOverlaps(a.generation.blueprint.script, a.reference.text)
    for (const r of runs) expect(r.words).toBeGreaterThanOrEqual(4)
    expect(runs.map((r) => r.run)).not.toContain('market moved without')
  })
})

describe('the measuring stick does not move when the policy moves', () => {
  it('the baseline threshold is a literal, not the repair threshold', () => {
    // ⚠️ THE REGRESSION THIS EXISTS TO HOLD. `HIGH_OVERLAP_RUN_WORDS` used to BE
    // `MIN_OVERLAP_CONTENT_WORDS`. Lowering the repair floor to 4 under that
    // coupling made `referenceBorrowingBaseline` report high: 6 where the
    // measured truth is high: 4 — frozen evidence announcing a 50% regression
    // that nothing in the product did. Measured, by reverting the decoupling.
    //
    // ⚖️ So these two must be free to differ. Re-coupling them to "keep the
    // numbers consistent" is the exact mistake: a baseline that tracks the
    // policy it is meant to judge cannot judge it.
    expect(HIGH_OVERLAP_RUN_WORDS).toBe(6)
    expect(MIN_OVERLAP_CONTENT_WORDS).toBe(4)
    expect(HIGH_OVERLAP_RUN_WORDS).not.toBe(MIN_OVERLAP_CONTENT_WORDS)
  })
})

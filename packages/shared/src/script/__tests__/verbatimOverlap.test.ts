/**
 * THE MEASURE THAT MAKES THE FIDELITY FIX FALSIFIABLE.
 *
 * The control shipped once looking correct and doing nothing. These tests pin
 * what the measure counts, and — in the mutation block — that it would actually
 * go DOWN if borrowing went down and UP if it went up. A measure that reported
 * the same number either way is the rename all over again.
 */
import { describe, it, expect } from 'vitest'
import {
  measureVerbatimOverlap, HIGH_OVERLAP_RUN_WORDS,
} from '../verbatimOverlap.js'
import { MIN_OVERLAP_CONTENT_WORDS } from '../phraseOverlap.js'

const REFERENCE =
  'Measuring the risk of taking action while ignoring the risk of doing nothing '
  + 'is exactly what keeps people poorer than they ought to be. '
  + 'You need to start taking more shots on goal. '
  + 'Most businesses fail because they never fix their pricing.'

describe('measureVerbatimOverlap', () => {
  it('reuses the enforcement threshold rather than picking a second one', () => {
    // Two "copied" definitions in one codebase is how a fix looks good in the
    // measure while the writer path disagrees about the same sentence.
    expect(HIGH_OVERLAP_RUN_WORDS).toBe(MIN_OVERLAP_CONTENT_WORDS)
  })

  it('finds a lifted sentence and reports the run length', () => {
    const r = measureVerbatimOverlap(
      ['Measuring the risk of taking action while ignoring the risk of doing nothing is exactly what keeps people poorer than they ought to be.'],
      REFERENCE,
    )
    expect(r.longestRun).toBeGreaterThanOrEqual(HIGH_OVERLAP_RUN_WORDS)
    expect(r.highOverlapSentences).toBe(1)
    expect(r.sentences).toBe(1)
    expect(r.highOverlapShare).toBe(1)
  })

  it('scores an original script at zero high-overlap sentences', () => {
    const r = measureVerbatimOverlap(
      ['I raised my rates twice last year and nobody left.',
       'Here is the spreadsheet I used to decide.'],
      REFERENCE,
    )
    expect(r.sentences).toBe(2)
    expect(r.highOverlapSentences).toBe(0)
    expect(r.highOverlapShare).toBe(0)
    expect(r.longestRun).toBeLessThan(HIGH_OVERLAP_RUN_WORDS)
  })

  it('scores per SENTENCE, so one lift inside a long beat is not diluted away', () => {
    // Run A's leak was one sentence inside a longer beat. Scoring whole beats
    // would have turned a total lift into a partial-looking number.
    const beat = 'Let me show you my own numbers from last quarter. '
      + 'Measuring the risk of taking action while ignoring the risk of doing nothing is exactly what keeps people poorer than they ought to be.'
    const r = measureVerbatimOverlap([beat], REFERENCE)
    expect(r.sentences).toBe(2)
    expect(r.highOverlapSentences).toBe(1)
    expect(r.highOverlapShare).toBe(0.5)
  })

  it('accepts beat objects and bare strings alike, and ignores unusable entries', () => {
    const r = measureVerbatimOverlap(
      [{ line: 'You need to start taking more shots on goal.' }, null, { direction: 'CU' } as never, ''],
      REFERENCE,
    )
    expect(r.sentences).toBe(1)
    expect(r.highOverlapSentences).toBe(1)
  })

  it('is empty, never throwing, when there is nothing to measure', () => {
    // A measurement must never be the thing that fails a generation.
    for (const [script, ref] of [[[], REFERENCE], [['x'], ''], [null, REFERENCE], [['x'], null]] as const) {
      const r = measureVerbatimOverlap(script as never, ref)
      expect(r.longestRun).toBe(0)
      expect(r.highOverlapShare).toBe(0)
    }
  })

  it('requires the shared run to be IN ORDER, not merely a shared bag of words', () => {
    // A topical-overlap measure would flag every script about the same subject,
    // which is not the defect.
    const shuffled = 'Nothing doing of risk the ignoring while action taking of risk the measuring.'
    const r = measureVerbatimOverlap([shuffled], REFERENCE)
    expect(r.highOverlapSentences).toBe(0)
  })
})

describe('mutation — the measure must MOVE with the borrowing', () => {
  const lifted = 'Measuring the risk of taking action while ignoring the risk of doing nothing is exactly what keeps people poorer than they ought to be.'
  const rewritten = 'Weighing what a decision might cost, and never weighing what standing still costs, is why so many stay stuck.'

  it('falls when a lifted sentence is genuinely rewritten', () => {
    const before = measureVerbatimOverlap([lifted], REFERENCE)
    const after = measureVerbatimOverlap([rewritten], REFERENCE)
    expect(after.longestRun).toBeLessThan(before.longestRun)
    expect(after.highOverlapShare).toBeLessThan(before.highOverlapShare)
    expect(after.highOverlapSentences).toBe(0)
  })

  it('does NOT fall for a cosmetic rewrite that keeps the run intact', () => {
    // The repair path has this same trap: a rewrite that keeps the same run
    // under a different tense reports success while copying the same sentence.
    const cosmetic = 'Honestly, measuring the risk of taking action while ignoring the risk of doing nothing is what keeps people poorer.'
    const r = measureVerbatimOverlap([cosmetic], REFERENCE)
    expect(r.highOverlapSentences).toBe(1)
  })

  it('rises as more of the script is borrowed', () => {
    const one = measureVerbatimOverlap([rewritten, lifted], REFERENCE)
    const two = measureVerbatimOverlap([lifted, lifted], REFERENCE)
    expect(two.highOverlapShare).toBeGreaterThan(one.highOverlapShare)
  })
})

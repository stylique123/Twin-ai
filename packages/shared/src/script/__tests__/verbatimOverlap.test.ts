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
import { MIN_OVERLAP_CONTENT_WORDS, longestContentRun } from '../phraseOverlap.js'

const REFERENCE =
  'Measuring the risk of taking action while ignoring the risk of doing nothing '
  + 'is exactly what keeps people poorer than they ought to be. '
  + 'You need to start taking more shots on goal. '
  + 'Most businesses fail because they never fix their pricing.'

describe('measureVerbatimOverlap', () => {
  it('shares the enforcement MEASURE while keeping its own threshold', () => {
    // ⚠️ THIS ASSERTED `HIGH_OVERLAP_RUN_WORDS === MIN_OVERLAP_CONTENT_WORDS`,
    // to stop "two 'copied' definitions in one codebase — how a fix looks good
    // in the measure while the writer path disagrees about the same sentence".
    //
    // ⚖️ THE WORRY IS RIGHT AND IT WAS GUARDING THE WRONG THING. There are not
    // two definitions of copying: there is one, `longestContentRun`, and both
    // paths call it on the same skeleton. What differed was the CUTOFF, and the
    // two cutoffs answer different questions. `MIN_OVERLAP_CONTENT_WORDS` is
    // live policy — how much borrowing the writer repairs, lowered to 4 once
    // the four frozen runs showed 6 sat above the phrases it was set to
    // protect. `HIGH_OVERLAP_RUN_WORDS` is a historical marker: the number the
    // baseline's "before" was measured at.
    //
    // ⚠️ KEEPING THEM EQUAL IS WHAT BREAKS THE MEASURE. Measured, by reverting
    // the split: at a repair floor of 4, the coupled baseline reports high: 6
    // where the frozen truth is high: 4 — evidence announcing a 50% regression
    // on runs nobody regenerated. A baseline that tracks the policy it exists
    // to judge cannot judge it.
    //
    // So the invariant worth holding is that ONE function defines copying, and
    // that the thresholds are free to differ.
    // ⚠️ ON ONE SENTENCE, because `measureVerbatimOverlap` splits into sentences
    // before measuring and `longestContentRun` does not. Comparing the whole
    // multi-sentence REFERENCE would compare a per-sentence maximum against a
    // whole-text one (17 against 30) and prove nothing about the shared measure.
    const ONE = 'You need to start taking more shots on goal'
    expect(measureVerbatimOverlap([ONE], ONE).longestRun)
      .toBe(longestContentRun(ONE, ONE))
    expect(HIGH_OVERLAP_RUN_WORDS).toBe(6)
    expect(MIN_OVERLAP_CONTENT_WORDS).toBe(4)
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

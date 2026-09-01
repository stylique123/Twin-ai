import { describe, it, expect } from 'vitest'
import { compareRuntime, runtimeComparisonSentence } from '../runtimeCompare.js'

/**
 * ⚠️ REPORTED FROM PRODUCTION AS "duration matching is a clamp": a 103-second
 * reference against a 34-second script, 59 against 24, 29 against 19. Measured
 * across every generation carrying both numbers, the BEAT PLAN is not clamped —
 * its target_sec totals track the reference (a 59s reference planned 56s). The
 * defect was entirely in the sentence, which timed only the WRITTEN beats and
 * showed that against the whole reference.
 */
const w = (line: string) => ({ line })
const ASK = { line: '' }

describe('a partial script is not a short script', () => {
  it('says what it timed, and that it will grow', () => {
    const cmp = compareRuntime([w('Three reasons your launch stalled today.'), ASK, ASK, ASK, ASK, ASK, w('Follow for the rest.')], 103)
    const s = runtimeComparisonSentence(cmp)
    expect(s).toMatch(/so far/)
    expect(s).toMatch(/5 lines are still waiting on you/)
    expect(s).toMatch(/this will grow/)
  })

  it('still names the reference, so the creator keeps the context', () => {
    const cmp = compareRuntime([w('A line.'), ASK], 59)
    expect(runtimeComparisonSentence(cmp)).toMatch(/reference runs about 59 seconds/)
  })

  it('never calls a partial script too long', () => {
    // The ceiling warning would be advice to trim a script that is not written.
    const cmp = compareRuntime([w('word '.repeat(400)), ASK], 30)
    expect(runtimeComparisonSentence(cmp)).not.toMatch(/worth trimming/)
  })

  it('a complete script reads exactly as it did before', () => {
    const cmp = compareRuntime([w('One line here.'), w('And a second line.')], 30)
    const s = runtimeComparisonSentence(cmp)
    expect(s).toMatch(/^About .* of talking\. The reference runs about 30 seconds\.$/)
    expect(s).not.toMatch(/so far|waiting on you/)
  })

  it('carries the pending count on the comparison itself', () => {
    expect(compareRuntime([w('a'), ASK, ASK], 10).unwrittenBeats).toBe(2)
    expect(compareRuntime([w('a'), w('b')], 10).unwrittenBeats).toBe(0)
  })

  it('singular reads as English', () => {
    const s = runtimeComparisonSentence(compareRuntime([w('A line.'), ASK], 20))
    expect(s).toMatch(/1 line is still waiting/)
  })
})

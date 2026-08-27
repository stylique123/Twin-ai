import { describe, it, expect } from 'vitest'
import {
  sentenceWordCounts, sentenceUniformityNote,
  MIN_SENTENCES_FOR_UNIFORMITY, UNIFORMITY_CV_THRESHOLD,
} from '../sentenceUniformity'

describe('sentence word counts', () => {
  it('counts words per line', () => {
    expect(sentenceWordCounts(['This has four words.', 'Two words.'])).toEqual([4, 2])
  })

  it('drops blank lines', () => {
    expect(sentenceWordCounts(['Real line here.', '', '   '])).toEqual([3])
  })

  it('ignores non-string entries', () => {
    expect(sentenceWordCounts(['Real line here.', null as unknown as string])).toEqual([3])
  })
})

describe('the sentence-length-uniformity note (Voice Cause 2, part 2)', () => {
  // ⚠️ REAL SPOKEN CADENCE, NOT FLAGGED. Mixed short and long lines — this
  // is the false-positive case the threshold has to survive.
  it('is silent on ordinary varied speech', () => {
    const lines = [
      'Okay so here is the thing.',
      'Nobody tells you this when you start.',
      'It costs more than you think, and it takes longer, and honestly the first year is just survival.',
      'Stop.',
      'That single decision changed everything for me.',
      'Three years later, I finally understood why.',
      'You have to just start.',
      'It will never feel ready.',
    ]
    expect(sentenceUniformityNote(lines)).toBeNull()
  })

  // ⚠️ THE FLAGGED CASE — every line metered to almost exactly the same
  // length, the templated cadence this exists to catch.
  it('flags a script where every line runs the same length', () => {
    const lines = [
      'This is exactly eight words long right here.',
      'Every single line here has eight words too.',
      'You will notice this line has eight words.',
      'Eight words is apparently all this script does.',
      'Nothing varies because eight words keeps repeating here.',
      'Once again this line has eight words exactly.',
    ]
    const counts = sentenceWordCounts(lines)
    expect(counts.every((n) => n === 8)).toBe(true)
    expect(sentenceUniformityNote(lines)).not.toBeNull()
  })

  it('states the average length in the note', () => {
    const lines = Array.from({ length: MIN_SENTENCES_FOR_UNIFORMITY }, () => 'Exactly six words in this line here.')
    const counts = sentenceWordCounts(lines)
    const note = sentenceUniformityNote(lines)
    expect(note).toContain(String(counts[0]))
  })

  // ⚖️ NEVER CALLS THE LENGTH ITSELF WRONG, ONLY THAT IT NEVER VARIES —
  // matches parallelTriads.ts's discipline.
  it('never calls the length itself wrong', () => {
    const lines = Array.from({ length: MIN_SENTENCES_FOR_UNIFORMITY }, () => 'Exactly six words in this line here.')
    expect(sentenceUniformityNote(lines)?.toLowerCase()).not.toMatch(/wrong|bad|error/)
  })

  it('is silent below the minimum sentence count, even if perfectly uniform', () => {
    const lines = Array.from({ length: MIN_SENTENCES_FOR_UNIFORMITY - 1 }, () => 'Exactly six words in this line here.')
    expect(sentenceUniformityNote(lines)).toBeNull()
  })

  it('is silent on an empty script', () => {
    expect(sentenceUniformityNote([])).toBeNull()
  })

  it('is silent on all-blank lines', () => {
    expect(sentenceUniformityNote(['', '   ', ''])).toBeNull()
  })

  it('the threshold is a coefficient of variation, not a raw stddev', () => {
    expect(UNIFORMITY_CV_THRESHOLD).toBeGreaterThan(0)
    expect(UNIFORMITY_CV_THRESHOLD).toBeLessThan(1)
  })
})

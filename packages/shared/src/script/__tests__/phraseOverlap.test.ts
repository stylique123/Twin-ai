import { describe, it, expect } from 'vitest'
import { longestContentRun, findPhraseOverlaps, MIN_OVERLAP_CONTENT_WORDS } from '../phraseOverlap.js'

// ⚠️ FIX 1 (Wave 1) MUTATION TEST. Run D's exact fixture line, reproduced
// verbatim from the reference transcript even at fidelity="loose". This is
// the check that must catch it — see eval/fixtures/live-runs for the full
// reconstructed run.
const REFERENCE_D = 'Measuring the risk of taking action while ignoring the risk of doing '
  + 'nothing is exactly what keeps people poorer than they ought to be. If you want '
  + 'a different life, start taking more shots on goal.'

describe('longestContentRun', () => {
  it('finds the Run D verbatim overlap (>= 6 content words)', () => {
    const line = 'Keeps people poorer than they ought to be, and nobody tells you that.'
    const run = longestContentRun(line, REFERENCE_D)
    expect(run).toBeGreaterThanOrEqual(MIN_OVERLAP_CONTENT_WORDS)
  })

  it('does not flag an unrelated line', () => {
    const run = longestContentRun('Your schedule is the real reason you are stuck.', REFERENCE_D)
    expect(run).toBeLessThan(MIN_OVERLAP_CONTENT_WORDS)
  })

  it('does not flag ordinary shared phrasing below the threshold', () => {
    // Shares "risk" and "goal" but not in a contiguous run of 6+.
    const run = longestContentRun('The risk here is real, and your only goal today is showing up.', REFERENCE_D)
    expect(run).toBeLessThan(MIN_OVERLAP_CONTENT_WORDS)
  })

  it('is insensitive to case and punctuation', () => {
    const run = longestContentRun(
      'KEEPS PEOPLE POORER THAN THEY OUGHT TO BE!!!', REFERENCE_D,
    )
    expect(run).toBeGreaterThanOrEqual(MIN_OVERLAP_CONTENT_WORDS)
  })
})

describe('findPhraseOverlaps', () => {
  it('reports the offending beat index and the shared run', () => {
    const beats = [
      { line: 'Your schedule is the real reason you are stuck.' },
      { line: 'Keeps people poorer than they ought to be if you let it.' },
    ]
    const found = findPhraseOverlaps(beats, REFERENCE_D)
    expect(found).toHaveLength(1)
    expect(found[0]!.beatIndex).toBe(1)
    expect(found[0]!.words).toBeGreaterThanOrEqual(MIN_OVERLAP_CONTENT_WORDS)
  })

  it('returns nothing when the reference transcript is empty', () => {
    const beats = [{ line: 'Keeps people poorer than they ought to be.' }]
    expect(findPhraseOverlaps(beats, '')).toEqual([])
    expect(findPhraseOverlaps(beats, null)).toEqual([])
  })

  it('returns nothing for a script with no reproduced sentence', () => {
    const beats = [
      { line: 'Your calendar is lying to you about what matters.' },
      { line: 'The work you avoid is usually the work that pays.' },
    ]
    expect(findPhraseOverlaps(beats, REFERENCE_D)).toEqual([])
  })

  it('ignores non-string / blank lines rather than throwing', () => {
    const beats = [{ line: undefined }, { line: '' }, { line: 42 }] as never
    expect(findPhraseOverlaps(beats, REFERENCE_D)).toEqual([])
  })
})

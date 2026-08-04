// Reference validation — §5's third missed case: "a bad reference link — 12
// minutes, no speech, a slideshow, a song. Currently goes straight in and
// produces confident nonsense."
//
// The load-bearing tests are the UNKNOWN ones. `assessProbe` had to be fixed
// because a container without a duration read as zero and told the creator
// "your video is too short" about a perfectly good take. This module is the
// same shape of decision on a different input, so it gets the same rule: a
// missing measurement has its OWN verdict and never borrows a real one.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REFERENCE_BOUNDS as B, REFERENCE_REASON_TEXT,
  assessReference, mayUseReference,
} from '../referenceCheck'

const at = (durationSec: number | null, wordCount: number | null) =>
  assessReference({ durationSec, wordCount })

describe('"NOT MEASURED" IS NEVER A FACT ABOUT THE VIDEO', () => {
  it('a missing duration is `duration_unknown`, never `too_short`', () => {
    // The exact defect assessProbe was fixed for, on a different input.
    for (const d of [null, undefined, NaN, Infinity, -1, '30' as unknown as number]) {
      const a = assessReference({ durationSec: d as number, wordCount: 200 })
      expect(a.verdict).toBe('unknown')
      expect(a.reason).toBe('duration_unknown')
    }
  })

  it('a missing word count is its own reason too', () => {
    const a = assessReference({ durationSec: 60, wordCount: null })
    expect(a.reason).toBe('word_count_unknown')
    expect(a.verdict).toBe('unknown')
  })

  it('BOTH missing reports the duration, not "no speech"', () => {
    // A reference with neither measurement is not a silent video. Saying so
    // would be inventing a fact out of two absences.
    expect(at(null, null).reason).toBe('duration_unknown')
  })

  it('an UNKNOWN reference is still USABLE — refusing on no evidence is the same overreach', () => {
    // In the direction that silently discards the creator's own choice.
    expect(mayUseReference(at(null, null))).toBe(true)
    expect(mayUseReference(assessReference({ durationSec: 60, wordCount: null }))).toBe(true)
  })

  it('zero words is NOT unknown — nobody spoke is a measurement', () => {
    const a = at(60, 0)
    expect(a.verdict).toBe('unusable')
    expect(a.reason).toBe('no_speech')
  })
})

describe('the four cases §5 names', () => {
  it('TWELVE MINUTES — the literal example', () => {
    const a = at(12 * 60, 1800)
    expect(a.verdict).toBe('unusable')
    expect(a.reason).toBe('too_long')
  })

  it('NO SPEECH — a silent clip', () => {
    expect(at(30, 0).reason).toBe('no_speech')
  })

  it('A SLIDESHOW — long enough, but almost nothing said', () => {
    // 40 words over 3 minutes is 13 wpm; ordinary speech is 120-160.
    const a = at(170, 40)
    expect(a.verdict).toBe('unusable')
    expect(a.reason).toBe('sparse_speech')
  })

  it('A SONG — a handful of mis-heard lyrics', () => {
    expect(at(150, 25).reason).toBe('sparse_speech')
  })

  it('and an ordinary short-form reference passes', () => {
    const a = at(45, 120) // 160 wpm, ordinary conversational speech
    expect(a.verdict).toBe('usable')
    expect(a.reason).toBe('ok')
    expect(mayUseReference(a)).toBe(true)
  })
})

describe('the bounds are exact, and reported with the verdict', () => {
  it('the edges are inclusive where the comment says they are', () => {
    expect(at(B.maxDurationSec, 400).verdict).toBe('usable')
    expect(at(B.maxDurationSec + 1, 400).reason).toBe('too_long')
    expect(at(B.minDurationSec, 30).verdict).toBe('usable')
    expect(at(B.minDurationSec - 1, 30).reason).toBe('too_short')
  })

  it('carries what it measured, so a caller can show it', () => {
    const a = at(60, 150)
    expect(a.measured).toEqual({ durationSec: 60, wordCount: 150, wordsPerMinute: 150 })
    expect(a.bounds).toEqual(B)
  })

  it('bounds are a PARAMETER — the numbers are chosen, not measured', () => {
    // Same honest state as the caption floors: loose enough that only the clear
    // cases fail, and movable in one place when there is evidence.
    const strict = { ...B, maxDurationSec: 30 }
    expect(assessReference({ durationSec: 45, wordCount: 120 }, strict).reason).toBe('too_long')
    expect(at(45, 120).reason).toBe('ok')
  })

  it('length is decided BEFORE speech density', () => {
    // A 12-minute video is the wrong shape to adapt however well-spoken it is,
    // and "too long" is more useful to the creator than "sparse".
    const a = at(30 * 60, 60) // both too long AND sparse
    expect(a.reason).toBe('too_long')
  })
})

describe('what it is allowed to SAY', () => {
  it('every reason has text, and none of it judges the video', () => {
    // §7c's honesty line: Twin may say what it CHECKED, never what will
    // PERFORM. "This is 12 minutes long" is a measurement; "this is a bad
    // reference" is a claim about a video nobody measured — and it is also
    // insulting to whoever made it.
    for (const [reason, text] of Object.entries(REFERENCE_REASON_TEXT)) {
      expect(text.length).toBeGreaterThan(0)
      expect(text.toLowerCase()).not.toMatch(/\bbad\b|\bpoor\b|\bwon'?t work\b|\bperform/)
      expect(reason.length).toBeGreaterThan(0)
    }
  })
})

import { describe, expect, it } from 'vitest'
import {
  IMPLAUSIBLY_SHORT_SEC,
  lengthSentence,
  measureScriptLength,
  spokenTime,
} from '../scriptLength'
import { estimateDurationSec } from '../../recordingScript'

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')

describe('the length is the recorder’s length', () => {
  // ⚠️ THE PROPERTY THAT STOPS TWO SCREENS QUOTING TWO NUMBERS. If this module
  // ever grows its own words-per-minute, the Plan screen and the teleprompter
  // disagree about the same script and neither is checkable by the creator.
  it('agrees beat for beat with estimateDurationSec', () => {
    const beats = [{ line: words(30) }, { line: words(45) }]
    const expected = beats.reduce((a, b) => a + estimateDurationSec(b.line), 0)
    expect(measureScriptLength(beats).spokenSec).toBeCloseTo(expected, 1)
  })
})

describe('a beat with no words is missing, not empty', () => {
  it('counts as unwritten rather than as zero seconds', () => {
    const len = measureScriptLength([
      { line: words(75) },
      { line: '', substance: 'needs_user' },
      { line: null },
      { line: '   ' },
    ])
    expect(len.writtenBeats).toBe(1)
    expect(len.unwrittenBeats).toBe(3)
  })

  // ⚖️ ABSENT IS NOT ZERO, SAID OUT LOUD. The creator must be told the number
  // will grow, or they will plan a 30-second shoot for a 90-second video.
  it('and the sentence says the real video will run longer', () => {
    const s = lengthSentence(measureScriptLength([{ line: words(75) }, { line: '' }]))
    expect(s).toMatch(/waiting on you/)
    expect(s).toMatch(/run longer/)
  })

  it('a beat that lost its line some other way still counts as unwritten', () => {
    // ⚠️ NOT GATED ON `substance`. Trusting the label would let a beat with a
    // normal substance and no words vanish into 0 seconds.
    const len = measureScriptLength([{ line: words(75) }, { line: '', substance: 'supported' }])
    expect(len.unwrittenBeats).toBe(1)
  })
})

describe('the one case that is a defect and not a choice', () => {
  it('flags a script nobody would have chosen', () => {
    // The measured 4-second script: ~10 words total.
    const len = measureScriptLength([{ line: words(10) }])
    expect(len.spokenSec).toBeLessThan(IMPLAUSIBLY_SHORT_SEC)
    expect(len.implausiblyShort).toBe(true)
    expect(lengthSentence(len)).toMatch(/shorter than a video normally needs/)
  })

  // ⚠️ THE FALSE POSITIVE THAT WOULD SEND A CREATOR TO FIX THE WRONG THING.
  it('does not flag a script that is short because it is unfinished', () => {
    const len = measureScriptLength([{ line: words(10) }, { line: '', substance: 'needs_user' }])
    expect(len.implausiblyShort).toBe(false)
    expect(lengthSentence(len)).toMatch(/waiting on you/)
  })

  it('and a deliberately short-but-real video is left alone', () => {
    // 10 seconds of speech is a choice creators make. No verdict.
    const len = measureScriptLength([{ line: words(30) }])
    expect(len.spokenSec).toBeGreaterThan(IMPLAUSIBLY_SHORT_SEC)
    expect(len.implausiblyShort).toBe(false)
    expect(lengthSentence(len)).toBe('About 12 seconds of talking.')
  })
})

describe('nothing written at all', () => {
  it('says so instead of claiming zero seconds', () => {
    const len = measureScriptLength([{ line: '' }, { line: null }])
    expect(len.implausiblyShort).toBe(false)
    expect(lengthSentence(len)).toBe(
      'None of this script is written yet, so there is nothing to time.')
  })

  it('and an absent script is not a crash', () => {
    expect(measureScriptLength(null).writtenBeats).toBe(0)
    expect(measureScriptLength(undefined).spokenSec).toBe(0)
  })
})

describe('plain everyday English', () => {
  it('reads as speech, never as a timestamp', () => {
    expect(spokenTime(9)).toBe('9 seconds')
    expect(spokenTime(1)).toBe('1 second')
    expect(spokenTime(60)).toBe('1 minute')
    expect(spokenTime(80)).toBe('1 minute 20 seconds')
    expect(spokenTime(121)).toBe('2 minutes 1 second')
    expect(spokenTime(80)).not.toMatch(/:/)
  })

  // ⚖️ THE HARD UX RULE. No jargon, no score, no grade.
  it('never grades the writing', () => {
    for (const beats of [[{ line: words(10) }], [{ line: words(300) }], [{ line: words(75) }, { line: '' }]]) {
      const s = lengthSentence(measureScriptLength(beats))
      expect(s).not.toMatch(/\b(too long|too short|weak|poor|bad|score|rating|optimal|ideal)\b/i)
      expect(s).not.toMatch(/%/)
    }
  })
})

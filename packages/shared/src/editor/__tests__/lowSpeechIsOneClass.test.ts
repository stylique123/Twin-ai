// ITEM 24: the same low-speech video must get the same class, the same
// sentence and the same override on every attempt, whichever reader path the
// attempt happened to take.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classifyReferenceRead, LOW_SPEECH_TEXT, isNoSpeechReadError } from '../referenceCheck'

const low = { cls: 'low_speech', message: LOW_SPEECH_TEXT, overrideAllowed: true }

describe('one rule for low speech', () => {
  // Every shape one music-led TikTok / captionless YouTube has produced.
  const attempts = [
    { name: 'whisper heard 5 words', input: { status: 'done', transcriptId: 't', durationSec: 30, words: 5 } },
    { name: 'whisper heard nothing (done, 0 words)', input: { status: 'done', transcriptId: 't', durationSec: 30, words: 0 } },
    { name: 'slow speech (25 words over 150s)', input: { status: 'done', transcriptId: 't', durationSec: 150, words: 25 } },
    { name: 'local whisper threw', input: { status: 'failed', error: 'vendor(unknown): x | local(unknown): empty transcript' } },
    { name: 'YouTube no captions', input: { status: 'failed', error: 'This video has no captions we can read. Try a different reference.' } },
    { name: 'Instagram no speech', input: { status: 'failed', error: 'This Instagram video has no speech we can read. Try a different reference.' } },
  ]
  for (const a of attempts) {
    it(`${a.name} → low_speech, same sentence, override offered`, () => {
      expect(classifyReferenceRead(a.input)).toEqual(low)
    })
  }
  it('the same inputs always give the same answer (deterministic)', () => {
    for (const a of attempts) expect(classifyReferenceRead(a.input)).toEqual(classifyReferenceRead(a.input))
  })
})

describe('the other classes are unchanged and never overridable', () => {
  it('a private/removed read failure is unreadable, not low speech', () => {
    const v = classifyReferenceRead({ status: 'failed', error: "Couldn't read that Instagram video — it may be private or removed." })
    expect(v).toMatchObject({ cls: 'unreadable', overrideAllowed: false })
    expect(isNoSpeechReadError('apify returned 402')).toBe(false)
  })
  it('too long / too short keep their own sentence and no override', () => {
    expect(classifyReferenceRead({ status: 'done', transcriptId: 't', durationSec: 900, words: 2000 }))
      .toMatchObject({ cls: 'too_long', overrideAllowed: false })
    expect(classifyReferenceRead({ status: 'done', transcriptId: 't', durationSec: 3, words: 10 }))
      .toMatchObject({ cls: 'too_short', overrideAllowed: false })
  })
  it('normal speech is usable; unmeasured is usable (no opinion)', () => {
    expect(classifyReferenceRead({ status: 'done', transcriptId: 't', durationSec: 40, words: 100 }).cls).toBe('usable')
    expect(classifyReferenceRead({ status: 'done', transcriptId: 't', durationSec: null, words: null }).cls).toBe('usable')
  })
})

describe('the build screen reads the one classifier on both branches', () => {
  const src = readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'apps', 'web', 'src', 'pages', 'v2', 'V2Building.tsx'), 'utf8')
  it('done and failed jobs both route through classifyReferenceRead and the same override', () => {
    expect(src.match(/classifyReferenceRead\(/g)?.length).toBeGreaterThanOrEqual(2)
    expect(src.match(/await lowSpeechUsedAnyway\(\)/g)?.length).toBe(2)
    expect(src).toMatch(/if \(choice === 'used_anyway'\) usedAnyway\.current = true/)
  })
})

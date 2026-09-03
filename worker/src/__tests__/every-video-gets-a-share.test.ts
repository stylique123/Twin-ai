import { describe, expect, it } from 'vitest'
import { buildVoiceCorpus, MIN_SHARE_CHARS } from '../voiceCorpus.js'

/**
 * ⚠️ THE NUMBERS BELOW ARE PRODUCTION'S. reference_transcripts n=551, mean 7,901
 * chars, median 1,061. The old `.slice(0, 12000)` on a front-loaded join read
 * ~1.5 videos for a long-form creator and ~11 for a short-form one — never the
 * 25 TikTok transcribes free.
 */
const WINDOW = 12_000
const long = (n: number, ch = 'a') => ch.repeat(n)

describe('buildVoiceCorpus', () => {
  it('says nothing when there is nothing', () => {
    const r = buildVoiceCorpus([], WINDOW)
    expect(r).toEqual({ text: '', used: 0, whole: 0, excerpted: 0, dropped: 0 })
  })

  it('ignores blanks and non-strings without throwing', () => {
    const r = buildVoiceCorpus(['', '   ', null as unknown as string, 'real words here'], WINDOW)
    expect(r.used).toBe(1)
    expect(r.text).toContain('real words here')
  })

  // THE DEFECT ITSELF. Twenty-five long transcripts: the old join read the first
  // one and a half. Every one of them must now appear.
  it('represents all 25 long transcripts, not the first few', () => {
    const r = buildVoiceCorpus(Array.from({ length: 25 }, () => long(7_901)), WINDOW)
    expect(r.used).toBe(25)
    expect(r.dropped).toBe(0)
    for (let i = 1; i <= 25; i++) expect(r.text).toContain(`--- VIDEO ${i} (spoken) ---`)
  })

  it('never exceeds the window', () => {
    for (const n of [1, 2, 5, 11, 25, 40]) {
      const r = buildVoiceCorpus(Array.from({ length: n }, () => long(7_901)), WINDOW)
      expect(r.text.length).toBeLessThanOrEqual(WINDOW)
    }
  })

  // A short-form creator's whole corpus fits; nothing should be cut for show.
  it('hands over short transcripts whole', () => {
    const r = buildVoiceCorpus(Array.from({ length: 10 }, () => long(1_061)), WINDOW)
    expect(r.whole).toBe(10)
    expect(r.excerpted).toBe(0)
    expect(r.text).not.toContain('[excerpt]')
  })

  // ⚖️ THE REDISTRIBUTION. Equal division would give the 200-char clip 480
  // characters and bin the rest; the long one must receive that remainder.
  it('redistributes what short videos do not spend', () => {
    const mixed = [long(200, 'a'), long(200, 'b'), long(200, 'c'), long(50_000, 'd')]
    const r = buildVoiceCorpus(mixed, WINDOW)
    const dCount = (r.text.match(/d/g) ?? []).length
    expect(dCount).toBeGreaterThan(WINDOW / 4)
    expect(r.whole).toBe(3)
    expect(r.excerpted).toBe(1)
  })

  it('marks an excerpt as an excerpt', () => {
    const r = buildVoiceCorpus([long(50_000)], WINDOW)
    expect(r.text).toContain('…[excerpt]')
    expect(r.excerpted).toBe(1)
  })

  // ⚖️ A CORPUS OF FRAGMENTS IS NOT A CORPUS. Past the floor, later videos are
  // dropped rather than each being reduced to a sentence.
  it('drops rather than shredding when the window cannot hold everyone', () => {
    const many = Array.from({ length: 200 }, () => long(7_901))
    const r = buildVoiceCorpus(many, WINDOW)
    expect(r.dropped).toBeGreaterThan(0)
    expect(r.used + r.dropped).toBe(200)
    const perVideo = r.text.length / r.used
    expect(perVideo).toBeGreaterThanOrEqual(MIN_SHARE_CHARS)
  })

  it('preserves the caller ordering', () => {
    const r = buildVoiceCorpus(['first one', 'second one', 'third one'], WINDOW)
    expect(r.text.indexOf('first one')).toBeLessThan(r.text.indexOf('second one'))
    expect(r.text.indexOf('second one')).toBeLessThan(r.text.indexOf('third one'))
  })

  it('is empty for a zero or negative window', () => {
    expect(buildVoiceCorpus(['abc'], 0).text).toBe('')
    expect(buildVoiceCorpus(['abc'], -5).used).toBe(0)
  })

  // The single-transcript case must not regress into the old behaviour.
  it('excerpts one enormous transcript instead of returning nothing', () => {
    const r = buildVoiceCorpus([long(200_000)], WINDOW)
    expect(r.used).toBe(1)
    expect(r.text.length).toBeLessThanOrEqual(WINDOW)
    expect(r.text.length).toBeGreaterThan(WINDOW / 2)
  })
})

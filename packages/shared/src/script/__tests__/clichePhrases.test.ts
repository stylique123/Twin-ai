import { describe, expect, it } from 'vitest'
import { STOCK_PHRASES, stockPhraseNote, stockPhrasesIn } from '../clichePhrases'

/**
 * ⚠️ THESE ARE REAL PRODUCTION LINES. Four of the seven hits a word-level list
 * produced were the creator naming their ENEMY. They are pinned here so that
 * widening the list back into somebody's opinion turns a test red.
 */
const THE_CREATORS_STANCE = [
  'Hey friends, I am sharing the exact playbook that gave me financial freedom, but I am also being quite honest about why the toxic hustle culture almost ruined it for me. Hope you enjoy xx.',
  'Hey friends, I am sharing three mindset shifts that helped me find financial freedom, but tbh I am also being quite honest about how hard it was to unlearn toxic hustle culture.',
  'Hey friends, if you feel burnt out by hustle culture but still want to build something huge, this video is for you.',
  'But here is the part nobody tells you about leaving that default path. If you just replace a stressful corporate job with a frantic hustle culture business, you have not actually escaped anything. You have just built yourself a new cage.',
]

const THE_REAL_FILLER = [
  'Myth number one: you need expensive gear to go viral. WRONG. We started with a potato camera and a dream. What you actually need is a rock-solid idea and relentless execution, not a thousand dollar lens.',
  "The truth? You need to make what *they* love. You have to understand your audience better than they understand themselves. What problems can you solve? What thrills can you deliver? That's the secret sauce.",
  "Seriously, we've done some crazy stuff, but this new one? It's on a whole other level. And it got me thinking, a lot of you out there are trying to make big videos too, but you're probably falling for some common traps.",
]

describe('an opinion is never filler', () => {
  // ⚖️ THE PROPERTY THIS MODULE EXISTS TO PROTECT. A creator arguing AGAINST
  // hustle culture is the most personal thing in their script.
  it.each(THE_CREATORS_STANCE)('leaves a named enemy alone: %s', (line) => {
    expect(stockPhrasesIn(line)).toEqual([])
    expect(stockPhraseNote(stockPhrasesIn(line))).toBeNull()
  })

  // ⚠️ THE STRUCTURAL GUARANTEE, not just the four measured lines.
  it('contains no single-word entries at all', () => {
    // ⚠️ HYPHENS COUNT AS A JOIN, NOT AS ONE WORD. "game-changer" is a fixed
    // compound that means the same in every sentence; "hustle" is a word that
    // takes its meaning from the sentence around it. The danger this asserts
    // against is the SECOND kind, so the split must treat a hyphen as a space.
    for (const p of STOCK_PHRASES) {
      expect(p.trim().split(/[\s-]+/).length, `"${p}" is one word`).toBeGreaterThan(1)
    }
  })

  it('and "hustle" specifically is not on the list', () => {
    expect(STOCK_PHRASES).not.toContain('hustle')
    expect(STOCK_PHRASES.some((p) => p === 'the grind')).toBe(false)
  })
})

describe('the filler the prompt already banned is caught', () => {
  it.each(THE_REAL_FILLER)('flags interchangeable advice-speak: %s', (line) => {
    expect(stockPhrasesIn(line).length).toBeGreaterThan(0)
  })

  it('names every phrase in the line, in the order they appear', () => {
    const hits = stockPhrasesIn(THE_REAL_FILLER[0])
    expect(hits.map((h) => h.phrase)).toEqual(['potato camera', 'relentless execution'])
    expect(hits[0].index).toBeLessThan(hits[1].index)
  })

  it('is case-insensitive', () => {
    expect(stockPhrasesIn('That is the SECRET SAUCE.').map((h) => h.phrase)).toEqual(['secret sauce'])
  })

  // ⚠️ NOT WORD-FUZZY. The check does not read sentences, so it must not guess.
  it('does not match near-misses', () => {
    expect(stockPhrasesIn('a secretive saucepan')).toEqual([])
    expect(stockPhrasesIn('we processed the trust deed')).toEqual([])
  })

  it('a non-string is not a line', () => {
    for (const v of [null, undefined, 3, {}, []]) expect(stockPhrasesIn(v)).toEqual([])
  })
})

describe('a note, never a verdict', () => {
  it('says nothing when there is nothing to say', () => {
    expect(stockPhraseNote([])).toBeNull()
  })

  it('names the words and what to do instead', () => {
    const note = stockPhraseNote(stockPhrasesIn('That is the secret sauce.'))
    expect(note).toBe('"secret sauce" could be said by anyone. Swap it for something only you would say.')
  })

  it('lists several readably', () => {
    expect(stockPhraseNote(stockPhrasesIn(THE_REAL_FILLER[0]))).toBe(
      '"potato camera" and "relentless execution" could be said by anyone. Swap it for something only you would say.')
  })

  // ⚖️ THE HARD UX RULE: no grade, no count, no jargon.
  it('never grades the writing or counts it', () => {
    for (const line of THE_REAL_FILLER) {
      const note = stockPhraseNote(stockPhrasesIn(line))!
      expect(note).not.toMatch(/\b(bad|weak|poor|score|rating|cliché|cliche|banned|violation|error)\b/i)
      expect(note).not.toMatch(/\b\d+\b/)
    }
  })
})

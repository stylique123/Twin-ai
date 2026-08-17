// THE PRODUCT LIBRARY SUGGESTED AN OPINION ABOUT THE INSTAGRAM ALGORITHM.
//
// ⚠️ REPORTED FROM THE LIVE PAGE, AND EVERY REJECTION BELOW IS A REAL ONE. Five
// suggestions were offered: a content-series title, Zoom, how often to post on
// Instagram, and growing a TikTok account. The rule producing them amounted to
// "this noun appeared in a video, so perhaps commerce has occurred".
//
// ⚖️ PRECISION OVER RECALL, AND THE ASYMMETRY IS NOT CLOSE. Missing a product is
// mildly annoying — the Add button is two inches away. Calling somebody's
// opinion "your product" makes the whole intelligence layer look like it is
// guessing, and a creator who sees that has no reason to trust the script.
import { describe, expect, it } from 'vitest'
import {
  scoreSuggestion, bestSuggestion, suggestionsAllowed,
} from '../productSuggestionConfidence'

const c = (text: string, timesSeen = 1, basis = 'demonstrated') => ({ text, timesSeen, basis })

describe('the things that reached a real creator and never should have', () => {
  it('refuses a content series title', () => {
    const v = scoreSuggestion(c('The Last 30 Days', 4))
    expect(v.confidence).toBe('low')
    expect(v.rejectedFor).toMatch(/nothing indicates|topic/)
  })

  it('refuses advice about posting frequency', () => {
    const v = scoreSuggestion(c('posting once a week is not enough to grow', 6))
    expect(v.confidence).toBe('low')
    expect(v.rejectedFor).toMatch(/topic, opinion or piece of advice/)
  })

  it('refuses a claim about growing an account', () => {
    expect(scoreSuggestion(c('how to grow a TikTok account fast', 3)).confidence).toBe('low')
  })

  it('refuses a platform the creator merely works on', () => {
    // ⚖️ Naming the room is not selling it.
    for (const p of ['Zoom', 'Instagram', 'TikTok', 'Canva']) {
      const v = scoreSuggestion(c(p, 12))
      expect(v.confidence, p).toBe('low')
      expect(v.rejectedFor, p).toMatch(/platform they post on/)
    }
  })

  it('refuses repetition on its own, however high', () => {
    // ⚠️ THE LINE THE OLD RULE DID NOT HAVE. A creator says a word thirty times;
    // that makes it a subject, not a product.
    const v = scoreSuggestion(c('cold plunge', 30))
    expect(v.confidence).toBe('low')
    expect(v.rejectedFor).toMatch(/nothing indicates they sell, promote or earn/)
  })
})

describe('what a real product relationship sounds like', () => {
  it('accepts something they say they built, mentioned often', () => {
    const v = scoreSuggestion(c('we built Twin', 7))
    expect(v.confidence).toBe('high')
    expect(v.reasons.join(' ')).toMatch(/building or selling/)
  })

  it('accepts an affiliate relationship with corroboration', () => {
    // ⚠️ THE FIRST FIXTURE HERE WAS `affiliate: notion.so` AND IT SCORED MEDIUM,
    // correctly: `.so` is not in the link matcher's TLD list, so only one signal
    // fired. I changed the fixture rather than widening the TLDs — a broad
    // domain regex matches "e.g" and "vs.io" in ordinary speech, and buying
    // recall with false positives is the exact trade this module refuses.
    const v = scoreSuggestion(c('I have been using Notion — affiliate link in bio', 3))
    expect(v.confidence).toBe('high')
  })

  it('accepts an offer with a call to action and repetition', () => {
    const v = scoreSuggestion(c('my course — link in bio', 5))
    expect(v.confidence).toBe('high')
  })

  it('holds a single weak signal at medium, and never shows it', () => {
    // ⚖️ MEDIUM IS A REAL STATE: evidence exists but nothing corroborates it.
    // The honest treatment is silence, not a half-bright card that asks the
    // creator to adjudicate our uncertainty.
    const one = c('use code SAVE20', 1)
    expect(scoreSuggestion(one).confidence).toBe('medium')
    expect(bestSuggestion([one])).toBeNull()
  })

  it('explains itself, so the suggestion can be judged', () => {
    const v = scoreSuggestion(c('we built Twin — try it free', 9))
    expect(v.reasons.length).toBeGreaterThanOrEqual(3)
    for (const r of v.reasons) expect(r).not.toMatch(/confidence|score|signal/i)
  })
})

describe('one suggestion, or none', () => {
  it('returns the single best candidate, not a section', () => {
    const best = bestSuggestion([
      c('The Last 30 Days', 9),
      c('Instagram', 20),
      c('we built Twin — try it free', 6),
      c('my course — link in bio', 2),
    ])
    expect(best).not.toBeNull()
    expect(best!.item.text).toBe('we built Twin — try it free')
  })

  it('returns nothing when nothing clears the bar', () => {
    expect(bestSuggestion([c('The Last 30 Days', 9), c('Zoom', 12), c('posting daily', 4)])).toBeNull()
  })

  it('is silent for a creator who said they sell nothing', () => {
    // ⚠️ MANUFACTURING SUGGESTIONS FOR SOMEBODY WHO ANSWERED "nothing
    // commercial" is the product arguing with them about their own business.
    expect(bestSuggestion([c('we built Twin — try it free', 9)], ['none'])).toBeNull()
    expect(suggestionsAllowed(['none'])).toBe(false)
  })

  it('but silence in onboarding is not that answer', () => {
    // ⚖️ An empty list means the question was never reached — a different fact
    // from "I sell nothing", and it must not suppress anything.
    expect(suggestionsAllowed([])).toBe(true)
    expect(suggestionsAllowed(null)).toBe(true)
    expect(bestSuggestion([c('we built Twin — try it free', 9)], [])).not.toBeNull()
  })
})

describe('it never throws on real extractor output', () => {
  it('survives the shapes that actually arrive', () => {
    for (const bad of [{}, { text: null }, { text: 42 }, { text: '   ' }, { text: 'x', timesSeen: NaN }]) {
      expect(() => scoreSuggestion(bad as never)).not.toThrow()
    }
    expect(bestSuggestion([])).toBeNull()
  })
})

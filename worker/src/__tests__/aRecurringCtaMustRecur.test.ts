import { describe, expect, it } from 'vitest'
import { ctaEvidenceFor, normaliseSpeech, MIN_VERIFIABLE_WORDS } from '../ctaEvidence'

// ⚠️ THE CTAs AND THE COUNTS BELOW ARE PRODUCTION. Read from
// `brand_voices.profile->recurring_ctas` on 2026-09-06 for the bakery voice
// used in the eight-run analysis, whose script closed on "subscribe to our
// channel" while she is on TikTok. Her own list really did contain it.
const HER_CTAS = [
  "Don't forget to subscribe to our channel",
  "I'll see you in the next video",
]

// One of her four own transcripts contains the subscribe line; none of the
// others do. Verified in production: says_subscribe = 1 of own_transcripts = 4.
const HER_FOUR_VIDEOS = [
  'so today we are shaping the loaves and dont forget to subscribe to our channel',
  'the starter needs feeding twice a day before you bake with it',
  'i sold forty loaves in under two hours at the market',
  'people always ask me about the scoring pattern on top',
]

describe('a recurring CTA must recur', () => {
  // ⚖️ THE WORDING IS NOT TESTED HERE BECAUSE IT DOES NOT LIVE HERE. This module
  // counts; `generate-blueprint`'s `renderRecurringCtasInline` is the only thing
  // that speaks the counts, and it cannot import from the worker.
  it('counts the one video that actually carries it, out of four', () => {
    const [subscribe] = ctaEvidenceFor(HER_CTAS, HER_FOUR_VIDEOS)
    expect(subscribe.observed_verbatim_in).toBe(1)
    expect(subscribe.of_videos).toBe(4)
  })

  it('reports ZERO — checked and not found — for the one she never said', () => {
    const [, nextVideo] = ctaEvidenceFor(HER_CTAS, HER_FOUR_VIDEOS)
    expect(nextVideo.observed_verbatim_in).toBe(0)
  })

  // ── THE NULL IS THE POINT. `absent is not zero`. ─────────────────────────

  it('NULL, not zero, when there are no transcripts to check against', () => {
    for (const t of [[], null, undefined]) {
      const [e] = ctaEvidenceFor(HER_CTAS, t)
      expect(e.observed_verbatim_in, JSON.stringify(t)).toBeNull()
      expect(e.of_videos).toBe(0)
    }
  })

  it('NULL, not zero, for a CTA too short to verify', () => {
    // ⚠️ "subscribe" alone would match almost any transcript mentioning it.
    const [e] = ctaEvidenceFor(['Subscribe'], HER_FOUR_VIDEOS)
    expect(e.observed_verbatim_in).toBeNull()
    expect(MIN_VERIFIABLE_WORDS).toBe(3)
  })

  it('punctuation, case and apostrophes do not decide the count', () => {
    expect(normaliseSpeech("Don't FORGET to subscribe — to our channel!!"))
      .toBe(normaliseSpeech('dont forget to subscribe to our channel'))
    const [e] = ctaEvidenceFor(["DON'T forget to subscribe to our channel."], HER_FOUR_VIDEOS)
    expect(e.observed_verbatim_in).toBe(1)
  })

  it('survives the shapes a model response actually arrives in', () => {
    expect(ctaEvidenceFor(null, HER_FOUR_VIDEOS)).toEqual([])
    expect(ctaEvidenceFor(['', '   ', 42, null], HER_FOUR_VIDEOS)).toEqual([])
  })
})

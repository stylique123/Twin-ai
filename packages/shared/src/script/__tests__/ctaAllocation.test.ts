import { describe, it, expect } from 'vitest'
import { ctaJob, looksLikeCta, pickHerCta, ctaFitsTopic, isHedgedCta, closeDescribesOffer, offerClose } from '../ctaAllocation.js'

const HERS = [
  "If you're just here for the beans, you'll find a link to my website in my bio.",
  'I would absolutely love if you checked out my beans with free shipping on my site.',
  'If starting a coffee cart is your dream, stick around.',
]

describe('her CTAs, each in its place', () => {
  it('names the job of each of her CTAs', () => {
    expect(HERS.map(ctaJob)).toEqual(['shop', 'shop', 'follow'])
    expect(ctaJob('Book a call through the link')).toBe('lead')
    expect(ctaJob('What would you pick? Tell me below')).toBe('comment')
  })
  it('a price list is not a CTA (test account defaultCta)', () => {
    expect(looksLikeCta('12oz bag — $18\n5lb bulk bag — $65\nIncludes: one 12oz bag')).toBe(false)
    expect(looksLikeCta('Try Twin free')).toBe(true)
    expect(looksLikeCta('Order from the link in my bio')).toBe(true)
  })
  it('a sell video gets her shop CTA, a follow video her stick-around line', () => {
    expect(pickHerCta('sell', { recurring: HERS })?.text).toBe(HERS[1]) // HERS[0] is hedged (owner 2026-10-05)
    expect(pickHerCta('followers', { recurring: HERS })?.text).toBe(HERS[2])
    expect(pickHerCta('entertain', { recurring: HERS })?.job).toBe('follow')
  })
  it('a typed ask with no action word is still her commercial CTA', () => {
    expect(pickHerCta('sell', { typed: 'Try Twin free', recurring: HERS })?.text).toBe('Try Twin free')
  })
  it('the typed CTA wins when it is a real ask for this goal; nothing invented when none fits', () => {
    expect(pickHerCta('leads', { typed: 'Book a planning call from my bio', recurring: HERS })?.text).toBe('Book a planning call from my bio')
    expect(pickHerCta('sell', { typed: '12oz bag — $18\n5lb — $65', recurring: [] })).toBeNull()
    expect(pickHerCta('conversations', { recurring: HERS })).toBeNull()
  })
})

describe('batch part-14: a CTA about one subject never closes a video about another', () => {
  it('the coffee-cart stick-around line does not close a roasting video', () => {
    expect(ctaFitsTopic(HERS[2]!, 'why I roast in small batches instead of buying pre-roasted beans')).toBe(false)
    expect(ctaFitsTopic(HERS[2]!, 'what nobody tells you about starting a coffee cart')).toBe(true)
    expect(ctaFitsTopic(HERS[0]!, 'anything at all')).toBe(true)
    expect(pickHerCta('followers', { recurring: HERS, topic: 'my morning routine at the roastery' })).toBeNull()
  })
})

describe('closing-ask fixes (owner 2026-10-05, blind set 2)', () => {
  const name = 'Coffee Cart Launch Call'
  const offer = 'A 60-minute 1:1 video call for $75 to plan your equipment, menu, and first market.'
  it('does not reuse a hedged recurring CTA', () => {
    expect(isHedgedCta(HERS[0])).toBe(true)
    expect(pickHerCta('sell', { recurring: [HERS[0]!] })).toBeNull()
  })
  it('a selling close must describe the offer', () => {
    expect(closeDescribesOffer('Book my Coffee Cart Launch Call through the link in my bio and let us build your setup.', name, offer)).toBe(false)
    expect(closeDescribesOffer("DM me and I'll help you pick the right coffee cart launch call.", name, offer)).toBe(false)
    expect(closeDescribesOffer('I offer a Coffee Cart Launch Call: a 60-minute one-on-one video call for $75 to plan your equipment, menu, and first market.', name, offer)).toBe(true)
  })
  it('rewrites the close from her offer', () => {
    expect(offerClose(name, offer, 'DM me to book it.')).toBe('Coffee Cart Launch Call: a 60-minute 1:1 video call for $75 to plan your equipment, menu, and first market. DM me to book it.')
  })
})

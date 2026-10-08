import { describe, it, expect } from 'vitest'
import { checkSupport } from '../supportCheck.js'

// Fictional data only.
const items = [
  { id: 'note', kind: 'note', text: "I roast every batch of beans myself on Tuesday mornings at Maya's Coffee" },
  { id: 'a1', kind: 'answer', text: 'Customers keep telling me the dark roast tastes like chocolate' },
  { id: 'f1', kind: 'fact', text: 'The Harbor Blend ships in a 12oz bag' },
  { id: 's1', kind: 'story', text: 'A regular ordered three bags for her whole office after one sip' },
]
const offerText = 'Harbor Blend 12oz bag, free shipping this week'
const one = (sentence: string) =>
  checkSupport({ sentences: [sentence], items, offerText }).perSentence[0]!

describe('checkSupport (brief 2.17, shadow)', () => {
  it('a paraphrase of her line passes', () => {
    const r = one('Every Tuesday morning I roasted the beans myself, batch by batch.')
    expect(r.type).toBe('supported')
    expect(r.item_ids).toContain('note')
  })
  it('stem tolerance: roasting / ordered', () => {
    expect(one('Roasting each batch of beans myself on Tuesdays.').type).toBe('supported')
    expect(one('One regular ordered three bags for the whole office.').type).toBe('supported')
  })
  it('an invented duration fails with number / low_overlap', () => {
    const r = one('Most coffee sits for months on dusty shelves before it reaches you.')
    expect(r.type).toBe('unsupported')
    expect(r.reasons).toEqual(expect.arrayContaining(['number', 'low_overlap']))
  })
  it('a town name not in any item, linked to weather, fails name', () => {
    const r = one('I roast the beans myself on Tuesday mornings when it rains in Pinecrest.')
    expect(r.type).toBe('unsupported')
    expect(r.reasons).toContain('name')
  })
  it('an invented cause fails cause', () => {
    const r = one('I roast every batch of beans myself because the beans go stale faster.')
    expect(r.type).toBe('unsupported')
    expect(r.reasons).toContain('cause')
  })
  it('an invented comparative fails comparative', () => {
    const r = one('The dark roast tastes more like chocolate than any other roast.')
    expect(r.type).toBe('unsupported')
    expect(r.reasons).toContain('comparative')
  })
  it('a question to the viewer passes', () => {
    expect(one('Have you ever tasted beans roasted that same week?').type).toBe('question')
  })
  it('"Here\'s what happened." is structure', () => {
    expect(one("Here's what happened.").type).toBe('structure')
    expect(one("So here's the thing.").type).toBe('structure')
  })
  it('a short line with a claim is not structure', () => {
    expect(one('It smells like burnt rubber.').type).toBe('unsupported')
  })
  it('a CTA restating the offer is the close', () => {
    expect(one('Order the Harbor Blend 12oz bag with free shipping this week.').type).toBe('close')
  })
  it('a second CTA does not count as close', () => {
    const r = checkSupport({
      sentences: ['Order the Harbor Blend 12oz bag with free shipping this week.', 'Grab the Harbor Blend 12oz bag, free shipping this week.'],
      items: [], offerText,
    })
    expect(r.perSentence.map((p) => p.type)).toEqual(['close', 'unsupported'])
    expect(r.counts.close).toBe(1)
  })
  it('a CTA with an invented price is not the close', () => {
    expect(one('Order the Harbor Blend for just 9 dollars this week.').type).not.toBe('close')
  })
  it('a sentence combining two items passes with both ids', () => {
    const r = one("At Maya's Coffee I roast every batch myself, and customers say the dark roast tastes like chocolate.")
    expect(r.type).toBe('supported')
    expect([...r.item_ids].sort()).toEqual(['a1', 'note'])
  })
  it('a number present in the item passes', () => {
    expect(one('The Harbor Blend ships in a 12oz bag.').type).toBe('supported')
  })
  it('counts and by_reason add up', () => {
    const r = checkSupport({
      sentences: ["Here's what happened.", 'Ever had a roast taste like chocolate?', 'Most coffee sits for months on dusty shelves.', 'Order the Harbor Blend 12oz bag with free shipping this week.'],
      items, offerText,
    })
    expect(r.counts).toMatchObject({ structure: 1, question: 1, unsupported: 1, close: 1, supported: 0 })
    expect(r.counts.by_reason.low_overlap).toBe(1)
  })
  it('empty input is safe', () => {
    expect(checkSupport({}).perSentence).toEqual([])
  })
})

describe('the close may be the offer restated plus a bare ask (calibration: close never fired)', () => {
  const offerText = "Maya's Roast Call: a 30-minute 1:1 video call for $40 to plan your first bag order."
  it('offer sentence then ask sentence are both the close', () => {
    const r = checkSupport({
      sentences: ["Maya's Roast Call: a 30-minute 1:1 video call for $40 to plan your first bag order.", 'Send me a message if you want it.'],
      items: [], offerText,
    })
    expect(r.perSentence.map((x) => x.type)).toEqual(['close', 'close'])
  })
  it('a third close sentence is not a close', () => {
    const r = checkSupport({
      sentences: ["Maya's Roast Call: a 30-minute 1:1 video call for $40.", 'Send me a message if you want it.', 'Book it today.'],
      items: [], offerText,
    })
    expect(r.counts.close).toBe(2)
  })
})

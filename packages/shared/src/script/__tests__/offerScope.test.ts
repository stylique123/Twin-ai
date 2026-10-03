import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { foreignOfferFigures, offerFigures, scrubForeignOffer, stripForeignOffer } from '../offerScope'

// Script batch audit 2026-10-03, parts 9 and 10: Signature Blend's offer bled
// into House Espresso, Bella Donovan, Cold Brew and an idea video.
const SIGNATURE = '12oz bag for $18, or a 5lb bulk bag for $65.'
const HOUSE_ESPRESSO = JSON.stringify({ id: 'he', name: 'House Espresso', offer: null, knowledge: [{ field: 'roast', value: 'medium-dark' }] })

describe('offer figures', () => {
  it('reads digits and spoken words alike', () => {
    expect([...offerFigures(SIGNATURE)].sort()).toEqual(['$18', '$65', '12oz', '5lb'])
    expect([...offerFigures('a twelve-ounce bag for eighteen dollars, or five-pound for sixty-five dollars')].sort())
      .toEqual(['$18', '$65', '12oz', '5lb'])
  })
})

describe('another product\'s offer never reaches this script', () => {
  it('reproduces the bleed: House Espresso has no offer, Signature Blend\'s is removed', () => {
    const foreign = foreignOfferFigures([SIGNATURE], [HOUSE_ESPRESSO])
    const r = stripForeignOffer([
      { line: 'This is my House Espresso. Grab a twelve-ounce bag for eighteen dollars.' },
      { line: 'Or go big with the five-pound bulk bag for sixty-five dollars.' },
      { line: 'Link in bio.' },
    ], foreign)
    expect(r.beats.map((b) => b.line)).toEqual(['This is my House Espresso.', '', 'Link in bio.'])
    expect(r.removed.map((x) => x.reason)).toEqual(['other_product_offer', 'other_product_offer'])
  })
  it('reproduces the idea-video bleed: nothing chosen, nobody\'s price', () => {
    const foreign = foreignOfferFigures([SIGNATURE], [''])
    const r = stripForeignOffer([{ line: 'Packing orders on a Saturday. Each bag is $18 and the bulk is $65.' }], foreign)
    expect(r.beats[0]!.line).toBe('Packing orders on a Saturday.')
  })
  it('keeps the chosen product\'s own price, and a figure she typed for this video', () => {
    expect(foreignOfferFigures([SIGNATURE], [JSON.stringify({ name: 'Signature Blend', offer: SIGNATURE })]).size).toBe(0)
    const foreign = foreignOfferFigures([SIGNATURE], [HOUSE_ESPRESSO, 'my espresso is a 12oz bag'])
    expect([...foreign].sort()).toEqual(['$18', '$65', '5lb'])
    expect(stripForeignOffer([{ line: 'A 12oz bag lasts two weeks.' }], foreign).removed).toHaveLength(0)
  })
  it('cuts another product\'s price from a fallback offer line', () => {
    const foreign = foreignOfferFigures([SIGNATURE], [HOUSE_ESPRESSO])
    expect(scrubForeignOffer('Small-batch coffee roaster. Signature Blend 12oz for $18.', foreign)).toBe('Small-batch coffee roaster.')
    expect(scrubForeignOffer('Signature Blend 12oz for $18.', foreign)).toBeUndefined()
    expect(scrubForeignOffer('Fresh roasted coffee', foreign)).toBe('Fresh roasted coffee')
  })
  it('is wired into the writer: fallbacks scrubbed, output checked', () => {
    const EDGE = readFileSync(new URL('../../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url), 'utf8')
    expect(EDGE).toMatch(/stripForeignOffer\(corrected\.beats, foreignOffer\)/)
    expect(EDGE).toMatch(/brief\.offer = scrubForeignOffer\(brief\.offer, foreignOffer\)/)
    expect(EDGE).toMatch(/offer: scrubForeignOffer\(p\.offer, foreignOffer\)/)
  })
})

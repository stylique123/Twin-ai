import { describe, expect, it } from 'vitest'
import { parseOffer, serializeOffer } from './offerRows'

describe('offer rows', () => {
  it('round-trips options, prices and what is included', () => {
    const v = 'Small — $22\nLarge — $28\nIncludes: free name embroidery'
    const { rows, included } = parseOffer(v)
    expect(rows).toEqual([{ name: 'Small', price: '$22' }, { name: 'Large', price: '$28' }])
    expect(included).toBe('free name embroidery')
    expect(serializeOffer(rows, included)).toBe(v)
  })
  it('keeps an old one-line offer as a single price row', () => {
    expect(parseOffer('$25, comes with a gift box').rows).toEqual([{ name: '', price: '$25, comes with a gift box' }])
  })
  it('saves all-blank as null', () => {
    expect(serializeOffer([{ name: ' ', price: '' }], ' ')).toBeNull()
  })
})

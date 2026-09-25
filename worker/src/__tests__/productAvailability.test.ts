import { describe, it, expect } from 'vitest'
import { readAvailability, shopifyJsUrl } from '../productAvailability.js'

describe('product availability', () => {
  it('maps product pages to the Shopify .js feed', () => {
    expect(shopifyJsUrl('https://sortofceramics.ca/products/small-blue-ceramic-mini-petal-bowl'))
      .toBe('https://sortofceramics.ca/products/small-blue-ceramic-mini-petal-bowl.js')
    expect(shopifyJsUrl('https://shop.com/collections/all/products/mug?x=1')).toBe('https://shop.com/products/mug.js')
    expect(shopifyJsUrl('https://shop.com/')).toBeNull()
    expect(shopifyJsUrl('http://shop.com/products/mug')).toBeNull()
  })
  it('reads sold out, partly sold out and in stock', () => {
    expect(readAvailability({ available: false, variants: [{ title: 'Default Title', available: false }] })?.availability).toBe('sold_out')
    const p = readAvailability({ available: true, variants: [{ title: 'Small', available: false }, { title: 'Large', available: true }] })
    expect(p).toEqual({ availability: 'partly_sold_out', soldOutVariants: ['Small'] })
    expect(readAvailability({ available: true, variants: [{ title: 'Default Title', available: true }] })?.availability).toBe('in_stock')
  })
  it('an unreadable answer is unknown, never "in stock"', () => {
    expect(readAvailability(null)).toBeNull()
    expect(readAvailability({ title: 'x' })).toBeNull()
  })
})

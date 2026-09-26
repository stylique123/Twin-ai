import { describe, expect, it } from 'vitest'
import { normalizeShape, ogImage, shopifyImage } from '../productShape.js'

describe('product shape from its shop photo', () => {
  it('finds the Shopify featured image, protocol-relative included', () => {
    expect(shopifyImage({ featured_image: '//cdn.shopify.com/a/bowl.jpg' })).toBe('https://cdn.shopify.com/a/bowl.jpg')
    expect(shopifyImage({ images: ['https://x.com/m.png'] })).toBe('https://x.com/m.png')
    expect(shopifyImage({})).toBeNull()
  })
  it('reads og:image in either attribute order, https only', () => {
    expect(ogImage('<meta property="og:image" content="https://s.com/p.jpg">')).toBe('https://s.com/p.jpg')
    expect(ogImage('<meta content="https://s.com/q.jpg" property="og:image" />')).toBe('https://s.com/q.jpg')
    expect(ogImage('<meta property="og:image" content="http://s.com/p.jpg">')).toBeNull()
  })
  it('accepts only a known shape; unknown is no answer', () => {
    expect(normalizeShape({ shape: 'vessel' })).toBe('vessel')
    expect(normalizeShape({ shape: 'unknown' })).toBeNull()
    expect(normalizeShape({ shape: 'bowl' })).toBeNull()
  })
})

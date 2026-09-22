// "WHY CAN'T YOU SEARCH FOR THIS PRODUCT INSIDE THAT BRAND?" — now it does.
// Fixtures are Shopify's documented storefront shapes, not the live shop: the
// build container cannot reach it, and this says so rather than pretending.
import { describe, expect, it } from 'vitest'
import { isShopFront, nameMatch, findShopProduct, readShopProduct, variantPriceLines, MIN_NAME_MATCH } from '../shopProductLookup.js'

const SUGGEST = { resources: { results: { products: [
  { title: 'Custom Embroidered Bandana', url: '/products/custom-embroidered-bandana?_pos=2' },
  { title: 'Reversible Scrunchie Bandana', url: '/products/reversible-scrunchie-bandana?_pos=1' },
] } } }
const PRODUCT = { product: {
  title: 'Reversible Scrunchie Bandana',
  body_html: '<p>Two prints in one. Slips over the collar.</p>',
  options: [{ name: 'Size' }],
  variants: [{ title: 'Small', price: '13.94' }, { title: 'Large', price: '15.20' }],
} }

const fake = (map: Record<string, unknown>) => async (u: string) => {
  for (const k of Object.keys(map)) if (u.includes(k)) return map[k]
  return null
}

describe('find the product inside its shop', () => {
  it('knows a shop front from a product page', () => {
    expect(isShopFront('https://www.thedogdaysco.com')).toBe(true)
    expect(isShopFront('https://www.thedogdaysco.com/collections/bandanas')).toBe(true)
    expect(isShopFront('https://www.thedogdaysco.com/products/x')).toBe(false)
    expect(isShopFront('')).toBe(false)
  })

  it('finds the right product by name, not the first result', async () => {
    const p = await findShopProduct('https://www.thedogdaysco.com', 'Reversible Scrunchie Bandana',
      fake({ 'suggest.json': SUGGEST, 'reversible-scrunchie-bandana.json': PRODUCT }))
    expect(p?.url).toBe('https://www.thedogdaysco.com/products/reversible-scrunchie-bandana')
    expect(p?.description).toBe('Two prints in one. Slips over the collar.')
  })

  it('reads each variant with its own price', async () => {
    const p = readShopProduct('u', PRODUCT)!
    expect(p.options).toEqual(['Size'])
    expect(variantPriceLines(p)).toEqual(['Small — 13.94', 'Large — 15.20'])
  })

  it('a single-price product is one price, not a variant list', () => {
    const p = readShopProduct('u', { product: { title: 'X', variants: [{ title: 'Default Title', price: '28.51' }] } })!
    expect(variantPriceLines(p)).toEqual(['28.51'])
  })

  it('refuses a weak match rather than reading the wrong product', async () => {
    expect(nameMatch('Reversible Scrunchie Bandana', 'Leather Collar')).toBeLessThan(MIN_NAME_MATCH)
    const p = await findShopProduct('https://shop.test', 'Reversible Scrunchie Bandana',
      fake({ 'suggest.json': { resources: { results: { products: [{ title: 'Leather Collar', url: '/products/collar' }] } } } }))
    expect(p).toBeNull()
  })

  it('falls back quietly when the shop is not Shopify', async () => {
    expect(await findShopProduct('https://shop.test', 'Bandana', fake({}))).toBeNull()
  })

  it('never follows a result off the product path', async () => {
    const p = await findShopProduct('https://shop.test', 'Bandana',
      fake({ 'suggest.json': { resources: { results: { products: [{ title: 'Bandana', url: 'https://evil.test/x' }] } } } }))
    expect(p).toBeNull()
  })
})

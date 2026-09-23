// "WHY CAN'T YOU SEARCH FOR THIS PRODUCT INSIDE THAT BRAND?" — now it does.
// Fixtures are Shopify's documented storefront shapes, not the live shop: the
// build container cannot reach it, and this says so rather than pretending.
import { describe, expect, it } from 'vitest'
import { isShopFront, nameMatch, findShopProduct, readShopProduct, variantPriceLines, optionLines, MIN_NAME_MATCH } from '../shopProductLookup.js'

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

describe('the production mismatch, 2026-09-23', () => {
  it('does NOT take "Scrunchie Bandana Mystery Packs" for "Reversible Scrunchie Bandana"', async () => {
    const fetchJson = async (u: string) => u.includes('suggest.json')
      ? { resources: { results: { products: [{ title: 'Scrunchie Bandana Mystery Packs', url: '/products/scrunchie-bandana-mystery-packs' }] } } }
      : { product: { title: 'Scrunchie Bandana Mystery Packs', variants: [{ title: 'Default Title', price: '45.00' }] } }
    expect(await findShopProduct('https://www.thedogdaysco.com', 'Reversible Scrunchie Bandana', fetchJson)).toBeNull()
  })

  it('still finds it when the title has extra words, or a plural', () => {
    expect(nameMatch('Reversible Scrunchie Bandana', 'Reversible Scrunchie Bandanas - Plaid')).toBe(1)
  })

  it('says one price once when every option costs the same, and lists the options separately', () => {
    const p = readShopProduct('https://x.com/products/b', { product: { title: 'B',
      options: [{ name: 'Size', values: ['Mini', 'Small'] }, { name: 'Style', values: ['Girly', 'Boyish'] }],
      variants: [
        { title: 'Mini / Girly', price: '28.51' }, { title: 'Mini / Boyish', price: '28.51' },
        { title: 'Small / Girly', price: '28.51' }, { title: 'Small / Boyish', price: '28.51' },
      ] } })!
    expect(variantPriceLines(p)).toEqual(['28.51 (every option)'])
    expect(optionLines(p)).toEqual(['Size: Mini, Small', 'Style: Girly, Boyish'])
  })

  it('groups by price when sizes cost different amounts', () => {
    const p = readShopProduct('https://x.com/products/b', { product: { title: 'B', variants: [
      { title: 'Mini / Girly', price: '22' }, { title: 'Mini / Boyish', price: '22' }, { title: 'Large / Girly', price: '30' },
    ] } })!
    expect(variantPriceLines(p)).toEqual(['Mini — 22', 'Large — 30'])
  })
})

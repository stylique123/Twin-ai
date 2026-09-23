// TWELVE FACTS ABOUT A BANDANA, AND NONE OF THEM WAS ABOUT THE BANDANA.
//
// ⚠️ THE FIXTURE IS THE REAL ROW, verbatim, read from production 2026-09-22:
// "Reversible Scrunchie Bandana", linked to the shop's homepage. The report,
// from the screen: the description is "the description of the brand, not of
// the product"; "View cart, Check out, Continue shopping — these are CTAs for
// shopping, not what we can say in the video"; and €28 and €13 are prices that
// "could also classify what the variants are".
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pageKindOf, placeFact, placeFacts, isShopButton, priceSignalsVariants } from '../factPlacement'

const REAL_ROW = [
  { field: 'name', value: 'The Dog Days Co.' },
  { field: 'description', value: 'Our Dog Days collars are made-to-order and handcrafted specially for your pup! Our BC-based company specializes in providing you with the cutest gear made with quality materials and exceptional customer service.' },
  { field: 'claim', value: 'Handcrafted just for your pup - ready in 7-14 business days!' },
  { field: 'claim', value: 'Free Shipping on orders over $75 across Canada!' },
  { field: 'claim', value: '4.84 ★ ( 48 )' },
  { field: 'cta', value: 'View cart' },
  { field: 'cta', value: 'Check out' },
  { field: 'cta', value: 'Continue shopping' },
  { field: 'cta', value: 'SHOP HERE' },
  { field: 'price', value: '€28,51 EUR' },
  { field: 'price', value: 'From €13,94 EUR' },
  { field: 'price', value: 'From €11,40 EUR' },
]
const ctx = { url: 'https://www.thedogdaysco.com', productName: 'Reversible Scrunchie Bandana' }

describe('a homepage is not a product', () => {
  it('knows a homepage from a product page by the path', () => {
    expect(pageKindOf('https://www.thedogdaysco.com')).toBe('homepage')
    expect(pageKindOf('thedogdaysco.com/')).toBe('homepage')
    expect(pageKindOf('https://www.thedogdaysco.com/products/reversible-scrunchie-bandana')).toBe('product')
    expect(pageKindOf('https://shop.example/collections/bandanas')).toBe('collection')
    expect(pageKindOf('https://www.etsy.com/listing/123/bandana')).toBe('product')
    expect(pageKindOf('https://example.com/about-our-story')).toBe('unknown')
    expect(pageKindOf('')).toBe('unknown')
  })

  it('puts nothing from the real homepage row on the product', () => {
    const placed = placeFacts(REAL_ROW, ctx)
    expect(placed.pageKind).toBe('homepage')
    expect(placed.product).toEqual([])
  })

  it('files the shop story, shipping and rating under the brand', () => {
    const brand = placeFacts(REAL_ROW, ctx).brand.map((f) => f.value)
    expect(brand).toContain('The Dog Days Co.')
    expect(brand.some((v) => v.startsWith('Our Dog Days collars'))).toBe(true)
    expect(brand).toContain('Free Shipping on orders over $75 across Canada!')
  })

  it('never lets a site button or a listing price reach a script', () => {
    const aside = placeFacts(REAL_ROW, ctx).setAside.map((f) => f.value)
    for (const v of ['View cart', 'Check out', 'Continue shopping', 'SHOP HERE',
      '€28,51 EUR', 'From €13,94 EUR', 'From €11,40 EUR']) {
      expect(aside).toContain(v)
    }
  })

  it('treats cart buttons as chrome even on a real product page', () => {
    const page = { pageKind: 'product' as const, productName: 'Bandana' }
    expect(placeFact({ field: 'cta', value: 'Add to cart' }, page)).toBe('shop_button')
    expect(placeFact({ field: 'cta', value: 'Comment BANDANA for the link' }, page)).toBe('product')
    expect(placeFact({ field: 'price', value: '€28,51' }, page)).toBe('product')
    expect(placeFact({ field: 'description', value: 'Reversible, two prints' }, page)).toBe('product')
  })

  it('keeps the product name on the product when a listing page carries it', () => {
    expect(placeFact({ field: 'name', value: 'Reversible Scrunchie Bandana' },
      { pageKind: 'collection', productName: 'Reversible Scrunchie Bandana' })).toBe('product')
  })

  it('recognises a price that has options behind it', () => {
    expect(priceSignalsVariants('From €13,94 EUR')).toBe(true)
    expect(priceSignalsVariants('€28,51 EUR')).toBe(false)
    expect(priceSignalsVariants('$10 – $25')).toBe(true)
  })

  it('does not mistake a real spoken CTA for a site button', () => {
    expect(isShopButton('View cart')).toBe(true)
    expect(isShopButton('Link in bio to grab yours')).toBe(false)
  })

  it('ships the same classifier to the edge, byte for byte', () => {
    const REPO = join(import.meta.dirname, '..', '..', '..', '..')
    const a = readFileSync(join(REPO, 'packages/shared/src/factPlacement.ts'), 'utf8')
    const b = readFileSync(join(REPO, 'supabase/functions/_shared/factPlacement.ts'), 'utf8')
    expect(b).toBe(a)
  })
})

describe('what the shop says about everything it sells (2026-09-23)', () => {
  const PRODUCT = 'https://thedogdaysco.com/products/reversible-scrunchie-bandana'
  it('files each fact by the page it was READ from, not the link the product has now', () => {
    const facts = [
      { field: 'description', value: 'Our Dog Days collars are made-to-order', sourceUrl: 'https://www.thedogdaysco.com' },
      { field: 'feature', value: 'Reversible, two prints in one', sourceUrl: PRODUCT },
    ]
    const placed = placeFacts(facts, { url: PRODUCT, productName: 'Reversible Scrunchie Bandana' })
    expect(placed.brand.map((f) => f.value)).toEqual(['Our Dog Days collars are made-to-order'])
    expect(placed.product.map((f) => f.value)).toEqual(['Reversible, two prints in one'])
  })

  it('puts shipping and returns on the brand, even from a product page', () => {
    const placed = placeFacts([{ field: 'claim', value: 'Free Shipping on orders over $75 across Canada!' }], { url: PRODUCT })
    expect(placed.brand).toHaveLength(1)
  })

  it('never takes the brand\'s own name as the product\'s', () => {
    const placed = placeFacts([{ field: 'name', value: 'The Dog Days Co.' }], { url: PRODUCT, brandName: 'The Dog Days Co' })
    expect(placed.brand).toHaveLength(1)
  })
})

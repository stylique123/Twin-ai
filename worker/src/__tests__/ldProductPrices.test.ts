import { describe, expect, it } from 'vitest'
import { ldPriceLines } from '../ldProductPrices.js'

const page = (...blocks: unknown[]) =>
  blocks.map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`).join('\n')

describe('prices from the page\'s own product data', () => {
  it('reads one product with one price (WooCommerce shape)', () => {
    expect(ldPriceLines(page({ '@context': 'https://schema.org', '@type': 'Product', name: 'Bandana',
      offers: { '@type': 'Offer', price: '22.00', priceCurrency: 'CAD' } }))).toEqual(['22.00 CAD'])
  })

  it('names each variant of a ProductGroup, without repeating the product name', () => {
    expect(ldPriceLines(page({ '@type': 'ProductGroup', name: 'Scrunchie Bandana', hasVariant: [
      { '@type': 'Product', name: 'Scrunchie Bandana - Small', offers: { price: 22, priceCurrency: 'CAD' } },
      { '@type': 'Product', name: 'Scrunchie Bandana - Large', offers: { price: 28, priceCurrency: 'CAD' } },
    ] }))).toEqual(['Small — 22 CAD', 'Large — 28 CAD'])
  })

  it('reads a price range and a @graph wrapper (Yoast / Squarespace shape)', () => {
    expect(ldPriceLines(page({ '@graph': [{ '@type': 'WebPage' },
      { '@type': 'Product', name: 'Collar', offers: { '@type': 'AggregateOffer', lowPrice: '18', highPrice: '30', priceCurrency: 'USD' } }] })))
      .toEqual(['From 18 to 30 USD'])
  })

  it('returns nothing when the page lists several products — those are other products\' prices', () => {
    expect(ldPriceLines(page(
      { '@type': 'Product', name: 'A', offers: { price: 1 } },
      { '@type': 'Product', name: 'B', offers: { price: 2 } },
    ))).toEqual([])
  })

  it('survives a malformed block', () => {
    expect(ldPriceLines('<script type="application/ld+json">{oops</script>')).toEqual([])
  })
})

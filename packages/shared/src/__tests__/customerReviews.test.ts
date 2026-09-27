import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderCustomerReviews } from '../customerReviews'
import { ldReviews } from '../../../../worker/src/ldProductReviews'

const page = (ld: unknown) => `<html><script type="application/ld+json">${JSON.stringify(ld)}</script></html>`

describe('customer reviews from the product page (24-ideas #14)', () => {
  it('reads the shop\'s own rating and review bodies for one product', () => {
    const r = ldReviews(page({
      '@type': 'Product', name: 'Petal Bowl',
      aggregateRating: { ratingValue: '4.8', reviewCount: '37' },
      review: [{ reviewBody: 'Heavier than I expected and the glaze is gorgeous in person.' }, { reviewBody: 'ok' }],
    }))
    expect(r).toEqual({ rating: 4.8, count: 37, quotes: ['Heavier than I expected and the glaze is gorgeous in person.'] })
  })
  it('returns nothing for a page of several products or no reviews', () => {
    expect(ldReviews(page([{ '@type': 'Product', aggregateRating: { ratingValue: 5 } }, { '@type': 'Product' }]))).toBeNull()
    expect(ldReviews(page({ '@type': 'Product', name: 'x' }))).toBeNull()
  })
  it('the writer line attributes them to customers, never to her', () => {
    const line = renderCustomerReviews({ rating: 4.8, count: 37, quotes: ['Heavier than I expected and the glaze is gorgeous.'] })!
    expect(line).toMatch(/their words, not the creator's/)
    expect(line).toMatch(/Never present a review as the creator's own experience/)
    expect(renderCustomerReviews(null)).toBeNull()
  })
  it('is stored by the extractor and read by the writer', () => {
    const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
    expect(readFileSync(join(repo, 'worker/src/jobs/extractProduct.ts'), 'utf8')).toMatch(/customer_reviews: reviews/)
    expect(readFileSync(join(repo, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')).toMatch(/renderCustomerReviews\(/)
  })
})

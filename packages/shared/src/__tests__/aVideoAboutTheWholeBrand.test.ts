// "A VIDEO ABOUT DOG DAYS CO" — THE ANSWER THE PICKER COULD NOT EXPRESS.
//
// ⚖️ REQUESTED 2026-09-22: the brand should be pickable as the subject of a
// video, beside each product, in "Which one is this video about?". Pinned
// here end to end: offered only when confirmed, carried as `brand:<id>`,
// resolved owner-scoped on the edge, never looked up as a product, and
// written as the brand — not as an invented product.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BRAND_CHOICE_PREFIX, selectProduct } from '../productSelection'

const REPO = join(import.meta.dirname, '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const WEB = readFileSync(join(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')

describe('a video about the whole brand', () => {
  it('uses one prefix on both sides', () => {
    expect(BRAND_CHOICE_PREFIX).toBe('brand:')
    expect(EDGE).toMatch(/const BRAND_CHOICE_PREFIX_INLINE = 'brand:'/)
  })

  it('a brand pick counts as a choice, so the picker does not come back', () => {
    const id = `${BRAND_CHOICE_PREFIX}b1`
    expect(selectProduct({ ownedProductIds: ['p1', 'p2', id], chosenId: id, mayUseAProduct: true }))
      .toEqual({ kind: 'chosen', productId: id })
  })

  it('offers only brands she confirmed, first, in the same question', () => {
    expect(WEB).toMatch(/loadBrands\(\)\.then\(\(b\) => b\.filter\(\(x\) => x\.confirmed\)\)/)
    expect(WEB).toMatch(/\.\.\.brandChoices,\s*\n\s*\.\.\.ownedProducts/)
    expect(EDGE).toMatch(/from\('brands'\)\.select\('id, name'\)\.eq\('owner_id', ownerId\)\.eq\('confirmed', true\)/)
  })

  it('never looks a brand id up as a product', () => {
    expect(EDGE).toMatch(/requestedProductId !== '' && !declinedAProduct && requestedBrandId === ''/)
  })

  it('resolves the brand owner-scoped and confirmed only', () => {
    const at = EDGE.indexOf('const confirmedBrand')
    const block = EDGE.slice(at, EDGE.indexOf('const chosenBrand', at))
    expect(block).toMatch(/requestedBrandId !== '' \? requestedBrandId/)
    expect(block).toMatch(/\.eq\('owner_id', ownerId\)\.eq\('confirmed', true\)/)
  })

  it('answers relationship and claims from the brand, so nothing is re-asked', () => {
    expect(EDGE).toMatch(/\(chosenBrand \? 'OWN_PRODUCT' : null\) \?\? ownedEntity\?\.relationship/)
    expect(EDGE).toMatch(/if \(chosenBrand && readyPresent\(chosenBrand\.description\)\) return true/)
  })

  it('writes about the business and forbids inventing a product', () => {
    expect(EDGE).toMatch(/THIS VIDEO IS ABOUT THE CREATOR\\'S OWN BRAND AS A WHOLE/)
    expect(EDGE).toMatch(/Do not single out or invent a specific product, price or feature/)
  })
})

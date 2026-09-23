// A BRAND, AND THE THINGS IT SELLS — AND NEVER A GUESS PASSED OFF AS AN ANSWER.
//
// ⚠️ THE OWNER'S CONDITIONS, 2026-09-22, each pinned below:
//   · "there's a brand and then there's products"
//   · "every time you pre-fill something, it's not the right one — make sure it
//      is the right one and I can properly edit it"
//   · "you can add more brands as well"
//   · an affiliate product must never require creating a brand
//   · "My whole business… doesn't actually change anything… remove that"
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { suggestBrand } from '../brandSuggestion'
import type { ProductEntityRecord } from '../productEntity'

const REPO = join(import.meta.dirname, '..', '..', '..', '..')
const LIB = readFileSync(join(REPO, 'apps/web/src/pages/ProductLibrary.tsx'), 'utf8')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const MIG = readFileSync(join(REPO, 'supabase/migrations/0224_a_brand_and_the_things_it_sells.sql'), 'utf8')

const fact = (field: string, value: string) =>
  ({ field, value, trust: 'usable', source: 'official_product_page', sourceUrl: null, extractedAt: '2026-09-22T00:00:00Z' })

// The real bandana row, reduced to what matters: linked to the homepage.
const bandana = {
  id: 'p1', name: 'Reversible Scrunchie Bandana', relationship: 'OWN_PRODUCT', archivedAt: null,
  productUrl: 'https://www.thedogdaysco.com',
  knowledge: [
    fact('name', 'The Dog Days Co.'),
    fact('description', 'Our Dog Days collars are made-to-order and handcrafted specially for your pup!'),
    fact('cta', 'View cart'),
  ],
} as unknown as ProductEntityRecord

describe('a brand, suggested only from her own shop page', () => {
  it('reads the brand from the homepage facts the classifier moved off the product', () => {
    expect(suggestBrand([bandana])).toEqual({
      name: 'The Dog Days Co',
      website: 'thedogdaysco.com',
      description: 'Our Dog Days collars are made-to-order and handcrafted specially for your pup!',
    })
  })

  it('suggests nothing when there is nothing honest to suggest', () => {
    const onProductPage = { ...bandana, productUrl: 'https://www.thedogdaysco.com/products/scrunchie' } as ProductEntityRecord
    expect(suggestBrand([onProductPage])).toBeNull()
    expect(suggestBrand([])).toBeNull()
  })

  it("never suggests someone else's brand as hers", () => {
    const affiliate = { ...bandana, relationship: 'AFFILIATE' } as ProductEntityRecord
    expect(suggestBrand([affiliate])).toBeNull()
  })
})

describe('a suggestion is not an answer', () => {
  it('stores a confirmed flag, defaulting to false', () => {
    expect(MIG).toMatch(/confirmed\s+boolean not null default false/)
  })

  it('the writer reads only a confirmed brand', () => {
    const at = EDGE.indexOf('const confirmedBrand')
    const block = EDGE.slice(at, EDGE.indexOf('})()', at))
    expect(block).toMatch(/\.eq\('confirmed', true\)/)
    expect(block).toMatch(/\.eq\('owner_id', ownerId\)/)
  })

  it('the screen labels a suggestion and saves it only on her say-so', () => {
    expect(LIB).toMatch(/please check this/)
    expect(LIB).toMatch(/Yes, that's right/)
    expect(LIB).toMatch(/confirmed: true/)
  })
})

describe('brands, products, and things she promotes for others', () => {
  it('lets her add more than one brand', () => {
    // Re-anchored 2026-09-23: the add-brand button now lives in the page header.
    expect(LIB).toMatch(/\+ Add brand/)
  })

  it('groups her own products apart from what she promotes for others', () => {
    expect(LIB).toMatch(/Your products/)
    expect(LIB).toMatch(/Things you promote for others/)
  })

  it('asks which brand only for her own products and only when there is a choice', () => {
    expect(LIB).toMatch(/isOwnProduct\(e\) && \(brands\?\.length \?\? 0\) > 1/)
  })

  it('an affiliate product never needs a brand', () => {
    expect(MIG).toMatch(/brand_id uuid references public\.brands\(id\) on delete set null/)
    expect(MIG).not.toMatch(/brand_id uuid not null/)
  })

  it('no longer offers "My whole business" as a kind of product', () => {
    expect(LIB).not.toMatch(/value: 'BUSINESS'/)
  })
})

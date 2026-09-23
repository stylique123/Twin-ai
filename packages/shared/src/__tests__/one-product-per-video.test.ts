// ITEMS 25 + 26: a "my product" build asks WHICH product when there are several,
// and a reference about several products is built for exactly the one chosen.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CONTAINER_TYPES,
} from '../referenceContentProfile'
import {
  referenceHasNoSingleProductFocus, singleProductReferenceNotice, templateFor,
} from '../containerTemplates'
import { mustAskWhichProduct, selectProduct } from '../productSelection'

const ROOT = join(__dirname, '..', '..', '..', '..')
const BUILDING = readFileSync(join(ROOT, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')
const EDGE = readFileSync(join(ROOT, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('item 25: which product, when there are several', () => {
  it('two products and no choice must ask, and the writer gets none', () => {
    const input = { ownedProductIds: ['a', 'b'], chosenId: null, mayUseAProduct: true }
    expect(mustAskWhichProduct(input)).toBe(true)
    expect(selectProduct(input)).toEqual({ kind: 'none', reason: 'creator_has_not_chosen' })
  })
  it('the choice is exactly one product', () => {
    expect(selectProduct({ ownedProductIds: ['a', 'b'], chosenId: 'b', mayUseAProduct: true }))
      .toEqual({ kind: 'chosen', productId: 'b' })
  })
  it('the picker is not decided before the goal chip is tapped', () => {
    // It rides along flagged `whenCommercial` while the intent is open, and the
    // card shows it from the LIVE answers.
    expect(BUILDING).toMatch(/intentStillOpen/)
    expect(BUILDING).toMatch(/whenCommercial: true/)
    expect(BUILDING).toMatch(/const visibleAsk = \(askQuestions \?\? \[\]\)\.filter\(\(q\) => !q\.whenCommercial \|\| liveCommercial\)/)
    // and the build button requires an answer to what is visible
    expect(BUILDING).toMatch(/disabled=\{visibleAsk\.some\(/)
  })
  it('the writer is handed only the chosen entity\'s facts', () => {
    expect(EDGE).toMatch(/if \(!nameableEntityIds\.has\(id\)\) continue/)
  })
})

describe('item 26: a multi-product reference built for one product', () => {
  it('round-ups and comparisons have no single product focus; nothing else does', () => {
    const multi = CONTAINER_TYPES.filter((c) => referenceHasNoSingleProductFocus(c))
    expect(multi.sort()).toEqual(['comparison', 'recommendation'])
    expect(referenceHasNoSingleProductFocus(null)).toBe(false)
    expect(referenceHasNoSingleProductFocus('other')).toBe(false)
    for (const c of multi) {
      expect(templateFor(c)!.beats.filter((b) => b.needs === 'product').length).toBeGreaterThanOrEqual(2)
    }
  })
  it('tells the creator in one sentence', () => {
    expect(singleProductReferenceNotice('The Serum'))
      .toBe("This reference isn't about one product — we'll use its structure for The Serum.")
  })
  it('the writer is told never to merge, and the note is saved on the blueprint', () => {
    expect(EDGE).toMatch(/referenceHasNoSingleProductFocus\(tpl\.container\)/)
    expect(EDGE).toMatch(/Never introduce, name, compare against or merge in any other product\./)
    expect(EDGE).toMatch(/reference_scope_note: referenceScopeNote/)
  })
})

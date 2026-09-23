// ITEMS 25 + 26: a "my product" build asks WHICH product when there are several,
// and a reference about several products is built for exactly the one chosen.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CONTAINER_TYPES,
} from '../referenceContentProfile'
import {
  referenceHasNoSingleProductFocus, singleProductReferenceNotice, templateFor, referenceLooksMultiProduct,
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

describe('item 26 fallback: a multi-product reference with no assessed container', () => {
  it('reads list / ranking / top-N / vs patterns from the transcript', () => {
    expect(referenceLooksMultiProduct({ transcript: 'My top 5 drugstore finds this month' }))
      .toMatchObject({ multi: true, reason: 'top_n' })
    expect(referenceLooksMultiProduct({ transcript: 'Three products I repurchase every single time.' }).multi).toBe(true)
    expect(referenceLooksMultiProduct({ transcript: 'CeraVe vs La Roche-Posay, which one wins?' }))
      .toMatchObject({ multi: true, reason: 'versus' })
    expect(referenceLooksMultiProduct({ transcript: 'I ranked every lip oil I own.' }).multi).toBe(true)
    expect(referenceLooksMultiProduct({ transcript: 'Number one is the cheapest. Number two surprised me.' }).multi).toBe(true)
  })
  it('reads two distinct product nouns carried by different beats', () => {
    const r = referenceLooksMultiProduct({ beats: [
      'Hook: holds up a tub',
      'First, a gel moisturizer that sinks in fast',
      'Then a mineral sunscreen with no white cast',
      'Follow for part two',
    ] })
    expect(r).toMatchObject({ multi: true, reason: 'distinct_products' })
    expect(r.products).toEqual(['moisturizer', 'sunscreen'])
  })
  it('leaves a single-product reference alone', () => {
    expect(referenceLooksMultiProduct({
      transcript: 'I have used this serum for thirty days. Here is what changed. Watch until the end.',
      beats: ['Hook: the serum bottle', 'Day one with the serum', 'Day thirty: the serum results', 'Link in bio'],
    }).multi).toBe(false)
    expect(referenceLooksMultiProduct({ transcript: '3 mistakes I made starting my business' }).multi).toBe(false)
    expect(referenceLooksMultiProduct({}).multi).toBe(false)
  })
  it('the edge applies the same notice and writer instruction on the fallback', () => {
    expect(EDGE).toMatch(/referenceLooksMultiProduct\(/)
    expect(EDGE).toMatch(/event: 'reference_multi_product_fallback'/)
    const at = EDGE.indexOf('referenceLooksMultiProduct(')
    const block = EDGE.slice(at, at + 2500)
    expect(block).toMatch(/singleProductReferenceNotice\(/)
    expect(block).toMatch(/THIS REFERENCE IS ABOUT SEVERAL PRODUCTS; THIS VIDEO IS ABOUT ONE/)
  })
})

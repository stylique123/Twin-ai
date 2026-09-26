// §2.5 REGRESSION GUARD — "What should viewers do after watching?" came back four
// times after being reported fixed. These pin every path that decides it, so the
// next regression fails CI instead of reaching a creator.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { brandCtaOnRecord, productCtaOnRecord } from '../cta'

const ROOT = join(__dirname, '..', '..', '..', '..')
const BUILD = readFileSync(join(ROOT, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')
const EDGE = readFileSync(join(ROOT, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('the CTA question is never asked when a CTA is on record (§2.5)', () => {
  const usable = { knowledge: [{ field: 'cta', value: 'Shop the drop', trust: 'usable' }] }

  it('product level: a usable extracted CTA is the answer', () => {
    expect(productCtaOnRecord(usable)).toBe('Shop the drop')
  })

  it('brand level: any product under the brand answers it; other brands do not', () => {
    const products = [{ brandId: 'b2', ...usable }, { brandId: 'b1', knowledge: [] }, { brandId: 'b1', offer: 'Join the list' }]
    expect(brandCtaOnRecord('b1', products)).toBe('Join the list')
    expect(brandCtaOnRecord('b3', products)).toBeNull()
    expect(brandCtaOnRecord(null, products)).toBeNull()
  })

  it('the card feeds the CTA on record (product OR brand) to readiness, so it is not asked', () => {
    expect(BUILD).toMatch(/brandCtaOnRecord\(chosenBrand\.id, libraryProducts\)/)
    expect(BUILD).toMatch(/cta: productCta \?\? str\(vBrief\.defaultCta\)/)
  })

  it('a CTA on record is prefilled as the answer, never added as a box', () => {
    expect(BUILD).toMatch(/if \(productCta && !ask\.some\(\(q\) => q\.field === 'cta'\)[^\n]*\n\s*answer\('cta', productCta\)/)
    expect(BUILD).not.toMatch(/ask\.push\(\{ field: 'cta'/)
  })

  it('the server gate counts the product CTA and a typed answer', () => {
    expect(EDGE).toMatch(/readyCommercial && !readyPresent\(answers\.cta \?\? brief\.defaultCta \?\? brief\.cta \?\? readyProductCta\)/)
  })
})

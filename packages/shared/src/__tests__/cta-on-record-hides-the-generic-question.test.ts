// ITEM 28: the generic CTA question is not asked when the product has one on
// record; the value is shown, editable, instead.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { productCtaOnRecord } from '../cta'
import { assessReadiness } from '../generationReadiness'

const ROOT = join(__dirname, '..', '..', '..', '..')
const BUILDING = readFileSync(join(ROOT, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')
const EDGE = readFileSync(join(ROOT, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('productCtaOnRecord', () => {
  it('reads a usable extracted cta first', () => {
    expect(productCtaOnRecord({ knowledge: [{ field: 'cta', value: 'Book a free fitting', trust: 'usable' }], offer: '£40' }))
      .toBe('Book a free fitting')
  })
  it('an unconfirmed cta is not an answer; the typed offer is', () => {
    expect(productCtaOnRecord({ knowledge: [{ field: 'cta', value: 'Buy now', trust: 'needs_confirmation' }], offer: 'Shop the spring drop' }))
      .toBe('Shop the spring drop')
  })
  it('nothing on record is null', () => {
    expect(productCtaOnRecord({ knowledge: [], offer: '  ' })).toBeNull()
    expect(productCtaOnRecord(null)).toBeNull()
  })
})

describe('the generic CTA question', () => {
  const base = { goal: 'sell', angle: 'x', offer: 'The Serum', relationship: 'OWN_PRODUCT', productFacts: ['a'] }
  it('is asked on a commercial video with nothing on record', () => {
    const v = assessReadiness({ ...base, cta: null } as never)
    expect(v.fields.find((f) => f.field === 'cta')?.state).toBe('MISSING_REQUIRED')
  })
  it('is not asked when the product CTA is supplied', () => {
    const v = assessReadiness({ ...base, cta: productCtaOnRecord({ offer: 'Shop the spring drop' }) } as never)
    expect(v.fields.find((f) => f.field === 'cta')?.state).toBe('RESOLVED')
  })
  it('the card feeds the product CTA to readiness and shows it prefilled', () => {
    expect(BUILDING).toMatch(/cta: productCta \?\? str\(vBrief\.defaultCta\)/)
    expect(BUILDING).toMatch(/answer\('cta', productCta\)/)
  })
  it('the server gate counts the product CTA too', () => {
    expect(EDGE).toMatch(/brief\.cta \?\? readyProductCta\)/)
  })
})

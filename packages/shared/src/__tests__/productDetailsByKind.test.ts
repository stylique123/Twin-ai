import { describe, it, expect } from 'vitest'
import { productDetailsByKind, missingProductDetails, showabilityForHoldUp } from '../productDetailsByKind'
import { EXTRACTED_FIELDS } from '../productExtraction'

// Fictional fixtures: Maya's Coffee (physical) and FlowDesk (software).
describe('productDetailsByKind (plan 1.4)', () => {
  it('three required per kind, urgency always optional and last', () => {
    for (const k of ['PHYSICAL_PRODUCT', 'APP', 'SAAS', 'DIGITAL_PRODUCT', 'COURSE', 'COMMUNITY', 'SERVICE']) {
      const qs = productDetailsByKind(k)
      expect(qs.filter((q) => q.required)).toHaveLength(3)
      expect(qs[qs.length - 1]).toMatchObject({ key: 'urgency', required: false })
      for (const q of qs) expect(EXTRACTED_FIELDS).toContain(q.writesTo)
    }
  })
  it('physical asks hold-up, steps and hesitation; software asks for a screen', () => {
    expect(productDetailsByKind('PHYSICAL_PRODUCT').map((q) => q.key)).toEqual(['hold_up', 'process_step', 'faq', 'urgency'])
    expect(productDetailsByKind('SAAS')[0].key).toBe('screen')
    expect(productDetailsByKind('MARKETPLACE')).toEqual([])
  })
  it('hold-up is three-way and close-up still films it', () => {
    expect(showabilityForHoldUp('hold_up')).toBe('ALWAYS')
    expect(showabilityForHoldUp('close_up')).toBe('ALWAYS')
    expect(showabilityForHoldUp('no')).toBe('NEVER')
  })
  it('only usable facts close a question; an unconfirmed page fact does not', () => {
    const k = [
      { field: 'process_step', value: 'grind, bloom, pour', trust: 'usable' },
      { field: 'faq', value: 'Is it too bitter?', trust: 'needs_confirmation' },
    ]
    expect(missingProductDetails('PHYSICAL_PRODUCT', k, 'UNKNOWN')).toEqual(['hold_up', 'faq'])
    expect(missingProductDetails('PHYSICAL_PRODUCT', k, 'NEVER')).toEqual(['faq'])
  })
})

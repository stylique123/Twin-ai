import { describe, it, expect } from 'vitest'
import { checkCtaEntity, ctaEntityViolations } from '../ctaEntity.js'

describe('checkCtaEntity', () => {
  it('flags the exact Run C CTA against an empty product_entities list', () => {
    const line = 'We partner with founders to scale their businesses at Acquisition dot com, '
      + 'and we put all the education out for free. You just have to apply it.'
    const result = checkCtaEntity(line, [])
    expect(result.flagged).toBe(true)
    // Either reason is a correct catch — the domain match and the
    // first-person-plural match both fire on this exact sentence.
    expect(result.reason).not.toBeNull()
  })

  it('flags a first-person-plural business claim even with no domain named', () => {
    const result = checkCtaEntity('We help founders scale past their first million.', [])
    expect(result.flagged).toBe(true)
    expect(result.reason).toBe('unowned_first_person_business')
  })

  it('flags a named brand/domain absent from product_entities', () => {
    const result = checkCtaEntity('Check out acme-coaching.com for more.', [{ name: 'Widget Co' }])
    expect(result.flagged).toBe(true)
    expect(result.reason).toBe('unowned_brand')
  })

  it('does not flag a brand that IS in product_entities', () => {
    const result = checkCtaEntity('Check out Widget Co dot com for more.', [{ name: 'Widget Co' }])
    expect(result.flagged).toBe(false)
  })

  it('does not flag a first-person-plural claim that names an owned entity', () => {
    const result = checkCtaEntity('We built Widget Co to help you ship faster.', [{ name: 'Widget Co' }])
    expect(result.flagged).toBe(false)
  })

  it('does not flag a non-commercial CTA', () => {
    const result = checkCtaEntity('Save this so you have it when you need it.', [])
    expect(result.flagged).toBe(false)
  })

  it('does not flag an empty line', () => {
    expect(checkCtaEntity('', []).flagged).toBe(false)
    expect(checkCtaEntity(undefined, []).flagged).toBe(false)
  })

  it('skipping the product questions (empty entities) does not exempt a claim about ANY business', () => {
    // ⚖️ "Skipping is an answer" — an empty entity list is not a blank the
    // check quietly fills; it makes every first-person-plural business claim
    // fail, whichever business it names.
    const result = checkCtaEntity('We run the best agency in the city.', [])
    expect(result.flagged).toBe(true)
  })
})

describe('ctaEntityViolations', () => {
  it('finds the CTA-section violation and reports its index', () => {
    const beats = [
      { section: 'Hook', line: 'Three reasons you are losing customers.' },
      { section: 'CTA', line: 'We partner with founders at Acquisition dot com.' },
    ]
    const violations = ctaEntityViolations(beats, [])
    expect(violations).toHaveLength(1)
    expect(violations[0].index).toBe(1)
    expect(violations[0].section).toBe('CTA')
  })

  it('is silent on a clean CTA', () => {
    const beats = [{ section: 'CTA', line: 'Follow if you want more like this.' }]
    expect(ctaEntityViolations(beats, [])).toHaveLength(0)
  })

  it('ignores non-CTA sections even if they contain a similar phrase', () => {
    const beats = [{ section: 'Reason 2', line: 'We partner with founders at Acquisition dot com.' }]
    expect(ctaEntityViolations(beats, [])).toHaveLength(0)
  })

  it('handles non-array input safely', () => {
    expect(ctaEntityViolations(null, [])).toEqual([])
    expect(ctaEntityViolations(undefined, [])).toEqual([])
  })
})

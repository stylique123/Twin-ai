import { describe, it, expect } from 'vitest'
import { brandIsHers } from './imageBrandCheck.js'
import { genericName, findProductOnWeb } from '../productWebSearch.js'

describe('a photo of someone else’s product is not hers', () => {
  const hers = ['Sunflower Coffee Roasters', 'Brazil Roast', 'sunflowercoffeeroasters']
  it('refuses the live case', () => { expect(brandIsHers('MYLIBERICA Coffee 06 Signature Blend', hers)).toBe(false) })
  it('accepts her own brand and a photo with no brand', () => {
    expect(brandIsHers('SUNFLOWER', hers)).toBe(true)
    expect(brandIsHers('', hers)).toBe(true)
  })
})

describe('a web search must be safe and hers', () => {
  it('a kind-of-product name is too generic to search without a brand', () => {
    expect(genericName('Single-Origin Limited Release')).toBe(true)
    expect(genericName('Brazil Cerrado Mineiro')).toBe(false)
  })
  it('refuses the search outright when generic and unbranded', async () => {
    const r = await findProductOnWeb({ productName: 'Single-Origin Limited Release', search: async () => { throw new Error('should not search') }, fetchPage: async () => null })
    expect(r).toMatchObject({ ok: false, reason: 'too_generic' })
  })
})

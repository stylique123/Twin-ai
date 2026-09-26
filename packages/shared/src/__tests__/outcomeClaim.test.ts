import { describe, expect, it } from 'vitest'
import { isOutcomeClaim } from '../outcomeClaim'

describe('a claim is not a fact (Fix C)', () => {
  it('claims, guarantees, benefits and result language need the deliberate confirm', () => {
    expect(isOutcomeClaim({ field: 'claim', value: 'Loved by customers' })).toBe(true)
    expect(isOutcomeClaim({ field: 'feature', value: 'Clinically proven to reduce redness' })).toBe(true)
    expect(isOutcomeClaim({ field: 'description', value: 'Cuts prep time by 40%' })).toBe(true)
    expect(isOutcomeClaim({ field: 'description', value: 'The #1 rated bowl' })).toBe(true)
  })
  it('plain facts keep the simple confirm', () => {
    expect(isOutcomeClaim({ field: 'price', value: '$28' })).toBe(false)
    expect(isOutcomeClaim({ field: 'feature', value: 'Dishwasher safe stoneware' })).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { inferShowability } from '../inferShowability'

describe("inferShowability (Maya's Coffee, fictional)", () => {
  const P = 'PHYSICAL_PRODUCT'
  it('coffee beans are ALWAYS', () => expect(inferShowability({ type: P, name: "Maya's House Blend Beans" })).toBe('ALWAYS'))
  it('a mug is ALWAYS', () => expect(inferShowability({ type: P, name: 'Maya Mug' })).toBe('ALWAYS'))
  it('a tote bag is ALWAYS', () => expect(inferShowability({ type: P, name: 'Coffee Tote Bag' })).toBe('ALWAYS'))
  it('a hoodie is ALWAYS', () => expect(inferShowability({ type: P, name: 'Barista Hoodie' })).toBe('ALWAYS'))
  it('an unnamed physical product is still ALWAYS', () => expect(inferShowability({ type: P })).toBe('ALWAYS'))
  it('an installed espresso setup is SOMETIMES', () =>
    expect(inferShowability({ type: P, name: 'Cafe Espresso Setup', facts: ['professionally installed on site'] })).toBe('SOMETIMES'))
  it('a roastery table is SOMETIMES', () => expect(inferShowability({ type: P, name: 'Roastery Table' })).toBe('SOMETIMES'))
  it('a barista coaching service is NEVER', () => expect(inferShowability({ type: 'SERVICE', name: 'Barista Coaching' })).toBe('NEVER'))
  it('a brew guide digital product is NEVER', () => expect(inferShowability({ type: 'DIGITAL_PRODUCT', name: 'Brew Guide' })).toBe('NEVER'))
  it('a latte art course is NEVER', () => expect(inferShowability({ type: 'COURSE', name: 'Latte Art 101' })).toBe('NEVER'))
  it('OTHER with nothing to go on is UNKNOWN', () => expect(inferShowability({ type: 'OTHER' })).toBe('UNKNOWN'))
  it('OTHER with an object word in the offer is ALWAYS', () =>
    expect(inferShowability({ type: 'OTHER', name: "Maya's", offer: 'a bag of fresh coffee beans every month' })).toBe('ALWAYS'))
  it('BUSINESS described only by downloads is NEVER', () =>
    expect(inferShowability({ type: 'BUSINESS', name: 'Menu Studio', facts: ['downloadable pdf'] })).toBe('NEVER'))
  it('OTHER with unrelated words is UNKNOWN', () => expect(inferShowability({ type: 'OTHER', name: 'Maya Things' })).toBe('UNKNOWN'))
  it('is case-insensitive on type and deterministic', () => {
    const a = inferShowability({ type: 'physical_product', name: 'Cold Brew Bottle' })
    expect(a).toBe('ALWAYS')
    expect(inferShowability({ type: 'physical_product', name: 'Cold Brew Bottle' })).toBe(a)
  })
  it('ignores non-string facts', () => expect(inferShowability({ type: 'OTHER', facts: [null, 3, {}] })).toBe('UNKNOWN'))
})

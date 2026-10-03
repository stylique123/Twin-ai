import { describe, expect, it } from 'vitest'
import { arcFor, arcCheck, arcPrompt } from '../arcShape'

describe('the arc is set by the objective and the angle (owner blueprint 2026-10-03, Part 1)', () => {
  it('sell is a short lean-in, entertain and story are long, teach is medium', () => {
    expect(arcFor('sell').leanIn).toBe('short')
    expect(arcFor('entertain').leanIn).toBe('long')
    expect(arcFor('personal_brand').row).toBe('story')
    expect(arcFor('educate').leanIn).toBe('medium')
    expect(arcFor('conversations').row).toBe('answer')
  })
  it('the angle she picked decides the row; a story on a sell video still has to land the product', () => {
    expect(arcFor('educate', 'feeling_story').row).toBe('story')
    const sellStory = arcFor('sell', 'feeling_story')
    expect(sellStory.row).toBe('story')
    expect(sellStory.productOptional).toBe(false)
  })
  it('the same product sits early in a sell script and late in an entertain script', () => {
    const lines = ['Hook about mornings.', 'A story about the cart.', 'The day it rained.', 'Then the Signature Blend saved it.', 'Comment yours.']
    const early = ['Hook.', 'The Signature Blend is roasted to order.', 'It ships in two days.', 'Order it.']
    expect(arcCheck(early, ['Signature', 'Blend'], arcFor('sell')).fits).toBe(true)
    expect(arcCheck(early, ['Signature', 'Blend'], arcFor('entertain')).reason).toBe('product_too_early')
    expect(arcCheck(lines, ['Signature', 'Blend'], arcFor('entertain')).fits).toBe(true)
    expect(arcCheck(['Hook.', 'Story.', 'Close.'], ['Signature'], arcFor('sell')).reason).toBe('product_never_named')
  })
  it('the writer is told the shape, and nothing about a product when there is none', () => {
    expect(arcPrompt(arcFor('entertain'), true)).toMatch(/Never pitch/)
    expect(arcPrompt(arcFor('sell'), false)).not.toMatch(/product is clearly/)
  })
})

import { describe, it, expect } from 'vitest'
import { classifyFactRules } from '../factClass.js'

// Fictional creator (Maya's Coffee), from the relevance brief Part 6.
describe('classifyFactRules', () => {
  it('A: lease with $11 left is a heavy challenge about her', () => {
    const c = classifyFactRules('I signed my lease with $11 left in my account.')
    expect(c.weight).toBe('heavy')
    expect(c.subject).toBe('her')
  })
  it('B: a customer reaction, light', () => {
    const c = classifyFactRules('A customer told me my roast ruined grocery store coffee for her.')
    expect(c.kind).toBe('customer_reaction')
    expect(c.moment).toBe('customer_reaction')
    expect(c.people).toBe('role_only')
  })
  it('C: a mistake story', () => {
    const c = classifyFactRules("I skipped testing a new supplier's beans and had to toss the whole lot. Now I always test a sample first.")
    expect(c.moment).toBe('mistake')
    expect(['complete_story', 'partial_story']).toContain(c.kind)
  })
  it('D: a permit challenge', () => {
    const c = classifyFactRules('The city told me I needed a permit and I spent a month getting one.')
    expect(c.kind).toBe('challenge')
  })
  it('price is an offer, size is a spec, scan topic stays a topic', () => {
    expect(classifyFactRules('A 12 oz bag is $18.').kind).toBe('offer')
    expect(classifyFactRules('Whole bean or ground, roasted to order.').kind).toBe('product_spec')
    expect(classifyFactRules('Operating a coffee cart business', { basis: 'scan' }).kind).toBe('topic_only')
  })
  it('flags minors and named people', () => {
    expect(classifyFactRules('My daughter helped me bag the first batch.').people).toBe('minor')
    expect(classifyFactRules('I roasted it for my friend Jenna Cole last week.').people).toBe('named')
  })
  it('a complete story has setup, turn and resolution', () => {
    const c = classifyFactRules('I pulled my first roast two minutes early because I was scared of burning it. It tasted like peanuts, so I let the next one run to second crack. Now that is the cup I sell.')
    expect(c.completeness).toBe('complete')
    expect(c.kind).toBe('complete_story')
  })
})

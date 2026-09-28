// Coffee report 1.5: panel statements must be true of the script.
import { describe, expect, it } from 'vitest'
import { itemCounts } from '../numberRole'
import { syncWhyItWorksToScript } from '../whyItWorksSync'

describe('panel statements (coffee report 1.5)', () => {
  it('"Two identical roasts" is a comparison, not a list of two', () => {
    expect(itemCounts('Two identical roasts, two totally different cups')).toEqual([])
    expect(itemCounts('Two mistakes every new roaster makes')).toEqual([2])
  })
  it('only claims "one action" when the close actually asks for one', () => {
    const base = [{ section: 'Hook', line: 'Why does the same roast taste different?' }]
    const q = syncWhyItWorksToScript([], [...base, { section: 'CTA', line: 'What do you notice in your cup?' }]).whyItWorks
    const a = syncWhyItWorksToScript([], [...base, { section: 'CTA', line: 'Order a bag from the link in my bio.' }]).whyItWorks
    expect(q.some((c) => /one action/.test(c))).toBe(false)
    expect(a.some((c) => /one action/.test(c))).toBe(true)
  })
})

import { honestWhyItWorks } from '../whyItWorksHonesty'
describe('hook claims follow the hook she picked (1.5)', () => {
  const claims = [
    'Your hook names a number, so people know exactly how much you are promising them.',
    'Your opening line is 9 words. It lands before anyone decides to scroll past.',
    'You open on a question, so people answer it in their head before they choose whether to keep watching.',
    'You end on one action in 8 words, so nobody has to work out what to do next.',
  ]
  it('drops or recomputes claims that are false of the chosen hook', () => {
    const out = honestWhyItWorks(claims, false, 'This was my most expensive roasting mistake')
    expect(out).toEqual([
      'Your opening line is 7 words. It lands before anyone decides to scroll past.',
      'You end on one action in 8 words, so nobody has to work out what to do next.',
    ])
  })
  it('keeps them when true, and changes nothing without a hook', () => {
    expect(honestWhyItWorks(claims, false, 'Why do 2 identical roasts taste different?')).toHaveLength(4)
    expect(honestWhyItWorks(claims, false)).toEqual(claims)
  })
})

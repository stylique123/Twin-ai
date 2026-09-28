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

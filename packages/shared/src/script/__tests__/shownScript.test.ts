import { describe, it, expect } from 'vitest'
import { directionsFor, renderDirectionGuidance, PRESENCE_RULES } from '../performanceDirection'

// ⚠️ AUDIT 2026-10-01 ("SHOWN SCRIPT"): every beat has a spoken half and a
// shown half, for every creator — not only sellers.
describe('the shown half of a script', () => {
  it('a video with no product gets body-and-face cues, never product handling', () => {
    const set = directionsFor({ kind: null, showability: null, shape: null })
    const ids = set.options.map((o) => o.id)
    expect(ids).toContain('show_size')
    expect(ids).not.toContain('twist_open')
    expect(ids).not.toContain('hold_up')
  })
  it('illustrator gestures are offered', () => {
    const ids = directionsFor({ kind: 'SERVICE', showability: 'NEVER' }).options.map((o) => o.id)
    for (const id of ['show_size', 'two_sides', 'mark_steps', 'fingertips']) expect(ids).toContain(id)
  })
  it('an app is a screen product, not a physical one', () => {
    const set = directionsFor({ kind: 'APP', showability: 'ALWAYS', sections: [] })
    expect(set.options.map((o) => o.id)).not.toContain('twist_open')
  })
  it('every prompt carries the presence rules: gesture, eyes, posture, where, demonstration', () => {
    const p = renderDirectionGuidance({ kind: null })
    expect(p).toContain(PRESENCE_RULES)
    for (const w of ['GESTURE', 'EYES', 'POSTURE', 'WHERE', 'DEMONSTRATION']) expect(PRESENCE_RULES).toContain(w)
    expect(p).not.toMatch(/inventing a prop, a gesture/)
  })
})

import { productCategory, CATEGORY_DEMO } from '../performanceDirection'
describe('phase 3: the demonstration matches what kind of thing it is', () => {
  it('reads the category from type, shape and her words', () => {
    expect(productCategory({ kind: 'APP' })).toBe('software')
    expect(productCategory({ kind: 'PHYSICAL_PRODUCT', productText: 'Colombia washed medium roast beans' })).toBe('consumable')
    expect(productCategory({ kind: 'PHYSICAL_PRODUCT', productText: 'handmade leather wallet' })).toBe('craft')
    expect(productCategory({ kind: 'PHYSICAL_PRODUCT', shape: 'garment' })).toBe('wearable_handled')
  })
  it('the prompt carries that category\'s demonstration', () => {
    const p = renderDirectionGuidance({ kind: 'PHYSICAL_PRODUCT', showability: 'ALWAYS', productText: 'scented soy candle' })
    expect(p).toContain(CATEGORY_DEMO.consumable!)
    expect(renderDirectionGuidance({ kind: null })).not.toContain('HOW THIS PRODUCT IS DEMONSTRATED')
  })
  it('an app never invents "free" and only asks for a screen recording when she can', () => {
    expect(CATEGORY_DEMO.software).toMatch(/never invent "free"/)
    expect(CATEGORY_DEMO.software).toMatch(/only ask for a\s+screen recording if she said she can/)
  })
})

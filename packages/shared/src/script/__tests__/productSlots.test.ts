import { describe, it, expect } from 'vitest'
import { filledProductSlots } from '../productSlots.js'

describe('filledProductSlots (owner 2026-10-05: a named slot, not a word count)', () => {
  it('fills nothing for the stand-in answers that released blind set 2', () => {
    for (const a of ['Fresh beans.', 'Nothing specific, keep it general.', 'It is really good and people love it a lot', 'Smooth and sweet coffee for everyday people']) {
      expect(filledProductSlots(a)).toEqual([])
    }
  })
  it('fills the named slots', () => {
    expect(filledProductSlots("It's a 32 oz bottle of concentrate for $18, cut it with water or milk.")).toEqual(['price', 'size', 'use', 'what'])
    expect(filledProductSlots('Made from our Colombia beans, steeped 18 hours.')).toEqual(['use', 'what'])
    expect(filledProductSlots('$15')).toEqual(['price'])
  })
})

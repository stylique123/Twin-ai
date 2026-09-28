import { describe, it, expect } from 'vitest'
import { planUseItems, defaultExcluded, PLAN_USE_MAX } from '../planUse'

const k = (id: string, text: string, source = 'asked', kind = 'experience') => ({ id, text, source, kind })

describe('plan card list is decided once and is what is sent (round 2, 2.4)', () => {
  it('starts on only what fits and is not flagged, capped at the max', () => {
    const rows = [
      k('a', 'Roasting coffee at home taught me patience'),
      k('b', 'My cup score was 87 points', 'caption', 'claim'),
      k('c', 'I restored an old motorbike last summer'),
      ...Array.from({ length: 14 }, (_, n) => k(`r${n}`, `Coffee roastery lesson number ${'x'.repeat(n + 1)} about roasting`)),
    ]
    const items = planUseItems(rows, 'Running a coffee roastery from my home is messy')
    const off = new Set(defaultExcluded(items))
    expect(off.has('b')).toBe(true)
    expect(off.has('c')).toBe(true)
    expect(items.filter((i) => !off.has(i.id)).length).toBeLessThanOrEqual(PLAN_USE_MAX)
  })

  it('is deterministic for the same input (no silent recount)', () => {
    const rows = [k('a', 'Roasting coffee at home'), k('b', 'Coffee beans from Colombia', 'caption', 'product')]
    const one = defaultExcluded(planUseItems(rows, 'coffee roastery'))
    const two = defaultExcluded(planUseItems(rows, 'coffee roastery'))
    expect(one).toEqual(two)
  })

  it('never shortens the text it shows', () => {
    const long = 'A'.repeat(20) + ' roasting coffee from home is messy and you just figure it out step by step from home, every single week'
    expect(planUseItems([k('a', long)], 'coffee')[0].text).toBe(long)
  })
})

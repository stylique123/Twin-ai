import { describe, it, expect } from 'vitest'
import { itemFromCreatorKnowledge, itemFromProductFact, slotCoverage, slotForCreatorKind, slotForProductField } from '../itemFormat.js'

// Fictional: Maya's Coffee.
describe('item format and slot map', () => {
  it('maps every live creator kind to a slot', () => {
    expect(slotForCreatorKind('experience')).toBe('story')
    expect(slotForCreatorKind('opinion')).toBe('stance')
    expect(slotForCreatorKind('framework')).toBe('process')
    expect(slotForCreatorKind('claim')).toBe('proof')
    expect(slotForCreatorKind('covered')).toBe('context')
    expect(slotForCreatorKind('something_new')).toBe('context')
  })
  it('maps every live product field to a slot', () => {
    expect(slotForProductField('feature')).toBe('what_it_is')
    expect(slotForProductField('price')).toBe('close')
    expect(slotForProductField('object_shape')).toBe('show_it')
    expect(slotForProductField('claim')).toBe('proof')
    expect(slotForProductField('page_section')).toBe('show_it')
  })
  it('adapts a creator row: a claim stays unconfirmed, an answer is confirmed', () => {
    const claim = itemFromCreatorKnowledge({ id: 'a', kind: 'claim', text: 'Our beans are the freshest in town', source: 'video' })
    expect(claim).toMatchObject({ subject: 'creator', slot_hint: 'proof', status: 'unconfirmed', says_who: 'creator' })
    const told = itemFromCreatorKnowledge({ id: 'b', kind: 'experience', text: 'Maya burned her first batch', source: 'answer' })
    expect(told).toMatchObject({ slot_hint: 'story', status: 'confirmed' })
    expect(itemFromCreatorKnowledge({ kind: 'experience', text: '  ' })).toBeNull()
  })
  it('adapts a product fact by trust', () => {
    expect(itemFromProductFact({ field: 'price', value: '$18 a bag', trust: 'user_confirmed', source: 'creator' }))
      .toMatchObject({ subject: 'product', slot_hint: 'close', status: 'confirmed', says_who: 'creator' })
    expect(itemFromProductFact({ field: 'claim', value: 'Best roast in Ohio', trust: 'page', source: 'page' }))
      .toMatchObject({ slot_hint: 'proof', status: 'unconfirmed', says_who: 'product_page' })
  })
  it('counts slot coverage and names the empty spoken slots', () => {
    const cov = slotCoverage([
      itemFromCreatorKnowledge({ kind: 'experience', text: 'A story', source: 'answer' }),
      itemFromProductFact({ field: 'price', value: '$18', trust: 'usable' }),
      itemFromProductFact({ field: 'claim', value: 'Unchecked', trust: 'page' }),
      itemFromCreatorKnowledge({ kind: 'topic', text: 'roasting', source: 'video' }),
      null,
    ])
    expect(cov.items).toBe(4)
    expect(cov.filled).toEqual(['story', 'close'])
    expect(cov.empty).toContain('proof')
    expect(cov.empty).toContain('show_it')
    expect(cov.empty).not.toContain('context')
  })
})

import { groupProductFactLines } from '../itemFormat.js'
describe('groupProductFactLines (plan 1.6)', () => {
  it('groups admitted facts by job, in script order, under the same cap', () => {
    const g = groupProductFactLines([
      { field: 'price', value: '$18 a bag' },
      { field: 'feature', value: 'Roasted to order' },
      { field: 'problem', value: 'Grocery beans taste burnt' },
      { field: 'process_step', value: '1. Grind 18g' },
      { field: 'faq', value: 'Q: Whole bean? A: Yes' },
      { field: 'object_shape', value: 'bag' },
    ])
    expect(g.lines[0]).toMatch(/^  HOOK MATERIAL/)
    expect(g.lines.findIndex((l) => l.includes('THE OFFER'))).toBeGreaterThan(g.lines.findIndex((l) => l.includes('QUESTIONS')))
    expect(g.groups).toMatchObject({ hook: 1, what_it_is: 1, show_it: 1, process: 1, objection: 1, close: 1 })
    expect(groupProductFactLines(Array.from({ length: 30 }, (_, i) => ({ field: 'feature', value: `f${i}` }))).groups.what_it_is).toBe(24)
  })
  it('skips empty values', () => {
    expect(groupProductFactLines([{ field: 'feature', value: '  ' }]).lines).toEqual([])
  })
})

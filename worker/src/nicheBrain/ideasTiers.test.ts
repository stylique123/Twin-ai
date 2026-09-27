import { describe, it, expect } from 'vitest'
import { normalizeIdeas, cleanWhy, isReadyDraft } from './ideasParse.js'

const one = (o: Record<string, unknown>) => normalizeIdeas({ ideas: [{ title: 'T', premise: 'P', ...o }] }, new Set(['p1']))[0]

describe('which ideas may skip the questions', () => {
  it('own record, undated, not selling → ready draft', () => {
    expect(one({ basis: 'own', mode: 'educate', goal: 'authority' }).ready).toBe(true)
  })
  it('a date makes it an event, whatever the model said', () => {
    const i = one({ basis: 'own', event_day: '2026-10-01' })
    expect(i.basis).toBe('event'); expect(i.ready).toBe(false)
  })
  it('trend, unconfirmed product, selling, or unknown basis all need her confirmation', () => {
    expect(one({ basis: 'trend' }).ready).toBe(false)
    expect(one({ basis: 'product' }).ready).toBe(false)
    expect(one({ basis: 'own', mode: 'sell' }).ready).toBe(false)
    expect(one({ basis: 'own', goal: 'sales' }).ready).toBe(false)
    expect(one({}).basis).toBe('trend')
    expect(isReadyDraft({ basis: 'event', event_day: null, mode: null, goal: null })).toBe(false)
  })
  it('an event basis with no valid date is a guess, not an event', () => {
    expect(one({ basis: 'event', event_day: 'Oct 1' }).basis).toBe('trend')
  })
})

describe('the why line is one plain sentence', () => {
  it('keeps the owner examples', () => {
    expect(cleanWhy('Coffee Day is October 1st — good timing for a fresh-roast video.')).not.toBeNull()
    expect(cleanWhy('Packaging videos do well for small coffee brands like yours.')).not.toBeNull()
  })
  it('drops mechanism language and long explanations', () => {
    expect(cleanWhy('International Coffee Day is happening on October 1st, perfectly matching your search-driven espresso and coffee bean tutorials.')).toBeNull()
    expect(cleanWhy('Proven niche pattern for your brand includes showing labels.')).toBeNull()
  })
})

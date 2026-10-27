// Plan v7.1 §3 (WP3): two questions, about this request's gaps, never repeated.
// Fictional fixtures only.
import { describe, expect, it } from 'vitest'
import { fitPain, gapQuestion, inventory, painToQuestion, pickTwo, enginePlanRecord, questionEngineOn } from '../questionEngine'

const pains = [
  { id: 'p1', text: 'Glaze runs off the pot and fuses to the kiln shelf' },
  { id: 'p2', text: 'Beginners waste money on the wrong wheel' },
]

describe('inventory', () => {
  it('marks the core slots and the product slots on the product door', () => {
    const inv = inventory({ door: 'product', angleNeeds: ['what_it_is', 'close'], material: [{ slot: 'story', text: 'x', source: 'her_material' }] })
    expect(inv.find((r) => r.slot === 'story')?.status).toBe('filled')
    expect(inv.find((r) => r.slot === 'what_it_is')).toEqual({ slot: 'what_it_is', status: 'missing', gap: 'product' })
    expect(inv.find((r) => r.slot === 'hook')?.gap).toBe('pain')
  })
})

describe('pain', () => {
  it('fits the pain that shares a word with the topic, and asks for her example', () => {
    expect(fitPain(pains, 'why glaze runs')?.id).toBe('p1')
    expect(fitPain(pains, 'coffee roasting')).toBeNull()
    const q = painToQuestion(pains[0]!)
    expect(q.key).toBe('mn:pain:p1')
    expect(q.text).toMatch(/When did you/)
  })
})

describe('pickTwo', () => {
  const base = { door: 'idea', angleNeeds: ['story'] as const, material: [], ideaText: 'why glaze runs', painThemes: pains }
  it('asks exactly two: the pain first, then the biggest gap (story)', () => {
    const qs = pickTwo({ ...base, angleNeeds: ['story'] })
    expect(qs).toHaveLength(2)
    expect(qs[0]!.source).toBe('pain_map')
    expect(qs[1]!.key).toBe('mn:gap:story')
  })
  it('never re-asks a closed key, and skips a question whose meaning she already answered', () => {
    const qs = pickTwo({ ...base, angleNeeds: ['story'], closedKeys: ['mn:pain:p1', 'mn:gap:story'] })
    expect(qs.map((q) => q.key)).not.toContain('mn:pain:p1')
    expect(qs.map((q) => q.key)).not.toContain('mn:gap:story')
    expect(qs).toHaveLength(2)
  })
  it('with nothing missing and no pain, still asks two sharpeners', () => {
    const material = (['story', 'hook', 'proof'] as const).map((slot) => ({ slot, text: 't', source: 'her_material' as const }))
    const qs = pickTwo({ door: 'idea', angleNeeds: ['story'], material, ideaText: 'x' })
    expect(qs.map((q) => q.key)).toEqual(['mn:sharpen:number', 'mn:sharpen:detail'])
  })
  it('words the gap for the door she came through', () => {
    expect(gapQuestion('story', 'product', 'the starter kit')).toMatch(/first used the starter kit/)
    expect(gapQuestion('story', 'reference', 'x')).toMatch(/This kind of video/)
  })
  it('never asks for dates or scarcity', () => {
    const qs = pickTwo({ door: 'product', angleNeeds: ['what_it_is', 'close'], material: [], productName: 'Kit', painThemes: pains })
    for (const q of qs) expect(q.text).not.toMatch(/\b(when (does|will) it end|deadline|only \d+ left|how many left)\b/i)
  })
  it('the log record carries no text', () => {
    const i = { ...base, angleNeeds: ['story'] as const }
    expect(JSON.stringify(enginePlanRecord({ ...i, angleNeeds: ['story'] }, pickTwo({ ...i, angleNeeds: ['story'] })))).not.toMatch(/glaze/i)
  })
  it('stage: unset and all are on; off is off', () => {
    expect(questionEngineOn(undefined)).toBe(true)
    expect(questionEngineOn('off')).toBe(false)
  })
})

describe('plan v7.1 WP5: her niche finds the scan niche', async () => {
  const { nicheMatches, painItemsFromMap } = await import('../questionUsefulness')
  it('matches across case, punctuation, containment and a shared specific word', () => {
    expect(nicheMatches('home-coffee', 'Home coffee & roasting')).toBe(true)
    expect(nicheMatches('pottery', 'Pottery')).toBe(true)
    expect(nicheMatches('ceramics studio', 'wheel ceramics')).toBe(true)
    expect(nicheMatches('coffee', 'fitness')).toBe(false)
  })
  it('the pain map read uses it', () => {
    const rows = [{ id: 'a', niche: 'home-coffee', pain_sentence: 'Beans go stale fast', status: 'active', origin: 'audience_pain', expiry: '2099-01-01' }]
    expect(painItemsFromMap(rows, 'Home coffee & roasting', '2026-10-27')).toHaveLength(1)
  })
})

describe('plan v7.1: the show-it question fits the product kind', () => {
  it('screen kinds ask about the screen; physical asks about handling it', () => {
    expect(gapQuestion('show_it', 'product', 'FlowDesk', 'SAAS')).toMatch(/screen-record it, or will you film the screen/)
    expect(gapQuestion('show_it', 'product', 'the tote', 'PHYSICAL')).toMatch(/open it, hold it up, use it/)
  })
})

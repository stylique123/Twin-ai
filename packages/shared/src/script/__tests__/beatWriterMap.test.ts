// Fictional creators only.
import { describe, it, expect } from 'vitest'
import { mapItemsToBeats, beatWriterOn, relevance, type MaterialItem } from '../beatWriterMap'
import { BEAT_WORD_BUDGETS, BEAT_IDS, wordsInBudget } from '../beatBudgets'
import { buildBeatPrompt } from '../beatPrompt'

const idsIn = (m: ReturnType<typeof mapItemsToBeats>, beat: string) => m.beats.find((b) => b.beat === beat)!.items.map((i) => i.id)
const allPlaced = (m: ReturnType<typeof mapItemsToBeats>) => m.beats.flatMap((b) => b.items.map((i) => i.id))

// "Wren Halloway", a fictional sourdough baker.
const RICH: MaterialItem[] = [
  { id: 's1', kind: 'story', text: 'My first sourdough starter died three times before I learned to feed it at the same hour every morning.' },
  { id: 's2', kind: 'story', text: 'I once got lost hiking in the hills and found a tiny cafe.' },
  { id: 'p1', kind: 'proof', text: 'Since I fixed my starter feeding schedule, my sourdough loaves rise every single bake.' },
  { id: 'o1', kind: 'opinion', text: 'Most sourdough advice makes the starter feeding sound harder than it is.' },
  { id: 'f1', kind: 'product_fact', text: 'My starter feeding schedule card lists the flour and water ratio for each sourdough feeding.' },
  { id: 'c1', kind: 'cta', text: 'Grab the free schedule card from the link in my bio.' },
]

describe('mapItemsToBeats', () => {
  it('rich material: fills every beat, refuses the unrelated story, never reuses an item', () => {
    const m = mapItemsToBeats(RICH, { angle: 'why your sourdough starter keeps dying', topic: 'sourdough starter feeding' })
    expect(m.refused).toContainEqual(expect.objectContaining({ id: 's2', reason: 'unrelated' }))
    expect(allPlaced(m)).not.toContain('s2')
    const placed = allPlaced(m)
    expect(new Set(placed).size).toBe(placed.length)
    expect(idsIn(m, 'proof')).toHaveLength(1)
    expect(idsIn(m, 'method')).toContain('f1')
    expect(idsIn(m, 'problem')).toEqual(['o1'])
    expect(idsIn(m, 'cta')).toEqual(['c1'])
    expect(m.unfilled).toEqual([])
    expect(m.askFor).toBeNull()
  })

  it('is deterministic regardless of input order', () => {
    const req = { angle: 'why your sourdough starter keeps dying', topic: 'sourdough starter feeding' }
    expect(mapItemsToBeats([...RICH].reverse(), req)).toEqual(mapItemsToBeats(RICH, req))
  })

  it('a duplicate id is never placed twice', () => {
    const m = mapItemsToBeats([...RICH, RICH[0]], { angle: 'sourdough starter', topic: 'starter feeding' })
    const placed = allPlaced(m)
    expect(new Set(placed).size).toBe(placed.length)
  })

  it('thin material ("Juno Pell", fictional): reports unfilled beats and asks ONE question for her proof', () => {
    const thin: MaterialItem[] = [
      { id: 'o1', kind: 'opinion', text: 'Cold plunges are overrated for beginners who skip warming up.' },
      { id: 's9', kind: 'story', text: 'My cat knocked a vase off the shelf last week.' },
    ]
    const m = mapItemsToBeats(thin, { angle: 'cold plunges for beginners', topic: 'cold plunge' })
    expect(allPlaced(m)).not.toContain('s9')
    expect(m.unfilled).toEqual(expect.arrayContaining(['proof', 'method', 'cta']))
    expect(m.needsMaterial).toContain('proof')
    expect(m.askFor).toBe('proof')
  })

  it('product-led ("Tobin Marsh", fictional): method holds product facts only and the ask targets the product slot when missing', () => {
    const items: MaterialItem[] = [
      { id: 'o1', kind: 'opinion', text: 'A desk lamp with a warm setting makes late reading easier on the eyes.', tags: ['desk lamp'] },
      { id: 'p1', kind: 'proof', text: 'I read for two hours under my desk lamp last night with no eye strain.' },
      { id: 'f1', kind: 'product_fact', text: 'The desk lamp has three warmth settings and a dimmer.' },
    ]
    const withFact = mapItemsToBeats(items, { angle: 'a desk lamp for late reading', topic: 'desk lamp', productLed: true })
    expect(idsIn(withFact, 'method')).toEqual(['f1'])
    expect(withFact.beats.find((b) => b.beat === 'method')!.items.every((i) => i.kind === 'product_fact')).toBe(true)
    const noFact = mapItemsToBeats(items.filter((i) => i.id !== 'f1'), { angle: 'a desk lamp for late reading', topic: 'desk lamp', productLed: true })
    expect(noFact.unfilled).toContain('method')
    expect(noFact.askFor).toBe('method')
  })

  it('no-story ("Ilsa Brann", fictional): proof stays empty rather than borrowing an unrelated story', () => {
    const items: MaterialItem[] = [
      { id: 'o1', kind: 'opinion', text: 'Budget spreadsheets fail because people track too many categories.' },
      { id: 's1', kind: 'story', text: 'Last summer I painted my kitchen yellow.' },
      { id: 'c1', kind: 'cta', text: 'Follow for the next budgeting tip.' },
    ]
    const m = mapItemsToBeats(items, { angle: 'simpler budget spreadsheets', topic: 'budget categories' })
    expect(idsIn(m, 'proof')).toEqual([])
    expect(m.refused.map((r) => r.id)).toContain('s1')
    expect(m.askFor).toBe('proof')
  })

  it('places at most one story per script', () => {
    const items: MaterialItem[] = [
      { id: 'a', kind: 'story', text: 'My sourdough starter died the first winter.' },
      { id: 'b', kind: 'story', text: 'My sourdough starter came back to life after a warm week.' },
    ]
    const m = mapItemsToBeats(items, { angle: 'sourdough starter', topic: 'sourdough starter' })
    expect(m.beats.flatMap((b) => b.items).filter((i) => i.kind === 'story')).toHaveLength(1)
    expect(m.refused).toContainEqual(expect.objectContaining({ reason: 'no_beat_left' }))
  })

  it('relevance is 0 for no shared words', () => {
    expect(relevance({ id: 'x', kind: 'story', text: 'hiking hills cafe' }, 'sourdough', 'starter')).toBe(0)
  })
})

describe('BEAT_WRITER flag', () => {
  it('defaults OFF', () => {
    expect(beatWriterOn(undefined)).toBe(false)
    expect(beatWriterOn('')).toBe(false)
    expect(beatWriterOn('false')).toBe(false)
    expect(beatWriterOn('on')).toBe(true)
  })
})

describe('BEAT_WORD_BUDGETS', () => {
  it('matches plan §33', () => {
    expect(BEAT_IDS).toEqual(['hook', 'problem', 'proof', 'method', 'cta'])
    expect(BEAT_WORD_BUDGETS.hook).toMatchObject({ min: 12, max: 20 })
    expect(BEAT_WORD_BUDGETS.problem).toMatchObject({ min: 15, max: 30 })
    expect(BEAT_WORD_BUDGETS.proof).toMatchObject({ min: 30, max: 50 })
    expect(BEAT_WORD_BUDGETS.method).toMatchObject({ min: 20, max: 40 })
    expect(BEAT_WORD_BUDGETS.cta).toMatchObject({ min: 8, max: 15 })
    expect(wordsInBudget('cta', 16)).toBe(false)
    expect(Object.isFrozen(BEAT_WORD_BUDGETS)).toBe(true)
  })
})

describe('buildBeatPrompt', () => {
  const m = mapItemsToBeats(RICH, { angle: 'why your sourdough starter keeps dying', topic: 'sourdough starter feeding' })
  it('carries the budget, only the assigned material, and the no-invention rule', () => {
    const slot = m.beats.find((b) => b.beat === 'proof')!
    const p = buildBeatPrompt({ slot, angle: 'why your sourdough starter keeps dying', topic: 'sourdough starter feeding', earlierLines: ['Your starter is not lazy.'] })
    expect(p).toMatchObject({ beat: 'proof', minWords: 30, maxWords: 50, itemIds: slot.items.map((i) => i.id) })
    expect(p.system).toContain('between 30 and 50 words')
    expect(p.system).toMatch(/Never invent/)
    expect(p.user).toContain(slot.items[0].text)
    expect(p.user).not.toContain('hiking')
    expect(p.user).toContain('- Your starter is not lazy.')
  })
  it('is pure: same input, same output; empty slot says so', () => {
    const slot = { beat: 'hook' as const, items: [] }
    const a = buildBeatPrompt({ slot, angle: 'x angle', topic: 'y topic' })
    expect(a).toEqual(buildBeatPrompt({ slot, angle: 'x angle', topic: 'y topic' }))
    expect(a.user).toContain('(none: write only from the angle')
    expect(a.itemIds).toEqual([])
  })
  it('offer appears only for the CTA beat', () => {
    const cta = buildBeatPrompt({ slot: m.beats.find((b) => b.beat === 'cta')!, angle: 'a', topic: 't', offer: 'Free card' })
    const hook = buildBeatPrompt({ slot: m.beats.find((b) => b.beat === 'hook')!, angle: 'a', topic: 't', offer: 'Free card' })
    expect(cta.user).toContain('OFFER: Free card')
    expect(hook.user).not.toContain('OFFER')
  })
})

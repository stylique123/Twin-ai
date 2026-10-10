import { describe, it, expect } from 'vitest'
import { needCheck, itemFromProductFact } from '../itemFormat'

// Fictional fixture: Maya's Coffee, a physical product.
const base = {
  voiceCard: true, exemplars: 4, storyIds: [] as string[], kind: 'PHYSICAL_PRODUCT',
  productItems: [], nicheFindings: 0, pillars: [] as string[], pillarMatched: false, urgencyFact: false,
}

describe('needCheck (plan 1.5, Need Check format)', () => {
  it('asks for the story first, then the product slot, then the profile', () => {
    const nc = needCheck(base)
    expect(nc.layers.catalyst.status).toBe('none')
    expect(nc.layers.product.status).toBe('missing')
    expect(nc.layers.pillar.status).toBe('unknown')
    expect(nc.decision).toBe('ask')
    expect(nc.ask).toEqual(['catalyst', 'product_slot', 'profile'])
  })
  it('picks a stored story when everything else is there', () => {
    const items = [
      itemFromProductFact({ field: 'description', value: 'A small-batch coffee bag', trust: 'usable' }, 'p1'),
      itemFromProductFact({ field: 'object_shape', value: 'bag', trust: 'usable' }, 'p1'),
    ]
    const nc = needCheck({ ...base, storyIds: ['s1'], productItems: items, pillars: ['coffee'], pillarMatched: true, urgencyFact: true })
    expect(nc.layers.product).toEqual({ status: 'complete', missing: [] })
    expect(nc.layers.urgency.status).toBe('live_fact')
    expect(nc.decision).toBe('pick')
    expect(nc.ask).toEqual([])
  })
  it('a thin persona and an outside pillar are reported', () => {
    const nc = needCheck({ ...base, voiceCard: false, pillars: ['tea'] })
    expect(nc.layers.persona.status).toBe('thin')
    expect(nc.layers.pillar.status).toBe('outside')
  })
})

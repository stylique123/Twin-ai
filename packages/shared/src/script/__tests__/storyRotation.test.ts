// Item 32: one stored story reached 8 consecutive scripts (production
// creator_knowledge.used_count = 8, 2026-09-22), once on an unrelated product.
import { describe, expect, it } from 'vitest'
import { gateStories, recentSupplyCounts, contentTerms } from '../storyRotation'

const SNAP = { id: 'snap', kind: 'experience', text: "I bought a bulk roll of snap fasteners without checking they'd hold on my fabric" }
const PEONY = { id: 'peony', kind: 'experience', text: 'A bride ordered 50 peony candles for her wedding' }
const CLAIM = { id: 'claim', kind: 'claim', text: 'Cheap hardware fails within a year' }

describe('gateStories', () => {
  it('never attaches a story to a product it is not about', () => {
    const r = gateStories([PEONY, SNAP, CLAIM], { productText: 'Scrunchie dog bandana, soft breathable fabric' })
    expect(r.kept.map((k) => k.id)).toEqual(['snap', 'claim'])
    expect(r.offProduct.map((k) => k.id)).toEqual(['peony'])
  })

  it('does not apply the product rule when the video is not product-led', () => {
    const r = gateStories([PEONY, SNAP], { productText: null })
    expect(r.kept).toHaveLength(2)
  })

  it('rests a story supplied in 2 of the last 5 generations, and only stories', () => {
    const ledger = [
      ...['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'].map((g, i) => ({ knowledge_id: 'snap', generation_id: g, used_at: `2026-09-2${i}T00:00:00Z` })),
      ...['g6', 'g7'].map((g) => ({ knowledge_id: 'claim', generation_id: g, used_at: '2026-09-27T00:00:00Z' })),
    ]
    const recent = recentSupplyCounts(ledger)
    expect(recent.get('snap')).toBe(5)
    const r = gateStories([SNAP, CLAIM, PEONY], { recent })
    expect(r.resting.map((k) => k.id)).toEqual(['snap'])
    expect(r.kept.map((k) => k.id)).toEqual(['claim', 'peony'])
  })

  it('a story used once recently is still supplied (rotation, not a ban)', () => {
    const recent = recentSupplyCounts([{ knowledge_id: 'snap', generation_id: 'g1', used_at: '2026-09-22T00:00:00Z' }])
    expect(gateStories([SNAP], { recent }).kept).toHaveLength(1)
  })

  it('only the last five generations count', () => {
    const ledger = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((g, i) => ({
      knowledge_id: i < 2 ? 'old' : 'x', generation_id: g, used_at: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
    }))
    expect(recentSupplyCounts(ledger).get('old')).toBeUndefined()
  })

  it('folds plurals so candles meets candle', () => {
    expect(contentTerms('candles').has('candle')).toBe(true)
  })
})

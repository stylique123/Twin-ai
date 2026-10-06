// Item 32: one stored story reached 8 consecutive scripts (production
// creator_knowledge.used_count = 8, 2026-09-22), once on an unrelated product.
import { describe, expect, it } from 'vitest'
import { gateStories, recentSupplyCounts, contentTerms, lastSupplied, oneStory, storyTwins } from '../storyRotation'

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

describe('coffee report 1.1: sensitive, back-to-back, off-topic', () => {
  const move = { id: 'm', kind: 'experience', text: 'Code enforcement told us to stop roasting coffee at home, 26 days to move' }
  const batch = { id: 'b', kind: 'experience', text: 'A scorched coffee batch taught me to cup every roast' }
  const claim = { id: 'c', kind: 'claim', text: 'I had postpartum depression while starting the roastery' }
  it('withholds a sensitive item of any kind unless her words for this script raise it', () => {
    const g = gateStories([move, claim, batch], { topicText: 'why I cup every coffee roast', chosenText: 'why I cup every coffee roast' })
    expect(g.sensitive.map((x) => x.id)).toEqual(['m', 'c'])
    expect(g.kept.map((x) => x.id)).toEqual(['b'])
    const opted = gateStories([move], { topicText: 'the day code enforcement shut my home roasting down', chosenText: 'the day code enforcement shut my home roasting down' })
    expect(opted.kept.map((x) => x.id)).toEqual(['m'])
  })
  it('rests a story told in her last script', () => {
    const g = gateStories([batch], { last: new Set(['b']) })
    expect(g.resting.map((x) => x.id)).toEqual(['b'])
    expect(lastSupplied([
      { knowledge_id: 'x', generation_id: 'g1', used_at: '2026-09-01T00:00:00Z' },
      { knowledge_id: 'b', generation_id: 'g2', used_at: '2026-09-02T00:00:00Z' },
    ])).toEqual(new Set(['b']))
  })
  it('with no product, a story must match what the video is about; no topic, no story', () => {
    expect(gateStories([batch], { topicText: 'get people to try our subscription' }).offTopic.map((x) => x.id)).toEqual(['b'])
    expect(gateStories([batch], { topicText: '' }).offTopic.map((x) => x.id)).toEqual(['b'])
    expect(gateStories([batch], {}).kept.map((x) => x.id)).toEqual(['b'])
  })
})

describe('oneStory (owner 2026-10-05, blind set 2)', () => {
  const mom1 = { id: 'm1', kind: 'experience', text: 'Someone told me they could taste the difference between my roast and the grocery store bag their mom always bought' }
  const mom2 = { id: 'm2', kind: 'experience', text: 'Someone told me they could taste the difference between my roast and the grocery store bag their mom always bought' }
  const supplier = { id: 's1', kind: 'experience', text: 'I bought green beans from a new supplier without testing a sample and the lot was tossed' }
  const claim = { id: 'c1', kind: 'claim', text: 'Dark roasting burns off caffeine' }
  it('keeps one story and every non-story row', () => {
    const r = oneStory([mom1, supplier, claim])
    expect(r.rows.map((x) => x.id)).toEqual(['m1', 'c1'])
  })
  it('rests a story told twice recently, and its stored twin with it', () => {
    const r = oneStory([mom2, supplier, claim], { recent: new Map([['m1', 2]]), idsByText: storyTwins([mom1, mom2, supplier]) })
    expect(r.kept?.id).toBe('s1')
  })
  it('drops all stories when every one is resting', () => {
    const r = oneStory([mom1, supplier, claim], { last: new Set(['m1', 's1']) })
    expect(r.rows.map((x) => x.id)).toEqual(['c1'])
  })
})

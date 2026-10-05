import { describe, it, expect } from 'vitest'
import { relevantToAsk } from '../askRelevance.js'

const rows = [
  { text: 'DIY coffee bar built using reclaimed materials and thrifted backsplash tiles', source: 'caption' },
  { text: 'La Marzocco espresso machine', source: 'caption' },
  { text: 'Start small from home with a coffee cart and learn as you go', source: 'caption' },
  { text: 'Coffee roasted in small batches for fresh coffee', source: 'caption' },
  { text: 'My first coffee market was messy', source: 'caption' },
  { text: 'I love coffee mornings', source: 'asked' },
  ...['Coffee tasting notes explained', 'Coffee grinder settings', 'Coffee from Colombia', 'Coffee packaging day', 'Coffee shipping update', 'Coffee subscription'].map((text) => ({ text, source: 'caption' })),
]
const ask = 'Coffee Cart Launch Call: a 60-minute video call to plan your coffee cart equipment, menu, and first market'

describe('relevantToAsk (owner 2026-10-05: relevance by option and product)', () => {
  it('drops the coffee bar and the La Marzocco captions for a cart-call video', () => {
    const r = relevantToAsk(rows, ask, { exempt: (x) => x.source === 'asked' })
    expect(r.dropped.map((x) => x.text)).toEqual(expect.arrayContaining([rows[0]!.text, rows[1]!.text, rows[3]!.text]))
  })
  it('keeps rows that share a distinctive word, and never filters her answers', () => {
    const r = relevantToAsk(rows, ask, { exempt: (x) => x.source === 'asked' })
    expect(r.kept.map((x) => x.text)).toContain(rows[2]!.text)
    expect(r.kept.map((x) => x.text)).toContain(rows[4]!.text)
    expect(r.kept.map((x) => x.text)).toContain(rows[5]!.text)
  })
  it('keeps everything when the ask has no distinctive word', () => {
    expect(relevantToAsk(rows, 'coffee').dropped).toEqual([])
  })
})

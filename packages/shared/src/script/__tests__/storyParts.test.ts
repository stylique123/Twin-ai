import { describe, expect, it } from 'vitest'
import { extractPassages, isCompleteStory, storyParts } from '../passages'
import fixture from './fixtures/storyPassages.json'

// FICTIONAL fixture (Maya's Coffee). Labels are hand-written; nothing comes from a real account.
const rows = fixture.passages as { id: number; label: 'complete' | 'not_complete'; type: string; text: string }[]

describe('complete-story rule (item 3.1)', () => {
  it('meets precision >= 0.85 and recall >= 0.75 on the labeled fixture', () => {
    let tp = 0, fp = 0, fn = 0
    const misses: string[] = []
    for (const r of rows) {
      const pred = isCompleteStory(r.text)
      const gold = r.label === 'complete'
      if (pred && gold) tp++
      else if (pred) { fp++; misses.push(`FP #${r.id} ${r.type}`) }
      else if (gold) { fn++; misses.push(`FN #${r.id}`) }
    }
    const precision = tp / Math.max(1, tp + fp)
    const recall = tp / Math.max(1, tp + fn)
    console.log(`storyParts fixture: n=${rows.length} tp=${tp} fp=${fp} fn=${fn} precision=${precision.toFixed(2)} recall=${recall.toFixed(2)} ${misses.join(', ')}`)
    expect(rows.length).toBeGreaterThanOrEqual(24)
    expect(precision).toBeGreaterThanOrEqual(0.85)
    expect(recall).toBeGreaterThanOrEqual(0.75)
  })

  it('reports each part separately', () => {
    expect(storyParts('Last summer I started roasting a Guatemalan lot and sold it every week.')).toEqual({ anchor: true, turn: false, resolution: false })
    expect(storyParts('Two years ago I roasted for days. Then they cancelled the order.')).toEqual({ anchor: true, turn: true, resolution: false })
  })

  it('never calls advice, tips, products or hypotheticals complete', () => {
    for (const r of rows.filter((x) => ['advice', 'tips', 'hypothetical', 'product'].includes(x.type))) {
      expect(isCompleteStory(r.text), `#${r.id}`).toBe(false)
    }
  })

  it('extractPassages uses the same rule', () => {
    for (const r of rows) {
      const sents = r.text.split(/(?<=[.!?])\s+/)
      const out = extractPassages(sents.map((t, i) => ({ start: i * 3, end: i * 3 + 3, text: t })))
      if (out.skipped) continue
      expect(out.passages.some((p) => p.complete), `#${r.id}`).toBe(r.label === 'complete')
    }
  })
})

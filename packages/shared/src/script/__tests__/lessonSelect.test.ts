import { describe, expect, it } from 'vitest'
import { selectLessons, isHumanLessonSource, lessonJaccard } from '../lessonSelect'

// Fictional account: Maya's Coffee, a small home roaster.
const NOW = Date.parse('2026-10-07T00:00:00Z')
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString()
let i = 0
const L = (source: string, text: string, extra: Record<string, unknown> = {}) =>
  ({ id: `l${++i}`, kind: 'style', source, text, weight: 1, created_at: day(1), ...extra })

describe('selectLessons', () => {
  it('drops rows flagged synthetic', () => {
    const r = selectLessons([L('rating', 'Show the roast date on the bag', { synthetic: true }), L('rating', 'Keep it under thirty seconds')], { now: NOW })
    expect(r.lessons.map((l) => l.text)).toEqual(['Keep it under thirty seconds'])
    expect(r.report.dropped.synthetic).toBe(1)
  })

  it('drops rows whose source_ref or source_id starts with batch:', () => {
    const r = selectLessons([
      L('angle_pick', 'Lead with the cupping moment', { source_ref: 'batch:part-12' }),
      L('audience', 'Open on the grinder sound', { source_id: 'batch:abc' }),
      L('rating', 'Mention the single origin by name'),
    ], { now: NOW })
    expect(r.lessons).toHaveLength(1)
    expect(r.report.dropped.synthetic).toBe(2)
  })

  it('ranks human sources above audience even when audience is heavier', () => {
    const r = selectLessons([
      L('audience', 'Viewers want the price early', { weight: 9 }),
      L('rating_tag', 'Keep it shorter: fewer scenes'),
      L('angle_pick', 'She picks the behind-the-counter angle', { created_at: day(2) }),
    ], { now: NOW })
    expect(r.lessons.map((l) => l.source)).toEqual(['rating_tag', 'angle_pick', 'audience'])
  })

  it('caps audience lessons to capAudience and counts the rest as cap', () => {
    const rows = Array.from({ length: 12 }, (_, k) => L('audience', `flagged gap w${k}a w${k}b w${k}c`))
    const r = selectLessons([...rows, L('rating', 'Say where the beans come from')], { now: NOW, capAudience: 5 })
    expect(r.lessons.filter((l) => l.source === 'audience')).toHaveLength(5)
    expect(r.report.dropped.cap).toBe(7)
    expect(r.report.out_by_source).toEqual({ rating: 1, audience: 5 })
  })

  it('defaults capAudience to 5', () => {
    const rows = Array.from({ length: 8 }, (_, k) => L('audience', `alpha${k} beta${k} gamma${k}`))
    expect(selectLessons(rows, { now: NOW }).lessons).toHaveLength(5)
  })

  it('merges near-duplicates (Jaccard >= 0.8) keeping the newest', () => {
    const old = L('rating', 'Keep the hook short and about the roast', { created_at: day(10) })
    const fresh = L('rating', 'keep the hook short, and about the roast!', { created_at: day(2) })
    const r = selectLessons([old, fresh], { now: NOW })
    expect(r.lessons).toEqual([fresh])
    expect(r.report.dropped.dup).toBe(1)
    expect(lessonJaccard('a b c d e', 'a b c d f')).toBeLessThan(0.8)
  })

  it('expires machine lessons older than 90 days but keeps old human ones', () => {
    const r = selectLessons([
      L('audience', 'Viewers liked the pour shot', { created_at: day(120) }),
      L('rating', 'Never call the blend artisanal', { created_at: day(400) }),
    ], { now: NOW })
    expect(r.lessons.map((l) => l.source)).toEqual(['rating'])
    expect(r.report.dropped.expired).toBe(1)
  })

  it('AI-rater/judge scores are never a human source', () => {
    for (const s of ['judge', 'ai_rater', 'ai_judge', 'audience', 'persona', '', null, undefined]) expect(isHumanLessonSource(s)).toBe(false)
    const r = selectLessons([
      L('judge', 'Judge says lead with the price', { weight: 10 }),
      L('ai_rater', 'Rater says more energy', { weight: 10 }),
      L('rating', 'Show her hands on the scale'),
    ], { now: NOW, capAudience: 1 })
    expect(r.lessons[0].source).toBe('rating')
    expect(r.lessons).toHaveLength(2)
    expect(r.report.dropped.cap).toBe(1)
  })

  it('respects max and reports in_by_source on the input', () => {
    const r = selectLessons([L('rating', 'one alpha'), L('edit', 'two beta'), L('hook_pick', 'three gamma'), L('audience', 'four delta')], { now: NOW, max: 2 })
    expect(r.lessons).toHaveLength(2)
    expect(r.report.in_by_source).toEqual({ rating: 1, edit: 1, hook_pick: 1, audience: 1 })
    expect(r.report.dropped.cap).toBe(2)
  })

  it('tolerates rows with no synthetic column and no dates', () => {
    const r = selectLessons([{ text: 'Name the farm in the close', source: 'rating' }], { now: NOW })
    expect(r.lessons).toHaveLength(1)
  })
})

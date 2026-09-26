import { describe, expect, it } from 'vitest'
import { normalizeAudience, normalizePanel, scriptFromBlueprint, audiencePrompt } from '../nicheBrain/audienceParse.js'

const s = { hooks: ['Hook A', 'Hook B', 'Hook C'], lines: ['line 0', 'line 1', 'line 2'], concept: 'mug' }
const v = (stops_for: number, leaves_at = -1, question: string | null = null) =>
  ({ who: 'Gift buyer', quote: 'I would save this.', stops_for, leaves_at, question })

describe('test viewers', () => {
  it('reads hooks and lines from a blueprint', () => {
    expect(scriptFromBlueprint({ hook_options: ['a', ' ', 'b'], script: [{ line: 'x' }, {}] }))
      .toEqual({ hooks: ['a', 'b'], lines: ['x'], concept: null })
    expect(scriptFromBlueprint({ hook_options: [], script: [{ line: 'x' }] })).toBeNull()
  })

  it('recounts hook votes from the viewers, never trusting a stated number', () => {
    const r = normalizeAudience({ viewers: [v(1), v(1), v(0), v(-1)], fixes: [], summary: 'ok', stopped: 99 }, s)!
    expect(r.hooks.map((h) => h.stopped)).toEqual([1, 2, 0])
    expect(r.best_hook).toBe(1)
  })

  it('clamps out-of-range indexes and drops a panel that is too small', () => {
    const r = normalizeAudience({ viewers: [v(7, 40), v(0), v(0)], fixes: [], summary: '' }, s)!
    expect(r.viewers[0].stops_for).toBe(-1)
    expect(r.viewers[0].leaves_at).toBe(-1)
    expect(normalizeAudience({ viewers: [v(0)], fixes: [] }, s)).toBeNull()
  })

  it('keeps only known issues and backs each fix with a real count', () => {
    const r = normalizeAudience({
      viewers: [v(0, 1), v(0, 1), v(0, -1, 'Is it dishwasher safe?')],
      fixes: [{ issue: 'slow_start', fix: 'Cut line 1.', beat: 1 }, { issue: 'made_up', fix: 'x', beat: 0 },
        { issue: 'unanswered_question', fix: 'Say if it is dishwasher safe, if true.', beat: -1 }],
      summary: 's',
    }, s)!
    expect(r.fixes.map((f) => [f.issue, f.count])).toEqual([['slow_start', 2], ['unanswered_question', 1]])
  })

  it('no winner when nobody stops', () => {
    expect(normalizeAudience({ viewers: [v(-1), v(-1), v(-1)], fixes: [] }, s)!.best_hook).toBeNull()
  })

  it('prompt carries product facts and numbered lines', () => {
    const p = audiencePrompt(s, { dna: { niche: 'ceramics' }, product: '{"name":"Mug"}', objections: ['price?'], lessons: [] })
    expect(p).toContain('PRODUCT FACTS')
    expect(p).toContain('1. Hook B')
    expect(p).toContain('2. line 2')
  })

  it('panel keeps only complete personas, max 10', () => {
    const good = { who: 'Gift buyer', about: 'Buys for mum', stops_for: 'glaze close-ups', scrolls_when: 'long intros', asks: null }
    const out = normalizePanel({ personas: [good, { who: 'x' }, ...Array(12).fill(good)] })
    expect(out.length).toBe(10)
    expect(out.every((p) => p.about && p.stops_for)).toBe(true)
  })

  it('prompt tells the model to play her panel when one exists', () => {
    const panel = [{ who: 'Price sceptic', about: 'a', stops_for: 'b', scrolls_when: 'c', asks: 'how much?' }]
    const p = audiencePrompt(s, { dna: {}, objections: [], lessons: [], panel })
    expect(p).toContain('HER PANEL')
    expect(p).toContain('0. Price sceptic')
  })
})

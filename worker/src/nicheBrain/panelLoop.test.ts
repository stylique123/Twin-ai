import { describe, it, expect } from 'vitest'
import { normalizeAudience, normalizePanel, applyLineRewrites, cleanNewHooks, HOOKS_SHOWN, MAX_TESTED_HOOKS, VIDEO_FAMILIES, audiencePrompt } from './audienceParse.js'

const s = { hooks: ['a hook'], lines: ['line zero', 'we roast in small batches', 'link in bio'] }
const viewer = (i: number, fits = true) => ({ who: `v${i}`, would_stop: [0], stops_for: 0, leaves_at: -1, quote: 'ok', fits })

describe('persona panel audit 2026-10-01', () => {
  it('viewers who would not watch this kind of video are left out of the score', () => {
    const r = normalizeAudience({ viewers: [...Array.from({ length: 7 }, (_, i) => viewer(i)), viewer(7, false), viewer(8, false)], fixes: [], summary: 's' }, s)!
    expect(r.viewers).toHaveLength(7)
    expect(r.out_of_scope).toBe(2)
  })
  it('keeps everyone when too few would fit, so the score still means something', () => {
    const r = normalizeAudience({ viewers: [...Array.from({ length: 4 }, (_, i) => viewer(i)), ...Array.from({ length: 5 }, (_, i) => viewer(9 + i, false))], fixes: [], summary: 's' }, s)!
    expect(r.out_of_scope).toBe(0)
    expect(r.viewers).toHaveLength(9)
  })
  it('reads what works, what only she can answer, and what her facts do not back', () => {
    const r = normalizeAudience({
      viewers: Array.from({ length: 6 }, (_, i) => viewer(i)), fixes: [], summary: 's',
      working: [{ what: 'The batch line', why: 'it is concrete', beat: 1 }],
      needs_her: [{ question: 'How many pounds do you roast at a time?', why: 'viewers asked', beat: 1 }, { question: 'not a question', why: 'x', beat: 0 }],
      unverified: ['scorching 230°C', 'scorching 230°C'],
    }, s)!
    expect(r.working).toHaveLength(1)
    expect(r.needs_her.map((q) => q.question)).toEqual(['How many pounds do you roast at a time?'])
    expect(r.unverified).toEqual(['scorching 230°C'])
  })
  it('caps hooks: 5 shown, 9 tested, 2 per rewrite round', () => {
    expect(HOOKS_SHOWN).toBe(5)
    expect(MAX_TESTED_HOOKS).toBe(9)
    expect(cleanNewHooks({ hooks: ['one new', 'two new', 'three new'] }, [])).toHaveLength(2)
  })
  it("her answer's numbers may enter the line; no other new number may", () => {
    const raw = { lines: [{ index: 1, text: 'we roast 5 pounds at a time' }] }
    expect(applyLineRewrites(s.lines, raw)).toBeNull()
    expect(applyLineRewrites(s.lines, raw, 'About 5 pounds a batch')?.changed).toEqual([1])
  })
  it('personas carry a kind and the kinds of her videos they watch', () => {
    const p = normalizePanel({ personas: [{ who: 'Gift buyer', about: 'a', stops_for: 'b', scrolls_when: 'c', kind: 'buyer', watches: ['product', 'nonsense', 'product'] }] })
    expect(p[0]).toMatchObject({ kind: 'buyer', watches: ['product'] })
    expect([...VIDEO_FAMILIES]).toContain('coach_expert')
  })
  it('the test prompt carries the video type, its shape and her verified facts', () => {
    const t = audiencePrompt(s, { dna: {}, objections: [], lessons: [], family: 'product', shape: 'show it', facts: ['She roasts on a 1kg drum'] })
    expect(t).toContain('VIDEO TYPE: product')
    expect(t).toContain('She roasts on a 1kg drum')
  })
})

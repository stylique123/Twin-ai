import { describe, it, expect } from 'vitest'
import { hookVerdicts, sameIdea, type Test } from './TestViewers'

const test = (hooks: Array<[string, number]>, best: number): Test => ({
  status: 'done', panel_size: 10, hooks: hooks.map(([hook, stopped]) => ({ hook, stopped })), best_hook: best,
  viewers: [{ who: 'a', quote: 'q', stops_for: 0, leaves_at: -1, question: null }], fixes: [], summary: null, panel_voice_id: null,
})

describe('the recommended hook is the one viewers stopped for', () => {
  it('never the first option by position (live: #1 scored 0, #4 scored 6)', () => {
    const opts = ['Dark roast coffee does not have more caffeine.', 'Your grocery store dark roast is lying to you.']
    const v = hookVerdicts(opts, test([[opts[0], 0], [opts[1], 6]], 1))!
    expect(v.best).toBe(opts[1])
    expect(v.stopped.get(opts[0])).toBe(0)
  })
  it('hides the weaker of two hooks saying the same thing', () => {
    const a = 'I had to toss an entire batch because I skipped testing.'
    const b = 'I tossed an entire batch because I skipped testing first.'
    expect(sameIdea(a, b)).toBe(true)
    const v = hookVerdicts([a, b], test([[a, 4], [b, 1]], 0))!
    expect(v.hidden.has(b)).toBe(true)
    expect(v.hidden.has(a)).toBe(false)
  })
  it('shows nothing before the test is in', () => {
    expect(hookVerdicts(['x'], null)).toBeNull()
  })
})

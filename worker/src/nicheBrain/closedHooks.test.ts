import { describe, it, expect } from 'vitest'
import { normalizeAudience, orderHooksBestFirst } from './audienceParse.js'

describe('a hook that answers its own question is demoted (owner brief 2026-10-01)', () => {
  it('reads closed_hooks and ranks a closed hook below an open one with similar stops', () => {
    const s = { hooks: ['A belly band will not heal your core.', 'Why your belly band is not fixing your core.'], lines: ['a', 'b'] }
    const viewers = Array.from({ length: 5 }, (_, i) => ({ who: `v${i}`, would_stop: i < 4 ? [0, 1] : [0], stops_for: 0, leaves_at: -1, quote: 'ok' }))
    const r = normalizeAudience({ viewers, fixes: [], summary: 's', closed_hooks: [0, 9] }, s)!
    expect(r.hooks.map((h) => h.closed)).toEqual([true, false])
    expect(orderHooksBestFirst(r.hooks)[0]).toBe(s.hooks[1])
  })
  it('a much stronger closed hook still wins', () => {
    expect(orderHooksBestFirst([{ hook: 'closed', stopped: 9, closed: true }, { hook: 'open', stopped: 3 }])[0]).toBe('closed')
  })
})

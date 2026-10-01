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

describe('the video keeps its hook promise (owner brief 2026-10-01, 1.6)', () => {
  const s = { hooks: ['h'], lines: ['a', 'b'] }
  const viewers = Array.from({ length: 4 }, (_, i) => ({ who: `v${i}`, would_stop: [0], stops_for: 0, leaves_at: -1, quote: 'ok' }))
  it('reads promise_kept, null when not judged', () => {
    expect(normalizeAudience({ viewers, fixes: [], summary: 's', promise_kept: false }, s)!.promise_kept).toBe(false)
    expect(normalizeAudience({ viewers, fixes: [], summary: 's' }, s)!.promise_kept).toBeNull()
  })
  it('a rewrite that closes the promise wins when nobody more leaves; one that breaks it never wins', async () => {
    const { betterVersion } = await import('./audienceParse.js')
    const base = normalizeAudience({ viewers, fixes: [], summary: 's', promise_kept: false }, s)!
    expect(betterVersion(base, { ...base, promise_kept: true })).toBe(true)
    const kept = { ...base, promise_kept: true }
    const moreWatch = { ...base, promise_kept: false, viewers: base.viewers }
    expect(betterVersion(kept, moreWatch)).toBe(false)
  })
})

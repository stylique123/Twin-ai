import { describe, expect, it } from 'vitest'
import { cleanNewHooks, normalizeAudience } from './audienceParse'

const s = { hooks: ['a', 'b', 'c'], lines: ['x', 'y'] }
const viewer = (n: number, would: number[], fav: number) => ({ who: `v${n}`, quote: 'q', stops_for: fav, would_stop: would, leaves_at: -1 })

describe('hook scoring', () => {
  it('counts every hook a viewer would stop for, not only the favourite', () => {
    const r = normalizeAudience({ viewers: [0, 1, 2, 3].map((n) => viewer(n, [0, 1], 0)) }, s)!
    expect(r.hooks.map((h) => h.stopped)).toEqual([4, 4, 0])
    expect(r.best_hook).toBe(0)
  })
  it('still counts the favourite when would_stop is missing, and drops bad indexes', () => {
    const r = normalizeAudience({ viewers: [0, 1, 2].map((n) => ({ ...viewer(n, [9, -1], 2), would_stop: n ? [9] : undefined })) }, s)!
    expect(r.hooks[2].stopped).toBe(3)
    expect(r.viewers[0].would_stop).toEqual([])
  })
})

describe('cleanNewHooks', () => {
  it('drops duplicates of old hooks, empties and overlong lines, keeps at most 3', () => {
    const long = Array(20).fill('w').join(' ')
    expect(cleanNewHooks({ hooks: ['A', ' new  one ', '', long, 'two', 'three', 'four'] }, ['a'])).toEqual(['new one', 'two', 'three'])
    expect(cleanNewHooks(null, [])).toEqual([])
  })
})

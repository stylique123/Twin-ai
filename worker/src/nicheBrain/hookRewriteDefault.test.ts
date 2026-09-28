// ROUND 2, PART 5 — PERMANENT. "Twin rewrote 3 hooks and re-tested: best hook
// 6 → 7 of 10 stopped", and for the first time the script's hook WAS the top
// scorer. This pins that on every generation, not just that one.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { orderHooksBestFirst, defaultHookAfterTest } from './audienceParse.js'

const AUDIENCE = readFileSync(resolve(__dirname, 'audience.ts'), 'utf8')

describe('the default hook is the best-scoring hook after the rewrite step', () => {
  const tested = [
    { hook: 'old recommended', stopped: 6 },
    { hook: 'rewrite one', stopped: 7 },
    { hook: 'rewrite two', stopped: 4 },
    { hook: 'dud', stopped: 0 },
  ]

  it('orders best-first and defaults to the top scorer', () => {
    const ordered = orderHooksBestFirst(tested)
    const best = [...tested].sort((a, b) => b.stopped - a.stopped)[0].hook
    expect(ordered[0]).toBe(best)
    expect(defaultHookAfterTest(ordered, null)).toBe(best)
  })

  it('drops a hook that stopped nobody when three did better', () => {
    expect(orderHooksBestFirst(tested)).not.toContain('dud')
  })

  it("her own pick always wins", () => {
    expect(defaultHookAfterTest(orderHooksBestFirst(tested), 'rewrite two')).toBe('rewrite two')
  })

  it('is what the worker actually writes, after the rewrite loop', () => {
    expect(AUDIENCE).toMatch(/const ordered = orderHooksBestFirst\(r\.hooks\)/)
    expect(AUDIENCE).toMatch(/selected_hook: want/)
    expect(AUDIENCE).toMatch(/HOOK_TARGET/)
  })
})

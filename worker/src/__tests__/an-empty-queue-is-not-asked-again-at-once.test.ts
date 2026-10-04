import { describe, it, expect } from 'vitest'
import { createIdleBackoff, createEmptyProbeGate } from '../idleBackoff.js'

describe('idle claim backoff', () => {
  it('doubles from the floor to the ceiling while idle', () => {
    const b = createIdleBackoff(1000, 30_000)
    const seen = Array.from({ length: 8 }, () => b.idle())
    expect(seen).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000])
  })

  it('snaps back to the floor the moment work is found', () => {
    const b = createIdleBackoff(3000, 30_000)
    b.idle(); b.idle(); b.idle()
    b.reset()
    expect(b.idle()).toBe(3000)
  })

  it('never returns a non-positive delay or exceeds the ceiling', () => {
    const b = createIdleBackoff(0, 5)
    for (let i = 0; i < 20; i++) {
      const d = b.idle()
      expect(d).toBeGreaterThan(0)
      expect(d).toBeLessThanOrEqual(5)
    }
  })
})

describe('empty-probe gate', () => {
  it('is due at first, then backs off on each empty answer, and resets on a hit', () => {
    const g = createEmptyProbeGate(15_000, 300_000)
    expect(g.due(0)).toBe(true)
    g.empty(0)
    expect(g.due(14_999)).toBe(false)
    expect(g.due(15_000)).toBe(true)
    g.empty(15_000) // next wait 30s
    expect(g.due(44_999)).toBe(false)
    expect(g.due(45_000)).toBe(true)
    g.found()
    expect(g.due(45_000)).toBe(true)
    g.empty(45_000)
    expect(g.due(60_000)).toBe(true) // back to the 15s floor
  })

  it('caps the wait at the ceiling', () => {
    const g = createEmptyProbeGate(15_000, 300_000)
    let t = 0
    for (let i = 0; i < 20; i++) { g.empty(t); t += 300_000 }
    g.empty(t)
    expect(g.due(t + 300_000)).toBe(true)
  })
})

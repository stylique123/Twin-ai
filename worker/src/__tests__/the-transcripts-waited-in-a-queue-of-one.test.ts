// THE BOUND IS THE WHOLE SAFETY ARGUMENT, SO IT IS THE THING MOST TESTED.
//
// ⚠️ MEASURED: `build_voice`'s serial transcription loop is what the creator
// waits on. p50 279s, p90 522s, max 952s — and 952 is the free TikTok budget of
// 25 videos run one at a time at ~38s each.
//
// ⚠️ AND THE FAILURE MODE OF FIXING IT BADLY IS ALREADY ON RECORD. `SWEEP_BATCH`
// was 25, it flooded the single worker loop, and a live creator's own asset was
// starved behind it. So the two properties that matter are that the work really
// does overlap AND that it never exceeds the bound.
import { describe, it, expect } from 'vitest'
import { mapWithConcurrency, TRANSCRIBE_CONCURRENCY } from '../boundedMap'

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

describe('the bound is respected', () => {
  it('never runs more than `limit` at once', async () => {
    let inFlight = 0
    let peak = 0
    await mapWithConcurrency(Array.from({ length: 25 }, (_, i) => i), 3, async (n) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await tick(1)
      inFlight -= 1
      return n
    })
    expect(peak).toBe(3)
  })

  it('and it really does overlap — a serial run would peak at 1', async () => {
    let peak = 0
    let inFlight = 0
    await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => {
      inFlight += 1; peak = Math.max(peak, inFlight)
      await tick(1)
      inFlight -= 1
      return n
    })
    // ⚠️ REFUSES A VACUOUS PASS. If the implementation were still serial every
    // assertion above about ordering would still hold, so the OVERLAP must be
    // asserted directly.
    expect(peak).toBeGreaterThan(1)
  })

  it('a limit wider than the list does not over-spawn', async () => {
    let peak = 0
    let inFlight = 0
    await mapWithConcurrency([1, 2], 10, async (n) => {
      inFlight += 1; peak = Math.max(peak, inFlight)
      await tick(1)
      inFlight -= 1
      return n
    })
    expect(peak).toBe(2)
  })

  it('a nonsense limit becomes 1, never zero work', async () => {
    for (const bad of [0, -5, NaN, Infinity, 0.4]) {
      const seen: number[] = []
      const out = await mapWithConcurrency([1, 2, 3], bad, async (n) => { seen.push(n); return n * 2 })
      expect(out, `limit ${bad} dropped work`).toEqual([2, 4, 6])
      expect(seen.length).toBe(3)
    }
  })

  it('the shipped bound is a real overlap and a deliberate one', () => {
    expect(TRANSCRIBE_CONCURRENCY).toBeGreaterThan(1)
    // ⚠️ THE CEILING IS THE POINT. The free budget is 25 and the paid one 10;
    // a bound at or above either is the SWEEP_BATCH mistake again.
    expect(TRANSCRIBE_CONCURRENCY).toBeLessThan(10)
  })
})

describe('order is a guarantee, because the model reads it', () => {
  it('returns results in INPUT order even when later items finish first', async () => {
    // The first item is the slowest, so a push-as-they-land implementation
    // would return it last.
    const delays = [30, 1, 1, 1, 1, 1]
    const out = await mapWithConcurrency(delays, 3, async (ms, i) => { await tick(ms); return i })
    expect(out).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('passes the correct index alongside each item', async () => {
    const out = await mapWithConcurrency(['a', 'b', 'c'], 2, async (s, i) => `${i}:${s}`)
    expect(out).toEqual(['0:a', '1:b', '2:c'])
  })

  it('an empty list is no work and no throw', async () => {
    let called = 0
    expect(await mapWithConcurrency([], 3, async () => { called += 1; return 1 })).toEqual([])
    expect(called).toBe(0)
  })

  it('every item runs exactly once', async () => {
    const counts = new Map<number, number>()
    await mapWithConcurrency(Array.from({ length: 25 }, (_, i) => i), 3, async (n) => {
      counts.set(n, (counts.get(n) ?? 0) + 1)
      await tick(1)
      return n
    })
    expect(counts.size).toBe(25)
    for (const [n, c] of counts) expect(c, `item ${n} ran ${c} times`).toBe(1)
  })
})

describe('what it deliberately does not do', () => {
  it('propagates a throw rather than swallowing it', async () => {
    // ⚠️ DOCUMENTED, NOT ACCIDENTAL. A helper that swallowed errors would hide
    // exactly the failures `routes` exists to count. The CALLER keeps its
    // per-item try/catch, and `voice.ts` is tested for that separately.
    await expect(mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom')
      return n
    })).rejects.toThrow('boom')
  })
})

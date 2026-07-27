// Interval algebra — laws, worked examples, and randomized property tests with
// FIXED RECORDED SEEDS (Gate-0 §8).
//
// The seeds are literals in this file. A property test with a fresh random seed
// per run is a test that reports a different thing every day and cannot be
// bisected; a recorded seed makes every failure reproducible from the failure
// message alone.
import { describe, it, expect } from 'vitest'
import {
  normalizeIntervals, unionIntervals, intersectIntervals, subtractIntervals,
  totalDurationMs, type Interval,
} from '../jobs/editorCompile.js'

// ---- a tiny deterministic PRNG (mulberry32) --------------------------------
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const RECORDED_SEEDS = [0x5eed0001, 0x5eed0002, 0x0badc0de, 0x1337beef, 0x00c0ffee] as const
const HORIZON_MS = 4000

function randomList(next: () => number, count: number): Interval[] {
  const out: Interval[] = []
  for (let i = 0; i < count; i++) {
    const startMs = Math.floor(next() * HORIZON_MS)
    const len = Math.floor(next() * 200)
    out.push({ startMs, endMs: startMs + len })
  }
  return out
}

// The three laws every operator's output must satisfy.
function expectNormalized(list: Interval[]): void {
  for (const iv of list) {
    expect(Number.isInteger(iv.startMs)).toBe(true)
    expect(Number.isInteger(iv.endMs)).toBe(true)
    expect(iv.endMs).toBeGreaterThan(iv.startMs)
  }
  for (let i = 1; i < list.length; i++) {
    // Strictly disjoint AND non-touching: touching intervals are merged, so a
    // gap of zero can never appear in a normalized list.
    expect(list[i].startMs).toBeGreaterThan(list[i - 1].endMs)
  }
}

// The membership oracle: a brute-force millisecond-set model of each operator.
// The algebra is checked against SET SEMANTICS, not against itself.
function toSet(list: Interval[]): Set<number> {
  const s = new Set<number>()
  for (const iv of list) for (let t = iv.startMs; t < iv.endMs; t++) s.add(t)
  return s
}

describe('interval algebra — laws', () => {
  it('normalize sorts, drops empties, and merges overlapping and touching runs', () => {
    const out = normalizeIntervals([
      { startMs: 30, endMs: 40 }, { startMs: 0, endMs: 10 }, { startMs: 10, endMs: 20 },
      { startMs: 100, endMs: 100 }, { startMs: 35, endMs: 50 },
    ])
    expect(out).toEqual([{ startMs: 0, endMs: 20 }, { startMs: 30, endMs: 50 }])
    expectNormalized(out)
  })

  it('normalize is idempotent', () => {
    const once = normalizeIntervals([{ startMs: 5, endMs: 9 }, { startMs: 7, endMs: 12 }])
    expect(normalizeIntervals(once)).toEqual(once)
  })

  it('rejects non-integer bounds rather than rounding them', () => {
    expect(() => normalizeIntervals([{ startMs: 0.5, endMs: 3 }])).toThrow(/integer milliseconds/)
  })

  it('subtract removes exactly the overlap and keeps the rest', () => {
    const out = subtractIntervals([{ startMs: 0, endMs: 100 }], [{ startMs: 30, endMs: 40 }])
    expect(out).toEqual([{ startMs: 0, endMs: 30 }, { startMs: 40, endMs: 100 }])
  })

  it('subtract can empty an interval completely', () => {
    expect(subtractIntervals([{ startMs: 10, endMs: 20 }], [{ startMs: 0, endMs: 100 }])).toEqual([])
  })

  it('subtract handles many holes in one interval', () => {
    const out = subtractIntervals([{ startMs: 0, endMs: 100 }],
      [{ startMs: 10, endMs: 20 }, { startMs: 30, endMs: 40 }, { startMs: 90, endMs: 200 }])
    expect(out).toEqual([
      { startMs: 0, endMs: 10 }, { startMs: 20, endMs: 30 }, { startMs: 40, endMs: 90 },
    ])
  })

  it('intersect of disjoint lists is empty', () => {
    expect(intersectIntervals([{ startMs: 0, endMs: 10 }], [{ startMs: 10, endMs: 20 }])).toEqual([])
  })

  it('intersect keeps only shared milliseconds', () => {
    const out = intersectIntervals(
      [{ startMs: 0, endMs: 50 }, { startMs: 60, endMs: 100 }],
      [{ startMs: 40, endMs: 70 }],
    )
    expect(out).toEqual([{ startMs: 40, endMs: 50 }, { startMs: 60, endMs: 70 }])
  })
})

describe('interval algebra — properties over recorded seeds', () => {
  for (const seed of RECORDED_SEEDS) {
    it(`seed 0x${seed.toString(16)}: every operator returns a normalized list`, () => {
      const next = rng(seed)
      for (let trial = 0; trial < 60; trial++) {
        const a = randomList(next, 1 + Math.floor(next() * 8))
        const b = randomList(next, 1 + Math.floor(next() * 8))
        expectNormalized(normalizeIntervals(a))
        expectNormalized(unionIntervals(a, b))
        expectNormalized(intersectIntervals(a, b))
        expectNormalized(subtractIntervals(a, b))
      }
    })

    it(`seed 0x${seed.toString(16)}: operators agree with millisecond set semantics`, () => {
      const next = rng(seed)
      for (let trial = 0; trial < 60; trial++) {
        const a = randomList(next, 1 + Math.floor(next() * 6))
        const b = randomList(next, 1 + Math.floor(next() * 6))
        const A = toSet(a)
        const B = toSet(b)
        const union = new Set([...A, ...B])
        const inter = new Set([...A].filter((t) => B.has(t)))
        const diff = new Set([...A].filter((t) => !B.has(t)))
        expect(toSet(unionIntervals(a, b))).toEqual(union)
        expect(toSet(intersectIntervals(a, b))).toEqual(inter)
        expect(toSet(subtractIntervals(a, b))).toEqual(diff)
      }
    })

    it(`seed 0x${seed.toString(16)}: subtract then add back the removed part restores the whole`, () => {
      const next = rng(seed)
      for (let trial = 0; trial < 60; trial++) {
        const a = randomList(next, 1 + Math.floor(next() * 6))
        const b = randomList(next, 1 + Math.floor(next() * 6))
        const kept = subtractIntervals(a, b)
        const removed = intersectIntervals(a, b)
        expect(unionIntervals(kept, removed)).toEqual(normalizeIntervals(a))
        // Durations partition exactly — this is the identity the compiler relies
        // on when it computes an output duration from kept segments.
        expect(totalDurationMs(kept) + totalDurationMs(removed))
          .toBe(totalDurationMs(normalizeIntervals(a)))
      }
    })
  }
})

describe('interval algebra — mutation controls', () => {
  // Each control re-implements the operator WITHOUT the guard under test and
  // proves the suite's assertions actually fail against it. Without these, a
  // passing assertion could mean "the guard works" or "the input never reached
  // the guard", and those are not the same thing.

  it('CONTROL: a normalize that merges only OVERLAPPING (not touching) runs violates the disjointness law', () => {
    const withoutTouchMerge = (list: Interval[]): Interval[] => {
      const sorted = [...list].filter((i) => i.endMs > i.startMs)
        .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
      const out: Interval[] = []
      for (const iv of sorted) {
        const last = out[out.length - 1]
        if (last && iv.startMs < last.endMs) { // `<` instead of `<=`: the mutation
          if (iv.endMs > last.endMs) last.endMs = iv.endMs
        } else out.push({ ...iv })
      }
      return out
    }
    const input = [{ startMs: 0, endMs: 10 }, { startMs: 10, endMs: 20 }]
    // The real implementation merges.
    expect(normalizeIntervals(input)).toEqual([{ startMs: 0, endMs: 20 }])
    // The mutant does not, and the law check catches it.
    const mutant = withoutTouchMerge(input)
    expect(mutant).toHaveLength(2)
    expect(() => expectNormalized(mutant)).toThrow()
  })

  it('CONTROL: a subtract that forgets to advance past consumed cutters loses milliseconds', () => {
    // Drops the `cursor = max(cursor, B[k].endMs)` update.
    const buggySubtract = (a: Interval[], b: Interval[]): Interval[] => {
      const out: Interval[] = []
      for (const iv of a) {
        let cursor = iv.startMs
        for (const cut of b) {
          if (cut.endMs <= iv.startMs || cut.startMs >= iv.endMs) continue
          if (cut.startMs > cursor) out.push({ startMs: cursor, endMs: cut.startMs })
          // MUTATION: cursor is never advanced past the cut.
        }
        if (cursor < iv.endMs) out.push({ startMs: cursor, endMs: iv.endMs })
      }
      return out
    }
    const a = [{ startMs: 0, endMs: 100 }]
    const b = [{ startMs: 30, endMs: 40 }]
    expect(toSet(subtractIntervals(a, b)).has(35)).toBe(false)
    // The mutant re-emits the whole interval, so the removed millisecond is
    // still present — the set-semantics assertion above genuinely tests this.
    expect(toSet(buggySubtract(a, b)).has(35)).toBe(true)
  })

  it('CONTROL: the set oracle is potent — it rejects a deliberately wrong intersect', () => {
    const wrongIntersect = (a: Interval[]): Interval[] => normalizeIntervals(a)
    const a = [{ startMs: 0, endMs: 50 }]
    const b = [{ startMs: 40, endMs: 70 }]
    expect(toSet(intersectIntervals(a, b))).toEqual(toSet([{ startMs: 40, endMs: 50 }]))
    expect(toSet(wrongIntersect(a))).not.toEqual(toSet([{ startMs: 40, endMs: 50 }]))
  })
})

// The ONE time map — worked examples, the seven frozen laws, and randomized
// properties over fixed recorded seeds (Gate-0 §8).
//
// CANONICAL SPECIFICATION (approved 2026-07-27):
//
//   outputStart[0] = 0
//   outputEnd[0]   = duration[0]
//   outputStart[i] = outputEnd[i-1] - overlap[i]
//   outputEnd[i]   = outputStart[i] + duration[i]
//
// equivalently outputEnd[i] = outputEnd[i-1] + duration[i] - overlap[i], and
// therefore totalOutputDuration = sum(durations) - sum(overlaps).
//
// This corrects a defect in the original Phase 8 plan, which stated the second
// line against the piece's own outputStart and so subtracted each overlap twice.
// The defect was found during implementation; `LAW 1` and the regression guard
// at the bottom of this file exist so it cannot come back.
import { describe, it, expect } from 'vitest'
import {
  buildTimeMap, mapSourceToOutput, pieceForSource, totalDurationMs, compileEditPlan,
  type Interval,
} from '../jobs/editorCompile.js'
import { buildFfmpegGraph } from '../jobs/ffmpegGraph.js'
import { baseInput, policy, shippedEncoder } from './fixtures/editPlanFixture.js'

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const RECORDED_SEEDS = [0x713e4a90, 0x2b1dfeed, 0x0ff1ce55, 0x51ce1234] as const

function randomPieces(next: () => number): { segments: Interval[]; overlaps: number[] } {
  const count = 1 + Math.floor(next() * 8)
  const segments: Interval[] = []
  let cursor = 0
  for (let i = 0; i < count; i++) {
    cursor += Math.floor(next() * 500)
    const len = 400 + Math.floor(next() * 3000)
    segments.push({ startMs: cursor, endMs: cursor + len })
    cursor += len
  }
  const overlaps = segments.map((s, i) => {
    if (i === 0) return 0
    const maxOverlap = Math.min(200, s.endMs - s.startMs - 1)
    return next() < 0.4 ? Math.floor(next() * Math.max(1, maxOverlap)) : 0
  })
  return { segments, overlaps }
}

describe('time map — worked examples', () => {
  it('hard cuts: output is the concatenation of the kept durations', () => {
    const map = buildTimeMap(
      [{ startMs: 0, endMs: 1000 }, { startMs: 5000, endMs: 5500 }], [0, 0])
    expect(map.pieces.map((p) => [p.outputStartMs, p.outputEndMs])).toEqual([[0, 1000], [1000, 1500]])
    expect(map.outputDurationMs).toBe(1500)
  })

  it('one transition shortens the timeline by the overlap EXACTLY once', () => {
    const segments = [{ startMs: 0, endMs: 1000 }, { startMs: 5000, endMs: 6000 }]
    const noOverlap = buildTimeMap(segments, [0, 0])
    const withOverlap = buildTimeMap(segments, [0, 120])
    expect(noOverlap.outputDurationMs).toBe(2000)
    expect(withOverlap.outputDurationMs).toBe(1880)
    // The difference is the overlap, not twice the overlap. This is the frozen
    // property that decides the reading of the plan's time-map formula.
    expect(noOverlap.outputDurationMs - withOverlap.outputDurationMs).toBe(120)
  })

  it('the second piece starts BEFORE the first ends by exactly the overlap', () => {
    const map = buildTimeMap([{ startMs: 0, endMs: 1000 }, { startMs: 5000, endMs: 6000 }], [0, 120])
    expect(map.pieces[0].outputEndMs).toBe(1000)
    expect(map.pieces[1].outputStartMs).toBe(880)
    expect(map.pieces[0].outputEndMs - map.pieces[1].outputStartMs).toBe(120)
  })

  it('refuses an overlap that would consume a whole piece', () => {
    expect(() => buildTimeMap(
      [{ startMs: 0, endMs: 1000 }, { startMs: 5000, endMs: 5100 }], [0, 100]))
      .toThrow(/consumes the whole piece/)
  })

  it('refuses a non-positive piece rather than emitting a zero-length one', () => {
    expect(() => buildTimeMap([{ startMs: 10, endMs: 10 }], [0])).toThrow(/non-positive duration/)
  })

  it('a source time outside every kept piece has NO output time', () => {
    const map = buildTimeMap([{ startMs: 0, endMs: 1000 }, { startMs: 5000, endMs: 6000 }], [0, 0])
    expect(mapSourceToOutput(map, 500)).toBe(500)
    expect(mapSourceToOutput(map, 3000)).toBeNull()
    expect(mapSourceToOutput(map, 5500)).toBe(1500)
  })
})

// ---------------------------------------------------------------------------
// The seven frozen laws, asserted one per test and numbered so a failure names
// the law it broke.
// ---------------------------------------------------------------------------
describe('time map — the seven frozen laws', () => {
  const SEGMENTS: Interval[] = [
    { startMs: 0, endMs: 1000 },
    { startMs: 5000, endMs: 6500 },
    { startMs: 9000, endMs: 11000 },
  ]
  const OVERLAPS = [0, 120, 200]

  it('LAW 1 — a transition overlap is counted EXACTLY once', () => {
    const map = buildTimeMap(SEGMENTS, OVERLAPS)
    const retained = totalDurationMs(SEGMENTS)
    const overlapSum = OVERLAPS.reduce((a, b) => a + b, 0)
    expect(map.outputDurationMs).toBe(retained - overlapSum)
    // Counted once, not zero times and not twice.
    expect(map.outputDurationMs).not.toBe(retained)
    expect(map.outputDurationMs).not.toBe(retained - 2 * overlapSum)
    // And each junction closes by exactly its own overlap.
    for (let i = 1; i < map.pieces.length; i++) {
      expect(map.pieces[i - 1].outputEndMs - map.pieces[i].outputStartMs).toBe(OVERLAPS[i])
    }
  })

  it('LAW 2 — output duration is never negative, and neither is any output time', () => {
    const map = buildTimeMap(SEGMENTS, OVERLAPS)
    expect(map.outputDurationMs).toBeGreaterThan(0)
    for (const p of map.pieces) {
      expect(p.outputStartMs).toBeGreaterThanOrEqual(0)
      expect(p.outputEndMs).toBeGreaterThan(p.outputStartMs)
    }
    // The guard that makes this structural rather than lucky.
    expect(() => buildTimeMap(
      [{ startMs: 0, endMs: 1000 }, { startMs: 5000, endMs: 5100 }], [0, 100]))
      .toThrow(/consumes the whole piece/)
  })

  it('LAW 3 — each retained source interval maps monotonically', () => {
    const map = buildTimeMap(SEGMENTS, OVERLAPS)
    for (const p of map.pieces) {
      let prev = -1
      for (let s = p.sourceStartMs; s < p.sourceEndMs; s += 37) {
        const out = mapSourceToOutput(map, s) as number
        expect(out).toBeGreaterThan(prev)
        prev = out
      }
      // Strictly order-preserving and offset-preserving within the piece.
      const a = mapSourceToOutput(map, p.sourceStartMs) as number
      const b = mapSourceToOutput(map, p.sourceEndMs - 1) as number
      expect(b - a).toBe(p.sourceEndMs - 1 - p.sourceStartMs)
    }
  })

  it('LAW 4 — no output region is unintentionally duplicated or omitted', () => {
    const map = buildTimeMap(SEGMENTS, OVERLAPS)
    // Cover [0, outputDuration) millisecond by millisecond and count how many
    // pieces claim each instant.
    const claims = new Map<number, number>()
    for (const p of map.pieces) {
      for (let t = p.outputStartMs; t < p.outputEndMs; t++) {
        claims.set(t, (claims.get(t) ?? 0) + 1)
      }
    }
    // OMISSION: every instant of the output is claimed by at least one piece.
    for (let t = 0; t < map.outputDurationMs; t++) {
      expect(claims.get(t) ?? 0).toBeGreaterThanOrEqual(1)
    }
    // No piece reaches beyond the declared output.
    for (const t of claims.keys()) expect(t).toBeLessThan(map.outputDurationMs)
    // DUPLICATION: the doubly-claimed instants are EXACTLY the declared
    // transition overlaps — every duplication is intentional and accounted for.
    const duplicated = [...claims.entries()].filter(([, n]) => n > 1)
    expect(duplicated.every(([, n]) => n === 2)).toBe(true)
    expect(duplicated).toHaveLength(OVERLAPS.reduce((a, b) => a + b, 0))
    for (const [t] of duplicated) {
      const junction = map.pieces.slice(1).some(
        (p) => t >= p.outputStartMs && t < p.outputStartMs + p.transitionInOverlapMs)
      expect(junction).toBe(true)
    }
  })

  it('LAW 5 — captions and audio use the IDENTICAL time map', () => {
    const plan = compileEditPlan({ ...baseInput(), policy: policy() }).plan
    const map = buildTimeMap(
      plan.timeline.segments.map((s) => ({ startMs: s.sourceStartMs, endMs: s.sourceEndMs })),
      plan.timeline.segments.map((s) => s.transitionInOverlapMs))

    // Captions: every cue boundary is a point of the one map, and inverting it
    // lands inside the kept source it came from.
    expect(plan.captions.cues.length).toBeGreaterThan(0)
    for (const cue of plan.captions.cues) {
      const piece = map.pieces.find(
        (p) => cue.outputStartMs >= p.outputStartMs && cue.outputStartMs < p.outputEndMs)
      expect(piece).toBeDefined()
      const src = (piece as { sourceStartMs: number }).sourceStartMs
        + (cue.outputStartMs - (piece as { outputStartMs: number }).outputStartMs)
      expect(mapSourceToOutput(map, src)).toBe(cue.outputStartMs)
    }

    // Audio: the renderer trims audio over the SAME source spans as video. If a
    // second retiming function existed anywhere, this is where it would show up
    // as drift between the atrim and trim pairs.
    const hardCut = baseInput()
    hardCut.decision.transitionPolicy = 'hard_cuts_only'
    const hcPlan = compileEditPlan({ ...hardCut, policy: policy() }).plan
    const graph = buildFfmpegGraph(hcPlan, {
      sourcePath: '/var/tmp/edit/source.mp4', assPath: '/var/tmp/edit/c.ass',
      fontsDir: null, outputPath: '/var/tmp/edit/out.mp4', encoder: shippedEncoder(),
    })
    // Segment trims are id-prefixed `vtrim`; the zoom pass also emits `trim`
    // filter nodes (id-prefixed `vzwtrim`) on the already-joined stream, so
    // this reads by id rather than by filter name to stay about segments only.
    const spans = (idPrefix: string): string[] => graph.nodes
      .filter((n) => n.id.startsWith(idPrefix))
      .map((n) => n.args.map((a) => `${a.key}=${String(a.value)}`).join(','))
    expect(spans('vtrim')).toEqual(spans('atrim'))
    expect(spans('vtrim')).toHaveLength(hcPlan.timeline.segments.length)
    // ...and those spans are the plan's segments, not some re-derivation.
    expect(spans('vtrim')[0]).toBe('start=0.000,end=10.460')

    // The output duration handed to the encoder is the map's end.
    const t = graph.outputOptions.indexOf('-t')
    const hcMap = buildTimeMap(
      hcPlan.timeline.segments.map((s) => ({ startMs: s.sourceStartMs, endMs: s.sourceEndMs })),
      hcPlan.timeline.segments.map((s) => s.transitionInOverlapMs))
    expect(graph.outputOptions[t + 1]).toBe(
      `${Math.floor(hcMap.outputDurationMs / 1000)}.${String(hcMap.outputDurationMs % 1000).padStart(3, '0')}`)
  })

  it('LAW 6 — zero-overlap transitions reduce to contiguous cuts', () => {
    const map = buildTimeMap(SEGMENTS, [0, 0, 0])
    for (let i = 1; i < map.pieces.length; i++) {
      // Contiguous: the next piece starts exactly where the previous ended.
      expect(map.pieces[i].outputStartMs).toBe(map.pieces[i - 1].outputEndMs)
    }
    expect(map.outputDurationMs).toBe(totalDurationMs(SEGMENTS))
    // No instant is claimed twice when there is no overlap.
    const claims = new Map<number, number>()
    for (const p of map.pieces) {
      for (let t = p.outputStartMs; t < p.outputEndMs; t++) claims.set(t, (claims.get(t) ?? 0) + 1)
    }
    expect([...claims.values()].every((n) => n === 1)).toBe(true)
    // A mixed case degrades piecewise: the zero-overlap junction stays contiguous.
    const mixed = buildTimeMap(SEGMENTS, [0, 0, 200])
    expect(mixed.pieces[1].outputStartMs).toBe(mixed.pieces[0].outputEndMs)
    expect(mixed.pieces[2].outputStartMs).toBe(mixed.pieces[1].outputEndMs - 200)
  })

  it('LAW 7 — total duration == retained duration minus overlaps, counted once', () => {
    // Asserted over a spread of shapes, not one lucky arrangement.
    const cases: Array<[Interval[], number[]]> = [
      [SEGMENTS, OVERLAPS],
      [SEGMENTS, [0, 0, 0]],
      [[{ startMs: 0, endMs: 4000 }], [0]],
      [[{ startMs: 100, endMs: 900 }, { startMs: 2000, endMs: 2800 }], [0, 799]],
    ]
    for (const [segments, overlaps] of cases) {
      const map = buildTimeMap(segments, overlaps)
      expect(map.outputDurationMs)
        .toBe(totalDurationMs(segments) - overlaps.reduce((a, b) => a + b, 0))
    }
  })
})

describe('time map — properties over recorded seeds', () => {
  for (const seed of RECORDED_SEEDS) {
    it(`seed 0x${seed.toString(16)}: monotonic, non-negative, and duration-exact`, () => {
      const next = rng(seed)
      for (let trial = 0; trial < 80; trial++) {
        const { segments, overlaps } = randomPieces(next)
        const map = buildTimeMap(segments, overlaps)

        // (2) no negative time.
        for (const p of map.pieces) {
          expect(p.outputStartMs).toBeGreaterThanOrEqual(0)
          expect(p.outputEndMs).toBeGreaterThan(p.outputStartMs)
        }
        // (1) monotonic: starts and ends both advance.
        for (let i = 1; i < map.pieces.length; i++) {
          expect(map.pieces[i].outputStartMs).toBeGreaterThanOrEqual(map.pieces[i - 1].outputStartMs)
          expect(map.pieces[i].outputEndMs).toBeGreaterThan(map.pieces[i - 1].outputEndMs)
        }
        // (3) mapped duration == planned duration: the timeline is the total
        //     kept material minus each overlap counted once.
        const planned = totalDurationMs(segments) - overlaps.reduce((a, b) => a + b, 0)
        expect(map.outputDurationMs).toBe(planned)
        // (5) overlap counted once, stated the other way round: removing every
        //     overlap lengthens the timeline by exactly their sum.
        const hardCut = buildTimeMap(segments, overlaps.map(() => 0))
        expect(hardCut.outputDurationMs - map.outputDurationMs)
          .toBe(overlaps.reduce((a, b) => a + b, 0))
      }
    })

    it(`seed 0x${seed.toString(16)}: every source point maps through exactly ONE piece`, () => {
      const next = rng(seed)
      for (let trial = 0; trial < 40; trial++) {
        const { segments, overlaps } = randomPieces(next)
        const map = buildTimeMap(segments, overlaps)
        for (const p of map.pieces) {
          for (const probe of [p.sourceStartMs, p.sourceStartMs + 1, p.sourceEndMs - 1]) {
            const owners = map.pieces.filter((q) => probe >= q.sourceStartMs && probe < q.sourceEndMs)
            expect(owners).toHaveLength(1)
            expect(pieceForSource(map, probe)).toBe(owners[0])
            // (4) unique inverse inside a kept piece: the forward map is
            //     injective there, so recovering the source time is exact.
            const out = mapSourceToOutput(map, probe)
            expect(out).not.toBeNull()
            const recovered = owners[0].sourceStartMs + ((out as number) - owners[0].outputStartMs)
            expect(recovered).toBe(probe)
          }
        }
      }
    })

    it(`seed 0x${seed.toString(16)}: output times stay integers`, () => {
      const next = rng(seed)
      for (let trial = 0; trial < 40; trial++) {
        const { segments, overlaps } = randomPieces(next)
        const map = buildTimeMap(segments, overlaps)
        for (const p of map.pieces) {
          expect(Number.isInteger(p.outputStartMs)).toBe(true)
          expect(Number.isInteger(p.outputEndMs)).toBe(true)
        }
        expect(Number.isInteger(map.outputDurationMs)).toBe(true)
      }
    })
  }
})

describe('time map — mutation controls', () => {
  // REGRESSION GUARD — the ORIGINAL SPECIFICATION DEFECT.
  //
  // The Phase 8 plan originally stated `outputEnd = outputStart + sourceDuration
  // - transitionOverlap` against the piece's own outputStart, which subtracts
  // each overlap TWICE. The defect was found while implementing this batch and
  // the corrected formula was approved as canonical on 2026-07-27. This test
  // encodes the defective formula verbatim and pins the exact size of its error,
  // so any drift back toward it fails here by name rather than as a puzzling
  // off-by-N in a duration assertion somewhere downstream.
  it('REGRESSION GUARD (original spec defect): the double-subtracting formula is short by exactly one overlap', () => {
    const doubleSubtract = (segments: Interval[], overlaps: number[]): number => {
      let cursor = 0
      for (let i = 0; i < segments.length; i++) {
        const dur = segments[i].endMs - segments[i].startMs
        const overlap = i === 0 ? 0 : overlaps[i]
        const start = i === 0 ? 0 : cursor - overlap
        cursor = start + dur - overlap
      }
      return cursor
    }
    const segments = [{ startMs: 0, endMs: 1000 }, { startMs: 5000, endMs: 6000 }]
    const overlaps = [0, 120]
    const overlapSum = overlaps.reduce((a, b) => a + b, 0)
    const real = buildTimeMap(segments, overlaps).outputDurationMs
    const defective = doubleSubtract(segments, overlaps)
    // Canonical: retained minus overlaps, counted once.
    expect(real).toBe(2000 - overlapSum)
    // Defective: counted twice.
    expect(defective).toBe(2000 - 2 * overlapSum)
    // The error is exactly one overlap — the whole of the defect, no more.
    expect(real - defective).toBe(overlapSum)
    // LAW 1 and LAW 7 both assert `retained - overlapSum`, so they genuinely
    // reject the defective formula rather than passing under either reading.
    expect(defective).not.toBe(real)
  })

  it('CONTROL: dropping the overlap-vs-duration guard produces a negative-length timeline', () => {
    const unguarded = (segments: Interval[], overlaps: number[]): number => {
      let cursor = 0
      for (let i = 0; i < segments.length; i++) {
        const dur = segments[i].endMs - segments[i].startMs
        const overlap = i === 0 ? 0 : overlaps[i]
        cursor = (i === 0 ? 0 : cursor - overlap) + dur
      }
      return cursor
    }
    const segments = [{ startMs: 0, endMs: 1000 }, { startMs: 5000, endMs: 5050 }]
    const overlaps = [0, 400]
    expect(() => buildTimeMap(segments, overlaps)).toThrow(/consumes the whole piece/)
    // Without the guard the second piece would start before the first even ended
    // by more than its own length — a timeline that goes backwards.
    expect(unguarded(segments, overlaps)).toBeLessThan(1000)
  })

  it('CONTROL: the uniqueness assertion is potent — overlapping SOURCE pieces break it', () => {
    // The compiler never produces overlapping source pieces (they are the
    // complement of a subtraction), but if it ever did, the property test's
    // `toHaveLength(1)` is what would catch it.
    const overlapping = [{ startMs: 0, endMs: 1000 }, { startMs: 500, endMs: 1500 }]
    const owners = overlapping.filter((q) => 700 >= q.startMs && 700 < q.endMs)
    expect(owners).toHaveLength(2)
  })
})

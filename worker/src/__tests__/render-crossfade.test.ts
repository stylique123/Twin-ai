// Batch 8.3 — crossfade rendering, the item 8.1 deliberately deferred.
//
// 8.1 refused `restrained` rather than silently rendering it as a hard cut,
// because silent substitution is what the contract forbids. This batch makes it
// real. The tests are therefore about two things:
//
//   1. the crossfade the graph emits is the one the plan asked for — right
//      duration, right offset, on both video AND audio;
//   2. everything 8.1 refused for a REASON is still refused. Implementing a
//      capability is the easiest moment to lose the guards that surrounded its
//      absence, so each is asserted with a mutation control proving the
//      assertion is not vacuous.
//
// The offset arithmetic is where a crossfade implementation actually goes
// wrong, and it goes wrong quietly: the video plays, it is simply a fraction of
// a second out of step with its own captions. So the offsets are computed
// independently here, from the plan's own segment table, rather than read back
// from the thing under test.
import { describe, it, expect } from 'vitest'
import { buildFfmpegGraph, serializeFilterGraph, type CrossfadeBounds } from '../jobs/ffmpegGraph.js'
import { compileEditPlan } from '../jobs/editorCompile.js'
import { EditPlanError, type EditPlanV1 } from '../jobs/editPlanContract.js'
import { baseInput, policy } from './fixtures/editPlanFixture.js'

const ASSETS = {
  sourcePath: '/var/tmp/edit/source.mp4',
  assPath: '/var/tmp/edit/captions.ass',
  fontsDir: '/opt/fonts',
  outputPath: '/var/tmp/edit/out.mp4',
}
const BOUNDS: CrossfadeBounds = {
  minOverlapMs: 80, maxOverlapMs: 1000, maxOverlapFractionOfShorterSegmentMilli: 400,
}

function codeOf(fn: () => unknown): string {
  try { fn() } catch (e) { return (e as EditPlanError).code }
  throw new Error('expected a throw, got none')
}
function crossfadePlan(): EditPlanV1 {
  return compileEditPlan({ ...baseInput(), policy: policy() }).plan
}
function hardCutPlan(): EditPlanV1 {
  const input = baseInput()
  input.decision.transitionPolicy = 'hard_cuts_only'
  return compileEditPlan({ ...input, policy: policy() }).plan
}
const clone = (p: EditPlanV1): EditPlanV1 => JSON.parse(JSON.stringify(p)) as EditPlanV1

describe('the fixture is what these tests think it is', () => {
  it('carries at least one real crossfade with a non-zero overlap', () => {
    const plan = crossfadePlan()
    expect(plan.video.transitionPolicy).toBe('restrained')
    expect(plan.video.transitions.length).toBeGreaterThan(0)
    expect(plan.video.transitions.every((t) => t.overlapMs > 0)).toBe(true)
    expect(plan.timeline.segments.length).toBeGreaterThan(1)
  })
})

describe('the emitted crossfade is the one the plan asked for', () => {
  it('emits an xfade for every transition and none for a hard cut', () => {
    const graph = buildFfmpegGraph(crossfadePlan(), ASSETS, BOUNDS)
    const xfades = graph.nodes.filter((n) => n.filter === 'xfade')
    expect(xfades.length).toBe(crossfadePlan().video.transitions.length)
    expect(buildFfmpegGraph(hardCutPlan(), ASSETS, BOUNDS).nodes.some((n) => n.filter === 'xfade')).toBe(false)
  })

  it('AUDIO crossfades too — a video-only fade is a visible/audible mismatch', () => {
    const graph = buildFfmpegGraph(crossfadePlan(), ASSETS, BOUNDS)
    const v = graph.nodes.filter((n) => n.filter === 'xfade').length
    const a = graph.nodes.filter((n) => n.filter === 'acrossfade').length
    expect(a).toBe(v)
    expect(a).toBeGreaterThan(0)
  })

  it('the xfade duration equals the plan overlap, and the offset is INDEPENDENTLY correct', () => {
    const plan = crossfadePlan()
    const graph = buildFfmpegGraph(plan, ASSETS, BOUNDS)
    const segs = plan.timeline.segments
    // Recomputed here from the segment table, not read back from the graph.
    let acc = segs[0].sourceEndMs - segs[0].sourceStartMs
    const expected: { duration: string; offset: string }[] = []
    const ms = (n: number) => `${Math.floor(n / 1000)}.${String(n % 1000).padStart(3, '0')}`
    for (let i = 1; i < segs.length; i++) {
      const d = segs[i].sourceEndMs - segs[i].sourceStartMs
      const o = segs[i].transitionInOverlapMs
      if (o > 0) expected.push({ duration: ms(o), offset: ms(acc - o) })
      acc += d - o
    }
    const got = graph.nodes.filter((n) => n.filter === 'xfade').map((n) => ({
      duration: String(n.args.find((a) => a.key === 'duration')!.value),
      offset: String(n.args.find((a) => a.key === 'offset')!.value),
    }))
    expect(got).toEqual(expected)
    expect(got.length).toBeGreaterThan(0)
  })

  it('the acrossfade duration matches its paired xfade at every junction', () => {
    const graph = buildFfmpegGraph(crossfadePlan(), ASSETS, BOUNDS)
    const vd = graph.nodes.filter((n) => n.filter === 'xfade').map((n) => String(n.args.find((a) => a.key === 'duration')!.value))
    const ad = graph.nodes.filter((n) => n.filter === 'acrossfade').map((n) => String(n.args.find((a) => a.key === 'd')!.value))
    expect(ad).toEqual(vd)
  })

  it('the serialized graph is still a single well-formed filter string', () => {
    const s = serializeFilterGraph(buildFfmpegGraph(crossfadePlan(), ASSETS, BOUNDS))
    expect(s).toContain('xfade=')
    expect(s).toContain('acrossfade=')
    expect(s.includes(';;')).toBe(false)
  })

  it('is deterministic — the same plan yields byte-identical graphs', () => {
    const a = serializeFilterGraph(buildFfmpegGraph(crossfadePlan(), ASSETS, BOUNDS))
    const b = serializeFilterGraph(buildFfmpegGraph(crossfadePlan(), ASSETS, BOUNDS))
    expect(a).toBe(b)
  })
})

describe('hard-cut plans are byte-unchanged from Batch 8.1', () => {
  // A pairwise fold would have been correct AND would have silently changed the
  // graph of every hard-cut plan already proven against 8.1. This is the test
  // that would have caught that.
  it('still emits ONE n-way concat, not a chain of pairwise ones', () => {
    const graph = buildFfmpegGraph(hardCutPlan(), ASSETS, BOUNDS)
    const concats = graph.nodes.filter((n) => n.filter === 'concat')
    expect(concats.length).toBe(1)
    expect(concats[0].args.find((a) => a.key === 'n')!.value).toBe(hardCutPlan().timeline.segments.length)
  })

  it('builds without bounds at all — bounds are needed only by crossfades', () => {
    expect(() => buildFfmpegGraph(hardCutPlan(), ASSETS)).not.toThrow()
  })
})

describe('bounds are enforced, and there is no default to fall back on', () => {
  it('MUTATION: a crossfade plan with NO bounds is refused rather than assumed', () => {
    expect(codeOf(() => buildFfmpegGraph(crossfadePlan(), ASSETS))).toBe('render_graph_invalid')
  })

  it('CONTROL: the identical plan WITH bounds builds — the refusal is about the bounds', () => {
    expect(() => buildFfmpegGraph(crossfadePlan(), ASSETS, BOUNDS)).not.toThrow()
  })

  it('an overlap under the minimum is refused', () => {
    const plan = clone(crossfadePlan())
    const t = plan.video.transitions[0]
    const seg = plan.timeline.segments[t.atSegmentIndex]
    // Keep the plan internally consistent so the refusal is about the BOUND and
    // not about the plan disagreeing with itself.
    const delta = seg.transitionInOverlapMs - 10
    t.overlapMs = 10; seg.transitionInOverlapMs = 10
    plan.output.durationMs += delta
    expect(codeOf(() => buildFfmpegGraph(plan, ASSETS, BOUNDS))).toBe('render_graph_invalid')
  })

  it('an overlap over the maximum is refused', () => {
    const plan = clone(crossfadePlan())
    const t = plan.video.transitions[0]
    const seg = plan.timeline.segments[t.atSegmentIndex]
    const delta = seg.transitionInOverlapMs - 999999
    t.overlapMs = 999999; seg.transitionInOverlapMs = 999999
    plan.output.durationMs += delta
    expect(codeOf(() => buildFfmpegGraph(plan, ASSETS, BOUNDS))).toBe('render_graph_invalid')
  })

  it('an overlap that would swallow a whole segment is refused, not clamped', () => {
    const plan = clone(crossfadePlan())
    const t = plan.video.transitions[0]
    const seg = plan.timeline.segments[t.atSegmentIndex]
    const segMs = seg.sourceEndMs - seg.sourceStartMs
    const delta = seg.transitionInOverlapMs - segMs
    t.overlapMs = segMs; seg.transitionInOverlapMs = segMs
    plan.output.durationMs += delta
    const graph = () => buildFfmpegGraph(plan, ASSETS, BOUNDS)
    expect(codeOf(graph)).toBe('render_graph_invalid')
    // ...and specifically NOT by rendering a shorter video and calling it done.
    expect(() => graph()).toThrow()
  })
})

describe('the graph and the time map must describe the same video', () => {
  // This is the cross-check that makes the whole batch worth trusting: the
  // compiler derives the output length from its recurrence, the graph builder
  // derives it from the segments it is about to join, and they are allowed to
  // be equal and nothing else.
  it('MUTATION: a plan whose declared duration is one ms off is refused', () => {
    const plan = clone(crossfadePlan())
    plan.output.durationMs += 1
    expect(codeOf(() => buildFfmpegGraph(plan, ASSETS, BOUNDS))).toBe('render_graph_invalid')
  })

  it('MUTATION: and one ms the other way, so the check is not one-sided', () => {
    const plan = clone(crossfadePlan())
    plan.output.durationMs -= 1
    expect(codeOf(() => buildFfmpegGraph(plan, ASSETS, BOUNDS))).toBe('render_graph_invalid')
  })

  it('MUTATION: it catches a segment silently lengthened without the map moving', () => {
    const plan = clone(crossfadePlan())
    plan.timeline.segments[0].sourceEndMs += 500
    expect(codeOf(() => buildFfmpegGraph(plan, ASSETS, BOUNDS))).toBe('render_graph_invalid')
  })

  it('CONTROL: the untouched plan passes the same check', () => {
    expect(() => buildFfmpegGraph(crossfadePlan(), ASSETS, BOUNDS)).not.toThrow()
  })

  it('the hard-cut plan is subject to the SAME cross-check', () => {
    // The duration check must not be a crossfade-only luxury; a hard-cut plan
    // can have a broken time map too.
    const plan = clone(hardCutPlan())
    plan.output.durationMs += 1
    expect(codeOf(() => buildFfmpegGraph(plan, ASSETS, BOUNDS))).toBe('render_graph_invalid')
  })
})

describe('what is still refused', () => {
  it('a transition overlap under a hard_cuts_only policy is a contradiction', () => {
    const plan = clone(crossfadePlan())
    plan.video.transitionPolicy = 'hard_cuts_only'
    expect(codeOf(() => buildFfmpegGraph(plan, ASSETS, BOUNDS))).toBe('render_graph_invalid')
  })

  it('an unknown transition kind is refused rather than treated as a crossfade', () => {
    const plan = clone(crossfadePlan())
    ;(plan.video.transitions[0] as { kind: string }).kind = 'star_wipe'
    expect(codeOf(() => buildFfmpegGraph(plan, ASSETS, BOUNDS))).toBe('render_graph_invalid')
  })

  it('captions with no ASS document are still refused, not dropped', () => {
    const plan = crossfadePlan()
    expect(plan.captions.cues.length).toBeGreaterThan(0)
    expect(codeOf(() => buildFfmpegGraph(plan, { ...ASSETS, assPath: null }, BOUNDS))).toBe('render_graph_invalid')
  })

  it('no crossfade argument escapes the value alphabet', () => {
    const s = serializeFilterGraph(buildFfmpegGraph(crossfadePlan(), ASSETS, BOUNDS))
    const xf = s.split(';').filter((c) => c.includes('xfade='))
    expect(xf.length).toBeGreaterThan(0)
    for (const chain of xf) {
      // The only quote in any chain belongs to a path argument, and xfade has none.
      expect(chain.includes("'")).toBe(false)
      expect(/xfade=[a-z0-9_=.:/-]+/i.test(chain)).toBe(true)
    }
  })
})

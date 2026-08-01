// Typed plan -> FFmpeg graph -> argument ARRAY.
//
// Three things are being proven, and nothing else:
//   1. the output is an argv ARRAY, never a shell string;
//   2. an unsupported instruction FAILS rather than being silently substituted;
//   3. the graph and its argv are deterministic.
import { describe, it, expect } from 'vitest'
import {
  buildFfmpegGraph, buildFfmpegArgs, serializeFilterGraph, ffmpegGraphSha256,
  msToSecondsLiteral, milliToScalarLiteral,
} from '../jobs/ffmpegGraph.js'
import { compileEditPlan } from '../jobs/editorCompile.js'
import { EditPlanError, type EditPlanV1 } from '../jobs/editPlanContract.js'
import { baseInput, policy } from './fixtures/editPlanFixture.js'

function codeOf(fn: () => unknown): string {
  try { fn() } catch (e) { return (e as EditPlanError).code }
  throw new Error('expected a throw, got none')
}

const ASSETS = {
  sourcePath: '/var/tmp/edit/source.mp4',
  assPath: '/var/tmp/edit/captions.ass',
  fontsDir: '/opt/fonts',
  outputPath: '/var/tmp/edit/out.mp4',
}
// The fixture plan uses a `restrained` transition, which this batch's graph
// builder does not implement — so the graph tests use the hard-cut plan and
// exercise the restrained case as an explicit failure below.
function hardCutPlan(): EditPlanV1 {
  const input = baseInput()
  input.decision.transitionPolicy = 'hard_cuts_only'
  return compileEditPlan({ ...input, policy: policy() }).plan
}

describe('numeric literals', () => {
  it('renders integer milliseconds as fixed 3-decimal seconds', () => {
    expect(msToSecondsLiteral(0)).toBe('0.000')
    expect(msToSecondsLiteral(1)).toBe('0.001')
    expect(msToSecondsLiteral(10460)).toBe('10.460')
    expect(msToSecondsLiteral(900000)).toBe('900.000')
    expect(() => msToSecondsLiteral(1.5)).toThrow()
    expect(() => msToSecondsLiteral(-1)).toThrow()
  })

  it('renders milli-units as fixed 3-decimal scalars, including negatives', () => {
    expect(milliToScalarLiteral(1060)).toBe('1.060')
    expect(milliToScalarLiteral(1120)).toBe('1.120')
    expect(milliToScalarLiteral(-14000)).toBe('-14.000')
    expect(milliToScalarLiteral(-1000)).toBe('-1.000')
    expect(milliToScalarLiteral(0)).toBe('0.000')
  })

  it('never uses floating point, so the literal is identical everywhere', () => {
    // 0.1 + 0.2 is the canonical float trap; the integer path cannot hit it.
    expect(msToSecondsLiteral(100 + 200)).toBe('0.300')
    expect(milliToScalarLiteral(1000 + 60)).toBe('1.060')
  })
})

describe('the argument array', () => {
  it('is an array of separate elements, never a shell string', () => {
    const args = buildFfmpegArgs(buildFfmpegGraph(hardCutPlan(), ASSETS))
    expect(Array.isArray(args)).toBe(true)
    for (const a of args) expect(typeof a).toBe('string')
    // The filter graph is ONE element, so its separators cannot word-split.
    const filterIdx = args.indexOf('-filter_complex')
    expect(filterIdx).toBeGreaterThan(-1)
    expect(args[filterIdx + 1]).toContain(';')
    expect(args.filter((a) => a === '-filter_complex')).toHaveLength(1)
  })

  it('carries the input, the output and the frozen output profile', () => {
    const args = buildFfmpegArgs(buildFfmpegGraph(hardCutPlan(), ASSETS))
    expect(args).toContain('-i')
    expect(args).toContain(ASSETS.sourcePath)
    expect(args[args.length - 1]).toBe(ASSETS.outputPath)
    expect(args).toContain('libx264')
    expect(args).toContain('aac')
    expect(args).toContain('yuv420p')
    expect(args).toContain('48000')
    expect(args).toContain('+faststart')
    expect(args).toContain('30/1')
    // The duration limit comes from the plan's time map, not from anywhere else.
    const t = args.indexOf('-t')
    expect(args[t + 1]).toBe(msToSecondsLiteral(hardCutPlan().output.durationMs))
  })

  it('never emits an empty argument', () => {
    const args = buildFfmpegArgs(buildFfmpegGraph(hardCutPlan(), ASSETS))
    for (const a of args) expect(a.length).toBeGreaterThan(0)
  })

  it('builds one trim pair per kept segment and concatenates them', () => {
    const plan = hardCutPlan()
    const graph = buildFfmpegGraph(plan, ASSETS)
    // Segment trims are id-prefixed `vtrim`; the zoom pass below also emits
    // `trim` filter nodes (id-prefixed `vzwtrim`) on the SAME joined stream, so
    // this counts by id rather than by filter name.
    const trims = graph.nodes.filter((n) => n.filter === 'trim' && n.id.startsWith('vtrim'))
    const atrims = graph.nodes.filter((n) => n.filter === 'atrim')
    expect(trims).toHaveLength(plan.timeline.segments.length)
    expect(atrims).toHaveLength(plan.timeline.segments.length)
    const concat = graph.nodes.find((n) => n.filter === 'concat')
    expect(concat?.args).toContainEqual({ key: 'n', value: plan.timeline.segments.length })
    // Each trim names its segment's exact source span.
    expect(trims[0].args).toContainEqual({ key: 'start', value: '0.000' })
    expect(trims[0].args).toContainEqual({ key: 'end', value: '10.460' })
  })

  it('burns captions from a FILE, so caption text never enters an argument', () => {
    const plan = hardCutPlan()
    const args = buildFfmpegArgs(buildFfmpegGraph(plan, ASSETS))
    const filter = args[args.indexOf('-filter_complex') + 1]
    expect(filter).toContain('subtitles=')
    expect(filter).toContain(ASSETS.assPath)
    const captionText = plan.captions.cues[0].lines.join(' ')
    for (const a of args) expect(a).not.toContain(captionText)
  })

  it('applies the plan audio chain and the frozen loudness targets', () => {
    const args = buildFfmpegArgs(buildFfmpegGraph(hardCutPlan(), ASSETS))
    const filter = args[args.indexOf('-filter_complex') + 1]
    expect(filter).toContain('highpass=f=80')
    expect(filter).toContain('loudnorm=I=-14.000:TP=-1.000:LRA=11')
  })

  it('applies a zoom at its held scale, ramping through eased steps around it', () => {
    const plan = hardCutPlan()
    const graph = buildFfmpegGraph(plan, ASSETS)
    const scaleNodes = graph.nodes.filter((n) => n.filter === 'scale' && n.id.startsWith('vzwscale'))
    // The fixture's one zoom is `medium` (scaleMilli 1120); its held window
    // reaches that scale exactly, and the eased steps around it never overshoot.
    expect(scaleNodes.some((n) => n.args.some((a) => a.key === 'w' && a.value === 'iw*1.120'))).toBe(true)
    for (const n of scaleNodes) {
      const w = n.args.find((a) => a.key === 'w')!.value as string
      const milli = Number(w.replace('iw*', ''))
      expect(milli).toBeGreaterThan(1.0)
      expect(milli).toBeLessThanOrEqual(1.120)
    }
  })
})

describe('zooms are time-gated, never permanent or compounding', () => {
  // This is the batch's core fix: the old graph applied a zoom's scale+crop to
  // whatever it was handed and chained the RESULT onward unconditionally, so
  // the zoomed framing never ended and a second zoom scaled the first zoom's
  // output rather than the original frame. Every assertion here is aimed at
  // one of those two failure modes specifically.

  it('framing returns to normal before and after the zoom window, with no scale/crop', () => {
    const plan = hardCutPlan()
    const zoom = plan.video.zooms[0]
    const graph = buildFfmpegGraph(plan, ASSETS)
    const trims = graph.nodes.filter((n) => n.id.startsWith('vzwtrim'))
    const first = trims[0]
    const last = trims[trims.length - 1]
    // The very first window starts the video and ends exactly where the zoom's
    // own ease-in begins; the very last starts exactly where its ease-out ends
    // and runs to the plan's declared output duration.
    expect(first.args).toContainEqual({ key: 'start', value: '0.000' })
    expect(first.args).toContainEqual({ key: 'end', value: msToSecondsLiteral(zoom.outputStartMs) })
    expect(last.args).toContainEqual({ key: 'start', value: msToSecondsLiteral(zoom.outputEndMs) })
    expect(last.args).toContainEqual({ key: 'end', value: msToSecondsLiteral(plan.output.durationMs) })
    // Neither boundary window has a matching scale/crop node — the frame passes
    // through untouched, which is what "returns to normal" means structurally.
    const idxOf = (id: string): string => id.replace('vzwtrim', '')
    expect(graph.nodes.some((n) => n.id === `vzwscale${idxOf(first.id)}`)).toBe(false)
    expect(graph.nodes.some((n) => n.id === `vzwscale${idxOf(last.id)}`)).toBe(false)
  })

  it('every zoom window is trimmed from the joined stream directly, so two zooms cannot compound', () => {
    const base = hardCutPlan()
    const plan = JSON.parse(JSON.stringify(base)) as EditPlanV1
    // Two well-separated, un-eased zooms so each is exactly one hold window —
    // easing is proven separately above, this test is about compounding only.
    plan.video.zooms = [
      {
        index: 0, outputStartMs: 1000, outputEndMs: 2000, scaleMilli: 1200,
        intensity: 'medium', reasonCode: 'emphasis_word', anchorWordIndex: 0,
        easeInMs: 0, easeOutMs: 0,
      },
      {
        index: 1, outputStartMs: 5000, outputEndMs: 6000, scaleMilli: 1400,
        intensity: 'strong', reasonCode: 'emphasis_word', anchorWordIndex: 1,
        easeInMs: 0, easeOutMs: 0,
      },
    ]
    const graph = buildFfmpegGraph(plan, ASSETS)
    const trims = graph.nodes.filter((n) => n.id.startsWith('vzwtrim'))
    // 5 windows: [0,1000) normal, [1000,2000) zoom0, [2000,5000) normal,
    // [5000,6000) zoom1, [6000,duration) normal.
    expect(trims).toHaveLength(5)
    // A filtergraph pad has exactly one consumer, so the joined stream is
    // fanned out through a `split` before any window trims it — every window
    // reads one of THAT split's own outputs. If zoom1 compounded on zoom0's
    // output, its trim's input would be zoom0's crop label instead.
    const split = graph.nodes.find((n) => n.filter === 'split')
    expect(split).toBeDefined()
    expect(split!.inputs).toHaveLength(1)
    for (const t of trims) expect(split!.outputs).toContain(t.inputs[0])
    // `vzwsar1` (zoom0's final, SAR-corrected output) legitimately feeds the
    // final concat — that is not compounding. It would BE compounding if any
    // trim or scale fed on it instead of a split output, which is what this
    // checks.
    const downstreamOfZoom0 = graph.nodes.filter((n) => n.id.startsWith('vzwtrim') || n.id.startsWith('vzwscale'))
    expect(downstreamOfZoom0.some((n) => n.inputs.includes('vzwsar1'))).toBe(false)
    const scale0 = graph.nodes.find((n) => n.id === 'vzwscale1')
    const scale1 = graph.nodes.find((n) => n.id === 'vzwscale3')
    expect(scale0?.args).toContainEqual({ key: 'w', value: 'iw*1.200' })
    expect(scale1?.args).toContainEqual({ key: 'w', value: 'iw*1.400' })
    // The un-zoomed windows (0, 2, 4) never got a scale/crop node at all.
    for (const idx of [0, 2, 4]) {
      expect(graph.nodes.some((n) => n.id === `vzwscale${idx}`)).toBe(false)
    }
  })

  it('the zoom windows are concatenated back together, covering the full output duration exactly', () => {
    const plan = hardCutPlan()
    const graph = buildFfmpegGraph(plan, ASSETS)
    const trims = graph.nodes.filter((n) => n.id.startsWith('vzwtrim'))
    const coveredMs = trims.reduce((n, t) => {
      const start = Number(t.args.find((a) => a.key === 'start')!.value)
      const end = Number(t.args.find((a) => a.key === 'end')!.value)
      return n + Math.round((end - start) * 1000)
    }, 0)
    expect(coveredMs).toBe(plan.output.durationMs)
    const concat = graph.nodes.find((n) => n.id === 'zoomconcat')
    expect(concat?.args).toContainEqual({ key: 'n', value: trims.length })
    expect(concat?.args).toContainEqual({ key: 'a', value: 0 })
  })
})

describe('unsupported instructions FAIL rather than substituting', () => {
  // BATCH 8.3 CHANGED WHAT THIS PROVES, so it is rewritten rather than left to
  // pass for a new reason. In 8.1 a restrained transition was refused because
  // crossfades were unimplemented. They are implemented now, and if this test
  // had been left alone it would still be green — via the "no bounds supplied"
  // refusal — while claiming to demonstrate something that is no longer true.
  // A test whose name outlives its subject is worse than a deleted one.
  it('a restrained transition with NO bounds supplied is refused, never assumed', () => {
    const plan = compileEditPlan({ ...baseInput(), policy: policy() }).plan
    expect(plan.video.transitions.length).toBeGreaterThan(0)
    expect(codeOf(() => buildFfmpegGraph(plan, ASSETS))).toBe('render_graph_invalid')
  })

  it('CONTROL: the identical plan with the transition removed builds fine', () => {
    // Proves the failure above is about the transition and not about the fixture
    // being unbuildable for some other reason.
    expect(() => buildFfmpegGraph(hardCutPlan(), ASSETS)).not.toThrow()
  })

  it('captions without an ASS document are refused rather than dropped', () => {
    const plan = hardCutPlan()
    expect(plan.captions.cues.length).toBeGreaterThan(0)
    expect(codeOf(() => buildFfmpegGraph(plan, { ...ASSETS, assPath: null }))).toBe('render_graph_invalid')
  })

  it('a music bed is refused', () => {
    const plan = JSON.parse(JSON.stringify(hardCutPlan())) as EditPlanV1
    ;(plan.audio as unknown as Record<string, unknown>).music = { trackId: 'x' }
    expect(codeOf(() => buildFfmpegGraph(plan, ASSETS))).toBe('render_graph_invalid')
  })

  it('a non-magnifying zoom is refused', () => {
    const plan = JSON.parse(JSON.stringify(hardCutPlan())) as EditPlanV1
    plan.video.zooms[0].scaleMilli = 1000
    expect(codeOf(() => buildFfmpegGraph(plan, ASSETS))).toBe('render_graph_invalid')
  })
})

describe('paths and values cannot become behaviour', () => {
  it('refuses a relative path, a URL, an option-lookalike and a traversal', () => {
    for (const bad of ['relative/x.mp4', 'http://evil/x.mp4', '-i', '/a/../../etc/passwd', 'file:/x']) {
      expect(codeOf(() => buildFfmpegGraph(hardCutPlan(), { ...ASSETS, sourcePath: bad })))
        .toBe('render_graph_invalid')
    }
  })

  it('refuses a path containing a filter separator', () => {
    expect(codeOf(() => buildFfmpegGraph(hardCutPlan(), { ...ASSETS, assPath: '/tmp/a:b.ass' })))
      .toBe('render_graph_invalid')
    expect(codeOf(() => buildFfmpegGraph(hardCutPlan(), { ...ASSETS, outputPath: "/tmp/a'b.mp4" })))
      .toBe('render_graph_invalid')
  })

  it('CONTROL: the value alphabet rejects a filter separator smuggled into an argument', () => {
    const graph = buildFfmpegGraph(hardCutPlan(), ASSETS)
    const hostile = JSON.parse(JSON.stringify(graph)) as typeof graph
    hostile.nodes[0].args.push({ key: 'x', value: 'a:drawtext=text=pwned' })
    expect(codeOf(() => serializeFilterGraph(hostile))).toBe('render_graph_invalid')
    // The unmodified graph serializes cleanly, so the rejection is about the
    // smuggled value alone.
    expect(() => serializeFilterGraph(graph)).not.toThrow()
  })

  it('CONTROL: the label alphabet rejects a smuggled chain terminator', () => {
    const graph = buildFfmpegGraph(hardCutPlan(), ASSETS)
    const hostile = JSON.parse(JSON.stringify(graph)) as typeof graph
    hostile.nodes[1].outputs = ['x];anullsrc[y']
    expect(codeOf(() => serializeFilterGraph(hostile))).toBe('render_graph_invalid')
  })
})

describe('determinism', () => {
  it('the same plan and assets produce the same graph, argv and digest', () => {
    const plan = hardCutPlan()
    const a = buildFfmpegGraph(plan, ASSETS)
    const b = buildFfmpegGraph(plan, ASSETS)
    expect(buildFfmpegArgs(a)).toEqual(buildFfmpegArgs(b))
    expect(serializeFilterGraph(a)).toBe(serializeFilterGraph(b))
    expect(ffmpegGraphSha256(a)).toBe(ffmpegGraphSha256(b))
  })

  it('a different plan produces a different digest', () => {
    const a = buildFfmpegGraph(hardCutPlan(), ASSETS)
    const other = baseInput()
    other.decision.transitionPolicy = 'hard_cuts_only'
    other.decision.selections = [0]
    const b = buildFfmpegGraph(compileEditPlan({ ...other, policy: policy() }).plan, ASSETS)
    expect(ffmpegGraphSha256(a)).not.toBe(ffmpegGraphSha256(b))
  })

  it('a different output path produces a different digest', () => {
    const plan = hardCutPlan()
    const a = buildFfmpegGraph(plan, ASSETS)
    const b = buildFfmpegGraph(plan, { ...ASSETS, outputPath: '/var/tmp/edit/other.mp4' })
    expect(ffmpegGraphSha256(a)).not.toBe(ffmpegGraphSha256(b))
  })
})

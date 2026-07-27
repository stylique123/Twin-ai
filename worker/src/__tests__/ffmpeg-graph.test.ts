// Typed plan -> FFmpeg graph -> argument ARRAY.
//
// Three things are being proven, and nothing else:
//   1. the output is an argv ARRAY, never a shell string;
//   2. an unsupported instruction FAILS rather than being silently substituted;
//   3. the graph and its argv are deterministic.
import { describe, it, expect } from 'vitest'
import {
  buildFfmpegGraph, buildFfmpegArgs, serializeFilterGraph, ffmpegGraphSha256,
  msToSecondsLiteral, milliToScalarLiteral, checkExpr,
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
// GATE-0 A1: the fixture is hard-cuts-only now, so this helper is no longer
// compensating for a restrained default — it is kept because these tests assert
// the hard-cut graph shape explicitly rather than inheriting it.
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
    const trims = graph.nodes.filter((n) => n.filter === 'trim')
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

  // CX1. This asserted the OLD shape: one scale+crop pair per zoom, with a
  // constant magnification. That shape is what made every zoom apply to the whole
  // video and made multiple zooms compound. There is now exactly ONE zoompan node
  // carrying every zoom window, because chaining per-zoom nodes would rescale an
  // already-rescaled frame.
  it('emits exactly one zoompan node carrying every zoom window', () => {
    const plan = hardCutPlan()
    const graph = buildFfmpegGraph(plan, ASSETS)
    const zoomNodes = graph.nodes.filter((n) => n.filter === 'zoompan')
    expect(zoomNodes).toHaveLength(1)
    const z = zoomNodes[0].args.find((a) => a.key === 'z')
    expect(z?.isExpr).toBe(true)
    for (const zoom of plan.video.zooms) {
      expect(String(z?.value)).toContain((zoom.outputStartMs / 1000).toFixed(3))
      expect(String(z?.value)).toContain((zoom.outputEndMs / 1000).toFixed(3))
    }
  })

  it('CONTROL: the expression channel still refuses a smuggled identifier', () => {
    // Proves isExpr is a BOUNDED channel and not an escape hatch: only the
    // whitelisted identifiers are expressible, so no plan-derived text could ride
    // this path even if it were somehow marked as an expression.
    expect(() => checkExpr('if(between(t,1,2),1.5,1)')).not.toThrow()
    expect(() => checkExpr("drawtext(x)")).toThrow()
    expect(() => checkExpr("1');drawbox=c=red:")).toThrow()
    expect(() => checkExpr('t;1')).toThrow()
  })
})

describe('unsupported instructions FAIL rather than substituting', () => {
  // GATE-0 A1. The compiler can no longer produce a plan carrying a transition,
  // so this can no longer be driven through compileEditPlan. The graph builder's
  // refusal is still the last line of defence — a plan reaching it from anywhere
  // else (a database row written by an older build, say) must still be refused
  // rather than quietly rendered as a hard cut. Constructed directly, on purpose.
  it('a transition reaching the graph builder is refused, not quietly rendered as a hard cut', () => {
    const plan = compileEditPlan({ ...baseInput(), policy: policy() }).plan
    expect(plan.video.transitions).toEqual([])
    const smuggled = JSON.parse(JSON.stringify(plan)) as typeof plan
    ;(smuggled.video.transitions as unknown[]).push(
      { index: 0, atSegmentIndex: 1, kind: 'crossfade', overlapMs: 120 },
    )
    expect(codeOf(() => buildFfmpegGraph(smuggled, ASSETS))).toBe('render_graph_invalid')
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

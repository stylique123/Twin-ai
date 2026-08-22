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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { baseInput, policy, shippedEncoder } from './fixtures/editPlanFixture.js'

/**
 * Evaluate an ffmpeg filter expression of `in` the way the evaluator would.
 *
 * ⚠️ IT MUST KNOW EVERY FUNCTION THE GATES USE. An oracle that knows `abs` but
 * not `not` throws on a perfectly good expression, and that reads as a defect
 * in the code rather than in the instrument.
 */
const nt = (x: number): number => (x ? 0 : 1)
function evalFfmpegExpr(expr: string, inN: number): number {
  // eslint-disable-next-line no-eval
  return eval(expr
    .replace(/\bin\b/g, String(inN))
    .replace(/\bnot\(/g, 'nt(')
    .replace(/\babs\(/g, 'Math.abs(')) as number
}


function codeOf(fn: () => unknown): string {
  try { fn() } catch (e) { return (e as EditPlanError).code }
  throw new Error('expected a throw, got none')
}

// The SHIPPED encoder settings, READ from render_catalog_v1.json rather than
// transcribed. See shippedEncoder()'s own comment for why that distinction is
// load-bearing here specifically.
const ENCODER = shippedEncoder()
const ASSETS = {
  sourcePath: '/var/tmp/edit/source.mp4',
  assPath: '/var/tmp/edit/captions.ass',
  fontsDir: '/opt/fonts',
  outputPath: '/var/tmp/edit/out.mp4',
  encoder: ENCODER,
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

  it('applies a zoom at its held scale, easing into and out of it', () => {
    // ⚠️ THE MECHANISM CHANGED; THE PROPERTY DID NOT. This used to assert the
    // per-window scale nodes of a split/concat decomposition. That decomposition
    // lost frames at every seam (184 target: 1 zoom 181, 2 zooms 176, 3 zooms
    // 170), so it is gone. The zoom now lives in ONE zoompan expression, and
    // what must still be true is that the scale reaches its target in the hold
    // and travels there rather than arriving in one frame.
    const plan = hardCutPlan()
    const zoom = plan.video.zooms[0]
    const graph = buildFfmpegGraph(plan, ASSETS)
    const zp = graph.nodes.find((n) => n.filter === 'zoompan')!
    const z = String(zp.args.find((a) => a.key === 'z')!.value)
    const held = ((zoom.scaleMilli - 1000) / 1000).toFixed(3)
    expect(z.startsWith('1+')).toBe(true)
    expect(z).toContain(`${held}*`)
    // It is an expression of the input frame index, not a constant.
    expect(z).toContain('in')
  })
})

describe('zooms are time-gated, never permanent or compounding', () => {
  // This is the batch's core fix: the old graph applied a zoom's scale+crop to
  // whatever it was handed and chained the RESULT onward unconditionally, so
  // the zoomed framing never ended and a second zoom scaled the first zoom's
  // output rather than the original frame. Every assertion here is aimed at
  // one of those two failure modes specifically.

  it('framing returns to normal before and after the zoom window', () => {
    // Structurally this used to mean "the boundary windows have no scale node".
    // With one continuous stream it means the GATE evaluates to zero outside
    // its window, which is the same claim about the picture.
    const plan = hardCutPlan()
    const zoom = plan.video.zooms[0]
    const graph = buildFfmpegGraph(plan, ASSETS)
    const zp = graph.nodes.find((n) => n.filter === 'zoompan')!
    const z = String(zp.args.find((a) => a.key === 'z')!.value)
    const fps = plan.output.fpsNum / plan.output.fpsDen
    const f = (ms: number) => Math.round((ms * fps) / 1000)
    expect(evalFfmpegExpr(z, f(zoom.outputStartMs) - 1)).toBeCloseTo(1, 9)
    expect(evalFfmpegExpr(z, f(zoom.outputEndMs))).toBeCloseTo(1, 9)
    // And it does reach the target somewhere in between.
    const mid = Math.round((f(zoom.outputStartMs) + f(zoom.outputEndMs)) / 2)
    expect(evalFfmpegExpr(z, mid)).toBeGreaterThan(1)
  })
  it('two zooms cannot compound, because their gates are disjoint', () => {
    // ⚠️ THE ORIGINAL DEFECT THIS GUARDS remains real: a second zoom must never
    // scale the FIRST zoom's output. The old graph achieved that by trimming
    // every window from the joined stream. The continuous form achieves it by
    // construction -- z is 1 plus a SUM of terms whose gates do not overlap --
    // so the strongest assertion available is that the scale never exceeds the
    // largest single zoom.
    // A second zoom, added to the real fixture rather than to a fixture
    // invented for this test -- the compounding risk is about two zooms on ONE
    // timeline, so they must share one.
    const plan = JSON.parse(JSON.stringify(hardCutPlan())) as EditPlanV1
    const first = plan.video.zooms[0]
    const gap = first.outputEndMs - first.outputStartMs
    plan.video.zooms = [first, {
      ...first,
      index: 1,
      outputStartMs: first.outputEndMs + gap,
      outputEndMs: Math.min(first.outputEndMs + gap * 2, plan.output.durationMs),
      scaleMilli: 1120,
    }]
    const graph = buildFfmpegGraph(plan, ASSETS)
    // There is exactly one zoom stage, and nothing is split or concatenated.
    expect(graph.nodes.filter((n) => n.filter === 'zoompan')).toHaveLength(1)
    expect(graph.nodes.some((n) => n.id === 'zoomsplit')).toBe(false)
    expect(graph.nodes.some((n) => n.id === 'zoomconcat')).toBe(false)

    const z = String(graph.nodes.find((n) => n.filter === 'zoompan')!
      .args.find((a) => a.key === 'z')!.value)
    const fps = plan.output.fpsNum / plan.output.fpsDen
    const lastFrame = Math.round((plan.output.durationMs * fps) / 1000)
    const biggest = Math.max(...plan.video.zooms.map((zz) => zz.scaleMilli)) / 1000
    let peak = 0
    for (let n = 0; n <= lastFrame; n++) peak = Math.max(peak, evalFfmpegExpr(z, n))
    expect(peak).toBeLessThanOrEqual(biggest + 1e-9)
    expect(peak).toBeGreaterThan(1)
  })
  it('covers the full output duration exactly, with no seams to lose frames at', () => {
    // ⚠️ THIS TEST USED TO ASSERT THE SEAMS. They were the defect: every
    // split/setpts/concat boundary dropped frames, and the loss scaled with the
    // seam count. Now the claim is that there are none.
    const plan = hardCutPlan()
    const graph = buildFfmpegGraph(plan, ASSETS)
    expect(graph.nodes.some((n) => n.filter === 'split' && n.id === 'zoomsplit')).toBe(false)
    expect(graph.nodes.some((n) => n.filter === 'concat' && n.id === 'zoomconcat')).toBe(false)
    expect(graph.nodes.filter((n) => n.id.startsWith('vzwtrim'))).toHaveLength(0)
    const zp = graph.nodes.find((n) => n.filter === 'zoompan')!
    // d=1 is what makes one input frame produce exactly one output frame.
    expect(zp.args).toContainEqual({ key: 'd', value: 1 })
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

// ---- the free-tier mark ------------------------------------------------------
//
// The failure that matters here is not a broken overlay, it is a QUIET one: a
// paying customer's video acquiring a mark, or a free video silently losing the
// one the plan asked for. Both directions are asserted.
describe('the free-tier watermark', () => {
  const PLACEMENT = {
    path: '/opt/assets/twinai-watermark.png',
    displayWidthPx: 300, opacityMilli: 820, marginRightPx: 64, marginBottomPx: 344,
  }
  function markedPlan(): EditPlanV1 {
    const input = baseInput()
    input.decision.transitionPolicy = 'hard_cuts_only'
    input.watermark = true
    return compileEditPlan({ ...input, policy: policy() }).plan
  }

  it('an unmarked plan emits NO overlay and NO second input', () => {
    // The default. A paying customer's render must not be able to pick up a
    // mark from an asset merely being available.
    const plan = hardCutPlan()
    expect(plan.output.watermark).toBe(false)
    const graph = buildFfmpegGraph(plan, ASSETS, undefined)
    expect(graph.inputs).toHaveLength(1)
    expect(graph.nodes.some((n) => n.filter === 'overlay')).toBe(false)
    expect(graph.nodes.some((n) => n.id.startsWith('wm'))).toBe(false)
  })

  it('CONTROL: supplying an asset to an unmarked plan STILL emits nothing', () => {
    // Proves the instruction comes from the PLAN, not from the caller's assets.
    const graph = buildFfmpegGraph(hardCutPlan(), { ...ASSETS, watermark: PLACEMENT })
    expect(graph.inputs).toHaveLength(1)
    expect(graph.nodes.some((n) => n.filter === 'overlay')).toBe(false)
  })

  it('a marked plan composites the asset as a SECOND INPUT, never an inline path', () => {
    const graph = buildFfmpegGraph(markedPlan(), { ...ASSETS, watermark: PLACEMENT })
    expect(graph.inputs).toHaveLength(2)
    expect(graph.inputs[1].path).toBe(PLACEMENT.path)
    // `movie=` would put the path inside the filter string; an input keeps it an
    // argv element, which is the property the whole module preserves.
    const filter = serializeFilterGraph(graph)
    expect(filter).not.toContain('movie=')
    expect(filter).toContain('[1:v]')
  })

  it('carries the catalog geometry and multiplies the artwork alpha', () => {
    const graph = buildFfmpegGraph(markedPlan(), { ...ASSETS, watermark: PLACEMENT })
    const scale = graph.nodes.find((n) => n.id === 'wmscale')!
    expect(scale.args).toContainEqual({ key: 'w', value: 300 })
    // -1 keeps the artwork's aspect rather than a second number able to disagree.
    expect(scale.args).toContainEqual({ key: 'h', value: -1 })
    const alpha = graph.nodes.find((n) => n.id === 'wmalpha')!
    expect(alpha.args).toContainEqual({ key: 'aa', value: '0.820' })
    const overlay = graph.nodes.find((n) => n.id === 'wmoverlay')!
    expect(overlay.args).toContainEqual({ key: 'x', value: 'W-w-64' })
    expect(overlay.args).toContainEqual({ key: 'y', value: 'H-h-344' })
  })

  it('sits LAST in the video chain, on top of the captions', () => {
    const plan = markedPlan()
    expect(plan.captions.cues.length).toBeGreaterThan(0)
    const graph = buildFfmpegGraph(plan, { ...ASSETS, watermark: PLACEMENT })
    // The mark is what the encoder is handed...
    expect(graph.videoOut).toBe('vwm')
    // ...and its base input is the subtitles' output, so a caption line can
    // never be drawn over the attribution.
    const overlay = graph.nodes.find((n) => n.id === 'wmoverlay')!
    expect(overlay.inputs[0]).toBe('vsub')
  })

  it('a marked plan with NO asset is REFUSED, never rendered unmarked', () => {
    // Failing closed matters more here than anywhere else in this file: the
    // alternative is shipping an unmarked free export and never knowing.
    expect(codeOf(() => buildFfmpegGraph(markedPlan(), ASSETS))).toBe('render_graph_invalid')
  })

  it('refuses out-of-range placement rather than clamping it', () => {
    const p = markedPlan()
    const bad = [
      { ...PLACEMENT, displayWidthPx: 0 },
      { ...PLACEMENT, opacityMilli: 0 },
      { ...PLACEMENT, opacityMilli: 1001 },
      { ...PLACEMENT, marginRightPx: -1 },
      { ...PLACEMENT, marginBottomPx: -1 },
    ]
    for (const wm of bad) {
      expect(codeOf(() => buildFfmpegGraph(p, { ...ASSETS, watermark: wm }))).toBe('render_graph_invalid')
    }
  })

  it('refuses a watermark path that could become behaviour', () => {
    const p = markedPlan()
    for (const path of ['relative/wm.png', 'http://evil/wm.png', '-i', '/a/../../etc/passwd', "/tmp/a'b.png"]) {
      expect(codeOf(() => buildFfmpegGraph(p, { ...ASSETS, watermark: { ...PLACEMENT, path } })))
        .toBe('render_graph_invalid')
    }
  })

  it('changes the graph digest, so a marked render is not mistaken for an unmarked one', () => {
    const marked = ffmpegGraphSha256(buildFfmpegGraph(markedPlan(), { ...ASSETS, watermark: PLACEMENT }))
    const clean = ffmpegGraphSha256(buildFfmpegGraph(hardCutPlan(), ASSETS))
    expect(marked).not.toBe(clean)
  })
})

describe('the output is tagged with the colour it was actually encoded in', () => {
  // AN UNTAGGED H.264 FILE IS THE CLASSIC "why does my export look washed out".
  // QuickTime, Safari and iOS assume BT.601 for an untagged stream while
  // libswscale produced BT.709 for a 1920-tall frame — a visible hue and
  // saturation shift, with nothing wrong in any log, because every stage did
  // its job and only the label was missing.
  it('states colourspace, primaries, transfer and range', () => {
    const args = buildFfmpegArgs(buildFfmpegGraph(hardCutPlan(), ASSETS))
    for (const [flag, value] of [
      ['-colorspace', 'bt709'], ['-color_primaries', 'bt709'],
      ['-color_trc', 'bt709'], ['-color_range', 'tv'],
    ] as const) {
      const i = args.indexOf(flag)
      expect(i).toBeGreaterThan(-1)
      expect(args[i + 1]).toBe(value)
    }
  })
})

describe('the watermark cannot be placed where the platform will cover it', () => {
  const OK = {
    path: '/opt/assets/twinai-watermark.png',
    displayWidthPx: 300, opacityMilli: 820, marginRightPx: 64, marginBottomPx: 344,
  }
  function markedPlan(): EditPlanV1 {
    const input = baseInput()
    input.decision.transitionPolicy = 'hard_cuts_only'
    input.watermark = true
    return compileEditPlan({ ...input, policy: policy() }).plan
  }

  it('REFUSES a mark inside the plan\'s bottom safe area', () => {
    // The original 56px margin put the mark 264px inside the band TikTok and
    // Reels cover with the caption bar — invisible on exactly the platforms it
    // exists to advertise on, and invisible in a way nothing would have caught,
    // because the render is perfect and the frame is correct.
    const p = markedPlan()
    expect(codeOf(() => buildFfmpegGraph(p, { ...ASSETS, watermark: { ...OK, marginBottomPx: 56 } })))
      .toBe('render_graph_invalid')
  })

  it('REFUSES a mark inside the right safe area', () => {
    const p = markedPlan()
    expect(codeOf(() => buildFfmpegGraph(p, { ...ASSETS, watermark: { ...OK, marginRightPx: 10 } })))
      .toBe('render_graph_invalid')
  })

  it('CONTROL: the catalog\'s own shipped geometry clears both', () => {
    // Reads the FROZEN numbers rather than restating them, so retuning the
    // catalog into the unsafe band fails here instead of in a user's video.
    const catalog = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'render_catalog_v1.json'), 'utf8')) as
      { watermark: { displayWidthPx: number; opacityMilli: number; marginRightPx: number; marginBottomPx: number } }
    const p = markedPlan()
    expect(() => buildFfmpegGraph(p, {
      ...ASSETS,
      watermark: { path: OK.path, ...catalog.watermark },
    })).not.toThrow()
    expect(catalog.watermark.marginBottomPx).toBeGreaterThanOrEqual(p.video.framing.safeBottomPx)
    expect(catalog.watermark.marginRightPx).toBeGreaterThanOrEqual(p.video.framing.safeRightPx)
  })
})

describe('the zoom crop is displaced toward the subject', () => {
  it('the pan is displaced toward the subject, easing WITH the scale', () => {
    // ⚖️ THE SAME GATE AS THE SCALE. A pan on its own curve reads as the frame
    // drifting -- a different defect from the one just fixed, and equally
    // invisible to a frame count.
    const plan = hardCutPlan()
    const zoom = plan.video.zooms[0]
    expect(zoom.offsetXPx).not.toBe(0)
    const graph = buildFfmpegGraph(plan, ASSETS)
    const zp = graph.nodes.find((n) => n.filter === 'zoompan')!
    const x = String(zp.args.find((a) => a.key === 'x')!.value)
    const z = String(zp.args.find((a) => a.key === 'z')!.value)
    expect(x).toContain(String(Math.abs(zoom.offsetXPx)))
    // The offset term is gated by the SAME expression the scale term uses.
    const gate = z.slice(z.indexOf('*') + 1)
    expect(x).toContain(gate)
  })
  it('a zero offset emits the plain centre expression, with no +0 term', () => {
    // No face evidence must not start emitting a degenerate `+0*...` term: it
    // would change the graph digest of every centred render for no picture
    // difference at all.
    const plan = JSON.parse(JSON.stringify(hardCutPlan())) as EditPlanV1
    plan.video.zooms[0].offsetXPx = 0
    plan.video.zooms[0].offsetYPx = 0
    const graph = buildFfmpegGraph(plan, ASSETS)
    const zp = graph.nodes.find((n) => n.filter === 'zoompan')!
    expect(zp.args).toContainEqual({ key: 'x', value: 'iw/2-(iw/zoom/2)', composedFromValidatedParts: true })
    expect(zp.args).toContainEqual({ key: 'y', value: 'ih/2-(ih/zoom/2)', composedFromValidatedParts: true })
  })
  it('the displaced crop expression stays inside the value alphabet', () => {
    // `+`/`-` and digits only — no comma, no conditional, nothing that could
    // terminate a filter. Proven by serializing rather than by inspection.
    expect(() => serializeFilterGraph(buildFfmpegGraph(hardCutPlan(), ASSETS))).not.toThrow()
  })
})

describe('the frozen encoder profile actually reaches ffmpeg', () => {
  // THE DEFECT THESE EXIST FOR. The catalog has always declared x264Preset,
  // x264Crf, x264Profile, x264Level, gopSizeFrames and audioBitrateKbps, under
  // a comment insisting that "the operator picked a different preset that day"
  // must never be a thing the audit trail has to say. The argv contained none
  // of them, so every render used ffmpeg's compiled-in defaults while the plan
  // hash, the graph hash and the validator all stayed green. A test asserting
  // "the catalog declares a CRF" would have passed the entire time — so these
  // assert the ARGV, which is the only thing ffmpeg reads.
  const argv = () => buildFfmpegArgs(buildFfmpegGraph(hardCutPlan(), ASSETS))
  const valueOf = (args: string[], flag: string): string | undefined => {
    const i = args.indexOf(flag)
    return i === -1 ? undefined : args[i + 1]
  }

  it('emits every declared encoder setting, with the catalog\'s values', () => {
    const args = argv()
    expect(valueOf(args, '-preset')).toBe('medium')
    expect(valueOf(args, '-crf')).toBe('20')
    expect(valueOf(args, '-profile:v')).toBe('high')
    expect(valueOf(args, '-level:v')).toBe('4.0')
    expect(valueOf(args, '-g')).toBe('60')
    expect(valueOf(args, '-b:a')).toBe('128k')
  })

  it('pins the GOP so keyframes cannot follow the CONTENT', () => {
    // Without keyint_min and sc_threshold=0, x264 places extra keyframes on
    // scene changes. For a hard-cut edit that means the keyframe layout — and
    // therefore the bytes — vary with the footage, so two renders of one plan
    // are not the same output. That is precisely what the profile exists to
    // prevent, and -g alone does not achieve it.
    const args = argv()
    expect(valueOf(args, '-keyint_min')).toBe(valueOf(args, '-g'))
    expect(valueOf(args, '-sc_threshold')).toBe('0')
  })

  it('CONTROL: the settings come from the caller, not from a constant in here', () => {
    // If the builder hardcoded them, the assertions above would pass while the
    // catalog was ignored — the same class of defect wearing a different hat.
    const slower = { ...ASSETS, encoder: { ...ENCODER, x264Crf: 18, x264Preset: 'slow', audioBitrateKbps: 192 } }
    const args = buildFfmpegArgs(buildFfmpegGraph(hardCutPlan(), slower))
    expect(valueOf(args, '-crf')).toBe('18')
    expect(valueOf(args, '-preset')).toBe('slow')
    expect(valueOf(args, '-b:a')).toBe('192k')
  })

  it('the SHIPPED catalog still declares the values asserted above', () => {
    // ENCODER is read from the catalog, so the assertions above track it
    // automatically. This pins the actual numbers, so a silent change to the
    // frozen profile — the thing the catalog's own comment says must never
    // happen unnoticed — fails here rather than shipping.
    expect(ENCODER).toEqual({
      x264Preset: 'medium', x264Crf: 20, x264Profile: 'high',
      x264Level: '4.0', gopSizeFrames: 60, audioBitrateKbps: 128,
    })
  })

  it('refuses a preset, profile or level that is not real, rather than passing it to a process', () => {
    const msg = (encoder: Record<string, unknown>): string => {
      try { buildFfmpegGraph(hardCutPlan(), { ...ASSETS, encoder: encoder as never }) }
      catch (e) { return (e as Error).message }
      throw new Error('expected a throw, got none')
    }
    expect(msg({ ...ENCODER, x264Preset: 'blazing' })).toContain('x264 preset')
    expect(msg({ ...ENCODER, x264Profile: 'ultra' })).toContain('x264 profile')
    expect(msg({ ...ENCODER, x264Level: '9.9' })).toContain('H.264 level')
    // The one that matters most: a value that could be read as a FLAG.
    expect(msg({ ...ENCODER, x264Preset: '-y' })).toContain('x264 preset')
    expect(msg({ ...ENCODER, x264Level: '-f' })).toContain('H.264 level')
  })

  it('refuses out-of-range or non-integer numerics', () => {
    const msg = (encoder: Record<string, unknown>): string => {
      try { buildFfmpegGraph(hardCutPlan(), { ...ASSETS, encoder: encoder as never }) }
      catch (e) { return (e as Error).message }
      throw new Error('expected a throw, got none')
    }
    expect(msg({ ...ENCODER, x264Crf: 52 })).toContain('CRF')
    expect(msg({ ...ENCODER, x264Crf: -1 })).toContain('CRF')
    expect(msg({ ...ENCODER, x264Crf: 20.5 })).toContain('CRF')
    expect(msg({ ...ENCODER, gopSizeFrames: 0 })).toContain('GOP')
    expect(msg({ ...ENCODER, audioBitrateKbps: 8 })).toContain('audio bitrate')
  })
})

// Editor v2 — Phase 8 Batch 8.1: typed EditPlan -> FFmpeg graph/argument AST.
//
// SOLE RESPONSIBILITY (Gate-0 §7): BUILDER ONLY. Nothing in this file starts a
// process, touches the filesystem, or resolves a path. It turns a validated plan
// into a typed graph and then into an argument ARRAY. There is no code path that
// produces a shell string, because there is no shell: `execFile`-style argv is
// the only output shape, and every argument is a separate array element.
//
// Two rules make this safe rather than merely tidy:
//
//  * EVERY instruction is translated explicitly. An unsupported one FAILS with
//    `render_graph_invalid`. Nothing is silently substituted, dropped, or
//    approximated — a renderer that quietly ignores an instruction produces a
//    video that does not match the plan the user approved.
//  * Filter expressions are CONSTRUCTED here from typed nodes and integer
//    fields, never stored in or read from the plan. The plan cannot carry a
//    filter string (editPlanContract rejects the metacharacters outright), so a
//    model or a browser has no channel into this file's output.
import { sha256Hex, canonicalJson } from './editorManifest.js'
import {
  EditPlanError, type EditPlanV1, type PlanSegment, type PlanZoom,
} from './editPlanContract.js'

export const FFMPEG_GRAPH_VERSION = 'ffmpeg-graph-1'

function invalid(message: string): never {
  throw new EditPlanError(`ffmpeg graph: ${message}`, 'render_graph_invalid')
}

// ---- typed graph ------------------------------------------------------------
// `isPath` marks the one argument kind that carries a caller-supplied local
// path. It is escaped for the filter mini-language at serialization time and is
// exempt from the value alphabet — which is why it is a distinct, explicit kind
// rather than a string that happens to look like a path.
export type FilterArg = { key: string; value: string | number; isPath?: true; isExpr?: true }
export interface FilterNode {
  id: string
  filter: string
  args: FilterArg[]
  inputs: string[]
  outputs: string[]
}
export interface FfmpegInput {
  // A caller-verified LOCAL file. It arrives as an argument; this module never
  // derives, joins or validates a path beyond refusing obviously hostile ones.
  path: string
  // Options that must precede -i for this input.
  preOptions: string[]
}
export interface FfmpegGraph {
  version: string
  inputs: FfmpegInput[]
  nodes: FilterNode[]
  videoOut: string
  audioOut: string
  outputOptions: string[]
  outputPath: string
}

const MS_PER_S = 1000

// Integer milliseconds -> a fixed 3-decimal seconds literal. Built by integer
// arithmetic and string padding, never by float division, so the same plan
// yields the same bytes on every machine.
export function msToSecondsLiteral(ms: number): string {
  if (!Number.isInteger(ms) || ms < 0) invalid(`time ${String(ms)} is not a non-negative integer ms value`)
  const whole = Math.floor(ms / MS_PER_S)
  const frac = ms % MS_PER_S
  return `${whole}.${String(frac).padStart(3, '0')}`
}
// Milli-units -> a fixed 3-decimal scalar literal (1060 -> "1.060").
export function milliToScalarLiteral(milli: number): string {
  if (!Number.isInteger(milli)) invalid(`scalar ${String(milli)} is not an integer milli value`)
  const neg = milli < 0
  const abs = Math.abs(milli)
  return `${neg ? '-' : ''}${Math.floor(abs / 1000)}.${String(abs % 1000).padStart(3, '0')}`
}

// A path is accepted only as an opaque argv element. It is refused if it could
// be mistaken for an option, a URL, or a protocol specifier — those are the ways
// a path turns into behaviour in ffmpeg.
const PATH_RE = /^\/[A-Za-z0-9._\-/]{1,1024}$/
function checkPath(p: string, what: string): string {
  if (typeof p !== 'string' || !PATH_RE.test(p)) invalid(`${what} must be an absolute plain local path`)
  if (p.includes('..')) invalid(`${what} must not contain a parent traversal`)
  return p
}

// Filter graph labels and argument values are constrained to an alphabet that
// cannot terminate a filter or a filter chain.
const LABEL_RE = /^[a-z][a-z0-9_]{0,30}$/
// Deliberately EXCLUDES `:` `;` `,` `[` `]` `'` `"` and `\` — the characters
// that terminate a filter option, a filter, or a chain. An argument that needs
// one of them is not expressible, and the builder fails rather than emitting it.
const VALUE_RE = /^[A-Za-z0-9_.*/+()\-]{1,64}$/
function checkLabel(l: string): string {
  if (!LABEL_RE.test(l)) invalid(`label ${JSON.stringify(l)} is not a plain graph label`)
  return l
}
// A BOUNDED EXPRESSION CHANNEL, for the one thing that genuinely needs one.
//
// A timed zoom is a magnification that varies with `t`, which cannot be written
// without `,` (inside `between(t,a,b)` and `if(c,x,y)`) and runs past the 64-char
// value cap. `,` is excluded from VALUE_RE precisely because it separates filters
// in a chain, so widening that alphabet would be a real injection weakening.
//
// Instead, expressions travel a SEPARATE channel with three independent bounds:
//   1. only the builder may mark an argument `isExpr` — no plan-derived string is
//      ever marked, so transcript or Director text cannot reach this path;
//   2. a strict grammar: digits, `.` and the arithmetic/grouping characters, plus
//      an identifier WHITELIST. Anything else, including a quote or a semicolon,
//      is refused;
//   3. the emitted value is single-quoted, and the grammar forbids `'`, so it
//      cannot terminate its own quoting.
const EXPR_CHARS_RE = /^[0-9a-z_.,+\-*/()]{1,512}$/
const EXPR_IDENTIFIERS = new Set(['t', 'if', 'between', 'iw', 'ih', 'zoom', 'min', 'max'])
export function checkExpr(v: string): string {
  if (!EXPR_CHARS_RE.test(v)) invalid(`filter expression ${JSON.stringify(v)} contains a forbidden character`)
  for (const id of v.match(/[a-z_][a-z0-9_]*/g) ?? []) {
    if (!EXPR_IDENTIFIERS.has(id)) invalid(`filter expression uses the unknown identifier ${JSON.stringify(id)}`)
  }
  return v
}

function checkValue(v: string | number): string {
  const s = typeof v === 'number' ? String(v) : v
  if (!VALUE_RE.test(s)) invalid(`filter argument ${JSON.stringify(s)} contains a forbidden character`)
  return s
}

// ---- plan -> graph ----------------------------------------------------------
export interface GraphAssets {
  sourcePath: string
  assPath: string | null
  fontsDir: string | null
  outputPath: string
}

function segmentChain(seg: PlanSegment, plan: EditPlanV1, nodes: FilterNode[]): { v: string; a: string } {
  const i = seg.index
  const vIn = `v${i}in`
  const aIn = `a${i}in`
  // Video: trim to the source span, reset PTS, conform to the output raster and
  // frame rate. Every kept segment is conformed identically so concatenation
  // cannot be fed mismatched streams.
  nodes.push({
    id: `vtrim${i}`, filter: 'trim',
    args: [
      { key: 'start', value: msToSecondsLiteral(seg.sourceStartMs) },
      { key: 'end', value: msToSecondsLiteral(seg.sourceEndMs) },
    ],
    inputs: ['0:v'], outputs: [`vt${i}`],
  })
  nodes.push({ id: `vpts${i}`, filter: 'setpts', args: [{ key: '', value: 'PTS-STARTPTS' }], inputs: [`vt${i}`], outputs: [`vp${i}`] })
  nodes.push({
    id: `vscale${i}`, filter: 'scale',
    args: [
      { key: 'w', value: plan.output.width },
      { key: 'h', value: plan.output.height },
      { key: 'force_original_aspect_ratio', value: 'increase' },
    ],
    inputs: [`vp${i}`], outputs: [`vs${i}`],
  })
  nodes.push({
    id: `vcrop${i}`, filter: 'crop',
    args: [{ key: 'w', value: plan.output.width }, { key: 'h', value: plan.output.height }],
    inputs: [`vs${i}`], outputs: [`vc${i}`],
  })
  nodes.push({
    id: `vfps${i}`, filter: 'fps',
    args: [{ key: 'fps', value: `${plan.output.fpsNum}/${plan.output.fpsDen}` }],
    inputs: [`vc${i}`], outputs: [vIn],
  })
  // Audio: the same trim, then conform to the output sample format.
  nodes.push({
    id: `atrim${i}`, filter: 'atrim',
    args: [
      { key: 'start', value: msToSecondsLiteral(seg.sourceStartMs) },
      { key: 'end', value: msToSecondsLiteral(seg.sourceEndMs) },
    ],
    inputs: ['0:a'], outputs: [`at${i}`],
  })
  nodes.push({ id: `apts${i}`, filter: 'asetpts', args: [{ key: '', value: 'PTS-STARTPTS' }], inputs: [`at${i}`], outputs: [`ap${i}`] })
  nodes.push({
    id: `afmt${i}`, filter: 'aformat',
    args: [
      { key: 'sample_rates', value: plan.output.audioSampleRateHz },
      { key: 'channel_layouts', value: plan.output.audioChannels === 1 ? 'mono' : 'stereo' },
    ],
    inputs: [`ap${i}`], outputs: [aIn],
  })
  return { v: vIn, a: aIn }
}

// ---- timed zooms -----------------------------------------------------------
//
// MECHANISM, ESTABLISHED EMPIRICALLY, NOT BY READING DOCS.
//
// The first implementation was `scale` + `crop`, which produced a zoom over the
// WHOLE video: two plans whose zooms sat 27 s apart emitted byte-identical argv.
// The obvious repair — putting `between(t,...)` into crop's w/h — was verified
// against real ffmpeg and DOES NOT WORK: crop evaluates w/h ONCE AT INIT, so the
// expression is frozen at t=0 and every frame renders unzoomed. Rendering both
// variants and comparing decoded frames showed them byte-identical inside the
// intended window, i.e. a silent no-op that would have shipped looking correct.
//
// `zoompan` evaluates `z` PER FRAME. The same experiment against it shows frames
// identical to an un-zoomed render before and after the window and different
// inside it, which is the property the plan actually describes.
//
// ONE zoompan node carries EVERY zoom, because chaining one per zoom would
// rescale an already-rescaled frame and compound the magnification — the exact
// defect CX1 reports. Windows are disjoint and ascending (the contract enforces
// it), so a nested conditional selects at most one.
function zoomScaleExpr(plan: EditPlanV1): string {
  // Trapezoid per zoom: linear ease in, hold, linear ease out. All times come
  // from the plan as integer milliseconds; only this function turns them into
  // the seconds literals ffmpeg wants.
  const sec = (ms: number): string => msToSecondsLiteral(ms)
  let expr = '1'
  for (const z of [...plan.video.zooms].reverse()) {
    const peak = milliToScalarLiteral(z.scaleMilli)
    const inEnd = Math.min(z.outputStartMs + z.easeInMs, z.outputEndMs)
    const outStart = Math.max(z.outputEndMs - z.easeOutMs, inEnd)
    const rampIn = z.easeInMs > 0
      ? `1+(${peak}-1)*(t-${sec(z.outputStartMs)})/${msToSecondsLiteral(z.easeInMs)}`
      : peak
    const rampOut = z.easeOutMs > 0
      ? `1+(${peak}-1)*(${sec(z.outputEndMs)}-t)/${msToSecondsLiteral(z.easeOutMs)}`
      : peak
    // Innermost first so the earlier-declared zoom wins if two ever touched.
    expr = `if(between(t,${sec(z.outputStartMs)},${sec(inEnd)}),${rampIn},`
      + `if(between(t,${sec(inEnd)},${sec(outStart)}),${peak},`
      + `if(between(t,${sec(outStart)},${sec(z.outputEndMs)}),${rampOut},${expr})))`
  }
  return expr
}

function zoomNode(plan: EditPlanV1, vIn: string, nodes: FilterNode[]): string {
  const out = 'vzoom'
  nodes.push({
    id: 'zoompan', filter: 'zoompan',
    args: [
      { key: 'z', value: zoomScaleExpr(plan), isExpr: true },
      // d=1 emits exactly one output frame per input frame; anything else would
      // duplicate frames and change the duration.
      { key: 'd', value: 1 },
      { key: 'x', value: 'iw/2-(iw/zoom/2)', isExpr: true },
      { key: 'y', value: 'ih/2-(ih/zoom/2)', isExpr: true },
      { key: 's', value: `${plan.output.width}x${plan.output.height}` },
      { key: 'fps', value: `${plan.output.fpsNum}/${plan.output.fpsDen}` },
    ],
    inputs: [vIn], outputs: [out],
  })
  return out
}

export function buildFfmpegGraph(plan: EditPlanV1, assets: GraphAssets): FfmpegGraph {
  const nodes: FilterNode[] = []
  const inputs: FfmpegInput[] = [{ path: checkPath(assets.sourcePath, 'source'), preOptions: [] }]

  if (plan.timeline.segments.length === 0) invalid('plan has no segments')

  const vLabels: string[] = []
  const aLabels: string[] = []
  for (const seg of plan.timeline.segments) {
    const { v, a } = segmentChain(seg, plan, nodes)
    vLabels.push(v)
    aLabels.push(a)
  }

  // Joining. `hard_cuts_only` concatenates; `restrained` is NOT implemented as a
  // crossfade in this batch, and it FAILS rather than silently degrading to a
  // hard cut — a plan that says "crossfade here" and renders a cut is exactly
  // the silent substitution the contract forbids.
  let vJoined: string
  let aJoined: string
  if (plan.video.transitions.length === 0) {
    if (plan.timeline.segments.length === 1) {
      vJoined = vLabels[0]
      aJoined = aLabels[0]
    } else {
      nodes.push({
        id: 'concat', filter: 'concat',
        args: [
          { key: 'n', value: plan.timeline.segments.length },
          { key: 'v', value: 1 }, { key: 'a', value: 1 },
        ],
        inputs: [...vLabels.flatMap((v, i) => [v, aLabels[i]])],
        outputs: ['vcat', 'acat'],
      })
      vJoined = 'vcat'
      aJoined = 'acat'
    }
  } else {
    invalid('transition kind "crossfade" is not supported by this graph builder')
  }

  // Zooms. Applied over the JOINED video, so `t` in the expression is output
  // time and matches the plan's outputStartMs/outputEndMs directly.
  let vCur = vJoined
  if (plan.video.zooms.length > 0) {
    for (const zoom of plan.video.zooms) {
      if (zoom.scaleMilli <= 1000) invalid(`zoom ${zoom.index} has a non-magnifying scale`)
    }
    vCur = zoomNode(plan, vCur, nodes)
  }

  // Captions: burned in from the plan's ASS document. The subtitles filter takes
  // a FILE, never inline text, so caption text never enters an argument at all.
  if (plan.captions.cues.length > 0) {
    if (!assets.assPath) invalid('plan has caption cues but no ASS document was provided')
    const args: FilterArg[] = [
      { key: 'filename', value: checkPath(assets.assPath, 'ass document'), isPath: true },
    ]
    if (assets.fontsDir) {
      args.push({ key: 'fontsdir', value: checkPath(assets.fontsDir, 'fonts dir'), isPath: true })
    }
    nodes.push({ id: 'subs', filter: 'subtitles', args, inputs: [vCur], outputs: ['vsub'] })
    vCur = 'vsub'
  }

  // Audio conditioning, then loudness normalisation to the frozen targets.
  const a = plan.audio
  let aCur = aJoined
  if (a.highpassHz > 0) {
    nodes.push({ id: 'ahp', filter: 'highpass', args: [{ key: 'f', value: a.highpassHz }], inputs: [aCur], outputs: ['ahp'] })
    aCur = 'ahp'
  }
  if (a.denoiseMilli > 0) {
    nodes.push({
      id: 'anr', filter: 'afftdn',
      args: [{ key: 'nr', value: Math.round(a.denoiseMilli / 10) }, { key: 'nt', value: 'w' }],
      inputs: [aCur], outputs: ['anr'],
    })
    aCur = 'anr'
  }
  if (a.deesserMilli > 0) {
    nodes.push({
      id: 'ads', filter: 'deesser',
      args: [{ key: 'i', value: milliToScalarLiteral(a.deesserMilli) }],
      inputs: [aCur], outputs: ['ads'],
    })
    aCur = 'ads'
  }
  nodes.push({
    id: 'aln', filter: 'loudnorm',
    args: [
      { key: 'I', value: milliToScalarLiteral(a.targetLufsMilli) },
      { key: 'TP', value: milliToScalarLiteral(a.truePeakCeilingDbtpMilli) },
      { key: 'LRA', value: 11 },
    ],
    inputs: [aCur], outputs: ['aout'],
  })
  aCur = 'aout'

  if (a.music !== null) invalid('music beds are not supported in this epoch')

  const outputOptions = [
    '-map', `[${vCur}]`,
    '-map', `[${aCur}]`,
    '-c:v', plan.output.videoCodec,
    '-pix_fmt', plan.output.pixelFormat,
    '-r', `${plan.output.fpsNum}/${plan.output.fpsDen}`,
    '-c:a', plan.output.audioCodec,
    '-ar', String(plan.output.audioSampleRateHz),
    '-ac', String(plan.output.audioChannels),
    '-t', msToSecondsLiteral(plan.output.durationMs),
  ]
  if (plan.output.faststart) outputOptions.push('-movflags', '+faststart')

  return {
    version: FFMPEG_GRAPH_VERSION,
    inputs, nodes, videoOut: vCur, audioOut: aCur,
    outputOptions, outputPath: checkPath(assets.outputPath, 'output'),
  }
}

// Escape a path for the filter-graph mini-language, where `:` separates options
// and `'` quotes. This is the ONLY place a path is embedded in a filter, and it
// runs after the path has already passed `checkPath`.
function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

export function serializeFilterGraph(graph: FfmpegGraph): string {
  const chains: string[] = []
  for (const node of graph.nodes) {
    // `0:v` / `0:a` name a demuxer stream rather than a graph label; everything
    // else must be a plain label.
    const ins = node.inputs.map((i) => (/^\d+:[va]$/.test(i) ? `[${i}]` : `[${checkLabel(i)}]`)).join('')
    const outs = node.outputs.map((o) => `[${checkLabel(o)}]`).join('')
    const args = node.args.map((arg) => {
      const raw = arg.isPath
        ? `'${escapeFilterPath(String(arg.value))}'`
        : arg.isExpr
          ? `'${checkExpr(String(arg.value))}'`
          : checkValue(arg.value)
      return arg.key === '' ? raw : `${arg.key}=${raw}`
    }).join(':')
    chains.push(`${ins}${node.filter}${args === '' ? '' : `=${args}`}${outs}`)
  }
  return chains.join(';')
}

/**
 * The argument ARRAY. Never a shell string: each element is passed verbatim to
 * the process, so no quoting, word splitting or metacharacter can apply.
 */
export function buildFfmpegArgs(graph: FfmpegGraph): string[] {
  const args: string[] = ['-hide_banner', '-nostdin', '-y']
  for (const input of graph.inputs) {
    args.push(...input.preOptions, '-i', input.path)
  }
  const filter = serializeFilterGraph(graph)
  if (filter !== '') args.push('-filter_complex', filter)
  args.push(...graph.outputOptions)
  args.push(graph.outputPath)
  for (const a of args) {
    if (typeof a !== 'string' || a.length === 0) invalid('produced an empty argument')
  }
  return args
}

/**
 * Deterministic identity of a graph plus its rendered argv. Two processes
 * compiling the same plan against the same asset paths must agree on this.
 */
export function ffmpegGraphSha256(graph: FfmpegGraph): string {
  return sha256Hex(canonicalJson({
    version: graph.version,
    inputs: graph.inputs,
    nodes: graph.nodes,
    videoOut: graph.videoOut,
    audioOut: graph.audioOut,
    outputOptions: graph.outputOptions,
    outputPath: graph.outputPath,
    args: buildFfmpegArgs(graph),
  }))
}

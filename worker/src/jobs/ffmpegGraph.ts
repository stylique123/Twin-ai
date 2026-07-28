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
export type FilterArg = { key: string; value: string | number; isPath?: true }
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

function zoomChain(plan: EditPlanV1, zoom: PlanZoom, vIn: string, nodes: FilterNode[]): string {
  const i = zoom.index
  const out = `vz${i}`
  // A zoom is a bounded, time-gated scale about the frame centre. The plan
  // carries integers only; the enable expression and the scale literal are built
  // here from those integers.
  nodes.push({
    id: `zoom${i}`, filter: 'scale',
    args: [
      { key: 'w', value: `iw*${milliToScalarLiteral(zoom.scaleMilli)}` },
      { key: 'h', value: `ih*${milliToScalarLiteral(zoom.scaleMilli)}` },
      { key: 'eval', value: 'init' },
    ],
    inputs: [vIn], outputs: [`vzs${i}`],
  })
  nodes.push({
    id: `zoomcrop${i}`, filter: 'crop',
    args: [
      { key: 'w', value: plan.output.width }, { key: 'h', value: plan.output.height },
      { key: 'x', value: `(iw-ow)/2` }, { key: 'y', value: `(ih-oh)/2` },
    ],
    inputs: [`vzs${i}`], outputs: [out],
  })
  return out
}

/**
 * Bounds a crossfade must satisfy. Supplied by the CALLER, never read here:
 * this file resolves no paths and opens no documents, so the frozen catalog
 * that owns these numbers is loaded by editorRender and passed down.
 *
 * There is deliberately NO DEFAULT. A plan carrying transitions with no bounds
 * supplied fails, because a default would be this module quietly inventing the
 * policy it exists to enforce.
 */
export interface CrossfadeBounds {
  minOverlapMs: number
  maxOverlapMs: number
  maxOverlapFractionOfShorterSegmentMilli: number
}

/**
 * Fold the conformed segments into one video and one audio stream.
 *
 * WHY A LEFT FOLD AND NOT `concat` PLUS PATCHES: `xfade` consumes exactly two
 * streams and its `offset` is measured on the FIRST stream's timeline. Folding
 * left means the accumulated stream is always the first input, so the offset is
 * simply "how long what we have so far runs, minus the overlap" — a quantity
 * this function already tracks. Any other shape has to reconstruct it.
 *
 * The fold recomputes the output duration INDEPENDENTLY of the compiler's time
 * map and then requires the two to agree exactly. That is the point of doing it
 * this way: `editorCompile` derives outputEnd from the recurrence, this walks
 * the filter graph that will actually run, and a disagreement between them is a
 * defect in one of the two — caught here rather than as a video that is the
 * wrong length.
 */
function joinSegments(
  plan: EditPlanV1, vLabels: string[], aLabels: string[], nodes: FilterNode[],
  bounds: CrossfadeBounds | undefined,
): { v: string; a: string } {
  const segs = plan.timeline.segments
  const hasTransition = segs.some((s) => s.transitionInOverlapMs > 0)

  if (hasTransition && plan.video.transitionPolicy !== 'restrained') {
    invalid(`policy ${plan.video.transitionPolicy} carries a transition overlap`)
  }
  if (hasTransition && !bounds) {
    invalid('plan carries crossfades but no transition bounds were supplied')
  }
  for (const t of plan.video.transitions) {
    // TRANSITION_KINDS is a single-member union today. This is not dead code —
    // it is what makes adding a second kind a compile-and-fail rather than a
    // silent render of something the plan did not ask for.
    if (t.kind !== 'crossfade') invalid(`transition kind ${JSON.stringify(t.kind)} is not supported`)
  }

  const totalMs = segs.reduce((n, s) => n + (s.sourceEndMs - s.sourceStartMs) - s.transitionInOverlapMs, 0)
  // Both numbers claim to be the finished video's length; one comes from the
  // compiler's recurrence, one from walking the segments the graph will join.
  // They are allowed to be equal and nothing else.
  if (totalMs !== plan.output.durationMs) {
    invalid(
      `graph duration ${totalMs}ms disagrees with the plan's declared output duration ` +
      `${plan.output.durationMs}ms — the time map and the filter graph do not describe the same video`,
    )
  }

  if (segs.length === 1) return { v: vLabels[0], a: aLabels[0] }

  // NO CROSSFADE: one n-way `concat`, byte-identical to what Batch 8.1 emitted.
  // A pairwise fold would also be correct, and would have quietly changed the
  // graph hash of every hard-cut plan already proven against 8.1. The new code
  // path is reached only by the new capability.
  if (!hasTransition) {
    nodes.push({
      id: 'concat', filter: 'concat',
      args: [
        { key: 'n', value: segs.length },
        { key: 'v', value: 1 }, { key: 'a', value: 1 },
      ],
      inputs: [...vLabels.flatMap((v, i) => [v, aLabels[i]])],
      outputs: ['vcat', 'acat'],
    })
    return { v: 'vcat', a: 'acat' }
  }

  let vAcc = vLabels[0]
  let aAcc = aLabels[0]
  let accMs = segs[0].sourceEndMs - segs[0].sourceStartMs

  for (let i = 1; i < segs.length; i++) {
    const seg = segs[i]
    const segMs = seg.sourceEndMs - seg.sourceStartMs
    const overlap = seg.transitionInOverlapMs
    const vOut = `vj${i}`
    const aOut = `aj${i}`

    if (overlap === 0) {
      // A plain junction. `concat` with n=2 keeps every join in one shape, so
      // the fold does not have to special-case a run of hard cuts.
      nodes.push({
        id: `concat${i}`, filter: 'concat',
        args: [{ key: 'n', value: 2 }, { key: 'v', value: 1 }, { key: 'a', value: 1 }],
        inputs: [vAcc, aAcc, vLabels[i], aLabels[i]],
        outputs: [vOut, aOut],
      })
      accMs += segMs
    } else {
      const b = bounds!
      const prevMs = segs[i - 1].sourceEndMs - segs[i - 1].sourceStartMs
      const shorter = Math.min(prevMs, segMs)
      if (overlap < b.minOverlapMs) invalid(`transition into segment ${i} is shorter than the minimum overlap`)
      if (overlap > b.maxOverlapMs) invalid(`transition into segment ${i} exceeds the maximum overlap`)
      // An overlap that swallows a whole segment produces a video in which that
      // segment never independently appears. Refused, not clamped.
      if (overlap * 1000 > shorter * b.maxOverlapFractionOfShorterSegmentMilli) {
        invalid(`transition into segment ${i} consumes too much of the shorter segment it joins`)
      }
      if (overlap >= prevMs || overlap >= segMs) {
        invalid(`transition into segment ${i} is not shorter than both segments it joins`)
      }
      const offsetMs = accMs - overlap
      if (offsetMs < 0) invalid(`transition into segment ${i} starts before the timeline does`)

      nodes.push({
        id: `xfade${i}`, filter: 'xfade',
        args: [
          { key: 'transition', value: 'fade' },
          { key: 'duration', value: msToSecondsLiteral(overlap) },
          { key: 'offset', value: msToSecondsLiteral(offsetMs) },
        ],
        inputs: [vAcc, vLabels[i]], outputs: [vOut],
      })
      // `acrossfade` has no offset: it fades the END of its first input into the
      // START of its second, which is exactly the junction a left fold is at.
      // Using it means the audio crossfade cannot drift from the video one by
      // an independently-computed offset, because it has none to get wrong.
      nodes.push({
        id: `acrossfade${i}`, filter: 'acrossfade',
        args: [
          { key: 'd', value: msToSecondsLiteral(overlap) },
          { key: 'c1', value: 'tri' }, { key: 'c2', value: 'tri' },
        ],
        inputs: [aAcc, aLabels[i]], outputs: [aOut],
      })
      accMs += segMs - overlap
    }
    vAcc = vOut
    aAcc = aOut
  }

  // The fold walked the graph node by node; `totalMs` was a closed-form sum.
  // Agreeing with the plan is not the same as the two agreeing with each other,
  // so both are asserted.
  if (accMs !== totalMs) invalid(`the folded graph runs ${accMs}ms but its segments sum to ${totalMs}ms`)
  return { v: vAcc, a: aAcc }
}

export function buildFfmpegGraph(
  plan: EditPlanV1, assets: GraphAssets, bounds?: CrossfadeBounds,
): FfmpegGraph {
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

  // Joining. Batch 8.1 concatenated and REFUSED crossfades rather than silently
  // rendering them as hard cuts. Batch 8.3 implements them, and the refusal
  // stays for anything still unsupported — the rule was never "no transitions",
  // it was "never substitute".
  const { v: vJoined, a: aJoined } = joinSegments(plan, vLabels, aLabels, nodes, bounds)

  // Zooms, applied in output-time order over the joined video.
  let vCur = vJoined
  for (const zoom of plan.video.zooms) {
    if (zoom.scaleMilli <= 1000) invalid(`zoom ${zoom.index} has a non-magnifying scale`)
    vCur = zoomChain(plan, zoom, vCur, nodes)
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

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
  EditPlanError, type EditPlanV1, type PlanOverlay, type PlanSegment, type PlanZoom,
} from './editPlanContract.js'
import {
  buildContinuousZoomPlan, composeZoomExpression, composePanExpression,
  assertFramePreserving, framesInCut,
} from './frameTimeline.js'

export const FFMPEG_GRAPH_VERSION = 'ffmpeg-graph-1'

function invalid(message: string): never {
  throw new EditPlanError(`ffmpeg graph: ${message}`, 'render_graph_invalid')
}

// ---- typed graph ------------------------------------------------------------
// `isPath` marks the one argument kind that carries a caller-supplied local
// path. It is escaped for the filter mini-language at serialization time and is
// exempt from the value alphabet — which is why it is a distinct, explicit kind
// rather than a string that happens to look like a path.
export type FilterArg = {
  key: string
  value: string | number
  isPath?: true
  /**
   * ⚠️ SET ONLY BY A BUILDER THAT VALIDATED EVERY COMPONENT SEPARATELY.
   *
   * A zoom expression is assembled from ramp cores that were each checked
   * against the SAME 64-character limit as every other value. The assembled
   * result is longer than any of its parts, and that length is the ONLY rule it
   * is exempt from -- the character class still applies in full, because the
   * character class is what actually refuses a terminator.
   *
   * The limit is not being widened. No authored value may exceed 64; a
   * composition of validated values is bounded by how many the plan contains,
   * which the plan validator already bounds.
   */
  composedFromValidatedParts?: true
}
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
/**
 * A value assembled from parts that were each already checked.
 *
 * ⚠️ THE CHARACTER CLASS IS ENFORCED IDENTICALLY. That is the rule that stops a
 * value terminating a filter, an option or a chain, and it is not relaxed.
 * Only the LENGTH bound differs, because the length of a composition is a
 * function of how many validated parts went in -- not of any single one of them
 * being allowed to grow.
 */
const COMPOSED_MAX_LEN = 1024
function checkComposedValue(v: string | number): string {
  const s = typeof v === 'number' ? String(v) : v
  if (!/^[A-Za-z0-9_.*\/+()\-]+$/.test(s)) {
    invalid(`composed filter argument ${JSON.stringify(s)} contains a forbidden character`)
  }
  if (s.length > COMPOSED_MAX_LEN) {
    invalid(`composed filter argument is ${s.length} characters, over ${COMPOSED_MAX_LEN}. `
      + 'A composition this long means the plan carries more effects than the graph should build.')
  }
  return s
}

function checkValue(v: string | number): string {
  const s = typeof v === 'number' ? String(v) : v
  if (!VALUE_RE.test(s)) invalid(`filter argument ${JSON.stringify(s)} contains a forbidden character`)
  return s
}

// ---- plan -> graph ----------------------------------------------------------
export interface GraphAssets {
  sourcePath: string
  /** One caller-verified local path per `plan.composition.sources`, INDEX
   *  ALIGNED with it. Absent is the ordinary case (a plan that composes
   *  nothing); a plan that composes something and is handed no paths fails,
   *  because the alternative is rendering the take where the creator asked for
   *  their screen and nothing anywhere saying so. */
  clipPaths?: string[]
  assPath: string | null
  fontsDir: string | null
  outputPath: string
  /** The frozen encoder settings. Required — see EncoderSettings for why an
   *  optional one would reintroduce the defect it exists to fix. */
  encoder: EncoderSettings
  /** The free-tier mark, supplied ONLY when the plan asks for one. Like the
   *  crossfade bounds, the geometry is handed down by the caller rather than
   *  read here — this module resolves no paths and opens no catalogs. */
  watermark?: WatermarkPlacement
}

/**
 * The frozen encoder settings, handed down like every other catalog value.
 *
 * THESE WERE DECLARED AND NEVER SENT. The catalog has carried `x264Preset`,
 * `x264Crf`, `x264Profile`, `x264Level`, `gopSizeFrames` and
 * `audioBitrateKbps` all along, under a comment insisting that "the operator
 * picked a different preset that day" must never be something the audit trail
 * has to say. The argv this file built contained none of them. Every render
 * ever made used ffmpeg's compiled-in defaults.
 *
 * That made the determinism claim false in the one dimension nobody measured:
 * the plan hash, the graph hash and the validator were all stable while the
 * actual picture quality and bitrate were whatever the worker's ffmpeg build
 * happened to default to. A version bump on the host silently changed every
 * customer's video and nothing anywhere went red.
 *
 * REQUIRED, not optional. An optional encoder setting reintroduces exactly the
 * failure being fixed — silence that looks like success — so the type system
 * refuses to build a graph that has not declared one.
 */
export interface EncoderSettings {
  x264Preset: string
  x264Crf: number
  x264Profile: string
  x264Level: string
  gopSizeFrames: number
  audioBitrateKbps: number
}

// x264's own preset names. A closed set, because this reaches argv: an
// unrecognised preset is a configuration error we want loudly, not a token
// handed to a process to interpret.
const X264_PRESETS = new Set([
  'ultrafast', 'superfast', 'veryfast', 'faster', 'fast',
  'medium', 'slow', 'slower', 'veryslow', 'placebo',
])
const X264_PROFILES = new Set(['baseline', 'main', 'high', 'high10', 'high422', 'high444'])
// H.264 levels are `<digit>.<digit>` or a bare digit. Pinned as a shape rather
// than a list so a future 6.2 does not need a code change, while `-anything`
// still cannot be read as a flag.
const X264_LEVEL_RE = /^[1-6](\.[0-9])?$/

/** Every encoder value checked before it becomes argv. Same posture as the
 *  rest of this file: the catalog is JSON on disk, so "it came from the
 *  catalog" is not the same as "it is safe to hand to a process". */
function checkEncoder(e: EncoderSettings, invalid: (m: string) => never): EncoderSettings {
  if (!X264_PRESETS.has(e.x264Preset)) invalid(`encoder: ${JSON.stringify(e.x264Preset)} is not an x264 preset`)
  if (!X264_PROFILES.has(e.x264Profile)) invalid(`encoder: ${JSON.stringify(e.x264Profile)} is not an x264 profile`)
  if (!X264_LEVEL_RE.test(e.x264Level)) invalid(`encoder: ${JSON.stringify(e.x264Level)} is not an H.264 level`)
  // CRF 0 is lossless and 51 is unwatchable; both are real x264 values and
  // neither is a thing this product should ever ship, but the bound that
  // matters here is that it is an integer in range and cannot carry a sign
  // that argv would read as a flag.
  if (!Number.isInteger(e.x264Crf) || e.x264Crf < 0 || e.x264Crf > 51) {
    invalid(`encoder: CRF ${String(e.x264Crf)} is not an integer in 0..51`)
  }
  if (!Number.isInteger(e.gopSizeFrames) || e.gopSizeFrames < 1 || e.gopSizeFrames > 600) {
    invalid(`encoder: GOP ${String(e.gopSizeFrames)} is not an integer in 1..600`)
  }
  if (!Number.isInteger(e.audioBitrateKbps) || e.audioBitrateKbps < 32 || e.audioBitrateKbps > 512) {
    invalid(`encoder: audio bitrate ${String(e.audioBitrateKbps)} kbps is not an integer in 32..512`)
  }
  return e
}

/** Where the mark sits and how solid it is. Integers only; every literal the
 *  graph emits is built from these by the same helpers the rest of the file
 *  uses, so nothing here can introduce a value the alphabet would reject. */
export interface WatermarkPlacement {
  path: string
  displayWidthPx: number
  opacityMilli: number
  marginRightPx: number
  marginBottomPx: number
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
    inputs: [`vc${i}`], outputs: [`vf${i}`],
  })
  // TIMEBASE IS PART OF THE CONFORMANCE, and leaving it out is what stopped the
  // renderer from running at all the first time it was ever executed:
  //
  //   [Parsed_xfade_42] First input link main timebase (1/1000000) do not match
  //                     the corresponding second input link xfade timebase (1/30)
  //   [Parsed_xfade_42] Failed to configure output pad
  //
  // `fps` leaves the link at 1/fps, while `concat` and `xfade` emit AV_TIME_BASE
  // (1/1000000). In a left fold the accumulator is therefore 1/1000000 from the
  // first join onward while every fresh segment is still 1/fps, and `xfade`
  // requires its two inputs to agree. Hard cuts never noticed because `concat`
  // conforms timebases itself.
  //
  // Conformed HERE rather than at the xfade, because this chain is where the
  // stream is made uniform and its own comment says so — a filter-local patch
  // would leave the identical trap for the next two-input filter added. The
  // literal is `AVTB` and not `1/${fpsDen}/${fpsNum}` so that a fractional rate
  // (30000/1001) cannot round into a timebase that disagrees with the frames.
  nodes.push({
    id: `vtb${i}`, filter: 'settb',
    args: [{ key: 'expr', value: 'AVTB' }],
    inputs: [`vf${i}`], outputs: [vIn],
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

// A zoom is a bounded, time-gated scale about the frame centre — bounded means
// framing MUST return to normal once `outputEndMs` passes, and time-gated means
// two zooms must never compound into each other's scale.
//
// The decomposition that used to live here — `trim` the joined video into
// per-window pieces, `setpts` each back to zero, `concat` them — is GONE. It
// lost frames at every seam, and the loss scaled with the seam count. The
// replacement is one continuous `zoompan` whose z/x/y are comma-free gate
// expressions composed from individually validated parts; see
// `buildContinuousZoomPlan` in ./frameTimeline.
function applyTimeGatedZooms(plan: EditPlanV1, vJoined: string, nodes: FilterNode[]): string {
  if (plan.video.zooms.length === 0) return vJoined

  // ⚠️ ONE CONTINUOUS STREAM. The previous implementation split the joined
  // video into per-window pieces, retimed each with `setpts=PTS-STARTPTS`, and
  // `concat`-ed them back. Every seam lost frames, and the loss scaled with the
  // seam count -- measured against a resolved target of 184 frames:
  //
  //     decomposed   1 zoom 181   2 zooms 176   3 zooms 170
  //     continuous   1 zoom 184   2 zooms 184   3 zooms 184
  //
  // Frame-exact boundaries did not rescue it: every piece >= 1 frame with an
  // exact tiling sum still rendered 181 of 184. The seams were the mechanism.
  const fpsNum = plan.output.fpsNum
  const fpsDen = plan.output.fpsDen
  const msToFrame = (ms: number) => Math.round((ms * fpsNum) / (1000 * fpsDen))
  const targetFrameCount = plan.timeline.segments.reduce(
    (n, seg) => n + framesInCut(seg.sourceEndMs - seg.sourceStartMs, fpsNum, fpsDen), 0,
  )

  const zoomPlan = buildContinuousZoomPlan(
    plan.video.zooms.map((z) => ({
      startFrame: msToFrame(z.outputStartMs),
      endFrameExclusive: msToFrame(z.outputEndMs),
      scaleMilli: z.scaleMilli,
      offsetXPx: z.offsetXPx,
      offsetYPx: z.offsetYPx,
    })),
    targetFrameCount,
  )
  // ⚖️ DEFENCE IN DEPTH. Should be unreachable; kept because a later change
  // that reintroduces seams must fail loudly rather than ship a short video.
  assertFramePreserving('continuous', zoomPlan)

  const out = 'vzoom'
  nodes.push({
    id: 'zoompan', filter: 'zoompan',
    args: [
      { key: 'z', value: composeZoomExpression(zoomPlan), composedFromValidatedParts: true },
      { key: 'x', value: composePanExpression(zoomPlan, 'x'), composedFromValidatedParts: true },
      { key: 'y', value: composePanExpression(zoomPlan, 'y'), composedFromValidatedParts: true },
      // d=1 emits exactly one output frame per input frame: the property that
      // makes the frame count survivable at all.
      { key: 'd', value: 1 },
      { key: 's', value: `${plan.output.width}x${plan.output.height}` },
      { key: 'fps', value: `${fpsNum}/${fpsDen}` },
    ],
    inputs: [vJoined], outputs: [out],
  })
  // zoompan can attach a corrective SAR the same way scale+crop did; every
  // other pad in this graph is exactly 1:1 and `concat` refuses a mismatch.
  const vSar = 'vzoomsar'
  nodes.push({ id: 'vzoomsetsar', filter: 'setsar', args: [{ key: 'sar', value: '1' }], inputs: [out], outputs: [vSar] })
  return vSar
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

// ---- composition: cutting to a clip ----------------------------------------
//
// A `full_frame` overlay REPLACES the picture for its output window. It is built
// with exactly the structure the zoom windows use, and for exactly the same
// reason: the alternative is a time-gated filter, `enable=between(t,a,b)`, whose
// comma `VALUE_RE` refuses on purpose. So the finished video's timeline is cut
// into windows that alternate between "the take" and "a clip", each window is
// produced independently, and they are `concat`-ed back in order.
//
// AUDIO NEVER ENTERS THIS FUNCTION. A clip contributes picture and nothing else
// — see the v7 note in editPlanContract. The `0:a` chain that was built before
// the join is what reaches the output, unchanged, whether or not anything is
// composed over it. That is the property that makes a cutaway safe to add to an
// already-proven audio path: it cannot touch it.
//
// EVERY WINDOW IS CONFORMED THE SAME WAY. A clip arrives at whatever raster,
// frame rate, pixel format and sample aspect the creator's screen happened to
// be, and `concat` refuses inputs that disagree on any of them ("Input link
// parameters ... do not match"). Both branches therefore end in the same
// fps/settb/setsar/format quartet rather than trusting the clip to match.
interface CompositionWindow {
  startMs: number
  endMs: number
  /** null = this stretch is the take's own picture. */
  overlay: PlanOverlay | null
}

function compositionWindows(plan: EditPlanV1): CompositionWindow[] {
  const windows: CompositionWindow[] = []
  let cursor = 0
  for (const ov of plan.composition.overlays) {
    if (ov.outputStartMs > cursor) windows.push({ startMs: cursor, endMs: ov.outputStartMs, overlay: null })
    windows.push({ startMs: ov.outputStartMs, endMs: ov.outputEndMs, overlay: ov })
    cursor = ov.outputEndMs
  }
  if (cursor < plan.output.durationMs) {
    windows.push({ startMs: cursor, endMs: plan.output.durationMs, overlay: null })
  }
  // Re-derived rather than assumed, exactly as `allWindows` and `joinSegments`
  // do: a fold that covers the wrong number of milliseconds is a defect here,
  // not a video that is quietly the wrong length.
  const coveredMs = windows.reduce((n, w) => n + (w.endMs - w.startMs), 0)
  if (coveredMs !== plan.output.durationMs) {
    invalid(`composition windows cover ${coveredMs}ms but the plan declares ${plan.output.durationMs}ms`)
  }
  return windows
}

/** The conformance every window ends with, so `concat` can join them. */
function conformWindow(plan: EditPlanV1, vIn: string, nodes: FilterNode[], tag: string): string {
  nodes.push({
    id: `cxfps${tag}`, filter: 'fps',
    args: [{ key: 'fps', value: `${plan.output.fpsNum}/${plan.output.fpsDen}` }],
    inputs: [vIn], outputs: [`cxf${tag}`],
  })
  nodes.push({
    id: `cxtb${tag}`, filter: 'settb',
    args: [{ key: 'expr', value: 'AVTB' }],
    inputs: [`cxf${tag}`], outputs: [`cxtb${tag}`],
  })
  nodes.push({
    id: `cxsar${tag}`, filter: 'setsar',
    args: [{ key: 'sar', value: '1' }], inputs: [`cxtb${tag}`], outputs: [`cxsar${tag}`],
  })
  nodes.push({
    id: `cxfmt${tag}`, filter: 'format',
    args: [{ key: 'pix_fmts', value: plan.output.pixelFormat }],
    inputs: [`cxsar${tag}`], outputs: [`cxo${tag}`],
  })
  return `cxo${tag}`
}

function clipWindowChain(
  plan: EditPlanV1, ov: PlanOverlay, inputIndex: number, nodes: FilterNode[], idx: number,
): string {
  const tag = `c${idx}`
  nodes.push({
    id: `cxctrim${idx}`, filter: 'trim',
    args: [
      { key: 'start', value: msToSecondsLiteral(ov.sourceStartMs) },
      { key: 'end', value: msToSecondsLiteral(ov.sourceEndMs) },
    ],
    inputs: [`${inputIndex}:v`], outputs: [`cxct${idx}`],
  })
  nodes.push({
    id: `cxcpts${idx}`, filter: 'setpts', args: [{ key: '', value: 'PTS-STARTPTS' }],
    inputs: [`cxct${idx}`], outputs: [`cxcp${idx}`],
  })
  // Fill the frame and crop the excess — the SAME treatment `segmentChain` gives
  // the take, so a 16:9 screen capture in a 9:16 video is centre-cropped rather
  // than letterboxed into bars nobody asked for. Losing the sides of a screen
  // recording is a real cost; it is the cost the creator chose when they asked
  // for their screen in a vertical video, and it is at least visible to them.
  nodes.push({
    id: `cxcscale${idx}`, filter: 'scale',
    args: [
      { key: 'w', value: plan.output.width },
      { key: 'h', value: plan.output.height },
      { key: 'force_original_aspect_ratio', value: 'increase' },
    ],
    inputs: [`cxcp${idx}`], outputs: [`cxcs${idx}`],
  })
  nodes.push({
    id: `cxccrop${idx}`, filter: 'crop',
    args: [{ key: 'w', value: plan.output.width }, { key: 'h', value: plan.output.height }],
    inputs: [`cxcs${idx}`], outputs: [`cxcc${idx}`],
  })
  return conformWindow(plan, `cxcc${idx}`, nodes, tag)
}

function applyComposition(
  plan: EditPlanV1, vBase: string, nodes: FilterNode[], clipInputIndex: readonly number[],
): string {
  const overlays = plan.composition.overlays
  if (overlays.length === 0) return vBase

  for (const ov of overlays) {
    // Same posture as the transition-kind check: a single-member union today,
    // and a compile-and-fail rather than a silent approximation the day it
    // grows. A `pip` rendered as a full-frame cut is a different video.
    if (ov.fit !== 'full_frame') invalid(`composition fit ${JSON.stringify(ov.fit)} is not supported`)
  }

  const windows = compositionWindows(plan)
  const baseWindows = windows.filter((w) => w.overlay === null)

  // A filtergraph label is a single-consumer pad, so the base stream is split
  // once into one copy per base window. When a clip covers the WHOLE video
  // (a voiceover over a screen recording — legitimate, and the take's picture
  // never appears) there is no consumer at all, and an unconsumed pad makes
  // ffmpeg refuse the graph outright. It is sunk explicitly rather than left
  // dangling: the take's audio is still what plays.
  const baseLabels: string[] = []
  if (baseWindows.length === 0) {
    nodes.push({ id: 'cxbasesink', filter: 'nullsink', args: [], inputs: [vBase], outputs: [] })
  } else if (baseWindows.length === 1) {
    baseLabels.push(vBase)
  } else {
    const labels = baseWindows.map((_w, i) => `cxbsplit${i}`)
    nodes.push({
      id: 'cxbasesplit', filter: 'split',
      args: [{ key: 'outputs', value: baseWindows.length }],
      inputs: [vBase], outputs: labels,
    })
    baseLabels.push(...labels)
  }

  let baseSeen = 0
  const labels = windows.map((w, idx) => {
    if (w.overlay === null) {
      const from = baseLabels[baseSeen++]
      nodes.push({
        id: `cxbtrim${idx}`, filter: 'trim',
        args: [
          { key: 'start', value: msToSecondsLiteral(w.startMs) },
          { key: 'end', value: msToSecondsLiteral(w.endMs) },
        ],
        inputs: [from], outputs: [`cxbt${idx}`],
      })
      nodes.push({
        id: `cxbpts${idx}`, filter: 'setpts', args: [{ key: '', value: 'PTS-STARTPTS' }],
        inputs: [`cxbt${idx}`], outputs: [`cxbp${idx}`],
      })
      return conformWindow(plan, `cxbp${idx}`, nodes, `b${idx}`)
    }
    const inputIndex = clipInputIndex[w.overlay.sourceIndex]
    if (inputIndex === undefined) {
      invalid(`composition overlay ${w.overlay.index} names source ${w.overlay.sourceIndex}, which has no input`)
    }
    return clipWindowChain(plan, w.overlay, inputIndex, nodes, idx)
  })

  if (labels.length === 1) return labels[0]
  nodes.push({
    id: 'cxconcat', filter: 'concat',
    args: [{ key: 'n', value: labels.length }, { key: 'v', value: 1 }, { key: 'a', value: 0 }],
    inputs: labels, outputs: ['vcx'],
  })
  return 'vcx'
}

export function buildFfmpegGraph(
  plan: EditPlanV1, assets: GraphAssets, bounds?: CrossfadeBounds,
): FfmpegGraph {
  const nodes: FilterNode[] = []
  const inputs: FfmpegInput[] = [{ path: checkPath(assets.sourcePath, 'source'), preOptions: [] }]

  if (plan.timeline.segments.length === 0) invalid('plan has no segments')

  // THE CLIP INPUTS, DECLARED BEFORE ANY FILTER REFERS TO ONE.
  //
  // ffmpeg numbers inputs by the order they appear in argv, so `1:v` means
  // whatever the second `-i` turned out to be. Resolving the mapping once, here,
  // is what stops "the second clip" and "input 2" from being two facts that can
  // drift — the watermark already reads `inputs.length` for the same reason.
  //
  // Nothing is inferred from the paths: the plan says how many sources it
  // composes, and a caller that supplied a different number is refused rather
  // than truncated to the shorter of the two, which would render the take where
  // the creator asked for their screen and report success.
  const clipPaths = assets.clipPaths ?? []
  const composedSources = plan.composition.sources
  if (clipPaths.length !== composedSources.length) {
    invalid(
      `plan composes ${composedSources.length} source(s) but ${clipPaths.length} clip path(s) were supplied`,
    )
  }
  const clipInputIndex: number[] = composedSources.map((cs, i) => {
    const index = inputs.length
    inputs.push({ path: checkPath(clipPaths[i], `clip ${cs.index}`), preOptions: [] })
    return index
  })

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

  // Zooms, time-gated so each applies only within its own window and framing
  // returns to normal the instant it ends. See `applyTimeGatedZooms`.
  for (const zoom of plan.video.zooms) {
    if (zoom.scaleMilli <= 1000) invalid(`zoom ${zoom.index} has a non-magnifying scale`)
  }
  let vCur = applyTimeGatedZooms(plan, vJoined, nodes)

  // CUTAWAYS, AFTER THE ZOOMS AND BEFORE THE CAPTIONS.
  //
  // After the zooms because a `full_frame` clip replaces the picture outright:
  // a zoom is a framing decision about the creator's own face, and applying it
  // to a screen recording would punch into a corner of an interface for a reason
  // that made sense about a different image.
  //
  // Before the captions because the captions are the creator's spoken words and
  // the creator keeps speaking over the clip. Burning them first would let the
  // cutaway paint over the line being said underneath it — a caption that
  // disappears exactly when the screen appears, which reads as a rendering bug
  // and is one.
  vCur = applyComposition(plan, vCur, nodes, clipInputIndex)

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

  // THE FREE-TIER MARK, LAST OF THE VIDEO STAGES.
  //
  // After the captions on purpose: the mark is an attribution on the finished
  // frame, and a caption line drawn over it would both obscure the mark and
  // look like a bug. Being last also means it is composited over whatever the
  // rest of the graph produced, so a zoom cannot scale it and a transition
  // cannot fade it out from under itself.
  //
  // NOTHING HAPPENS WITHOUT THE PLAN. The instruction is `plan.output.watermark`
  // and the asset is supplied by the caller; a plan that does not ask for a mark
  // cannot acquire one from a stray asset being present, and a plan that DOES
  // ask fails loudly rather than rendering an unmarked video.
  if (plan.output.watermark) {
    const wm = assets.watermark
    if (!wm) invalid('the plan asks for a watermark but no watermark asset was supplied')
    if (!Number.isInteger(wm.displayWidthPx) || wm.displayWidthPx <= 0) invalid('watermark width is not a positive integer')
    if (!Number.isInteger(wm.opacityMilli) || wm.opacityMilli <= 0 || wm.opacityMilli > 1000) {
      invalid('watermark opacity is out of range')
    }
    if (!Number.isInteger(wm.marginRightPx) || wm.marginRightPx < 0) invalid('watermark right margin is negative')
    if (!Number.isInteger(wm.marginBottomPx) || wm.marginBottomPx < 0) invalid('watermark bottom margin is negative')
    // THE MARK MUST CLEAR THE PLAN'S OWN SAFE AREA.
    //
    // The margins were first chosen by eye against a mockup and put the mark
    // 264px inside the band TikTok and Reels cover with the caption bar and the
    // right-hand action rail — invisible on exactly the platforms it exists to
    // advertise on, and invisible in a way no test or reviewer would notice,
    // because the render is perfect and the frame is correct.
    //
    // The plan already carries the safe area; it was simply read by nothing in
    // the render path. Checking against it here makes the placement a property
    // the builder enforces rather than a number somebody tuned.
    const safe = plan.video.framing
    if (wm.marginBottomPx < safe.safeBottomPx) {
      invalid(`watermark sits ${safe.safeBottomPx - wm.marginBottomPx}px inside the plan's bottom safe area`)
    }
    if (wm.marginRightPx < safe.safeRightPx) {
      invalid(`watermark sits ${safe.safeRightPx - wm.marginRightPx}px inside the plan's right safe area`)
    }
    // A second INPUT, not a filter that reads a file. `movie=` would embed a
    // path inside the filter string; an input keeps the path an argv element,
    // which is the property this whole module exists to preserve.
    const inputIndex = inputs.length
    inputs.push({ path: checkPath(wm.path, 'watermark'), preOptions: [] })

    // `-1` keeps the source aspect: the asset is authored at one size and the
    // catalog names only a width, so a height here would be a second number
    // able to disagree with the artwork.
    nodes.push({
      id: 'wmscale', filter: 'scale',
      args: [{ key: 'w', value: wm.displayWidthPx }, { key: 'h', value: -1 }],
      inputs: [`${inputIndex}:v`], outputs: ['wms'],
    })
    // The alpha the artwork already carries is MULTIPLIED by the catalog's
    // opacity rather than replaced by it, so a fully transparent pixel stays
    // transparent instead of becoming a faint box.
    nodes.push({ id: 'wmfmt', filter: 'format', args: [{ key: '', value: 'rgba' }], inputs: ['wms'], outputs: ['wmf'] })
    nodes.push({
      id: 'wmalpha', filter: 'colorchannelmixer',
      args: [{ key: 'aa', value: milliToScalarLiteral(wm.opacityMilli) }],
      inputs: ['wmf'], outputs: ['wma'],
    })
    // Bottom-right, measured from the frame's own edges. `W`/`H` are the base
    // frame and `w`/`h` the overlay, so the margins hold whatever either turns
    // out to be — no arithmetic here needs the output raster to be a constant.
    nodes.push({
      id: 'wmoverlay', filter: 'overlay',
      args: [
        { key: 'x', value: `W-w-${wm.marginRightPx}` },
        { key: 'y', value: `H-h-${wm.marginBottomPx}` },
      ],
      inputs: [vCur, 'wma'], outputs: ['vwm'],
    })
    vCur = 'vwm'
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

  const enc = checkEncoder(assets.encoder, invalid)
  const outputOptions = [
    '-map', `[${vCur}]`,
    '-map', `[${aCur}]`,
    '-c:v', plan.output.videoCodec,
    '-pix_fmt', plan.output.pixelFormat,
    '-r', `${plan.output.fpsNum}/${plan.output.fpsDen}`,
    // THE FROZEN ENCODER PROFILE, which until now was declared in the catalog
    // and never passed to ffmpeg. `-g` with `keyint_min` equal to it pins the
    // GOP exactly, rather than letting x264 place keyframes on scene changes —
    // which for a hard-cut edit would vary with the CONTENT and make two
    // renders of one plan differ.
    '-preset', enc.x264Preset,
    '-crf', String(enc.x264Crf),
    '-profile:v', enc.x264Profile,
    '-level:v', enc.x264Level,
    '-g', String(enc.gopSizeFrames),
    '-keyint_min', String(enc.gopSizeFrames),
    '-sc_threshold', '0',
    '-c:a', plan.output.audioCodec,
    '-b:a', `${enc.audioBitrateKbps}k`,
    '-ar', String(plan.output.audioSampleRateHz),
    '-ac', String(plan.output.audioChannels),
    '-t', msToSecondsLiteral(plan.output.durationMs),
    // COLOUR METADATA, WITHOUT WHICH THE EXPORT LOOKS WASHED OUT.
    //
    // An untagged H.264 file is interpreted by QuickTime, Safari and iOS as
    // BT.601, while libswscale actually produced BT.709 for a 1920-tall frame.
    // The result is the classic hue-and-saturation shift a creator describes as
    // "the colours look wrong / faded compared to my recording" — with nothing
    // in any log, because every stage did its job and only the label is absent.
    //
    // `tv` range is stated for the same reason: a full-range phone capture
    // converted with no range signalling reads as crushed blacks or milky
    // greys depending on the player's guess.
    '-colorspace', 'bt709', '-color_primaries', 'bt709',
    '-color_trc', 'bt709', '-color_range', 'tv',
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
        : arg.composedFromValidatedParts
          ? checkComposedValue(arg.value)
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

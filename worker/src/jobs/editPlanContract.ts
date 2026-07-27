// Editor v2 — Phase 8 Batch 8.1: the EditPlanV1 strict contract.
//
// SOLE RESPONSIBILITY (Gate-0 §7): the strict validator, the canonical
// serialization and the plan hash. No compilation logic, no I/O, no process.
//
// Contract laws (Gate-0 §3.1), each enforced structurally below:
//  * strict objects — unknown keys FAIL (never ignored);
//  * ALL times are integer milliseconds; every other quantity is an integer too
//    (gains in milli-dB, scales in milli-units), so no float formatting can ever
//    differ between processes or architectures;
//  * identities are IDs and hashes — never URLs or arbitrary paths;
//  * NO shell or filter expression is ever stored — enforced by a whole-document
//    scan, not by reviewing each field by eye;
//  * the only unbounded free text is caption text sourced from transcript words;
//  * every array has a frozen maximum;
//  * canonical serialization recursively sorts object keys and preserves array
//    order — it is `editorManifest.canonicalJson`, the ONE canonicalization in
//    this codebase, deliberately imported rather than re-implemented;
//  * the hash excludes no semantic field (it is taken over the whole document);
//  * identical inputs produce byte-identical JSON and hash in separate processes;
//  * plan maximum serialized size: 1 MiB.
import { canonicalJson, sha256Hex } from './editorManifest.js'

export const EDIT_PLAN_SCHEMA_VERSION = 1
export const EDIT_PLAN_VERSION = 'edit-plan-v1'
export const EDIT_PLAN_MAX_BYTES = 1048576

// Frozen array maxima. Duplicated from edit_policy_v1.json ON PURPOSE: the
// policy file bounds what the COMPILER may emit, these bound what the VALIDATOR
// will accept from any source (including a plan read back out of the database).
// A policy edit must never silently widen the contract.
export const MAX_ALLOWED_WINDOWS = 200
export const MAX_SEGMENTS = 600
export const MAX_REMOVALS = 1200
export const MAX_CUES = 2000
export const MAX_CUE_LINES = 2
export const MAX_CUE_EMPHASIS = 16
export const MAX_ZOOMS = 20
export const MAX_TRANSITIONS = 40
export const MAX_WARNINGS = 200
export const MAX_CUE_LINE_CHARS = 200

export const AUDIO_PRESET_IDS = ['speech-clean-v1', 'speech-noisy-v1', 'speech-roomy-v1'] as const
export const CAPTION_PRESET_IDS = [
  'caption-clean-keyword-v1', 'caption-punchy-word-v1', 'caption-minimal-subtitle-v1',
] as const
export const TRANSITION_POLICIES = ['hard_cuts_only', 'restrained'] as const
export const TRANSITION_KINDS = ['crossfade'] as const
export const ZOOM_REASON_CODES = ['emphasis_word', 'scene_open', 'retention_beat'] as const
export const ZOOM_INTENSITIES = ['subtle', 'medium'] as const
export const REMOVAL_ORIGINS = ['speech_candidate', 'visual_waste', 'hook_trim'] as const
export const HOOK_TREATMENTS = ['keep', 'open_at_word'] as const
export const SOURCE_ORIGINS = ['teleprompter', 'upload'] as const

export type AudioPresetId = (typeof AUDIO_PRESET_IDS)[number]
export type CaptionPresetId = (typeof CAPTION_PRESET_IDS)[number]
export type TransitionPolicy = (typeof TRANSITION_POLICIES)[number]
export type TransitionKind = (typeof TRANSITION_KINDS)[number]
export type ZoomReasonCode = (typeof ZOOM_REASON_CODES)[number]
export type ZoomIntensity = (typeof ZOOM_INTENSITIES)[number]
export type RemovalOrigin = (typeof REMOVAL_ORIGINS)[number]
export type HookTreatment = (typeof HOOK_TREATMENTS)[number]
export type SourceOrigin = (typeof SOURCE_ORIGINS)[number]

// ---- the document -----------------------------------------------------------
export interface PlanIdentity {
  planVersion: string
  policyVersion: string
  compilerVersion: string
  projectId: string
  generationId: string
  sourceAssetId: string
  sourceChecksum: string
  bootManifestSha: string
  scriptSnapshotSha: string
  decisionSha256: string
}
export interface PlanWindow { startMs: number; endMs: number }
export interface PlanSource {
  origin: SourceOrigin
  durationMs: number
  allowedWindows: PlanWindow[]
}
export interface PlanOutput {
  profileId: string
  width: number
  height: number
  fpsNum: number
  fpsDen: number
  videoCodec: string
  audioCodec: string
  pixelFormat: string
  audioSampleRateHz: number
  audioChannels: number
  faststart: boolean
  durationMs: number
}
export interface PlanSegment {
  index: number
  sourceStartMs: number
  sourceEndMs: number
  outputStartMs: number
  outputEndMs: number
  transitionInOverlapMs: number
}
export interface PlanRemoval {
  sourceStartMs: number
  sourceEndMs: number
  origin: RemovalOrigin
  ref: number | null
  reasonCode: string
}
export interface PlanTimeline {
  segments: PlanSegment[]
  removals: PlanRemoval[]
  cutsPerMinuteMilli: number
}
export interface PlanCue {
  index: number
  outputStartMs: number
  outputEndMs: number
  lines: string[]
  emphasisWordIndices: number[]
}
export interface PlanCaptions {
  presetId: CaptionPresetId
  fontSizePx: number
  marginVerticalPx: number
  cues: PlanCue[]
}
export interface PlanZoom {
  index: number
  outputStartMs: number
  outputEndMs: number
  scaleMilli: number
  intensity: ZoomIntensity
  reasonCode: ZoomReasonCode
  anchorWordIndex: number
  easeInMs: number
  easeOutMs: number
}
export interface PlanTransition {
  index: number
  atSegmentIndex: number
  kind: TransitionKind
  overlapMs: number
}
export interface PlanFraming {
  modeId: string
  safeTopPx: number
  safeBottomPx: number
  safeLeftPx: number
  safeRightPx: number
}
export interface PlanVideo {
  framing: PlanFraming
  transitionPolicy: TransitionPolicy
  transitions: PlanTransition[]
  zooms: PlanZoom[]
}
export interface PlanAudio {
  presetId: AudioPresetId
  highpassHz: number
  denoiseMilli: number
  deesserMilli: number
  targetLufsMilli: number
  toleranceLuMilli: number
  truePeakCeilingDbtpMilli: number
  music: null
}
export interface PlanHook {
  treatment: HookTreatment
  startWordIndex: number | null
  sourceTrimStartMs: number
  sourceTrimEndMs: number
  reasonCode: string
}
export interface PlanCover {
  sourceTimeMs: number
  outputTimeMs: number
}
export interface PlanWarning { code: string; detail: string }
export interface PlanComplexity {
  wordCount: number
  candidateCount: number
  segmentCount: number
  removalCount: number
  cueCount: number
  zoomCount: number
  transitionCount: number
}
export interface EditPlanV1 {
  schemaVersion: number
  identity: PlanIdentity
  source: PlanSource
  output: PlanOutput
  timeline: PlanTimeline
  captions: PlanCaptions
  video: PlanVideo
  audio: PlanAudio
  hook: PlanHook
  cover: PlanCover
  warnings: PlanWarning[]
  complexity: PlanComplexity
}

// ---- stable errors (Gate-0 §5) ----------------------------------------------
export class EditPlanError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'EditPlanError'
    this.code = code
  }
}
function fail(message: string, code = 'edit_plan_invalid'): never {
  throw new EditPlanError(message, code)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const HEX64_RE = /^[0-9a-f]{64}$/
// Identity/enum/code strings: a conservative token alphabet. A URL, a path, a
// filter expression and a shell command all fail it, so "identities are IDs and
// hashes, never URLs or paths" is a property of the alphabet rather than of a
// reviewer noticing.
const TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}
function strictKeys(v: unknown, keys: readonly string[], where: string): Record<string, unknown> {
  if (!isPlainObject(v)) fail(`${where}: not a plain object`)
  for (const k of keys) if (!(k in v)) fail(`${where}: missing key ${k}`)
  for (const k of Object.keys(v)) if (!keys.includes(k)) fail(`${where}: unknown key ${k}`)
  return v
}
// Every numeric field in the plan goes through here. Integer, finite, and NOT
// -0 (which JSON.stringify renders as "0" but which compares !== 0 under
// Object.is, i.e. a value that could differ in a hash preimage without differing
// in the document).
function int(v: unknown, lo: number, hi: number, where: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || Object.is(v, -0) || v < lo || v > hi) {
    fail(`${where}: expected integer in [${lo},${hi}]`)
  }
  return v
}
function bool(v: unknown, where: string): boolean {
  if (typeof v !== 'boolean') fail(`${where}: expected boolean`)
  return v
}
function token(v: unknown, where: string): string {
  if (typeof v !== 'string' || !TOKEN_RE.test(v)) fail(`${where}: expected an identifier token`)
  return v
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], where: string): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    fail(`${where}: expected one of ${allowed.join('|')}`)
  }
  return v as T
}
function hex64(v: unknown, where: string): string {
  if (typeof v !== 'string' || !HEX64_RE.test(v)) fail(`${where}: expected a sha256 hex digest`)
  return v
}
function uuid(v: unknown, where: string): string {
  if (typeof v !== 'string' || !UUID_RE.test(v)) fail(`${where}: expected a uuid`)
  return v
}
function arr(v: unknown, max: number, where: string): unknown[] {
  if (!Array.isArray(v)) fail(`${where}: not an array`)
  if (v.length > max) fail(`${where}: ${v.length} entries exceeds the frozen maximum ${max}`)
  return v
}

const IDENTITY_KEYS = ['planVersion', 'policyVersion', 'compilerVersion', 'projectId', 'generationId',
  'sourceAssetId', 'sourceChecksum', 'bootManifestSha', 'scriptSnapshotSha', 'decisionSha256'] as const
const SOURCE_KEYS = ['origin', 'durationMs', 'allowedWindows'] as const
const OUTPUT_KEYS = ['profileId', 'width', 'height', 'fpsNum', 'fpsDen', 'videoCodec', 'audioCodec',
  'pixelFormat', 'audioSampleRateHz', 'audioChannels', 'faststart', 'durationMs'] as const
const SEGMENT_KEYS = ['index', 'sourceStartMs', 'sourceEndMs', 'outputStartMs', 'outputEndMs',
  'transitionInOverlapMs'] as const
const REMOVAL_KEYS = ['sourceStartMs', 'sourceEndMs', 'origin', 'ref', 'reasonCode'] as const
const TIMELINE_KEYS = ['segments', 'removals', 'cutsPerMinuteMilli'] as const
const CUE_KEYS = ['index', 'outputStartMs', 'outputEndMs', 'lines', 'emphasisWordIndices'] as const
const CAPTIONS_KEYS = ['presetId', 'fontSizePx', 'marginVerticalPx', 'cues'] as const
const ZOOM_KEYS = ['index', 'outputStartMs', 'outputEndMs', 'scaleMilli', 'intensity', 'reasonCode',
  'anchorWordIndex', 'easeInMs', 'easeOutMs'] as const
const TRANSITION_KEYS = ['index', 'atSegmentIndex', 'kind', 'overlapMs'] as const
const FRAMING_KEYS = ['modeId', 'safeTopPx', 'safeBottomPx', 'safeLeftPx', 'safeRightPx'] as const
const VIDEO_KEYS = ['framing', 'transitionPolicy', 'transitions', 'zooms'] as const
const AUDIO_KEYS = ['presetId', 'highpassHz', 'denoiseMilli', 'deesserMilli', 'targetLufsMilli',
  'toleranceLuMilli', 'truePeakCeilingDbtpMilli', 'music'] as const
const HOOK_KEYS = ['treatment', 'startWordIndex', 'sourceTrimStartMs', 'sourceTrimEndMs', 'reasonCode'] as const
const COVER_KEYS = ['sourceTimeMs', 'outputTimeMs'] as const
const WARNING_KEYS = ['code', 'detail'] as const
const COMPLEXITY_KEYS = ['wordCount', 'candidateCount', 'segmentCount', 'removalCount', 'cueCount',
  'zoomCount', 'transitionCount'] as const
const TOP_KEYS = ['schemaVersion', 'identity', 'source', 'output', 'timeline', 'captions', 'video',
  'audio', 'hook', 'cover', 'warnings', 'complexity'] as const

const MAX_MS = 900000

// The document-wide "no shell or filter expression is ever stored" scan. It runs
// over the WHOLE plan after field validation, so a field added later without a
// dedicated check is still covered. Caption lines are the single documented
// exemption (Gate-0 §3.1: "no unbounded free text EXCEPT caption text sourced
// from transcript words") and are instead bounded in length and count, and
// escaped at the ASS boundary.
const FILTER_METACHARACTERS = /[;:,'"\\[\]{}()<>|&$`\n\r\t=*?!]/
export function assertNoExpressionStrings(plan: EditPlanV1): void {
  const walk = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      if (FILTER_METACHARACTERS.test(value)) {
        fail(`${path}: string contains shell/filter metacharacters`, 'edit_plan_invalid')
      }
      return
    }
    if (Array.isArray(value)) {
      value.forEach((el, i) => { walk(el, `${path}[${i}]`) })
      return
    }
    if (isPlainObject(value)) {
      for (const k of Object.keys(value)) walk(value[k], `${path}.${k}`)
    }
  }
  walk(plan.identity, 'identity')
  walk(plan.source, 'source')
  walk(plan.output, 'output')
  walk(plan.timeline, 'timeline')
  walk(plan.video, 'video')
  walk(plan.audio, 'audio')
  walk(plan.hook, 'hook')
  walk(plan.cover, 'cover')
  walk(plan.warnings, 'warnings')
  walk(plan.complexity, 'complexity')
  // captions: everything EXCEPT cue lines.
  walk(plan.captions.presetId, 'captions.presetId')
  plan.captions.cues.forEach((c, i) => {
    walk(c.index, `captions.cues[${i}].index`)
    walk(c.emphasisWordIndices, `captions.cues[${i}].emphasisWordIndices`)
  })
}

export function validateEditPlan(input: unknown): EditPlanV1 {
  const o = strictKeys(input, TOP_KEYS, 'plan')
  if (o.schemaVersion !== EDIT_PLAN_SCHEMA_VERSION) fail('plan: schemaVersion mismatch')

  // -- identity
  const idn = strictKeys(o.identity, IDENTITY_KEYS, 'identity')
  if (idn.planVersion !== EDIT_PLAN_VERSION) fail('identity.planVersion mismatch')
  const identity: PlanIdentity = {
    planVersion: EDIT_PLAN_VERSION,
    policyVersion: token(idn.policyVersion, 'identity.policyVersion'),
    compilerVersion: token(idn.compilerVersion, 'identity.compilerVersion'),
    projectId: uuid(idn.projectId, 'identity.projectId'),
    generationId: uuid(idn.generationId, 'identity.generationId'),
    sourceAssetId: uuid(idn.sourceAssetId, 'identity.sourceAssetId'),
    sourceChecksum: hex64(idn.sourceChecksum, 'identity.sourceChecksum'),
    bootManifestSha: hex64(idn.bootManifestSha, 'identity.bootManifestSha'),
    scriptSnapshotSha: hex64(idn.scriptSnapshotSha, 'identity.scriptSnapshotSha'),
    decisionSha256: hex64(idn.decisionSha256, 'identity.decisionSha256'),
  }

  // -- source
  const src = strictKeys(o.source, SOURCE_KEYS, 'source')
  const origin = oneOf(src.origin, SOURCE_ORIGINS, 'source.origin')
  const sourceDurationMs = int(src.durationMs, 1, MAX_MS, 'source.durationMs')
  const rawWindows = arr(src.allowedWindows, MAX_ALLOWED_WINDOWS, 'source.allowedWindows')
  if (rawWindows.length === 0) fail('source.allowedWindows: empty', 'edit_plan_no_kept_media')
  let prevWindowEnd = -1
  const allowedWindows: PlanWindow[] = rawWindows.map((w, i) => {
    const ww = strictKeys(w, ['startMs', 'endMs'], `source.allowedWindows[${i}]`)
    const startMs = int(ww.startMs, 0, sourceDurationMs, `source.allowedWindows[${i}].startMs`)
    const endMs = int(ww.endMs, 0, sourceDurationMs, `source.allowedWindows[${i}].endMs`)
    if (endMs <= startMs) fail(`source.allowedWindows[${i}]: non-positive length`)
    if (startMs < prevWindowEnd) fail(`source.allowedWindows[${i}]: overlaps or unsorted`)
    prevWindowEnd = endMs
    return { startMs, endMs }
  })

  // -- output
  const out = strictKeys(o.output, OUTPUT_KEYS, 'output')
  const output: PlanOutput = {
    profileId: token(out.profileId, 'output.profileId'),
    width: int(out.width, 2, 8192, 'output.width'),
    height: int(out.height, 2, 8192, 'output.height'),
    fpsNum: int(out.fpsNum, 1, 240, 'output.fpsNum'),
    fpsDen: int(out.fpsDen, 1, 1001, 'output.fpsDen'),
    videoCodec: token(out.videoCodec, 'output.videoCodec'),
    audioCodec: token(out.audioCodec, 'output.audioCodec'),
    pixelFormat: token(out.pixelFormat, 'output.pixelFormat'),
    audioSampleRateHz: int(out.audioSampleRateHz, 8000, 192000, 'output.audioSampleRateHz'),
    audioChannels: int(out.audioChannels, 1, 2, 'output.audioChannels'),
    faststart: bool(out.faststart, 'output.faststart'),
    durationMs: int(out.durationMs, 1, MAX_MS, 'output.durationMs'),
  }
  if (output.width % 2 !== 0 || output.height % 2 !== 0) fail('output: dimensions must be even')

  // -- timeline
  const tl = strictKeys(o.timeline, TIMELINE_KEYS, 'timeline')
  const rawSegs = arr(tl.segments, MAX_SEGMENTS, 'timeline.segments')
  if (rawSegs.length === 0) fail('timeline.segments: empty', 'edit_plan_no_kept_media')
  const segments: PlanSegment[] = rawSegs.map((s, i) => {
    const ss = strictKeys(s, SEGMENT_KEYS, `timeline.segments[${i}]`)
    const seg: PlanSegment = {
      index: int(ss.index, 0, MAX_SEGMENTS - 1, `timeline.segments[${i}].index`),
      sourceStartMs: int(ss.sourceStartMs, 0, sourceDurationMs, `timeline.segments[${i}].sourceStartMs`),
      sourceEndMs: int(ss.sourceEndMs, 0, sourceDurationMs, `timeline.segments[${i}].sourceEndMs`),
      outputStartMs: int(ss.outputStartMs, 0, MAX_MS, `timeline.segments[${i}].outputStartMs`),
      outputEndMs: int(ss.outputEndMs, 0, MAX_MS, `timeline.segments[${i}].outputEndMs`),
      transitionInOverlapMs: int(ss.transitionInOverlapMs, 0, 5000, `timeline.segments[${i}].transitionInOverlapMs`),
    }
    if (seg.index !== i) fail(`timeline.segments[${i}]: index must equal position`)
    if (seg.sourceEndMs <= seg.sourceStartMs) fail(`timeline.segments[${i}]: non-positive source length`)
    if (i === 0 && seg.transitionInOverlapMs !== 0) {
      fail('timeline.segments[0]: the first segment cannot have an inbound transition')
    }
    return seg
  })
  // Source spans: sorted, non-overlapping, inside an allowed window.
  let prevSrcEnd = -1
  for (const seg of segments) {
    if (seg.sourceStartMs < prevSrcEnd) fail(`timeline.segments[${seg.index}]: source spans overlap or are unsorted`)
    prevSrcEnd = seg.sourceEndMs
    const inside = allowedWindows.some((w) => seg.sourceStartMs >= w.startMs && seg.sourceEndMs <= w.endMs)
    if (!inside) fail(`timeline.segments[${seg.index}]: outside the allowed source domain`, 'edit_plan_unsafe_cut')
  }
  // THE time map, re-derived here independently of the compiler, in its
  // canonical approved form (see editorCompile.buildTimeMap for the recorded
  // specification correction):
  //
  //   outputStart[0] = 0
  //   outputEnd[0]   = duration[0]
  //   outputStart[i] = outputEnd[i-1] - overlap[i]
  //   outputEnd[i]   = outputStart[i] + duration[i]
  //
  // so totalOutputDuration = sum(durations) - sum(overlaps), each overlap
  // counted exactly once. A plan whose stored output times disagree with this is
  // rejected — which is what makes "no subsystem maintains a second retiming
  // function" checkable rather than merely asserted in a comment.
  let cursor = 0
  for (const seg of segments) {
    const dur = seg.sourceEndMs - seg.sourceStartMs
    const expectedStart = seg.index === 0 ? 0 : cursor - seg.transitionInOverlapMs
    if (seg.transitionInOverlapMs >= dur) {
      fail(`timeline.segments[${seg.index}]: transition overlap consumes the whole segment`, 'edit_plan_unsafe_cut')
    }
    if (seg.outputStartMs !== expectedStart) fail(`timeline.segments[${seg.index}]: outputStartMs violates the time map`)
    if (seg.outputEndMs !== expectedStart + dur) fail(`timeline.segments[${seg.index}]: outputEndMs violates the time map`)
    cursor = seg.outputEndMs
  }
  if (output.durationMs !== cursor) fail('output.durationMs does not equal the mapped timeline end')

  const rawRem = arr(tl.removals, MAX_REMOVALS, 'timeline.removals')
  let prevRemEnd = -1
  const removals: PlanRemoval[] = rawRem.map((r, i) => {
    const rr = strictKeys(r, REMOVAL_KEYS, `timeline.removals[${i}]`)
    const rem: PlanRemoval = {
      sourceStartMs: int(rr.sourceStartMs, 0, sourceDurationMs, `timeline.removals[${i}].sourceStartMs`),
      sourceEndMs: int(rr.sourceEndMs, 0, sourceDurationMs, `timeline.removals[${i}].sourceEndMs`),
      origin: oneOf(rr.origin, REMOVAL_ORIGINS, `timeline.removals[${i}].origin`),
      ref: rr.ref === null ? null : int(rr.ref, 0, 1_000_000, `timeline.removals[${i}].ref`),
      reasonCode: token(rr.reasonCode, `timeline.removals[${i}].reasonCode`),
    }
    if (rem.sourceEndMs <= rem.sourceStartMs) fail(`timeline.removals[${i}]: non-positive length`)
    if (rem.sourceStartMs < prevRemEnd) fail(`timeline.removals[${i}]: overlaps or unsorted`)
    prevRemEnd = rem.sourceEndMs
    return rem
  })
  // A removal may never intersect a kept segment: the two are complements.
  for (const rem of removals) {
    for (const seg of segments) {
      if (rem.sourceStartMs < seg.sourceEndMs && seg.sourceStartMs < rem.sourceEndMs) {
        fail(`timeline.removals: removal [${rem.sourceStartMs},${rem.sourceEndMs}) intersects kept segment ${seg.index}`,
          'edit_plan_divergent')
      }
    }
  }
  const timeline: PlanTimeline = {
    segments, removals,
    cutsPerMinuteMilli: int(tl.cutsPerMinuteMilli, 0, 10_000_000, 'timeline.cutsPerMinuteMilli'),
  }

  // -- captions
  const cap = strictKeys(o.captions, CAPTIONS_KEYS, 'captions')
  const rawCues = arr(cap.cues, MAX_CUES, 'captions.cues')
  let prevCueEnd = -1
  const cues: PlanCue[] = rawCues.map((c, i) => {
    const cc = strictKeys(c, CUE_KEYS, `captions.cues[${i}]`)
    const index = int(cc.index, 0, MAX_CUES - 1, `captions.cues[${i}].index`)
    if (index !== i) fail(`captions.cues[${i}]: index must equal position`)
    const outputStartMs = int(cc.outputStartMs, 0, MAX_MS, `captions.cues[${i}].outputStartMs`)
    const outputEndMs = int(cc.outputEndMs, 0, MAX_MS, `captions.cues[${i}].outputEndMs`)
    if (outputEndMs <= outputStartMs) fail(`captions.cues[${i}]: non-positive duration`)
    if (outputEndMs > output.durationMs) fail(`captions.cues[${i}]: extends past the output duration`)
    if (outputStartMs < prevCueEnd) fail(`captions.cues[${i}]: overlaps or unsorted`)
    prevCueEnd = outputEndMs
    const lines = arr(cc.lines, MAX_CUE_LINES, `captions.cues[${i}].lines`).map((ln, j) => {
      if (typeof ln !== 'string' || ln.length === 0) fail(`captions.cues[${i}].lines[${j}]: empty or not a string`)
      if (ln.length > MAX_CUE_LINE_CHARS) fail(`captions.cues[${i}].lines[${j}]: too long`)
      return ln
    })
    if (lines.length === 0) fail(`captions.cues[${i}]: no lines`)
    const emph = arr(cc.emphasisWordIndices, MAX_CUE_EMPHASIS, `captions.cues[${i}].emphasisWordIndices`)
    let prevE = -1
    const emphasisWordIndices = emph.map((e, j) => {
      const val = int(e, 0, 1_000_000, `captions.cues[${i}].emphasisWordIndices[${j}]`)
      if (val <= prevE) fail(`captions.cues[${i}].emphasisWordIndices: not strictly ascending`)
      prevE = val
      return val
    })
    return { index, outputStartMs, outputEndMs, lines, emphasisWordIndices }
  })
  const captions: PlanCaptions = {
    presetId: oneOf(cap.presetId, CAPTION_PRESET_IDS, 'captions.presetId'),
    fontSizePx: int(cap.fontSizePx, 8, 400, 'captions.fontSizePx'),
    marginVerticalPx: int(cap.marginVerticalPx, 0, 4000, 'captions.marginVerticalPx'),
    cues,
  }

  // -- video
  const vid = strictKeys(o.video, VIDEO_KEYS, 'video')
  const fr = strictKeys(vid.framing, FRAMING_KEYS, 'video.framing')
  const framing: PlanFraming = {
    modeId: token(fr.modeId, 'video.framing.modeId'),
    safeTopPx: int(fr.safeTopPx, 0, output.height, 'video.framing.safeTopPx'),
    safeBottomPx: int(fr.safeBottomPx, 0, output.height, 'video.framing.safeBottomPx'),
    safeLeftPx: int(fr.safeLeftPx, 0, output.width, 'video.framing.safeLeftPx'),
    safeRightPx: int(fr.safeRightPx, 0, output.width, 'video.framing.safeRightPx'),
  }
  if (framing.safeTopPx + framing.safeBottomPx >= output.height) fail('video.framing: vertical safe area collapses')
  if (framing.safeLeftPx + framing.safeRightPx >= output.width) fail('video.framing: horizontal safe area collapses')
  const transitionPolicy = oneOf(vid.transitionPolicy, TRANSITION_POLICIES, 'video.transitionPolicy')
  const rawTrans = arr(vid.transitions, MAX_TRANSITIONS, 'video.transitions')
  const transitions: PlanTransition[] = rawTrans.map((t, i) => {
    const tt = strictKeys(t, TRANSITION_KEYS, `video.transitions[${i}]`)
    const tr: PlanTransition = {
      index: int(tt.index, 0, MAX_TRANSITIONS - 1, `video.transitions[${i}].index`),
      atSegmentIndex: int(tt.atSegmentIndex, 1, segments.length - 1, `video.transitions[${i}].atSegmentIndex`),
      kind: oneOf(tt.kind, TRANSITION_KINDS, `video.transitions[${i}].kind`),
      overlapMs: int(tt.overlapMs, 1, 5000, `video.transitions[${i}].overlapMs`),
    }
    if (tr.index !== i) fail(`video.transitions[${i}]: index must equal position`)
    return tr
  })
  if (transitionPolicy === 'hard_cuts_only' && transitions.length > 0) {
    fail('video.transitions: hard_cuts_only forbids transitions')
  }
  // The overlap is counted ONCE, and the time map is where it is counted: every
  // transition must be the transitionInOverlapMs already baked into its segment.
  let prevAt = 0
  for (const tr of transitions) {
    if (tr.atSegmentIndex <= prevAt) fail(`video.transitions[${tr.index}]: not strictly ascending by segment`)
    prevAt = tr.atSegmentIndex
    if (segments[tr.atSegmentIndex].transitionInOverlapMs !== tr.overlapMs) {
      fail(`video.transitions[${tr.index}]: overlap not reflected in the time map`, 'edit_plan_divergent')
    }
  }
  for (const seg of segments) {
    if (seg.transitionInOverlapMs > 0 && !transitions.some((t) => t.atSegmentIndex === seg.index)) {
      fail(`timeline.segments[${seg.index}]: time-map overlap without a declared transition`, 'edit_plan_divergent')
    }
  }
  const rawZooms = arr(vid.zooms, MAX_ZOOMS, 'video.zooms')
  let prevZoomEnd = -1
  const zooms: PlanZoom[] = rawZooms.map((z, i) => {
    const zz = strictKeys(z, ZOOM_KEYS, `video.zooms[${i}]`)
    const zoom: PlanZoom = {
      index: int(zz.index, 0, MAX_ZOOMS - 1, `video.zooms[${i}].index`),
      outputStartMs: int(zz.outputStartMs, 0, MAX_MS, `video.zooms[${i}].outputStartMs`),
      outputEndMs: int(zz.outputEndMs, 0, MAX_MS, `video.zooms[${i}].outputEndMs`),
      scaleMilli: int(zz.scaleMilli, 1001, 2000, `video.zooms[${i}].scaleMilli`),
      intensity: oneOf(zz.intensity, ZOOM_INTENSITIES, `video.zooms[${i}].intensity`),
      reasonCode: oneOf(zz.reasonCode, ZOOM_REASON_CODES, `video.zooms[${i}].reasonCode`),
      anchorWordIndex: int(zz.anchorWordIndex, 0, 1_000_000, `video.zooms[${i}].anchorWordIndex`),
      easeInMs: int(zz.easeInMs, 0, 2000, `video.zooms[${i}].easeInMs`),
      easeOutMs: int(zz.easeOutMs, 0, 2000, `video.zooms[${i}].easeOutMs`),
    }
    if (zoom.index !== i) fail(`video.zooms[${i}]: index must equal position`)
    if (zoom.outputEndMs <= zoom.outputStartMs) fail(`video.zooms[${i}]: non-positive duration`)
    if (zoom.outputEndMs > output.durationMs) fail(`video.zooms[${i}]: extends past the output duration`)
    if (zoom.easeInMs + zoom.easeOutMs > zoom.outputEndMs - zoom.outputStartMs) {
      fail(`video.zooms[${i}]: eases exceed the zoom duration`)
    }
    if (zoom.outputStartMs < prevZoomEnd) fail(`video.zooms[${i}]: overlaps or unsorted`)
    prevZoomEnd = zoom.outputEndMs
    return zoom
  })
  const video: PlanVideo = { framing, transitionPolicy, transitions, zooms }

  // -- audio
  const aud = strictKeys(o.audio, AUDIO_KEYS, 'audio')
  if (aud.music !== null) fail('audio.music: only null is permitted in this epoch', 'render_music_license_invalid')
  const audio: PlanAudio = {
    presetId: oneOf(aud.presetId, AUDIO_PRESET_IDS, 'audio.presetId'),
    highpassHz: int(aud.highpassHz, 0, 500, 'audio.highpassHz'),
    denoiseMilli: int(aud.denoiseMilli, 0, 1000, 'audio.denoiseMilli'),
    deesserMilli: int(aud.deesserMilli, 0, 1000, 'audio.deesserMilli'),
    targetLufsMilli: int(aud.targetLufsMilli, -70000, 0, 'audio.targetLufsMilli'),
    toleranceLuMilli: int(aud.toleranceLuMilli, 0, 5000, 'audio.toleranceLuMilli'),
    truePeakCeilingDbtpMilli: int(aud.truePeakCeilingDbtpMilli, -20000, 0, 'audio.truePeakCeilingDbtpMilli'),
    music: null,
  }

  // -- hook
  const hk = strictKeys(o.hook, HOOK_KEYS, 'hook')
  const treatment = oneOf(hk.treatment, HOOK_TREATMENTS, 'hook.treatment')
  const hook: PlanHook = {
    treatment,
    startWordIndex: hk.startWordIndex === null ? null : int(hk.startWordIndex, 0, 1_000_000, 'hook.startWordIndex'),
    sourceTrimStartMs: int(hk.sourceTrimStartMs, 0, sourceDurationMs, 'hook.sourceTrimStartMs'),
    sourceTrimEndMs: int(hk.sourceTrimEndMs, 0, sourceDurationMs, 'hook.sourceTrimEndMs'),
    reasonCode: token(hk.reasonCode, 'hook.reasonCode'),
  }
  if (hook.sourceTrimEndMs < hook.sourceTrimStartMs) fail('hook: reversed trim span')
  if (treatment === 'keep' && hook.sourceTrimEndMs !== hook.sourceTrimStartMs) {
    fail('hook: treatment "keep" must trim nothing')
  }
  if (treatment === 'keep' && hook.startWordIndex !== null) fail('hook: treatment "keep" has no start word')

  // -- cover
  const cv = strictKeys(o.cover, COVER_KEYS, 'cover')
  const cover: PlanCover = {
    sourceTimeMs: int(cv.sourceTimeMs, 0, sourceDurationMs, 'cover.sourceTimeMs'),
    outputTimeMs: int(cv.outputTimeMs, 0, MAX_MS, 'cover.outputTimeMs'),
  }
  if (cover.outputTimeMs >= output.durationMs) fail('cover.outputTimeMs: outside the output')
  {
    const seg = segments.find((s) => cover.sourceTimeMs >= s.sourceStartMs && cover.sourceTimeMs < s.sourceEndMs)
    if (!seg) fail('cover.sourceTimeMs: not inside a kept segment', 'edit_plan_divergent')
    if (cover.outputTimeMs !== seg.outputStartMs + (cover.sourceTimeMs - seg.sourceStartMs)) {
      fail('cover: output time does not follow the time map', 'edit_plan_divergent')
    }
  }

  // -- warnings / complexity
  const warnings: PlanWarning[] = arr(o.warnings, MAX_WARNINGS, 'warnings').map((w, i) => {
    const ww = strictKeys(w, WARNING_KEYS, `warnings[${i}]`)
    return { code: token(ww.code, `warnings[${i}].code`), detail: token(ww.detail, `warnings[${i}].detail`) }
  })
  const cx = strictKeys(o.complexity, COMPLEXITY_KEYS, 'complexity')
  const complexity: PlanComplexity = {
    wordCount: int(cx.wordCount, 0, 1_000_000, 'complexity.wordCount'),
    candidateCount: int(cx.candidateCount, 0, 1_000_000, 'complexity.candidateCount'),
    segmentCount: int(cx.segmentCount, 0, MAX_SEGMENTS, 'complexity.segmentCount'),
    removalCount: int(cx.removalCount, 0, MAX_REMOVALS, 'complexity.removalCount'),
    cueCount: int(cx.cueCount, 0, MAX_CUES, 'complexity.cueCount'),
    zoomCount: int(cx.zoomCount, 0, MAX_ZOOMS, 'complexity.zoomCount'),
    transitionCount: int(cx.transitionCount, 0, MAX_TRANSITIONS, 'complexity.transitionCount'),
  }
  if (complexity.segmentCount !== segments.length) fail('complexity.segmentCount disagrees with the timeline')
  if (complexity.removalCount !== removals.length) fail('complexity.removalCount disagrees with the timeline')
  if (complexity.cueCount !== cues.length) fail('complexity.cueCount disagrees with the captions')
  if (complexity.zoomCount !== zooms.length) fail('complexity.zoomCount disagrees with the video')
  if (complexity.transitionCount !== transitions.length) fail('complexity.transitionCount disagrees with the video')

  const plan: EditPlanV1 = {
    schemaVersion: EDIT_PLAN_SCHEMA_VERSION,
    identity, source: { origin, durationMs: sourceDurationMs, allowedWindows },
    output, timeline, captions, video, audio, hook, cover, warnings, complexity,
  }
  assertNoExpressionStrings(plan)
  const bytes = Buffer.byteLength(canonicalEditPlan(plan), 'utf8')
  if (bytes > EDIT_PLAN_MAX_BYTES) {
    fail(`plan canonical form is ${bytes} bytes (cap ${EDIT_PLAN_MAX_BYTES})`, 'edit_plan_too_large')
  }
  return plan
}

// ---- canonical serialization + hash ----------------------------------------
// canonicalJson is imported, never re-implemented: one canonicalization for the
// whole codebase (Gate-0 §3.1). Key order is recursive-sorted, array order is
// preserved, and every value in a validated plan is an integer, a boolean, null
// or a string — so there is no float to format differently anywhere.
export function canonicalEditPlan(plan: EditPlanV1): string {
  return canonicalJson(plan)
}
export function editPlanSha256(plan: EditPlanV1): string {
  return sha256Hex(canonicalEditPlan(plan))
}
export function editPlanByteLength(plan: EditPlanV1): number {
  return Buffer.byteLength(canonicalEditPlan(plan), 'utf8')
}

// Identity gate (Gate-0 §5 `edit_plan_identity_mismatch`): a plan is only usable
// against the exact pinned identity that produced it.
export function assertPlanIdentity(plan: EditPlanV1, expected: {
  projectId: string; generationId: string; sourceAssetId: string
  sourceChecksum: string; bootManifestSha: string; scriptSnapshotSha: string; decisionSha256: string
}): void {
  const keys = Object.keys(expected) as Array<keyof typeof expected>
  for (const k of keys) {
    if (plan.identity[k] !== expected[k]) {
      fail(`plan identity ${k} does not match the pinned edit`, 'edit_plan_identity_mismatch')
    }
  }
}

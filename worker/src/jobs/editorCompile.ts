// Editor v2 — Phase 8 Batch 8.1: the pure Decision -> EditPlan compiler.
//
// SOLE RESPONSIBILITY (Gate-0 §7): pure Decision + pinned evidence -> EditPlan.
// No database, storage, network, provider or process call appears in this file
// or in anything it imports transitively for its own work; the only file it
// reads is the frozen numeric policy document, exactly as editorManifest reads
// the frozen analysis rules.
//
// Two invariants govern the whole file:
//
//  1. THE ALLOWED DOMAIN. Bytes outside it do not exist for the editor. For a
//     teleprompter source that is ONLY the pinned capture manifest's accepted
//     windows — a rejected take is gone forever and cannot be resurrected by any
//     later stage. For an upload it is [0, sourceDurationMs). Script scenes are
//     NEVER source authority: the compiler input has no field through which a
//     script scene could reach a timing decision.
//
//  2. ONE TIME MAP. `buildTimeMap` is the only retiming function in the editor.
//     Captions, zooms, transitions, the cover frame and the output duration all
//     read it. Nothing recomputes an output time from a source time by any other
//     route, and `editPlanContract.validateEditPlan` independently re-derives it
//     so a second implementation could not survive review by accident.
//
// Where the frozen contract is silent the compiler always resolves toward
// KEEPING the creator's content and recording a warning. A cut is never forced.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EDIT_PLAN_SCHEMA_VERSION, EDIT_PLAN_VERSION, EditPlanError, validateEditPlan, editPlanSha256, canonicalEditPlan,
  MAX_WARNINGS, MAX_CUE_EMPHASIS,
  type EditPlanV1, type PlanSegment, type PlanRemoval, type PlanCue, type PlanWarning,
  type PlanZoom, type PlanTransition, type AudioPresetId, type CaptionPresetId,
  type TransitionPolicy, type ZoomIntensity, type ZoomReasonCode, type SourceOrigin,
} from './editPlanContract.js'

// v2: cues now carry `lineEmphasis` alongside `emphasisWordIndices` (EDIT_PLAN
// schema v2) — the compiler is the one place that still has the ordered,
// per-word group data needed to compute it.
export const EDIT_COMPILER_VERSION = 'edit-compiler-2'

const WORKER_ROOT = join(import.meta.dirname, '..', '..')

// ---- frozen policy ----------------------------------------------------------
export interface CaptionPresetPolicy {
  maxWordsPerCue: number
  maxCharsPerLine: number
  minCueDurationMs: number
  maxCueDurationMs: number
  maxCharsPerSecondMilli: number
  fontSizePx: number
  marginVerticalPx: number
}
export interface EditPolicyV1 {
  policyVersion: string
  output: {
    profileId: string; width: number; height: number; fpsNum: number; fpsDen: number
    videoCodec: string; audioCodec: string; pixelFormat: string
    audioSampleRateHz: number; audioChannels: number; faststart: boolean
    maxDurationMs: number; minDurationMs: number; expectedDurationToleranceMs: number
  }
  source: { maxDurationMs: number }
  loudness: { targetLufsMilli: number; toleranceLuMilli: number; truePeakCeilingDbtpMilli: number }
  audio: {
    presetIds: string[]; defaultPresetId: string
    noisySnrDbMilliMax: number; roomyEarlyEnergyRatioMilliMax: number
    presets: Record<string, { highpassHz: number; denoiseMilli: number; deesserMilli: number }>
  }
  cuts: {
    minKeptSegmentMs: number; minPhonemeHandleMs: number; maxCutsPerMinuteMilli: number
    maxKeptSegments: number; maxRemovals: number; emphasisPauseGuardMs: number
    sceneBoundaryGuardMs: number; minRemovalMs: number
  }
  captions: {
    maxCues: number; maxLinesPerCue: number; presetIds: string[]
    presets: Record<string, CaptionPresetPolicy>
  }
  zooms: {
    maxCount: number; minSeparationMs: number; holdMs: number
    easeInMs: number; easeOutMs: number; scaleMilli: Record<string, number>
  }
  transitions: {
    defaultPolicy: TransitionPolicy; restrainedOverlapMs: number
    minHandleMs: number; maxCount: number; kind: 'crossfade'
  }
  framing: {
    modeId: string; safeTopPx: number; safeBottomPx: number; safeLeftPx: number; safeRightPx: number
  }
  cover: { minOffsetMs: number; preferredOffsetMs: number }
  limits: { maxWarnings: number; maxPlanBytes: number }
}

let cachedPolicy: EditPolicyV1 | null = null
export function loadEditPolicy(path = join(WORKER_ROOT, 'edit_policy_v1.json')): EditPolicyV1 {
  if (cachedPolicy) return cachedPolicy
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  delete raw._comment
  cachedPolicy = raw as unknown as EditPolicyV1
  return cachedPolicy
}
export function resetEditPolicyCacheForTests(): void { cachedPolicy = null }

// ---- interval algebra -------------------------------------------------------
// Half-open [startMs, endMs) integer-millisecond intervals. Every function
// returns a NORMALIZED list: sorted by start, strictly positive length, and with
// no two intervals touching or overlapping. Normalization is idempotent, which
// is what makes the algebra property-testable: the same three laws
// (sortedness, positivity, disjointness) hold on every output of every operator.
export interface Interval { startMs: number; endMs: number }

function assertIntegerInterval(iv: Interval, where: string): void {
  if (!Number.isInteger(iv.startMs) || !Number.isInteger(iv.endMs)) {
    throw new EditPlanError(`${where}: interval bounds must be integer milliseconds`, 'edit_plan_invalid')
  }
}
export function normalizeIntervals(list: readonly Interval[]): Interval[] {
  for (let i = 0; i < list.length; i++) assertIntegerInterval(list[i], `interval ${i}`)
  const kept = list.filter((iv) => iv.endMs > iv.startMs)
  const sorted = [...kept].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
  const out: Interval[] = []
  for (const iv of sorted) {
    const last = out[out.length - 1]
    // `>=` merges touching intervals too, so the disjointness law is strict:
    // no output pair satisfies a.endMs >= b.startMs.
    if (last && iv.startMs <= last.endMs) {
      if (iv.endMs > last.endMs) last.endMs = iv.endMs
    } else {
      out.push({ startMs: iv.startMs, endMs: iv.endMs })
    }
  }
  return out
}
export function unionIntervals(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  return normalizeIntervals([...a, ...b])
}
export function intersectIntervals(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const A = normalizeIntervals(a)
  const B = normalizeIntervals(b)
  const out: Interval[] = []
  let i = 0
  let j = 0
  while (i < A.length && j < B.length) {
    const startMs = Math.max(A[i].startMs, B[j].startMs)
    const endMs = Math.min(A[i].endMs, B[j].endMs)
    if (endMs > startMs) out.push({ startMs, endMs })
    if (A[i].endMs <= B[j].endMs) i++
    else j++
  }
  return normalizeIntervals(out)
}
export function subtractIntervals(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const A = normalizeIntervals(a)
  const B = normalizeIntervals(b)
  const out: Interval[] = []
  let j = 0
  for (const iv of A) {
    let cursor = iv.startMs
    // B is sorted; advance past everything that ends before this interval starts.
    let k = j
    while (k < B.length && B[k].endMs <= iv.startMs) k++
    j = k
    while (k < B.length && B[k].startMs < iv.endMs) {
      if (B[k].startMs > cursor) out.push({ startMs: cursor, endMs: Math.min(B[k].startMs, iv.endMs) })
      cursor = Math.max(cursor, B[k].endMs)
      if (cursor >= iv.endMs) break
      k++
    }
    if (cursor < iv.endMs) out.push({ startMs: cursor, endMs: iv.endMs })
  }
  return normalizeIntervals(out)
}
export function totalDurationMs(list: readonly Interval[]): number {
  let total = 0
  for (const iv of list) total += iv.endMs - iv.startMs
  return total
}

// ---- the one time map -------------------------------------------------------
export interface TimeMapPiece {
  index: number
  sourceStartMs: number
  sourceEndMs: number
  outputStartMs: number
  outputEndMs: number
  transitionInOverlapMs: number
}
export interface TimeMap {
  pieces: TimeMapPiece[]
  outputDurationMs: number
}

// THE CANONICAL TIME MAP (approved 2026-07-27).
//
// `overlaps[i]` is the transition overlap BETWEEN piece i-1 and piece i;
// `overlaps[0]` is always 0.
//
//   outputStart[0] = 0
//   outputEnd[0]   = duration[0]
//   outputStart[i] = outputEnd[i-1] - overlap[i]
//   outputEnd[i]   = outputStart[i] + duration[i]
//
// Equivalently  outputEnd[i] = outputEnd[i-1] + duration[i] - overlap[i],
// and therefore totalOutputDuration = sum(durations) - sum(overlaps).
// A transition overlap is counted EXACTLY ONCE.
//
// SPECIFICATION CORRECTION. The original Phase 8 plan stated the second line as
// `outputEnd = outputStart + sourceDuration - transitionOverlap`. Read literally
// against THIS piece's own outputStart, that subtracts the overlap a SECOND
// time: it contradicts the frozen property that an overlap is counted once, and
// makes the timeline shorter than the material it contains. The defect was found
// during implementation of this batch and the corrected formula above was
// approved as canonical. `edit-time-map.test.ts` keeps a regression guard that
// encodes the original double-subtracting formula and proves it is short by
// exactly one overlap, so the defect cannot be reintroduced.
export function buildTimeMap(segments: readonly Interval[], overlaps: readonly number[]): TimeMap {
  if (segments.length !== overlaps.length) {
    throw new EditPlanError('time map: overlaps must be parallel to segments', 'edit_plan_invalid')
  }
  const pieces: TimeMapPiece[] = []
  let cursor = 0
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    assertIntegerInterval(seg, `time map piece ${i}`)
    const duration = seg.endMs - seg.startMs
    if (duration <= 0) throw new EditPlanError(`time map piece ${i}: non-positive duration`, 'edit_plan_invalid')
    const overlap = i === 0 ? 0 : overlaps[i]
    if (!Number.isInteger(overlap) || overlap < 0) {
      throw new EditPlanError(`time map piece ${i}: bad overlap`, 'edit_plan_invalid')
    }
    if (i > 0 && overlap >= duration) {
      throw new EditPlanError(`time map piece ${i}: overlap consumes the whole piece`, 'edit_plan_unsafe_cut')
    }
    const outputStartMs = i === 0 ? 0 : cursor - overlap
    if (outputStartMs < 0) throw new EditPlanError(`time map piece ${i}: negative output time`, 'edit_plan_invalid')
    const outputEndMs = outputStartMs + duration
    pieces.push({
      index: i,
      sourceStartMs: seg.startMs, sourceEndMs: seg.endMs,
      outputStartMs, outputEndMs, transitionInOverlapMs: overlap,
    })
    cursor = outputEndMs
  }
  return { pieces, outputDurationMs: cursor }
}

// Forward map. A source time that is not inside a kept piece has no output
// time — the caller must decide what that means, never invent one.
export function mapSourceToOutput(map: TimeMap, sourceMs: number): number | null {
  for (const p of map.pieces) {
    if (sourceMs >= p.sourceStartMs && sourceMs < p.sourceEndMs) {
      return p.outputStartMs + (sourceMs - p.sourceStartMs)
    }
  }
  return null
}
export function pieceForSource(map: TimeMap, sourceMs: number): TimeMapPiece | null {
  for (const p of map.pieces) {
    if (sourceMs >= p.sourceStartMs && sourceMs < p.sourceEndMs) return p
  }
  return null
}

// ---- compiler input ---------------------------------------------------------
export type SpeechCandidateKind = 'silence' | 'filler' | 'false_start' | 'repetition'
export type CandidateConfidence = 'low' | 'medium' | 'high'

export interface CompileWord {
  text: string
  startMs: number
  endMs: number
  confidence: number
}
export interface CompileCandidate {
  kind: SpeechCandidateKind
  startMs: number
  endMs: number
  confidence: CandidateConfidence
  selectionEnabled: 0 | 1
  safeToConsider: boolean
  wordIndices: number[]
}
export interface CompileVisualWaste {
  startMs: number
  endMs: number
  classCode: number
  selectionEnabled: 0 | 1
}
export interface CompileAudioFacts {
  snrDbMilli: number
  earlyEnergyRatioMilli: number
}
export interface CompileEvidence {
  words: CompileWord[]
  candidates: CompileCandidate[]
  visualWaste: CompileVisualWaste[]
  audio: CompileAudioFacts | null
}
export interface CompileDecision {
  selections: number[]
  visualWasteSelections: number[]
  emphasisWordIndices: number[]
  hookTreatment: 'keep' | 'open_at_word'
  hookStartWordIndex: number | null
  captionPresetId: CaptionPresetId
  transitionPolicy: TransitionPolicy
  zoomRequests: Array<{ anchorWordIndex: number; intensity: ZoomIntensity; reasonCode: ZoomReasonCode }>
}
export interface CompileIdentity {
  projectId: string
  generationId: string
  sourceAssetId: string
  sourceChecksum: string
  bootManifestSha: string
  scriptSnapshotSha: string
  decisionSha256: string
}
export interface CompileSource {
  origin: SourceOrigin
  durationMs: number
  // Teleprompter ONLY: the pinned capture manifest's accepted windows. Anything
  // outside them was rejected by the creator and is unavailable forever.
  acceptedWindows: Interval[]
}
export interface CompileBrandColors { primaryHex: string | null; highlightHex: string | null }
export interface CompileInput {
  identity: CompileIdentity
  source: CompileSource
  evidence: CompileEvidence
  decision: CompileDecision
  policy?: EditPolicyV1
  // Optional for callers (tests, mainly) that don't care about brand colors —
  // absent is treated exactly like { primaryHex: null, highlightHex: null },
  // never as "colors pending" or any other state.
  brandColors?: CompileBrandColors
  /** Whether this render carries the free-tier TwinAI mark.
   *
   *  ABSENT MEANS NO WATERMARK, deliberately. A caller that has not resolved
   *  the account's entitlement must not accidentally brand a paying customer's
   *  video; the failure direction that matters is "we watermarked someone who
   *  paid not to be", so the default is the one that cannot do that. */
  watermark?: boolean
}
export interface CompileResult {
  plan: EditPlanV1
  planSha256: string
  canonical: string
  warnings: PlanWarning[]
}

function bad(message: string, code = 'edit_plan_invalid'): never {
  throw new EditPlanError(message, code)
}

class WarningSink {
  private readonly seen = new Set<string>()
  readonly list: PlanWarning[] = []
  private truncated = false
  add(code: string, detail: string): void {
    const key = `${code}|${detail}`
    if (this.seen.has(key)) return
    if (this.list.length >= MAX_WARNINGS - 1) {
      if (!this.truncated) {
        this.truncated = true
        this.list.push({ code: 'warnings_truncated', detail: 'limit_reached' })
      }
      return
    }
    this.seen.add(key)
    this.list.push({ code, detail })
  }
}

// ---- allowed domain ---------------------------------------------------------
// Teleprompter: exactly the pinned accepted windows. Upload: the whole file.
// There is deliberately no third branch and no script input.
export function resolveAllowedDomain(source: CompileSource): Interval[] {
  if (!Number.isInteger(source.durationMs) || source.durationMs <= 0) {
    bad('source: durationMs must be a positive integer millisecond value')
  }
  if (source.origin === 'upload') {
    if (source.acceptedWindows.length !== 0) {
      bad('upload source carries accepted capture windows', 'edit_plan_divergent')
    }
    return [{ startMs: 0, endMs: source.durationMs }]
  }
  if (source.acceptedWindows.length === 0) {
    bad('teleprompter source has no accepted capture windows', 'edit_plan_no_kept_media')
  }
  for (const w of source.acceptedWindows) {
    if (!Number.isInteger(w.startMs) || !Number.isInteger(w.endMs)) bad('accepted window: non-integer bounds')
    if (w.startMs < 0 || w.endMs > source.durationMs || w.endMs <= w.startMs) {
      bad('accepted window outside the measured source duration', 'edit_plan_divergent')
    }
  }
  // The manifest already guarantees sorted, non-overlapping windows; normalizing
  // is a re-proof, not a repair. Windows that MERGE here would mean the manifest
  // let two takes touch, so a change in count is a contradiction, not a fix.
  const normalized = normalizeIntervals(source.acceptedWindows)
  if (normalized.length !== source.acceptedWindows.length) {
    bad('accepted capture windows overlap or touch', 'edit_plan_divergent')
  }
  return normalized
}

// ---- protections ------------------------------------------------------------
// Everything a removal may never touch, expressed as one interval list so the
// protection rule is a single subtraction rather than a chain of special cases.
export interface ProtectionInputs {
  domain: Interval[]
  words: CompileWord[]
  coveredWordIndices: Set<number>
  emphasisWordIndices: number[]
  origin: SourceOrigin
  policy: EditPolicyV1
}
export function buildProtectedRegions(inp: ProtectionInputs): Interval[] {
  const { policy } = inp
  const parts: Interval[] = []
  // (a) Accepted scene boundaries: a guard band inside each end of each window,
  //     so a cut can never eat the first or last frames of a take the creator
  //     explicitly accepted.
  if (inp.origin === 'teleprompter') {
    for (const w of inp.domain) {
      const guard = Math.min(policy.cuts.sceneBoundaryGuardMs, Math.floor((w.endMs - w.startMs) / 2))
      if (guard > 0) {
        parts.push({ startMs: w.startMs, endMs: w.startMs + guard })
        parts.push({ startMs: w.endMs - guard, endMs: w.endMs })
      }
    }
  }
  // (b) Every word NOT covered by a selected candidate, widened by the minimum
  //     phoneme handle on each side. This is the rule that makes it impossible
  //     for a silence removal to clip the consonant of the word beside it.
  const handle = policy.cuts.minPhonemeHandleMs
  for (let i = 0; i < inp.words.length; i++) {
    if (inp.coveredWordIndices.has(i)) continue
    const w = inp.words[i]
    parts.push({ startMs: Math.max(0, w.startMs - handle), endMs: w.endMs + handle })
  }
  // (c) Emphasis pauses: the beat around a word the Director marked for emphasis
  //     is part of the emphasis. Removing it would flatten the delivery the
  //     Director asked for.
  const pause = policy.cuts.emphasisPauseGuardMs
  for (const idx of inp.emphasisWordIndices) {
    const w = inp.words[idx]
    if (!w) continue
    parts.push({ startMs: Math.max(0, w.startMs - pause), endMs: w.endMs + pause })
  }
  return normalizeIntervals(parts)
}

// ---- removal resolution -----------------------------------------------------
interface ResolvedRemoval {
  interval: Interval
  origin: 'speech_candidate' | 'visual_waste'
  ref: number
  reasonCode: string
}

function resolveRemovals(
  input: CompileInput, policy: EditPolicyV1, domain: Interval[], warn: WarningSink,
): { requested: ResolvedRemoval[]; coveredWordIndices: Set<number> } {
  const { evidence, decision } = input
  const covered = new Set<number>()
  const requested: ResolvedRemoval[] = []

  const seenCandidates = new Set<number>()
  for (const idx of decision.selections) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= evidence.candidates.length) {
      bad(`removal: candidate index ${String(idx)} does not exist`, 'edit_plan_divergent')
    }
    if (seenCandidates.has(idx)) bad(`removal: duplicate candidate index ${idx}`, 'edit_plan_divergent')
    seenCandidates.add(idx)
    const c = evidence.candidates[idx]
    // Auto filler removal is OFF and must be STRUCTURALLY impossible, not merely
    // unused: a filler selection is a hard compile failure at every entry point,
    // never a warning and never a silent drop.
    if (c.kind === 'filler') {
      bad(`removal: candidate ${idx} is a filler and auto filler removal is disabled`, 'edit_plan_filler_disabled')
    }
    if (c.selectionEnabled !== 1) {
      bad(`removal: candidate ${idx} is not selection-enabled`, 'edit_plan_unsafe_cut')
    }
    if (!Number.isInteger(c.startMs) || !Number.isInteger(c.endMs) || c.endMs <= c.startMs) {
      bad(`removal: candidate ${idx} has a malformed span`, 'edit_plan_divergent')
    }
    // Unsafe or uncertain evidence never becomes a cut. These are the two cases
    // where the upstream analyzer itself declined to vouch for the span, so the
    // compiler keeps the content and says why.
    if (!c.safeToConsider) {
      warn.add('removal_skipped_unsafe_candidate', `candidate_${idx}`)
      continue
    }
    if (c.confidence === 'low') {
      warn.add('removal_skipped_uncertain_candidate', `candidate_${idx}`)
      continue
    }
    for (const w of c.wordIndices) {
      if (!Number.isInteger(w) || w < 0 || w >= evidence.words.length) {
        bad(`removal: candidate ${idx} references word ${String(w)} which does not exist`, 'edit_plan_divergent')
      }
      covered.add(w)
    }
    requested.push({
      interval: { startMs: c.startMs, endMs: c.endMs },
      origin: 'speech_candidate', ref: idx, reasonCode: `speech_${c.kind}`,
    })
  }

  const seenWaste = new Set<number>()
  for (const idx of decision.visualWasteSelections) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= evidence.visualWaste.length) {
      bad(`removal: visual-waste index ${String(idx)} does not exist`, 'edit_plan_divergent')
    }
    if (seenWaste.has(idx)) bad(`removal: duplicate visual-waste index ${idx}`, 'edit_plan_divergent')
    seenWaste.add(idx)
    const v = evidence.visualWaste[idx]
    if (v.selectionEnabled !== 1) {
      bad(`removal: visual-waste ${idx} is not selection-enabled`, 'edit_plan_unsafe_cut')
    }
    if (!Number.isInteger(v.startMs) || !Number.isInteger(v.endMs) || v.endMs <= v.startMs) {
      bad(`removal: visual-waste ${idx} has a malformed span`, 'edit_plan_divergent')
    }
    requested.push({
      interval: { startMs: v.startMs, endMs: v.endMs },
      origin: 'visual_waste', ref: idx, reasonCode: 'visual_dead_air',
    })
  }
  void domain
  void policy
  return { requested, coveredWordIndices: covered }
}

// ---- compile ----------------------------------------------------------------
// #rrggbb (the brand snapshot's format) -> ASS &H00BBGGRR: opaque alpha, bytes
// reversed. Pure and total for any string matching HEX_COLOUR_RE in
// editorCompileInput.ts, which is the only caller this ever sees, so it never
// needs to fail.
function hexToAssColour(hex: string): string {
  const r = hex.slice(1, 3).toUpperCase(), g = hex.slice(3, 5).toUpperCase(), b = hex.slice(5, 7).toUpperCase()
  return `&H00${b}${g}${r}`
}

export function compileEditPlan(input: CompileInput): CompileResult {
  const policy = input.policy ?? loadEditPolicy()
  const warn = new WarningSink()
  const { evidence, decision, identity } = input
  const brandColors = input.brandColors ?? { primaryHex: null, highlightHex: null }

  if (input.source.durationMs > policy.source.maxDurationMs) {
    bad(`source is ${input.source.durationMs} ms, over the editor maximum ${policy.source.maxDurationMs} ms`,
      'source_too_long_for_editor')
  }
  // Words are the spine of everything downstream; a non-monotonic or malformed
  // word list would silently corrupt captions, zooms and protections at once.
  for (let i = 0; i < evidence.words.length; i++) {
    const w = evidence.words[i]
    if (!Number.isInteger(w.startMs) || !Number.isInteger(w.endMs) || w.endMs < w.startMs) {
      bad(`word ${i}: malformed span`, 'edit_plan_divergent')
    }
    if (i > 0 && w.startMs < evidence.words[i - 1].startMs) bad(`word ${i}: start time decreases`, 'edit_plan_divergent')
  }
  for (const idx of decision.emphasisWordIndices) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= evidence.words.length) {
      bad(`emphasis: word index ${String(idx)} does not exist`, 'edit_plan_divergent')
    }
  }

  const allowedDomain = resolveAllowedDomain(input.source)

  // ---- hook treatment, applied BEFORE candidate subtraction ----------------
  // The hook never fabricates or reorders: it can only choose a real spoken word
  // to open on and drop what precedes it. The trim is recorded exactly.
  let effectiveDomain = allowedDomain
  let hookTrimStartMs = allowedDomain[0].startMs
  let hookTrimEndMs = allowedDomain[0].startMs
  let hookStartWordIndex: number | null = null
  let hookReason = 'hook_keep'
  if (decision.hookTreatment === 'open_at_word') {
    const idx = decision.hookStartWordIndex
    if (idx === null || !Number.isInteger(idx) || idx <= 0 || idx >= evidence.words.length) {
      bad(`hook: start word index ${String(idx)} does not exist`, 'edit_plan_divergent')
    }
    const word = evidence.words[idx]
    const window = allowedDomain.find((w) => word.startMs >= w.startMs && word.startMs < w.endMs)
    if (!window) {
      // The chosen word is not inside any accepted take. Opening there would
      // resurrect rejected bytes, so the hook is refused outright rather than
      // moved to some nearby word the Director did not choose.
      bad(`hook: start word ${idx} is outside the allowed source domain`, 'edit_plan_unsafe_cut')
    }
    const trimEnd = Math.max(allowedDomain[0].startMs, word.startMs - policy.cuts.minPhonemeHandleMs)
    if (trimEnd > allowedDomain[0].startMs) {
      hookTrimStartMs = allowedDomain[0].startMs
      hookTrimEndMs = trimEnd
      hookStartWordIndex = idx
      hookReason = 'hook_open_at_word'
      effectiveDomain = subtractIntervals(allowedDomain, [{ startMs: hookTrimStartMs, endMs: hookTrimEndMs }])
      if (effectiveDomain.length === 0) {
        bad('hook: the requested opening removes all accepted media', 'edit_plan_no_kept_media')
      }
    } else {
      warn.add('hook_open_at_word_noop', `word_${idx}`)
    }
  }

  // ---- removals -------------------------------------------------------------
  const { requested, coveredWordIndices } = resolveRemovals(input, policy, effectiveDomain, warn)
  const protectedRegions = buildProtectedRegions({
    domain: allowedDomain, words: evidence.words, coveredWordIndices,
    emphasisWordIndices: decision.emphasisWordIndices, origin: input.source.origin, policy,
  })

  // Each requested removal is clipped to the effective domain, then has every
  // protected region subtracted out. What survives is the SAFE part of the cut.
  // Fragments below the minimum removal length are dropped: a 20 ms hole is a
  // glitch, not an edit.
  interface SafeRemoval { interval: Interval; origin: 'speech_candidate' | 'visual_waste'; ref: number; reasonCode: string }
  const safe: SafeRemoval[] = []
  for (const r of requested) {
    const clipped = intersectIntervals([r.interval], effectiveDomain)
    if (clipped.length === 0) {
      warn.add('removal_outside_allowed_domain', `${r.origin}_${r.ref}`)
      continue
    }
    const survivors = subtractIntervals(clipped, protectedRegions)
      .filter((iv) => iv.endMs - iv.startMs >= policy.cuts.minRemovalMs)
    if (survivors.length === 0) {
      // Protections won. The content STAYS — the cut is never forced.
      warn.add('removal_kept_protected_content', `${r.origin}_${r.ref}`)
      continue
    }
    if (survivors.length !== 1 || survivors[0].startMs !== clipped[0].startMs
        || survivors[0].endMs !== clipped[clipped.length - 1].endMs) {
      warn.add('removal_snapped_to_safe_span', `${r.origin}_${r.ref}`)
    }
    for (const iv of survivors) safe.push({ interval: iv, origin: r.origin, ref: r.ref, reasonCode: r.reasonCode })
  }

  // ---- cut density ----------------------------------------------------------
  // A removal is a cut. Too many cuts per minute is unwatchable, so the longest
  // (most valuable) removals are kept and the shortest are given back, with the
  // ordering fully determined by (length desc, start asc) so the result is
  // reproducible byte-for-byte.
  const domainMs = totalDurationMs(effectiveDomain)
  const maxCuts = Math.max(1, Math.floor((policy.cuts.maxCutsPerMinuteMilli * domainMs) / (1000 * 60000)))
  let accepted = safe
  if (accepted.length > maxCuts) {
    const ranked = [...accepted].sort((a, b) =>
      (b.interval.endMs - b.interval.startMs) - (a.interval.endMs - a.interval.startMs)
      || a.interval.startMs - b.interval.startMs)
    const dropped = ranked.slice(maxCuts)
    for (const d of dropped) warn.add('removal_dropped_cut_density', `${d.origin}_${d.ref}`)
    const keep = new Set(ranked.slice(0, maxCuts))
    accepted = accepted.filter((r) => keep.has(r))
  }
  if (accepted.length > policy.cuts.maxRemovals) {
    bad(`too many removals (${accepted.length} > ${policy.cuts.maxRemovals})`, 'edit_plan_too_large')
  }

  // ---- kept segments --------------------------------------------------------
  // The complement, then a repair pass that gives content back whenever a
  // removal would leave a kept fragment shorter than the minimum. The pass only
  // ever UN-applies removals, so it always terminates and always errs toward
  // keeping the creator's material.
  accepted.sort((a, b) => a.interval.startMs - b.interval.startMs)
  let appliedRemovals = accepted
  for (;;) {
    const kept = subtractIntervals(effectiveDomain, appliedRemovals.map((r) => r.interval))
    const shortIdx = kept.findIndex((iv) => iv.endMs - iv.startMs < policy.cuts.minKeptSegmentMs)
    if (shortIdx === -1) break
    const short = kept[shortIdx]
    // Give back the removal adjacent to the offending fragment; prefer the one
    // that follows it, then the one before it.
    const after = appliedRemovals.findIndex((r) => r.interval.startMs === short.endMs)
    const before = appliedRemovals.findIndex((r) => r.interval.endMs === short.startMs)
    const victim = after !== -1 ? after : before
    if (victim === -1) {
      // Nothing to give back: the fragment is short because the accepted take
      // itself is short. Keeping it is still right — the alternative is deleting
      // media nobody asked to delete.
      warn.add('kept_segment_below_minimum', `at_${short.startMs}`)
      break
    }
    const v = appliedRemovals[victim]
    warn.add('removal_reverted_min_segment', `${v.origin}_${v.ref}`)
    appliedRemovals = appliedRemovals.filter((_, i) => i !== victim)
  }

  const keptIntervals = subtractIntervals(effectiveDomain, appliedRemovals.map((r) => r.interval))
  if (keptIntervals.length === 0) bad('no media remains after removals', 'edit_plan_no_kept_media')
  if (keptIntervals.length > policy.cuts.maxKeptSegments) {
    bad(`too many kept segments (${keptIntervals.length} > ${policy.cuts.maxKeptSegments})`, 'edit_plan_too_large')
  }

  // ---- transitions + the time map ------------------------------------------
  // `restrained` is honoured ONLY at a verified scene boundary — a junction
  // between two DIFFERENT accepted capture windows — with a real handle on both
  // sides. An upload has no verified scene boundary at all, so it always gets
  // hard cuts. When nothing qualifies the plan records `hard_cuts_only`, which
  // is the frozen default, rather than a policy it did not actually apply.
  const overlaps = new Array<number>(keptIntervals.length).fill(0)
  const transitions: PlanTransition[] = []
  let transitionPolicy: TransitionPolicy = policy.transitions.defaultPolicy
  if (decision.transitionPolicy === 'restrained' && input.source.origin === 'teleprompter') {
    const overlap = policy.transitions.restrainedOverlapMs
    const windowIndexOf = (ms: number): number => allowedDomain.findIndex((w) => ms >= w.startMs && ms < w.endMs)
    for (let i = 1; i < keptIntervals.length && transitions.length < policy.transitions.maxCount; i++) {
      const prev = keptIntervals[i - 1]
      const cur = keptIntervals[i]
      const crossesWindow = windowIndexOf(prev.startMs) !== windowIndexOf(cur.startMs)
      if (!crossesWindow) continue
      const prevLen = prev.endMs - prev.startMs
      const curLen = cur.endMs - cur.startMs
      if (prevLen < policy.transitions.minHandleMs + overlap || curLen < policy.transitions.minHandleMs + overlap) {
        warn.add('transition_skipped_no_handle', `at_${i}`)
        continue
      }
      overlaps[i] = overlap
      transitions.push({ index: transitions.length, atSegmentIndex: i, kind: policy.transitions.kind, overlapMs: overlap })
    }
    if (transitions.length > 0) transitionPolicy = 'restrained'
    else warn.add('transition_policy_downgraded', 'no_verified_boundary')
  } else if (decision.transitionPolicy === 'restrained') {
    warn.add('transition_policy_downgraded', 'upload_has_no_scene_boundary')
  }

  const timeMap = buildTimeMap(keptIntervals, overlaps)
  const segments: PlanSegment[] = timeMap.pieces.map((p) => ({
    index: p.index,
    sourceStartMs: p.sourceStartMs, sourceEndMs: p.sourceEndMs,
    outputStartMs: p.outputStartMs, outputEndMs: p.outputEndMs,
    transitionInOverlapMs: p.transitionInOverlapMs,
  }))
  const outputDurationMs = timeMap.outputDurationMs
  if (outputDurationMs < policy.output.minDurationMs) {
    bad(`output would be ${outputDurationMs} ms, below the minimum ${policy.output.minDurationMs} ms`,
      'edit_plan_no_kept_media')
  }
  if (outputDurationMs > policy.output.maxDurationMs) {
    bad(`output would be ${outputDurationMs} ms, over the maximum`, 'edit_plan_too_large')
  }

  // ---- removals as recorded in the plan ------------------------------------
  // Everything the source has that the output does not: the hook trim, the
  // accepted removals, and the bytes outside the allowed domain are NOT listed
  // (they never existed for the editor). The plan's removals are exactly the
  // complement of the kept segments WITHIN the allowed domain.
  const removedIntervals = subtractIntervals(allowedDomain, keptIntervals)
  const removalLabel = (iv: Interval): { origin: PlanRemoval['origin']; ref: number | null; reasonCode: string } => {
    if (hookStartWordIndex !== null && iv.startMs >= hookTrimStartMs && iv.endMs <= hookTrimEndMs) {
      return { origin: 'hook_trim', ref: hookStartWordIndex, reasonCode: hookReason }
    }
    const owner = appliedRemovals.find((r) => r.interval.startMs <= iv.startMs && iv.endMs <= r.interval.endMs)
    if (owner) return { origin: owner.origin, ref: owner.ref, reasonCode: owner.reasonCode }
    return { origin: 'speech_candidate', ref: null, reasonCode: 'derived_complement' }
  }
  const removals: PlanRemoval[] = removedIntervals.map((iv) => {
    const label = removalLabel(iv)
    return { sourceStartMs: iv.startMs, sourceEndMs: iv.endMs, ...label }
  })
  if (removals.length > policy.cuts.maxRemovals) {
    bad(`too many recorded removals (${removals.length})`, 'edit_plan_too_large')
  }
  const cutsPerMinuteMilli = outputDurationMs > 0
    ? Math.round((Math.max(0, segments.length - 1) * 60000 * 1000) / outputDurationMs)
    : 0

  // ---- captions -------------------------------------------------------------
  const captionPreset = policy.captions.presets[decision.captionPresetId]
  if (!captionPreset) bad(`captions: unknown preset ${decision.captionPresetId}`)
  const emphasisSet = new Set(decision.emphasisWordIndices)
  const cues = buildCaptionCues({
    words: evidence.words, timeMap, preset: captionPreset,
    maxLines: policy.captions.maxLinesPerCue, maxCues: policy.captions.maxCues,
    outputDurationMs, emphasisSet, warn,
  })

  // ---- zooms ----------------------------------------------------------------
  const zooms: PlanZoom[] = []
  for (const req of decision.zoomRequests) {
    if (zooms.length >= Math.min(policy.zooms.maxCount, 20)) {
      warn.add('zoom_dropped_max_count', `word_${req.anchorWordIndex}`)
      continue
    }
    const word = evidence.words[req.anchorWordIndex]
    if (!word) bad(`zoom: anchor word ${req.anchorWordIndex} does not exist`, 'edit_plan_divergent')
    const piece = pieceForSource(timeMap, word.startMs)
    if (!piece) {
      // The anchor was removed. A zoom is a pointer at a specific word, so it is
      // dropped — never slid onto a different word the Director did not choose.
      warn.add('zoom_dropped_anchor_removed', `word_${req.anchorWordIndex}`)
      continue
    }
    const start = piece.outputStartMs + (word.startMs - piece.sourceStartMs)
    const maxEnd = Math.min(piece.outputEndMs, outputDurationMs)
    const end = Math.min(start + policy.zooms.holdMs, maxEnd)
    if (end - start < policy.zooms.easeInMs + policy.zooms.easeOutMs) {
      warn.add('zoom_dropped_too_short', `word_${req.anchorWordIndex}`)
      continue
    }
    const prev = zooms[zooms.length - 1]
    if (prev && start - prev.outputEndMs < policy.zooms.minSeparationMs) {
      warn.add('zoom_dropped_min_separation', `word_${req.anchorWordIndex}`)
      continue
    }
    const scaleMilli = policy.zooms.scaleMilli[req.intensity]
    if (typeof scaleMilli !== 'number') bad(`zoom: unknown intensity ${req.intensity}`)
    zooms.push({
      index: zooms.length, outputStartMs: start, outputEndMs: end, scaleMilli,
      intensity: req.intensity, reasonCode: req.reasonCode, anchorWordIndex: req.anchorWordIndex,
      easeInMs: policy.zooms.easeInMs, easeOutMs: policy.zooms.easeOutMs,
    })
  }

  // ---- audio ----------------------------------------------------------------
  let audioPresetId: AudioPresetId = policy.audio.defaultPresetId as AudioPresetId
  if (evidence.audio === null) {
    warn.add('audio_preset_defaulted', 'no_audio_component')
  } else if (evidence.audio.snrDbMilli < policy.audio.noisySnrDbMilliMax) {
    audioPresetId = 'speech-noisy-v1'
  } else if (evidence.audio.earlyEnergyRatioMilli > policy.audio.roomyEarlyEnergyRatioMilliMax) {
    audioPresetId = 'speech-roomy-v1'
  }
  const audioPreset = policy.audio.presets[audioPresetId]
  if (!audioPreset) bad(`audio: unknown preset ${audioPresetId}`)

  // ---- cover ----------------------------------------------------------------
  // Chosen through the same time map, inside the first kept piece and clear of
  // any transition overlap, so its inverse is unique by construction.
  const first = timeMap.pieces[0]
  const coverMaxOutput = Math.min(first.outputEndMs - 1, outputDurationMs - 1)
  const coverOutputTimeMs = Math.max(0, Math.min(policy.cover.preferredOffsetMs, coverMaxOutput))
  const coverSourceTimeMs = first.sourceStartMs + (coverOutputTimeMs - first.outputStartMs)

  const draft: EditPlanV1 = {
    schemaVersion: EDIT_PLAN_SCHEMA_VERSION,
    identity: {
      planVersion: EDIT_PLAN_VERSION,
      policyVersion: policy.policyVersion,
      compilerVersion: EDIT_COMPILER_VERSION,
      projectId: identity.projectId,
      generationId: identity.generationId,
      sourceAssetId: identity.sourceAssetId,
      sourceChecksum: identity.sourceChecksum,
      bootManifestSha: identity.bootManifestSha,
      scriptSnapshotSha: identity.scriptSnapshotSha,
      decisionSha256: identity.decisionSha256,
    },
    source: {
      origin: input.source.origin,
      durationMs: input.source.durationMs,
      allowedWindows: allowedDomain.map((w) => ({ startMs: w.startMs, endMs: w.endMs })),
    },
    output: {
      profileId: policy.output.profileId,
      width: policy.output.width, height: policy.output.height,
      fpsNum: policy.output.fpsNum, fpsDen: policy.output.fpsDen,
      videoCodec: policy.output.videoCodec, audioCodec: policy.output.audioCodec,
      pixelFormat: policy.output.pixelFormat,
      audioSampleRateHz: policy.output.audioSampleRateHz, audioChannels: policy.output.audioChannels,
      faststart: policy.output.faststart, durationMs: outputDurationMs,
      watermark: input.watermark === true,
    },
    timeline: { segments, removals, cutsPerMinuteMilli },
    captions: {
      presetId: decision.captionPresetId,
      fontSizePx: captionPreset.fontSizePx,
      marginVerticalPx: captionPreset.marginVerticalPx,
      brandPrimaryColourAss: brandColors.primaryHex ? hexToAssColour(brandColors.primaryHex) : null,
      brandHighlightColourAss: brandColors.highlightHex ? hexToAssColour(brandColors.highlightHex) : null,
      cues,
    },
    video: {
      framing: {
        modeId: policy.framing.modeId,
        safeTopPx: policy.framing.safeTopPx, safeBottomPx: policy.framing.safeBottomPx,
        safeLeftPx: policy.framing.safeLeftPx, safeRightPx: policy.framing.safeRightPx,
      },
      transitionPolicy, transitions, zooms,
    },
    audio: {
      presetId: audioPresetId,
      highpassHz: audioPreset.highpassHz,
      denoiseMilli: audioPreset.denoiseMilli,
      deesserMilli: audioPreset.deesserMilli,
      targetLufsMilli: policy.loudness.targetLufsMilli,
      toleranceLuMilli: policy.loudness.toleranceLuMilli,
      truePeakCeilingDbtpMilli: policy.loudness.truePeakCeilingDbtpMilli,
      music: null,
    },
    hook: {
      treatment: hookStartWordIndex === null ? 'keep' : 'open_at_word',
      startWordIndex: hookStartWordIndex,
      sourceTrimStartMs: hookTrimStartMs,
      sourceTrimEndMs: hookTrimEndMs,
      reasonCode: hookReason,
    },
    cover: { sourceTimeMs: coverSourceTimeMs, outputTimeMs: coverOutputTimeMs },
    warnings: warn.list,
    complexity: {
      wordCount: evidence.words.length,
      candidateCount: evidence.candidates.length,
      segmentCount: segments.length,
      removalCount: removals.length,
      cueCount: cues.length,
      zoomCount: zooms.length,
      transitionCount: transitions.length,
    },
  }

  // The compiler's own output goes through the SAME strict validator any other
  // producer would face. It is not trusted because it is local.
  const plan = validateEditPlan(draft)
  assertNoRemovedWordIsCaptioned(plan, evidence.words, timeMap)
  return { plan, planSha256: editPlanSha256(plan), canonical: canonicalEditPlan(plan), warnings: plan.warnings }
}

// ---- caption cue construction ----------------------------------------------
interface CueBuildInputs {
  words: CompileWord[]
  timeMap: TimeMap
  preset: CaptionPresetPolicy
  maxLines: number
  maxCues: number
  outputDurationMs: number
  emphasisSet: Set<number>
  warn: WarningSink
}
interface StagedWord { index: number; text: string; outStartMs: number; outEndMs: number }

// Greedy line fill: words are never split, truncated or reordered. A word longer
// than the line limit gets its own line rather than being cut, because caption
// text is transcript text and the transcript is evidence.
//
// Returns each line's joined DISPLAY string alongside the ORIGINAL INDICES (into
// `texts`) that composed it, using the exact same greedy decision (based on the
// joined string's length) as before — so `lines` is byte-identical to what this
// function has always produced. The indices exist so a caller needing per-word
// boundaries (emphasis highlighting) never has to re-split the joined string —
// a single entry of `texts` is not guaranteed free of internal whitespace (the
// injection-resistance tests deliberately feed such tokens), so splitting on
// space downstream would misalign word boundaries whenever one occurs.
function layoutLines(
  texts: string[], maxCharsPerLine: number, maxLines: number,
): { lines: string[]; groups: number[][] } | null {
  const lines: string[] = []
  const groups: number[][] = []
  let current = ''
  let currentGroup: number[] = []
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i]
    const candidate = current === '' ? t : `${current} ${t}`
    if (candidate.length <= maxCharsPerLine || current === '') {
      current = candidate
      currentGroup.push(i)
    } else {
      lines.push(current)
      groups.push(currentGroup)
      current = t
      currentGroup = [i]
      if (lines.length > maxLines) return null
    }
  }
  if (current !== '') { lines.push(current); groups.push(currentGroup) }
  if (lines.length === 0 || lines.length > maxLines) return null
  return { lines, groups }
}

function buildCaptionCues(inp: CueBuildInputs): PlanCue[] {
  const { words, timeMap, preset, maxLines, maxCues, outputDurationMs, emphasisSet, warn } = inp
  // Stage every word that survives into output time, in one pass over the words
  // and the pieces together (O(words + pieces), no pairwise search).
  const staged: Array<StagedWord & { pieceIndex: number }> = []
  let p = 0
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    while (p < timeMap.pieces.length && timeMap.pieces[p].sourceEndMs <= w.startMs) p++
    const piece = timeMap.pieces[p]
    // A word is captioned only when it lies WHOLLY inside one kept piece. A word
    // straddling a cut has no single output span, and half a word on screen is
    // worse than no word.
    if (!piece || w.startMs < piece.sourceStartMs || w.endMs > piece.sourceEndMs) continue
    const outStartMs = piece.outputStartMs + (w.startMs - piece.sourceStartMs)
    const outEndMs = piece.outputStartMs + (w.endMs - piece.sourceStartMs)
    if (outEndMs <= outStartMs) continue
    staged.push({ index: i, text: w.text, outStartMs, outEndMs, pieceIndex: piece.index })
  }

  const cues: PlanCue[] = []
  let group: Array<StagedWord & { pieceIndex: number }> = []
  const pending = [...staged]
  const flush = (): void => {
    if (group.length === 0) return
    // Hitting the cue ceiling DROPS the rest of the captions. Silently, until
    // now — a 15-minute take on the punchiest preset can reach it, and the
    // symptom is "my captions just stop halfway", with nothing anywhere saying
    // why. It is still a drop, but it is now a recorded one.
    if (cues.length >= maxCues) {
      warn.add('caption_dropped_max_cues', `cue_${cues.length}`)
      group = []
      return
    }
    const texts = group.map((g) => g.text)
    let layout = layoutLines(texts, preset.maxCharsPerLine, maxLines)
    while (layout === null && group.length > 1) {
      // Too much text to lay out: give the tail back to the next cue rather than
      // dropping any of it.
      const tail = group.pop()
      if (tail) pending.unshift(tail)
      layout = layoutLines(group.map((g) => g.text), preset.maxCharsPerLine, maxLines)
    }
    let lines: string[]
    // The original-token indices (into `group`) behind each line — `[[0]]` in
    // the single-overflow-word fallback below, `layout.groups` otherwise.
    let lineGroups: number[][]
    if (layout === null) {
      // A single word longer than two full lines. Keep it as one line — the
      // validator bounds the line length, and truncating transcript text is not
      // something this compiler does silently.
      lines = [group[0].text.slice(0, preset.maxCharsPerLine * maxLines)]
      lineGroups = [[0]]
      warn.add('caption_line_overflow', `word_${group[0].index}`)
    } else {
      lines = layout.lines
      lineGroups = layout.groups
    }
    // The per-token texts behind each line. NOT `texts[idx]` in the truncated
    // fallback — that word was cut short, so its one token is the truncated
    // text actually being displayed, keeping `lineTokens[j].join(' ') ===
    // lines[j]` true in every case, exactly as the validator requires.
    const lineTokens: string[][] = layout === null
      ? [[lines[0]]]
      : lineGroups.map((idxs) => idxs.map((idx) => texts[idx]))
    // One flag per token, straight from the SAME index groups — exact by
    // construction, never by re-parsing rendered text apart.
    const lineEmphasis: boolean[][] = lineGroups.map((idxs) => idxs.map((idx) => emphasisSet.has(group[idx].index)))
    const startMs = group[0].outStartMs
    let endMs = group[group.length - 1].outEndMs
    const chars = lines.join(' ').length
    // Reading speed and minimum duration both want a LONGER cue; the maximum
    // wants a shorter one. Room is whatever is left before the next word starts
    // or the piece ends, so extending never overlaps the following cue.
    const room = Math.min(outputDurationMs, nextBoundary(group[group.length - 1]))
    const wantByRead = preset.maxCharsPerSecondMilli > 0
      ? Math.ceil((chars * 1000 * 1000) / preset.maxCharsPerSecondMilli) : 0
    const want = Math.max(preset.minCueDurationMs, wantByRead)
    if (endMs - startMs < want) endMs = Math.min(startMs + want, room)
    if (endMs - startMs > preset.maxCueDurationMs) endMs = startMs + preset.maxCueDurationMs
    if (endMs > outputDurationMs) endMs = outputDurationMs
    if (endMs <= startMs) { group = []; return }
    const emphasisWordIndices = group.map((g) => g.index).filter((i) => emphasisSet.has(i)).slice(0, MAX_CUE_EMPHASIS)
    cues.push({
      index: cues.length, outputStartMs: startMs, outputEndMs: endMs,
      lines, emphasisWordIndices, lineTokens, lineEmphasis,
    })
    group = []
  }
  // The next hard stop after a staged word: the start of the following staged
  // word in the same piece, or the end of the piece.
  const stagedByIndex = new Map<number, number>()
  staged.forEach((s, i) => stagedByIndex.set(s.index, i))
  function nextBoundary(last: StagedWord & { pieceIndex: number }): number {
    const pos = stagedByIndex.get(last.index)
    if (pos !== undefined && pos + 1 < staged.length && staged[pos + 1].pieceIndex === last.pieceIndex) {
      return staged[pos + 1].outStartMs
    }
    return timeMap.pieces[last.pieceIndex].outputEndMs
  }

  while (pending.length > 0) {
    const w = pending.shift()
    if (!w) break
    if (group.length > 0) {
      const samePiece = group[0].pieceIndex === w.pieceIndex
      const wouldExceedWords = group.length >= preset.maxWordsPerCue
      const wouldExceedTime = w.outEndMs - group[0].outStartMs > preset.maxCueDurationMs
      // A cue never spans a cut: crossing a piece boundary would give it an
      // output span containing time that no longer exists.
      if (!samePiece || wouldExceedWords || wouldExceedTime) flush()
    }
    group.push(w)
  }
  flush()
  return cues
}

// The explicit end-to-end check the frozen fixture matrix asks for: no word that
// was removed may appear in any cue. It re-derives membership from the time map
// rather than trusting the staging pass that produced the cues.
export function assertNoRemovedWordIsCaptioned(
  plan: EditPlanV1, words: CompileWord[], timeMap: TimeMap,
): void {
  const captionedText = new Set<string>()
  for (const cue of plan.captions.cues) for (const line of cue.lines) {
    for (const tok of line.split(' ')) captionedText.add(tok)
  }
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    const inside = timeMap.pieces.some((p) => w.startMs >= p.sourceStartMs && w.endMs <= p.sourceEndMs)
    if (inside) continue
    // A removed word's exact token may legitimately also occur elsewhere in the
    // transcript, so text alone is not proof. The decisive check is positional:
    // no cue may cover the removed word's output time, because it has none.
    const mapped = mapSourceToOutput(timeMap, w.startMs)
    if (mapped === null) continue
    for (const cue of plan.captions.cues) {
      if (mapped >= cue.outputStartMs && mapped < cue.outputEndMs && captionedText.has(w.text)) {
        throw new EditPlanError(
          `captions: removed word ${i} appears in cue ${cue.index}`, 'edit_plan_divergent')
      }
    }
  }
}

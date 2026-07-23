// Editor v2 — worker-local duplicate of the Source Capture contract.
//
// The worker has NO @twinai/shared runtime dependency (Docker builds worker/src
// only), so — exactly like directorContract.ts mirrors director.ts — this file
// re-implements the pure capture logic from packages/shared/src/editor/capture.ts.
// A parity test (worker/src/__tests__/capture-contract.test.ts) imports the
// shared authority by relative path and pins byte/behaviour equality.
//
// Used by validateSource.ts to normalize the client-asserted capture intent
// against the MEASURED media duration before the source asset becomes ready.
import { canonicalJson, sha256Hex } from './editorManifest.js'

export const CAPTURE_SCHEMA_VERSION = 1
export const CAPTURE_NORMALIZATION_VERSION = 'capture-1'
export const CAPTURE_END_TOLERANCE_MS = 750
export const CAPTURE_MIN_SEGMENT_MS = 250
export const CAPTURE_MAX_SEGMENTS = 200
export const CAPTURE_INTENT_MAX_BYTES = 65536
export const CAPTURE_MANIFEST_MAX_BYTES = 65536

export type CaptureOrigin = 'teleprompter' | 'upload'

export interface IntentAcceptedSegment {
  sceneNumber: number
  startMs: number
  endMs: number
  intendedDialogueSha256: string
}
export interface SourceCaptureIntentV1 {
  schemaVersion: 1
  origin: CaptureOrigin
  generationId: string
  sourceAssetId: string
  recordingScriptSha256: string | null
  clientAttemptId: string
  recorderClock: 'mediarecorder-active-time-ms' | 'none'
  acceptedSegments: IntentAcceptedSegment[]
}
export interface ManifestAcceptedSegment {
  sceneNumber: number
  sourceStartMs: number
  sourceEndMs: number
  intendedDialogueSha256: string
}
export interface SourceCaptureManifestV1 {
  schemaVersion: 1
  sourceAssetId: string
  sourceSha256: string
  sourceDurationMs: number
  origin: CaptureOrigin
  recordingScriptSha256: string | null
  intentSha256: string
  acceptedSegments: ManifestAcceptedSegment[]
  normalizationVersion: string
  manifestSha256: string
}

export class CaptureContractError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'CaptureContractError'
    this.code = code
  }
}
function fail(message: string, code: string): never {
  throw new CaptureContractError(message, code)
}

const HEX64_RE = /^[0-9a-f]{64}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function utf8Len(s: string): number {
  return Buffer.byteLength(s, 'utf8')
}

// Untrusted-input validation (the stored intent jsonb, re-checked in the worker).
export function validateCaptureIntent(input: unknown): SourceCaptureIntentV1 {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) fail('intent: not an object', 'capture_intent_not_object')
  const o = input as Record<string, unknown>
  if (o.schemaVersion !== CAPTURE_SCHEMA_VERSION) fail('intent: schemaVersion', 'capture_intent_schema')
  if (o.origin !== 'teleprompter' && o.origin !== 'upload') fail('intent: origin', 'capture_intent_bad_origin')
  const origin = o.origin as CaptureOrigin
  if (typeof o.generationId !== 'string' || !UUID_RE.test(o.generationId)) fail('intent: generationId', 'capture_intent_bad_id')
  if (typeof o.sourceAssetId !== 'string' || !UUID_RE.test(o.sourceAssetId)) fail('intent: sourceAssetId', 'capture_intent_bad_id')
  if (typeof o.clientAttemptId !== 'string' || !UUID_RE.test(o.clientAttemptId)) fail('intent: clientAttemptId', 'capture_intent_bad_id')

  if (origin === 'teleprompter') {
    if (typeof o.recordingScriptSha256 !== 'string' || !HEX64_RE.test(o.recordingScriptSha256)) fail('teleprompter: script sha', 'capture_intent_bad_script_sha')
    if (o.recorderClock !== 'mediarecorder-active-time-ms') fail('teleprompter: clock', 'capture_intent_bad_clock')
  } else {
    if (o.recordingScriptSha256 !== null) fail('upload: script sha must be null', 'capture_intent_upload_shape')
    if (o.recorderClock !== 'none') fail('upload: clock must be none', 'capture_intent_upload_shape')
  }

  if (!Array.isArray(o.acceptedSegments)) fail('intent: acceptedSegments not array', 'capture_intent_bad_segments')
  const segs = o.acceptedSegments as unknown[]
  if (origin === 'upload') {
    if (segs.length !== 0) fail('upload: segments must be empty', 'capture_intent_upload_shape')
  } else {
    if (segs.length === 0) fail('teleprompter: segments empty', 'capture_intent_no_segments')
    if (segs.length > CAPTURE_MAX_SEGMENTS) fail('teleprompter: too many segments', 'capture_intent_too_many')
  }
  const seenScenes = new Set<number>()
  let prevEnd = -1
  const normalized: IntentAcceptedSegment[] = segs.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) fail(`segment ${i}: not an object`, 'capture_intent_bad_segments')
    const s = raw as Record<string, unknown>
    const sceneNumber = s.sceneNumber
    if (typeof sceneNumber !== 'number' || !Number.isInteger(sceneNumber) || sceneNumber < 1) fail(`segment ${i}: sceneNumber`, 'capture_intent_bad_scene')
    if (seenScenes.has(sceneNumber)) fail(`segment ${i}: duplicate sceneNumber`, 'capture_intent_dup_scene')
    seenScenes.add(sceneNumber)
    const startMs = s.startMs
    const endMs = s.endMs
    if (typeof startMs !== 'number' || !Number.isInteger(startMs) || startMs < 0) fail(`segment ${i}: startMs`, 'capture_intent_bad_time')
    if (typeof endMs !== 'number' || !Number.isInteger(endMs) || endMs < 0) fail(`segment ${i}: endMs`, 'capture_intent_bad_time')
    if (endMs - startMs < CAPTURE_MIN_SEGMENT_MS) fail(`segment ${i}: below min`, 'capture_intent_short_segment')
    if (startMs < prevEnd) fail(`segment ${i}: overlaps`, 'capture_intent_overlap')
    prevEnd = endMs
    if (typeof s.intendedDialogueSha256 !== 'string' || !HEX64_RE.test(s.intendedDialogueSha256)) fail(`segment ${i}: dialogue sha`, 'capture_intent_bad_dialogue_sha')
    return { sceneNumber, startMs, endMs, intendedDialogueSha256: s.intendedDialogueSha256 }
  })

  const intent: SourceCaptureIntentV1 = {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    origin,
    generationId: o.generationId,
    sourceAssetId: o.sourceAssetId,
    recordingScriptSha256: o.recordingScriptSha256 as string | null,
    clientAttemptId: o.clientAttemptId,
    recorderClock: o.recorderClock as SourceCaptureIntentV1['recorderClock'],
    acceptedSegments: normalized,
  }
  if (utf8Len(canonicalJson(intent)) > CAPTURE_INTENT_MAX_BYTES) fail('intent too large', 'capture_intent_too_large')
  return intent
}

// Normalize against MEASURED media duration. Fail-closed, never clamps past the
// terminal tolerance.
export function normalizeCaptureManifest(args: {
  intent: SourceCaptureIntentV1
  sourceSha256: string
  sourceDurationMs: number
  intentSha256: string
}): Omit<SourceCaptureManifestV1, 'manifestSha256'> {
  const { intent, sourceSha256, sourceDurationMs, intentSha256 } = args
  if (!HEX64_RE.test(sourceSha256)) fail('manifest: sourceSha256', 'capture_manifest_bad_sha')
  if (!HEX64_RE.test(intentSha256)) fail('manifest: intentSha256', 'capture_manifest_bad_sha')
  if (!Number.isInteger(sourceDurationMs) || sourceDurationMs <= 0) fail('manifest: duration', 'capture_manifest_bad_duration')

  const acceptedSegments: ManifestAcceptedSegment[] = intent.acceptedSegments.map((seg, i) => {
    if (seg.startMs < 0 || seg.startMs > sourceDurationMs) fail(`segment ${i}: start out of bounds`, 'capture_manifest_out_of_bounds')
    let end = seg.endMs
    if (end > sourceDurationMs) {
      if (end - sourceDurationMs > CAPTURE_END_TOLERANCE_MS) fail(`segment ${i}: end beyond tolerance`, 'capture_manifest_out_of_bounds')
      end = sourceDurationMs
    }
    if (end - seg.startMs < CAPTURE_MIN_SEGMENT_MS) fail(`segment ${i}: below min after clamp`, 'capture_manifest_short_segment')
    return { sceneNumber: seg.sceneNumber, sourceStartMs: seg.startMs, sourceEndMs: end, intendedDialogueSha256: seg.intendedDialogueSha256 }
  })
  let prevEnd = -1
  for (let i = 0; i < acceptedSegments.length; i++) {
    if (acceptedSegments[i].sourceStartMs < prevEnd) fail(`segment ${i}: overlaps after normalize`, 'capture_manifest_overlap')
    prevEnd = acceptedSegments[i].sourceEndMs
  }

  return {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    sourceAssetId: intent.sourceAssetId,
    sourceSha256,
    sourceDurationMs,
    origin: intent.origin,
    recordingScriptSha256: intent.recordingScriptSha256,
    intentSha256,
    acceptedSegments,
    normalizationVersion: CAPTURE_NORMALIZATION_VERSION,
  }
}

export function canonicalManifestBytes(manifest: Omit<SourceCaptureManifestV1, 'manifestSha256'>): string {
  const bytes = canonicalJson(manifest)
  if (utf8Len(bytes) > CAPTURE_MANIFEST_MAX_BYTES) fail('manifest too large', 'capture_manifest_too_large')
  return bytes
}
export function manifestSha256(manifest: Omit<SourceCaptureManifestV1, 'manifestSha256'>): string {
  return sha256Hex(canonicalManifestBytes(manifest))
}

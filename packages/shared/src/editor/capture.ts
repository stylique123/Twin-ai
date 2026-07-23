// Editor v2 — Phase 7 exit correction: the Source Capture Intent / Manifest
// contract. PURE + runtime-agnostic (browser recorder, Node worker, vitest).
//
// Two documents, distinct authority (Constitution §5.1):
//   * SourceCaptureIntentV1   — what the browser ASSERTED. Written append-only in
//     the same server transaction that binds the idempotent source-upload attempt
//     (edge fn `source-asset` create). NEVER downstream authority.
//   * SourceCaptureManifestV1 — the SERVER-NORMALIZED truth. Written once by
//     `validate_source` after ffprobe, against the MEASURED media duration,
//     before the source asset becomes `ready`.
//
// The recorder stores accepted per-scene windows in ACTIVE-recording seconds,
// positional over the FILTERED teleprompter scenes (index != scene_number). The
// client builder here converts to integer milliseconds and binds each window to
// the pinned RecordingScene.scene_number. Client timestamps are INTENT; only the
// normalized manifest (validated against measured duration) is authority.
import { canonicalJson, utf8ByteLength } from './director'

export const CAPTURE_SCHEMA_VERSION = 1
export const CAPTURE_NORMALIZATION_VERSION = 'capture-1'

// Frozen policy constants v1 (Constitution §10A). Changing one requires a policy
// version bump + regenerated fixtures + full regression — never a silent tweak.
export const CAPTURE_END_TOLERANCE_MS = 750 // terminal drift vs measured duration
export const CAPTURE_MIN_SEGMENT_MS = 250 // minimum accepted capture segment
export const CAPTURE_MAX_SEGMENTS = 200 // bound on accepted scenes (defense-in-depth)
export const CAPTURE_INTENT_MAX_BYTES = 65536 // canonical intent byte cap
export const CAPTURE_MANIFEST_MAX_BYTES = 65536 // canonical manifest byte cap

export type CaptureOrigin = 'teleprompter' | 'upload'
export type RecorderClock = 'mediarecorder-active-time-ms' | 'none'

// What the recorder collected for one accepted scene window (raw, pre-hash).
export interface AcceptedSegmentInput {
  sceneNumber: number
  startMs: number
  endMs: number
  dialogue: string // the pinned scene's exact spoken words ('' for silent)
}

export interface IntentAcceptedSegment {
  sceneNumber: number
  startMs: number
  endMs: number
  intendedDialogueSha256: string // 64-hex
}

// TWO intent types, distinct authority (Constitution §5.1 / §10D):
//
//  * SourceCaptureIntentInputV1 — what the BROWSER asserts. It omits
//    sourceAssetId and recordedAt because NEITHER is client authority: the
//    server assigns the asset id (after the attempt lock) and the timestamp.
//    This is what the client builders produce and what the edge forwards.
//
//  * SourceCaptureIntentV1 — the STORED, authoritative document. The
//    server-authoritative create RPC constructs it INSIDE the transaction from
//    the input plus the resolved sourceAssetId and a server-assigned
//    recordedAt, then canonicalizes + hashes it — intent_sha256 covers THIS
//    document (recordedAt included). An idempotent retry re-derives the
//    identical hash from the SAME stored recordedAt + asset id; a divergent
//    payload does not, so it fails closed.
export interface SourceCaptureIntentInputV1 {
  schemaVersion: 1
  origin: CaptureOrigin
  generationId: string
  recordingScriptSha256: string | null // 64-hex (teleprompter) / null (upload)
  clientAttemptId: string
  recorderClock: RecorderClock
  acceptedSegments: IntentAcceptedSegment[]
}

export interface SourceCaptureIntentV1 {
  schemaVersion: 1
  origin: CaptureOrigin
  generationId: string
  sourceAssetId: string
  recordingScriptSha256: string | null // 64-hex (teleprompter) / null (upload)
  clientAttemptId: string
  recorderClock: RecorderClock
  acceptedSegments: IntentAcceptedSegment[]
  recordedAt: string // server-assigned ISO-8601 UTC, ms precision (YYYY-MM-DDTHH:MM:SS.sssZ)
}

// Server-assigned recordedAt format: ISO-8601 UTC with exactly millisecond
// precision and a literal Z. The create RPC emits this EXACT shape so the DB
// and TS canonical hashes agree byte-for-byte.
const RECORDED_AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

export interface ManifestAcceptedSegment {
  sceneNumber: number
  sourceStartMs: number
  sourceEndMs: number
  intendedDialogueSha256: string
}

// The server-normalized manifest (validated against measured media duration).
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

// ---------------------------------------------------------------------------
// SHA-256 hex via Web Crypto (browser + Node 20+ + vitest all expose it). The
// worker also computes manifestSha256 with node:crypto over the SAME canonical
// bytes — SHA-256 hex is impl-independent, so the two agree byte-for-byte.
// ---------------------------------------------------------------------------
export async function sha256Hex(input: string): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle
  if (!subtle) throw new CaptureContractError('crypto.subtle unavailable', 'capture_no_crypto')
  const bytes = new TextEncoder().encode(input)
  const digest = await subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// NFC-normalize free text before hashing so the same words hash identically
// across platforms/inputs.
export function normalizeDialogue(text: string): string {
  return (text ?? '').normalize('NFC')
}

// Canonical projection of a recording script for the capture-time script SHA.
// Bounded, deterministic, independent of the worker's edit-project snapshot (the
// two need not be equal; this records the script AS CAPTURED).
export interface CaptureScriptSceneLike {
  scene_number: number
  dialogue: string | null
  show_in_teleprompter?: boolean
}
export interface CaptureScriptLike {
  generation_id?: string
  hook?: string | null
  scenes: CaptureScriptSceneLike[]
}
export function canonicalCaptureScript(script: CaptureScriptLike): string {
  return canonicalJson({
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    generationId: String(script.generation_id ?? ''),
    hook: normalizeDialogue(String(script.hook ?? '')),
    scenes: script.scenes.map((s) => ({
      sceneNumber: Number(s.scene_number),
      dialogue: normalizeDialogue(String(s.dialogue ?? '')),
      showInTeleprompter: s.show_in_teleprompter !== false,
    })),
  })
}
export async function captureScriptSha256(script: CaptureScriptLike): Promise<string> {
  return sha256Hex(canonicalCaptureScript(script))
}

// ---------------------------------------------------------------------------
// Client-side intent builder (recorder). Converts active-recording seconds to
// integer ms, binds scene numbers, hashes intended dialogue. Async (crypto).
// Returns the intent WITHOUT recordedAt — the server assigns that on insert.
// ---------------------------------------------------------------------------
export async function buildTeleprompterIntent(args: {
  generationId: string
  clientAttemptId: string
  recordingScriptSha256: string
  segments: AcceptedSegmentInput[]
}): Promise<SourceCaptureIntentInputV1> {
  if (args.segments.length === 0) fail('teleprompter: no accepted segments', 'capture_intent_no_segments')
  if (args.segments.length > CAPTURE_MAX_SEGMENTS) fail('teleprompter: too many segments', 'capture_intent_too_many')
  const acceptedSegments: IntentAcceptedSegment[] = []
  for (const seg of args.segments) {
    acceptedSegments.push({
      sceneNumber: seg.sceneNumber,
      startMs: Math.round(seg.startMs),
      endMs: Math.round(seg.endMs),
      intendedDialogueSha256: await sha256Hex(normalizeDialogue(seg.dialogue)),
    })
  }
  const input: SourceCaptureIntentInputV1 = {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    origin: 'teleprompter',
    generationId: args.generationId,
    recordingScriptSha256: args.recordingScriptSha256,
    clientAttemptId: args.clientAttemptId,
    recorderClock: 'mediarecorder-active-time-ms',
    acceptedSegments,
  }
  // Structural validation before it leaves the client — the edge re-validates
  // and the create RPC is the sole authority for the stored document.
  validateCaptureIntentInput(input)
  return input
}

export function buildUploadIntent(args: {
  generationId: string
  clientAttemptId: string
}): SourceCaptureIntentInputV1 {
  const input: SourceCaptureIntentInputV1 = {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    origin: 'upload',
    generationId: args.generationId,
    recordingScriptSha256: null,
    clientAttemptId: args.clientAttemptId,
    recorderClock: 'none',
    acceptedSegments: [],
  }
  validateCaptureIntentInput(input)
  return input
}

// ---------------------------------------------------------------------------
// Untrusted-input validation. Every malformed case is a STABLE code. The common
// fields (everything the CLIENT asserts) are validated once; the input validator
// stops there, the stored validator additionally requires the server-authority
// fields (sourceAssetId + recordedAt).
// ---------------------------------------------------------------------------
interface CommonIntentFields {
  origin: CaptureOrigin
  generationId: string
  clientAttemptId: string
  recordingScriptSha256: string | null
  recorderClock: RecorderClock
  acceptedSegments: IntentAcceptedSegment[]
}
function validateCommonIntentFields(o: Record<string, unknown>): CommonIntentFields {
  if (o.schemaVersion !== CAPTURE_SCHEMA_VERSION) fail('intent: schemaVersion', 'capture_intent_schema')
  if (o.origin !== 'teleprompter' && o.origin !== 'upload') fail('intent: origin', 'capture_intent_bad_origin')
  const origin = o.origin as CaptureOrigin
  if (typeof o.generationId !== 'string' || !UUID_RE.test(o.generationId)) fail('intent: generationId', 'capture_intent_bad_id')
  if (typeof o.clientAttemptId !== 'string' || !UUID_RE.test(o.clientAttemptId)) fail('intent: clientAttemptId', 'capture_intent_bad_id')

  if (origin === 'teleprompter') {
    if (typeof o.recordingScriptSha256 !== 'string' || !HEX64_RE.test(o.recordingScriptSha256)) {
      fail('teleprompter: recordingScriptSha256 required 64-hex', 'capture_intent_bad_script_sha')
    }
    if (o.recorderClock !== 'mediarecorder-active-time-ms') fail('teleprompter: recorderClock', 'capture_intent_bad_clock')
  } else {
    if (o.recordingScriptSha256 !== null) fail('upload: recordingScriptSha256 must be null', 'capture_intent_upload_shape')
    if (o.recorderClock !== 'none') fail('upload: recorderClock must be none', 'capture_intent_upload_shape')
  }

  if (!Array.isArray(o.acceptedSegments)) fail('intent: acceptedSegments not array', 'capture_intent_bad_segments')
  const segs = o.acceptedSegments as unknown[]
  if (origin === 'upload') {
    if (segs.length !== 0) fail('upload: acceptedSegments must be empty', 'capture_intent_upload_shape')
  } else {
    if (segs.length === 0) fail('teleprompter: acceptedSegments empty', 'capture_intent_no_segments')
    if (segs.length > CAPTURE_MAX_SEGMENTS) fail('teleprompter: too many segments', 'capture_intent_too_many')
  }
  const seenScenes = new Set<number>()
  let prevEnd = -1
  const acceptedSegments: IntentAcceptedSegment[] = segs.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) fail(`segment ${i}: not an object`, 'capture_intent_bad_segments')
    const s = raw as Record<string, unknown>
    const sceneNumber = s.sceneNumber
    if (typeof sceneNumber !== 'number' || !Number.isInteger(sceneNumber) || sceneNumber < 1) {
      fail(`segment ${i}: sceneNumber`, 'capture_intent_bad_scene')
    }
    if (seenScenes.has(sceneNumber)) fail(`segment ${i}: duplicate sceneNumber`, 'capture_intent_dup_scene')
    seenScenes.add(sceneNumber)
    const startMs = s.startMs
    const endMs = s.endMs
    if (typeof startMs !== 'number' || !Number.isInteger(startMs) || startMs < 0) fail(`segment ${i}: startMs`, 'capture_intent_bad_time')
    if (typeof endMs !== 'number' || !Number.isInteger(endMs) || endMs < 0) fail(`segment ${i}: endMs`, 'capture_intent_bad_time')
    if (endMs - startMs < CAPTURE_MIN_SEGMENT_MS) fail(`segment ${i}: below min duration`, 'capture_intent_short_segment')
    // Strict order + non-overlap in the intent's own timeline. Abutting windows
    // (startMs == prevEnd) are legal — a continuous recorder pauses/resumes with
    // no gap, so consecutive accepted scenes share a boundary instant.
    if (startMs < prevEnd) fail(`segment ${i}: overlaps/out-of-order`, 'capture_intent_overlap')
    prevEnd = endMs
    if (typeof s.intendedDialogueSha256 !== 'string' || !HEX64_RE.test(s.intendedDialogueSha256)) {
      fail(`segment ${i}: intendedDialogueSha256`, 'capture_intent_bad_dialogue_sha')
    }
    return { sceneNumber, startMs, endMs, intendedDialogueSha256: s.intendedDialogueSha256 }
  })
  return {
    origin,
    generationId: o.generationId,
    clientAttemptId: o.clientAttemptId,
    recordingScriptSha256: o.recordingScriptSha256 as string | null,
    recorderClock: o.recorderClock as RecorderClock,
    acceptedSegments,
  }
}

// Validate the BROWSER input document (no server-authority fields).
export function validateCaptureIntentInput(input: unknown): SourceCaptureIntentInputV1 {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) fail('intent: not an object', 'capture_intent_not_object')
  const c = validateCommonIntentFields(input as Record<string, unknown>)
  const intent: SourceCaptureIntentInputV1 = {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    origin: c.origin,
    generationId: c.generationId,
    recordingScriptSha256: c.recordingScriptSha256,
    clientAttemptId: c.clientAttemptId,
    recorderClock: c.recorderClock,
    acceptedSegments: c.acceptedSegments,
  }
  const bytes = utf8ByteLength(canonicalJson(intent))
  if (bytes > CAPTURE_INTENT_MAX_BYTES) fail(`intent ${bytes} bytes > cap`, 'capture_intent_too_large')
  return intent
}

// Validate the STORED document (the one intent_sha256 covers): common fields
// PLUS the server-authority sourceAssetId + recordedAt.
export function validateCaptureIntent(input: unknown): SourceCaptureIntentV1 {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) fail('intent: not an object', 'capture_intent_not_object')
  const o = input as Record<string, unknown>
  const c = validateCommonIntentFields(o)
  if (typeof o.sourceAssetId !== 'string' || !UUID_RE.test(o.sourceAssetId)) fail('intent: sourceAssetId', 'capture_intent_bad_id')
  if (typeof o.recordedAt !== 'string' || !RECORDED_AT_RE.test(o.recordedAt)) fail('intent: recordedAt', 'capture_intent_bad_recorded_at')
  const intent: SourceCaptureIntentV1 = {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    origin: c.origin,
    generationId: c.generationId,
    sourceAssetId: o.sourceAssetId,
    recordingScriptSha256: c.recordingScriptSha256,
    clientAttemptId: c.clientAttemptId,
    recorderClock: c.recorderClock,
    acceptedSegments: c.acceptedSegments,
    recordedAt: o.recordedAt,
  }
  const bytes = utf8ByteLength(canonicalJson(intent))
  if (bytes > CAPTURE_INTENT_MAX_BYTES) fail(`intent ${bytes} bytes > cap`, 'capture_intent_too_large')
  return intent
}

// Construct the STORED intent from a validated input plus the server-authority
// fields. This is EXACTLY the document the create RPC persists and hashes — the
// DB builds the same string field-by-field, and a parity test proves byte
// equality against canonicalCaptureIntent() here.
export function buildStoredIntent(
  input: SourceCaptureIntentInputV1,
  server: { sourceAssetId: string; recordedAt: string },
): SourceCaptureIntentV1 {
  if (!UUID_RE.test(server.sourceAssetId)) fail('stored intent: sourceAssetId', 'capture_intent_bad_id')
  if (!RECORDED_AT_RE.test(server.recordedAt)) fail('stored intent: recordedAt', 'capture_intent_bad_recorded_at')
  return validateCaptureIntent({ ...input, sourceAssetId: server.sourceAssetId, recordedAt: server.recordedAt })
}

// Canonical bytes / SHA of a stored intent (what intent_sha256 covers).
export function canonicalCaptureIntent(intent: SourceCaptureIntentV1): string {
  return canonicalJson(intent)
}
export async function captureIntentSha256(intent: SourceCaptureIntentV1): Promise<string> {
  return sha256Hex(canonicalJson(intent))
}

// ---------------------------------------------------------------------------
// Server-side normalization against the MEASURED media duration. Pure: the
// worker computes intentSha256/manifestSha256 with node:crypto (identical hex)
// and hands the result to the fenced writer RPC. Fail-closed, never clamps.
// ---------------------------------------------------------------------------
export function normalizeCaptureManifest(args: {
  intent: SourceCaptureIntentV1
  sourceSha256: string
  sourceDurationMs: number
  intentSha256: string
}): Omit<SourceCaptureManifestV1, 'manifestSha256'> {
  const { intent, sourceSha256, sourceDurationMs, intentSha256 } = args
  if (!HEX64_RE.test(sourceSha256)) fail('manifest: sourceSha256', 'capture_manifest_bad_sha')
  if (!HEX64_RE.test(intentSha256)) fail('manifest: intentSha256', 'capture_manifest_bad_sha')
  if (!Number.isInteger(sourceDurationMs) || sourceDurationMs <= 0) fail('manifest: sourceDurationMs', 'capture_manifest_bad_duration')

  const acceptedSegments: ManifestAcceptedSegment[] = intent.acceptedSegments.map((seg, i) => {
    // Every bound must lie within [0, duration]; only the terminal end may
    // exceed measured duration by up to the tolerance (recorder/clock drift),
    // and is then clamped to duration. Anything beyond fails closed.
    if (seg.startMs < 0 || seg.startMs > sourceDurationMs) {
      fail(`segment ${i}: startMs outside measured duration`, 'capture_manifest_out_of_bounds')
    }
    let end = seg.endMs
    if (end > sourceDurationMs) {
      if (end - sourceDurationMs > CAPTURE_END_TOLERANCE_MS) {
        fail(`segment ${i}: endMs beyond tolerance`, 'capture_manifest_out_of_bounds')
      }
      end = sourceDurationMs
    }
    if (end - seg.startMs < CAPTURE_MIN_SEGMENT_MS) {
      fail(`segment ${i}: below min duration after clamp`, 'capture_manifest_short_segment')
    }
    return {
      sceneNumber: seg.sceneNumber,
      sourceStartMs: seg.startMs,
      sourceEndMs: end,
      intendedDialogueSha256: seg.intendedDialogueSha256,
    }
  })
  // Re-assert strict order / non-overlap in the source timeline post-clamp.
  let prevEnd = -1
  for (let i = 0; i < acceptedSegments.length; i++) {
    // Abutting windows (start == prevEnd) are legal; only a true overlap fails.
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

// Canonical bytes/SHA of a normalized manifest (excluding manifestSha256, which
// is that SHA). The worker sets manifestSha256 = sha256(canonicalManifestBytes).
export function canonicalManifestBytes(manifest: Omit<SourceCaptureManifestV1, 'manifestSha256'>): string {
  const bytes = canonicalJson(manifest)
  if (utf8ByteLength(bytes) > CAPTURE_MANIFEST_MAX_BYTES) fail('manifest too large', 'capture_manifest_too_large')
  return bytes
}

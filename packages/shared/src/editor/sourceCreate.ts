// Editor v2 — the PURE edge-facing create-request core (Constitution §10D).
// Canonical, unit-tested logic the `source-asset` edge function uses to parse,
// normalize, and shape a create request into the single atomic RPC
// (editor_create_source_asset). The edge is Deno and cannot import this module
// at deploy time, so it inlines byte-identical copies of these functions; a
// source-invariant test (edge-source-parity.test.ts) proves no drift. Keep this
// file the single source of truth — edit here first, then mirror into the edge.
import { normalizeSourceMime } from './capture'

export { normalizeSourceMime }

// Parse ONLY a finite, JS-safe, non-negative INTEGER for the bigint wire. Any
// malformed / fractional / exponent-fraction / unsafe / NaN-equivalent value
// returns null → the edge returns a stable 400 and never reaches the RPC. The DB
// remains the sole min/max/open/quota authority; this is just wire hygiene.
export function safeSizeBytes(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : (typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN)
  if (!Number.isFinite(n) || !Number.isSafeInteger(n) || n < 0) return null
  return n
}

// Map the client's snake_case capture payload to the camelCase
// SourceCaptureIntentInputV1 the RPC validates. recordingScriptSha256 preserves
// MISSING vs explicit null (own-property presence) so a missing key fails closed
// in the DB validator instead of being silently manufactured as null. Unknown
// keys are intentionally NOT copied here — the DB validator rejects them
// independently; this builder only shapes the known contract fields.
export function buildCreateInput(
  capture: Record<string, unknown>,
  ctx: { generationId: string; clientAttemptId: string },
): Record<string, unknown> {
  const rawSegs = capture.accepted_segments
  const input: Record<string, unknown> = {
    schemaVersion: 1,
    origin: capture.origin,
    generationId: ctx.generationId,
    clientAttemptId: ctx.clientAttemptId,
    recorderClock: capture.recorder_clock,
    acceptedSegments: Array.isArray(rawSegs)
      ? rawSegs.map((s) => {
          const seg = s as Record<string, unknown>
          return {
            sceneNumber: seg.scene_number,
            startMs: seg.start_ms,
            endMs: seg.end_ms,
            intendedDialogueSha256: seg.intended_dialogue_sha256,
          }
        })
      : rawSegs,
  }
  // Own-property presence: missing key stays missing; explicit null stays null.
  if (Object.prototype.hasOwnProperty.call(capture, 'recording_script_sha256')) {
    input.recordingScriptSha256 = capture.recording_script_sha256
  }
  return input
}

// Map the RPC's stable exception codes to an HTTP status + user-safe message.
export function createErrorStatus(msg: string): number {
  if (msg.includes('source_generation_not_owned')) return 404
  if (msg.includes('source_too_many_open')) return 429
  if (msg.includes('source_quota_exceeded')) return 413
  if (msg.includes('source_asset_rejected') || msg.includes('source_attempt_conflict') || msg.includes('capture_intent_conflict')) return 409
  if (msg.includes('source_policy_') || msg.includes('capture_intent_')) return 400
  return 500
}
export function mapCreateError(msg: string): string {
  if (msg.includes('source_generation_not_owned')) return 'Generation not found'
  if (msg.includes('source_too_many_open')) return 'Too many recordings are still processing — give them a moment to finish.'
  if (msg.includes('source_quota_exceeded')) return 'Your storage is full — delete some older videos first.'
  if (msg.includes('source_asset_rejected')) return 'This recording was rejected — please record a new take.'
  if (msg.includes('source_attempt_conflict')) return 'This recording attempt already exists with different details.'
  if (msg.includes('capture_intent_conflict')) return 'A different capture already exists for this recording.'
  if (msg.includes('source_policy_mime')) return 'Unsupported video type — record or pick an MP4/MOV/WebM.'
  if (msg.includes('source_policy_size')) return 'That recording is empty or too large — please re-record.'
  if (msg.includes('source_policy_bucket')) return 'Upload target not allowed.'
  if (msg.includes('capture_intent_')) return 'The capture data was invalid — please re-record.'
  return 'Could not start the upload — try again.'
}

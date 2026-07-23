// Editor v2 — the PURE, injectable edge-facing create authority (Constitution §10D).
// The `source-asset` edge (Deno) INLINES byte-identical copies of these functions
// (it cannot import shared at deploy time); edge-source-parity.test.ts proves no
// drift. Keep this the single source of truth — edit here first, then mirror.
//
// TRUST BOUNDARY: the edge REJECTS unknown request/capture/segment keys BEFORE any
// mapping (it never sanitizes hostile keys into a valid request), parses only a
// safe size + allowed MIME, then calls EXACTLY ONE atomic RPC
// (editor_create_source_asset). It performs ZERO direct table writes — the RPC is
// the sole authority for provenance, hashing, the marker, caps, and the source-bound
// script binding. runSourceCreate is injectable so a handler test proves this behavior.
import { normalizeSourceMime } from './capture'

export { normalizeSourceMime }

export const SOURCE_BUCKET = 'takes'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Frozen wire key sets — anything outside FAILS closed (never dropped/sanitized).
export const CREATE_BODY_KEYS = new Set(['action', 'generation_id', 'recording_attempt_id', 'content_type', 'size_bytes', 'capture'])
export const CAPTURE_SNAKE_KEYS = new Set(['origin', 'recording_script_sha256', 'recorder_clock', 'accepted_segments'])
export const SEGMENT_SNAKE_KEYS = new Set(['scene_number', 'start_ms', 'end_ms', 'intended_dialogue_sha256'])

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
// in the DB validator instead of being silently manufactured as null. Callers MUST
// have already rejected unknown keys (validateCreateBody) — this only shapes the
// known contract fields; it never sees a hostile key because validation ran first.
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
  if (Object.prototype.hasOwnProperty.call(capture, 'recording_script_sha256')) {
    input.recordingScriptSha256 = capture.recording_script_sha256
  }
  return input
}

export interface PlanError { status: number; message: string }
export interface CreateRpcArgs {
  p_generation: string
  p_attempt: string
  p_input: Record<string, unknown>
  p_bucket: string
  p_mime: string
  p_size_bytes: number
}

// Validate the FULL create request keyset (body + capture + every segment) and build
// the exact RPC args — WITHOUT performing any I/O. Returns a stable PlanError (never
// throws) OR the RPC args. Unknown keys anywhere fail closed BEFORE mapping.
export function buildCreatePlan(
  body: Record<string, unknown>,
): { error: PlanError } | { rpcArgs: CreateRpcArgs } {
  for (const k of Object.keys(body)) {
    if (!CREATE_BODY_KEYS.has(k)) return { error: { status: 400, message: `Unexpected field: ${k}` } }
  }
  const generationId = String(body.generation_id ?? '').trim()
  const attemptId = String(body.recording_attempt_id ?? '').trim().toLowerCase()
  if (!UUID_RE.test(generationId)) return { error: { status: 400, message: 'generation_id (uuid) is required' } }
  if (!UUID_RE.test(attemptId)) return { error: { status: 400, message: 'recording_attempt_id (uuid) is required' } }

  const sizeBytes = safeSizeBytes(body.size_bytes)
  if (sizeBytes === null) return { error: { status: 400, message: 'That recording is empty or too large — please re-record.' } }

  const norm = normalizeSourceMime(body.content_type as string | null | undefined)
  if (!norm) return { error: { status: 400, message: 'Unsupported video type — record or pick an MP4/MOV/WebM.' } }

  const capture = body.capture
  if (!capture || typeof capture !== 'object' || Array.isArray(capture)) {
    return { error: { status: 400, message: 'capture provenance is required' } }
  }
  const cap = capture as Record<string, unknown>
  for (const k of Object.keys(cap)) {
    if (!CAPTURE_SNAKE_KEYS.has(k)) return { error: { status: 400, message: `Unexpected capture field: ${k}` } }
  }
  const segs = cap.accepted_segments
  if (Array.isArray(segs)) {
    for (const s of segs) {
      if (!s || typeof s !== 'object' || Array.isArray(s)) return { error: { status: 400, message: 'Invalid capture segment' } }
      for (const k of Object.keys(s as Record<string, unknown>)) {
        if (!SEGMENT_SNAKE_KEYS.has(k)) return { error: { status: 400, message: `Unexpected segment field: ${k}` } }
      }
    }
  }

  return {
    rpcArgs: {
      p_generation: generationId,
      p_attempt: attemptId,
      p_input: buildCreateInput(cap, { generationId, clientAttemptId: attemptId }),
      p_bucket: SOURCE_BUCKET,
      p_mime: norm.baseMime,
      p_size_bytes: sizeBytes,
    },
  }
}

// Map the RPC's stable exception codes to an HTTP status. Every EXPECTED client
// conflict maps to a 4xx (never a generic 500): ownership 404, caps 429/413, all
// attempt/intent/script/dialogue conflicts 409, oversize script 413, and any other
// source_policy_/capture_ contract violation 400.
export function createErrorStatus(msg: string): number {
  if (msg.includes('source_generation_not_owned')) return 404
  if (msg.includes('source_too_many_open')) return 429
  if (msg.includes('source_quota_exceeded')) return 413
  if (msg.includes('script_snapshot_too_large')) return 413
  if (msg.includes('source_asset_rejected')
    || msg.includes('source_attempt_conflict')
    || msg.includes('capture_intent_conflict')
    || msg.includes('capture_script_sha_mismatch')
    || msg.includes('capture_dialogue_sha_mismatch')
    || msg.includes('capture_script_ambiguous_scene')
    || msg.includes('capture_segment_not_teleprompter')
    || msg.includes('capture_segment_order')) return 409
  if (msg.includes('source_policy_') || msg.includes('capture_')) return 400
  return 500
}
export function mapCreateError(msg: string): string {
  if (msg.includes('source_generation_not_owned')) return 'Generation not found'
  if (msg.includes('source_too_many_open')) return 'Too many recordings are still processing — give them a moment to finish.'
  if (msg.includes('source_quota_exceeded')) return 'Your storage is full — delete some older videos first.'
  if (msg.includes('script_snapshot_too_large')) return 'Your script is too long to record against — shorten it and try again.'
  if (msg.includes('source_asset_rejected')) return 'This recording was rejected — please record a new take.'
  if (msg.includes('source_attempt_conflict')) return 'This recording attempt already exists with different details.'
  if (msg.includes('capture_intent_conflict')) return 'A different capture already exists for this recording.'
  if (msg.includes('capture_script_sha_mismatch')) return "This take doesn't match the current script — please re-record."
  if (msg.includes('capture_dialogue_sha_mismatch')) return "A scene's words don't match the script — please re-record."
  if (msg.includes('capture_script_ambiguous_scene')) return 'This script has duplicate scenes — regenerate it and try again.'
  if (msg.includes('capture_segment_not_teleprompter')) return 'A recorded scene is not part of the teleprompter script — please re-record.'
  if (msg.includes('capture_segment_order')) return 'The recorded scenes are out of order — please re-record.'
  if (msg.includes('source_policy_mime')) return 'Unsupported video type — record or pick an MP4/MOV/WebM.'
  if (msg.includes('source_policy_size')) return 'That recording is empty or too large — please re-record.'
  if (msg.includes('source_policy_bucket')) return 'Upload target not allowed.'
  if (msg.includes('capture_')) return 'The capture data was invalid — please re-record.'
  return 'Could not start the upload — try again.'
}

// The injectable create handler. deps expose ONLY the one RPC + the storage signer —
// there is intentionally NO table-write dependency, so the handler structurally
// cannot write media_assets / source_capture_intents / source_script_snapshots. It
// validates the request, then calls createSourceAsset EXACTLY once on a valid request
// (and never on an invalid one). Returns a plain {status, body} for the edge to send.
export interface CreateDeps {
  createSourceAsset(args: CreateRpcArgs & { p_owner: string }): Promise<{ data: unknown; error: { message: string } | null }>
  signUpload(path: string): Promise<{ token: string; signedUrl: string } | null>
}
export interface CreateResult { status: number; body: Record<string, unknown> }

export async function runSourceCreate(
  body: Record<string, unknown>, ownerId: string, deps: CreateDeps,
): Promise<CreateResult> {
  const plan = buildCreatePlan(body)
  if ('error' in plan) return { status: plan.error.status, body: { error: plan.error.message } }

  const { data, error } = await deps.createSourceAsset({ p_owner: ownerId, ...plan.rpcArgs })
  if (error) return { status: createErrorStatus(error.message), body: { error: mapCreateError(error.message) } }
  const row = (Array.isArray(data) ? data[0] : data) as { asset_id?: string; storage_path?: string; status?: string } | null
  if (!row || !row.asset_id || !row.storage_path || !row.status) {
    return { status: 500, body: { error: 'Could not start the upload — try again.' } }
  }

  const base = { assetId: row.asset_id, bucket: SOURCE_BUCKET, path: row.storage_path, status: row.status }
  if (row.status === 'ready') return { status: 200, body: { ...base, token: null, signedUrl: null } }

  const sign = await deps.signUpload(row.storage_path)
  if (!sign) return { status: 500, body: { error: 'Could not authorize the upload — try again.' } }
  return { status: 200, body: { ...base, token: sign.token, signedUrl: sign.signedUrl } }
}

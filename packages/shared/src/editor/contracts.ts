// Editor v2 — shared wire/domain contracts (Phase 1: source assets).
//
// Rules that hold for every editor-v2 contract:
//  * All media time is INTEGER MILLISECONDS and every such field carries the
//    `Ms` suffix. Never a bare `start`/`end`/`duration` number.
//  * The browser never supplies storage paths or URLs to the backend — it deals
//    in asset IDs; the server resolves paths after verifying ownership.
//  * This module must not import recording-timeline or any legacy editor code.

export type MediaAssetKind = 'source' | 'music' | 'output' | 'thumbnail'

export type MediaAssetStatus = 'uploading' | 'validating' | 'ready' | 'rejected' | 'deleted'

// The client-visible shape of a media asset row (RLS-guarded SELECT).
export interface MediaAsset {
  id: string
  owner_id: string
  generation_id: string | null
  recording_attempt_id: string | null
  kind: MediaAssetKind
  bucket: string
  storage_path: string
  content_sha256: string | null
  mime_type: string | null
  size_bytes: number | null
  duration_ms: number | null
  width: number | null
  height: number | null
  rotation: number | null
  has_audio: boolean | null
  status: MediaAssetStatus
  created_at: string
  validated_at: string | null
}

// What the `source-asset` edge function returns when an upload intent is
// created. The path is server-chosen and STABLE for the asset — retries
// re-upload to the same object instead of minting timestamped duplicates.
// token/signedUrl authorize a PUT of exactly that object (short-lived,
// upsert-enabled); they are null when the asset is already `ready` and there
// is nothing left to upload.
export interface SourceUploadIntent {
  assetId: string
  bucket: string
  path: string
  status: MediaAssetStatus
  token: string | null
  signedUrl: string | null
}

// Stable object path for a source asset. The first segment MUST be the owner id —
// the takes-bucket INSERT policy only allows uploads under the caller's own
// auth.uid() folder, so this shape is both stable and policy-compatible.
export function sourceAssetPath(ownerId: string, generationId: string, assetId: string, contentType: string): string {
  const ext = contentType.includes('mp4') ? 'mp4' : 'webm'
  return `${ownerId}/${generationId}/${assetId}.${ext}`
}

// Bounds enforced server-side before an upload intent is issued (mirrored here
// so the client can fail fast with the same numbers).
export const SOURCE_MAX_BYTES = 600 * 1024 * 1024 // matches the takes bucket cap
export const SOURCE_MIN_BYTES = 2048 // a real few-second take is tens of KB minimum

// ---- Edit projects (Phase 2) -----------------------------------------------
// One row per one-click edit request. Created ONLY by start-editor-v2 (which
// atomically also enqueues exactly one editor_v2 job); every later state
// transition is worker-owned (Phase 3+). Clients read via RLS, never write.

export type EditProjectStatus =
  | 'queued'
  | 'inspecting'
  | 'transcribing'
  | 'analyzing'
  | 'directing'
  | 'compiling'
  | 'rendering'
  | 'validating'
  | 'completed'
  | 'failed'
  | 'cancelled'

export const EDIT_PROJECT_ACTIVE_STATUSES: readonly EditProjectStatus[] = [
  'queued', 'inspecting', 'transcribing', 'analyzing', 'directing',
  'compiling', 'rendering', 'validating',
]

// The client-visible shape of an edit project row (RLS-guarded SELECT).
export interface EditProject {
  id: string
  owner_id: string
  generation_id: string
  source_asset_id: string
  status: EditProjectStatus
  output_asset_id: string | null
  failure_code: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

// Stable rejection codes start-editor-v2 returns BEFORE any project/job exists.
// `editor_not_available` (503) is the fail-closed launch gate: the server-side
// EDITOR_V2_START_ENABLED switch is off (missing = off) — production stays
// disabled until the Phase-3 worker exists and rollout begins.
export type StartEditorRejection =
  | 'editor_not_available'
  | 'source_not_found'
  | 'not_a_source'
  | 'generation_mismatch'
  | 'source_rejected'
  | 'source_deleted'
  | 'source_not_ready'
  | 'source_not_editor_eligible'
  | 'too_many_active_projects'
  | 'idempotency_key_conflict'

// Idempotency-key semantics (exact, so callers never over-assume):
//  * The key that CREATES a project is permanently bound to that project's
//    (generation, source) and stored on the row. Reusing it with different
//    inputs is a 409 conflict, forever.
//  * A DIFFERENT key sent while a project for the same source is still ACTIVE
//    gets that active project back via active-source reconciliation. That
//    alternate key is NOT stored and NOT consumed — it acquired no binding.
//    If the project later settles (completed/failed/cancelled) and the same
//    alternate key is sent again with valid inputs, it will CREATE a new
//    project and only then become bound.

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

// What the `source-asset` edge function returns when an upload intent is created.
// The path is server-chosen and STABLE for the asset — retries re-upload to the
// same object instead of minting timestamped duplicates.
export interface SourceUploadIntent {
  assetId: string
  bucket: string
  path: string
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

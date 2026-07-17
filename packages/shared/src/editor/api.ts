// Editor v2 — client API for the durable source-asset flow (Phase 1).
//
// The flow (docs/twinai-new-editor-build-plan.md §J):
//   recording finishes → create ONE upload intent (server-authorized, stable path)
//   → upload EXACTLY once → server validates (ffprobe on the worker) → ready
//   → generations.source_asset_id persisted server-side.
//
// The browser never invents storage paths and never marks an asset ready — it
// only initiates, uploads bytes, and observes status. The database, not
// localStorage, is authoritative for recovery.
import { getClient, uploadFileToPath, type TakeFile } from '../api'
import type { MediaAsset, SourceUploadIntent } from './contracts'

// ---- Upload-once coordinator -------------------------------------------------
// Autosave, confirmation and navigation must share ONE upload. Concurrent (and
// repeated) callers get the same in-flight promise; only a FAILED attempt clears
// the slot so a retry can run. Success is sticky — later callers reuse the result.
export class UploadOnce<T> {
  private inflight: Promise<T> | null = null
  run(start: () => Promise<T>): Promise<T> {
    if (!this.inflight) {
      this.inflight = start().catch((e) => {
        this.inflight = null // failed → allow retry
        throw e
      })
    }
    return this.inflight
  }
  reset(): void {
    this.inflight = null
  }
  get active(): boolean {
    return this.inflight !== null
  }
}

// Create the server-authorized upload intent for a generation the caller owns.
// Returns the asset id + the STABLE object path retries must reuse.
export async function createSourceUpload(
  generationId: string,
  file: { contentType: string; sizeBytes: number },
): Promise<SourceUploadIntent> {
  const { data, error } = await getClient().functions.invoke('source-asset', {
    body: { action: 'create', generation_id: generationId, content_type: file.contentType, size_bytes: file.sizeBytes },
  })
  if (error) throw new Error(await invokeError(error))
  return data as SourceUploadIntent
}

// Tell the server the bytes are uploaded → it verifies the object exists and
// enqueues worker-side validation (ffprobe). Idempotent per asset.
export async function finalizeSourceUpload(assetId: string): Promise<void> {
  const { error } = await getClient().functions.invoke('source-asset', {
    body: { action: 'finalize', asset_id: assetId },
  })
  if (error) throw new Error(await invokeError(error))
}

// The full one-upload pipeline: intent → bytes → finalize. Poll separately for
// `ready` (validation runs on the worker). Wrap calls in an UploadOnce so every
// caller shares this single operation.
export async function uploadSourceRecording(
  generationId: string,
  file: TakeFile & { sizeBytes: number },
  onProgress?: (fraction: number) => void,
): Promise<SourceUploadIntent> {
  const intent = await createSourceUpload(generationId, { contentType: file.contentType, sizeBytes: file.sizeBytes })
  await uploadFileToPath(intent.path, file, onProgress)
  await finalizeSourceUpload(intent.assetId)
  return intent
}

// Read one asset (RLS: owner + workspace peers).
export async function getMediaAsset(assetId: string): Promise<MediaAsset | null> {
  const { data, error } = await getClient().from('media_assets').select('*').eq('id', assetId).maybeSingle()
  if (error) return null
  return (data as MediaAsset) ?? null
}

// The newest READY source asset for a generation — the durable, cross-device
// recovery path (works with localStorage cleared and from another device).
export async function getReadySourceAsset(generationId: string): Promise<MediaAsset | null> {
  const { data, error } = await getClient()
    .from('media_assets')
    .select('*')
    .eq('generation_id', generationId)
    .eq('kind', 'source')
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return null
  return (data as MediaAsset) ?? null
}

// Wait for worker-side validation to settle. Resolves with the terminal asset
// ('ready' | 'rejected') or null on timeout/stop — the caller decides how to
// present a still-validating asset.
export async function pollSourceAssetReady(
  assetId: string,
  opts: { attempts?: number; intervalMs?: number; shouldStop?: () => boolean } = {},
): Promise<MediaAsset | null> {
  const { attempts = 60, intervalMs = 2000, shouldStop } = opts
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs))
    if (shouldStop?.()) return null
    const asset = await getMediaAsset(assetId)
    if (asset && (asset.status === 'ready' || asset.status === 'rejected')) return asset
  }
  return null
}

async function invokeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context
  if (ctx?.json) {
    try {
      const body = await ctx.json()
      if (body?.error) return String(body.error)
    } catch {
      /* fall through */
    }
  }
  return (error as { message?: string }).message ?? 'Could not save your recording'
}

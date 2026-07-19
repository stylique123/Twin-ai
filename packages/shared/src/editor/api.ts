// Editor v2 — client API for the durable source-asset flow (Phase 1).
//
// The flow (docs/twinai-new-editor-build-plan.md §J):
//   recording finishes → the client mints ONE recording_attempt_id for the take
//   → create a server-authorized upload intent (DB-unique per attempt, stable
//   path, signed upload token) → PUT the bytes exactly once → finalize (atomic
//   uploading→validating + one dedup-keyed validation job) → the worker
//   ffprobes it → ready → generations.source_asset_id persisted server-side.
//
// Idempotency is DATABASE-backed, not browser-backed: repeating create/finalize
// from a refreshed page, a second tab, or another device converges on the same
// asset row, same object, same job. UploadOnce below is only an in-page
// convenience to avoid firing redundant requests. There is NO fallback to the
// legacy direct-bucket upload — if this flow fails, the caller keeps the Blob
// and retries the SAME attempt (same asset, same path); it never silently
// switches persistence systems.
import { getClient, uploadToSignedTarget, type TakeFile } from '../api'
import type { EditEvent, EditProject, EditProjectStatus, MediaAsset, SourceUploadIntent } from './contracts'

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

// A recording attempt's identity. One take = one attempt id (mint at record
// finish / file pick); a RETAKE intentionally mints a new one. Retries of the
// same take MUST reuse the same id — that is what lets the server converge.
export function newRecordingAttemptId(): string {
  return crypto.randomUUID()
}

// Create (or converge on) the server-authorized upload intent for this attempt.
// Returns the asset id, the STABLE object path, and a signed upload token bound
// to exactly that object (null if the asset is already ready).
export async function createSourceUpload(
  generationId: string,
  attemptId: string,
  file: { contentType: string; sizeBytes: number },
): Promise<SourceUploadIntent> {
  const { data, error } = await getClient().functions.invoke('source-asset', {
    body: {
      action: 'create',
      generation_id: generationId,
      recording_attempt_id: attemptId,
      content_type: file.contentType,
      size_bytes: file.sizeBytes,
    },
  })
  if (error) throw new Error(await invokeError(error))
  return data as SourceUploadIntent
}

// Tell the server the bytes are uploaded → it verifies the object exists, then
// atomically flips to validating and enqueues exactly one validation job
// (editor_finalize_source in the DB). Idempotent per asset — repeats reconcile.
export async function finalizeSourceUpload(assetId: string): Promise<void> {
  const { error } = await getClient().functions.invoke('source-asset', {
    body: { action: 'finalize', asset_id: assetId },
  })
  if (error) throw new Error(await invokeError(error))
}

// The full one-upload pipeline: intent → signed PUT → finalize. Poll separately
// for `ready` (validation runs on the worker). Wrap calls in an UploadOnce so
// in-page callers share this single operation; cross-page/tab/device dedup is
// the database's job via attemptId.
export async function uploadSourceRecording(
  generationId: string,
  attemptId: string,
  file: TakeFile & { sizeBytes: number },
  onProgress?: (fraction: number) => void,
): Promise<SourceUploadIntent> {
  const intent = await createSourceUpload(generationId, attemptId, {
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
  })
  // Already validated (e.g. finalized from another tab/device) → nothing to send.
  if (intent.status === 'ready' || !intent.token || !intent.signedUrl) {
    onProgress?.(1)
    return intent
  }
  await uploadToSignedTarget(
    { bucket: intent.bucket, path: intent.path, token: intent.token, signedUrl: intent.signedUrl, contentType: file.contentType },
    file,
    onProgress,
  )
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
// Matches the server's link rule: newest ready source by creation order.
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

// ---- Edit start (Phase 2) ---------------------------------------------------
// The one-click entry point. The browser sends EXACTLY three IDs — never
// storage paths, URLs, transcripts, cuts, captions, prompts, or model/FFmpeg
// options; the server derives everything else. Repeats/retries MUST reuse the
// same idempotencyKey (one per user click-intent) — the database converges
// them onto ONE project and ONE queued editor_v2 job. A new deliberate edit
// (after completion/failure) mints a new key.

export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

export async function startEditorV2(
  generationId: string,
  sourceAssetId: string,
  idempotencyKey: string,
): Promise<{ projectId: string; status: string }> {
  const { data, error } = await getClient().functions.invoke('start-editor-v2', {
    body: { generation_id: generationId, source_asset_id: sourceAssetId, idempotency_key: idempotencyKey },
  })
  if (error) throw new Error(await invokeError(error))
  return data as { projectId: string; status: string }
}

// Read one edit project (RLS: owner + workspace peers). Durable observation —
// works after refresh and from any device; Realtime is only ever an
// optimization on top of this.
export async function getEditProject(projectId: string): Promise<EditProject | null> {
  const { data, error } = await getClient().from('edit_projects').select('*').eq('id', projectId).maybeSingle()
  if (error) return null
  return (data as EditProject) ?? null
}

// The newest edit project for a generation — how a refreshed/other-device
// session resumes watching without any local state.
export async function getLatestEditProject(generationId: string): Promise<EditProject | null> {
  const { data, error } = await getClient()
    .from('edit_projects')
    .select('*')
    .eq('generation_id', generationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return null
  return (data as EditProject) ?? null
}

// ---- Cancellation (Phase 3 foundations) -------------------------------------
// Ask the server to cancel an edit project the caller owns. Resolution modes:
//  * 'cancelled'        — the project was still queued and unclaimed: settled
//                         immediately, the job will never run
//  * 'cancel_requested' — a worker is (or may be) driving it: the flag is set
//                         and the worker finishes the project as cancelled at
//                         the next stage boundary
//  * a terminal status  — the project had already settled; cancel is a no-op
// Foreign/missing projects raise the same 'not_found' (no existence leak).
export async function cancelEditProject(
  projectId: string,
): Promise<'cancelled' | 'cancel_requested' | EditProjectStatus> {
  const { data, error } = await getClient().rpc('editor_request_cancel', { p_project: projectId })
  if (error) throw new Error(error.message)
  return data as 'cancelled' | 'cancel_requested' | EditProjectStatus
}

// Durable progress observation: the append-only event history for a project
// (RLS: owner + workspace peers), in deterministic seq order.
export async function getEditEvents(projectId: string, afterSeq = 0): Promise<EditEvent[]> {
  const { data, error } = await getClient()
    .from('edit_events')
    .select('seq,project_id,stage,pct,message_code,details,created_at')
    .eq('project_id', projectId)
    .gt('seq', afterSeq)
    .order('seq', { ascending: true })
  if (error) return []
  return (data as EditEvent[]) ?? []
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

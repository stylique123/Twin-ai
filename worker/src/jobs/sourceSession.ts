// Phase 6 — VerifiedSourceSession: attempt-scoped ownership of the source
// bytes. ONE session is created per job attempt in the orchestrator and passed
// through every real stage (inspection, transcription, analysis), replacing
// the per-stage downloadObject/fileSha256 pairs.
//
// Guarantees (the download truth table, DB-assertable via evented metrics):
//  * localPath() performs AT MOST ONE download per attempt, memoized —
//    concurrent/serial callers share the same verified file.
//  * Every download is immediately sha256-verified against the asset's
//    validation checksum; a mismatch is the PERMANENT `source_bytes_changed`.
//  * reconcileRemote() is CHEAP (HEAD etag+size vs the finalize reference) and
//    is called before any cache acceptance and at stage boundaries; drifted
//    bytes are the PERMANENT `source_bytes_changed`.
//
// Both integrity failures use the ESTABLISHED `source_bytes_changed` code
// (shipped since Phase 4, asserted by the Phase-4/5 gates and documented) —
// one code for "the bytes are not the validated bytes", consistent with the
// cached-component-mismatch checks in the inspect/speech/analyze stages.
//  * A stage that consumes no bytes (full component reuse, hook-only work)
//    causes ZERO downloads — it simply never calls localPath().
//  * dispose() is exactly-once: further byte access is a programming error.
//
// The local file lives inside the per-ATTEMPT scratch dir, which the
// orchestrator removes on every exit path (with the age-based orphan sweep as
// backstop) — the session does not own directory teardown.
import { join } from 'node:path'
import { env } from '../env.js'
import { PermanentJobError } from '../errors.js'
import { downloadObject, headObject } from '../storage.js'
import { fileSha256, type AssetRow } from './editorInspect.js'

export interface SourceSessionMetrics {
  headChecks: number
  downloads: number
  hashVerifications: number
}

export interface DownloadOpts {
  signal?: AbortSignal
  chunkPauseMs?: number
}

export class VerifiedSourceSession {
  private readonly asset: AssetRow & { content_sha256: string }
  private readonly meta: Record<string, unknown>
  private readonly dir: string
  private downloadPromise: Promise<string> | null = null
  private disposed = false
  readonly metrics: SourceSessionMetrics = { headChecks: 0, downloads: 0, hashVerifications: 0 }

  constructor(asset: AssetRow & { content_sha256: string }, meta: Record<string, unknown>, dir: string) {
    this.asset = asset
    this.meta = meta
    this.dir = dir
  }

  private assertLive(op: string): void {
    if (this.disposed) throw new Error(`source session used after dispose (${op})`)
  }

  // CHEAP integrity reconciliation: the object in storage must still be the
  // object finalize saw. Runs before any cache acceptance and at stage
  // boundaries; a cached analysis must never legitimize changed bytes.
  async reconcileRemote(label: string): Promise<{ etag: string | null; sizeBytes: number | null; finalizedEtag: string | undefined }> {
    this.assertLive('reconcileRemote')
    this.metrics.headChecks++
    const finalizedEtag = (this.meta as { finalized_etag?: string }).finalized_etag
    const finalizedBytes = Number((this.meta as { finalized_bytes?: number }).finalized_bytes ?? 0) || null
    const head = await headObject(this.asset.bucket, this.asset.storage_path)
    if (!head) throw new PermanentJobError(`${label}: storage object missing`, 'object_missing')
    if (finalizedEtag && head.etag && head.etag !== finalizedEtag) {
      throw new PermanentJobError(`${label}: storage bytes changed after finalize`, 'source_bytes_changed')
    }
    if (finalizedBytes && head.sizeBytes && head.sizeBytes !== finalizedBytes) {
      throw new PermanentJobError(`${label}: storage size changed after finalize`, 'source_bytes_changed')
    }
    return { etag: head.etag, sizeBytes: head.sizeBytes, finalizedEtag }
  }

  // The verified local copy of the source bytes. At most one download per
  // attempt; the bytes are sha256-verified against the validation checksum
  // BEFORE the path is handed to any consumer. Callers pass their stage's
  // abort signal / matrix pacing; on a memoized hit those options are moot
  // (the bytes are already on disk and verified).
  localPath(opts: DownloadOpts = {}): Promise<string> {
    this.assertLive('localPath')
    if (!this.downloadPromise) {
      const target = join(this.dir, 'source-bytes')
      this.downloadPromise = (async () => {
        this.metrics.downloads++
        await downloadObject(this.asset.bucket, this.asset.storage_path, target, opts)
        this.metrics.hashVerifications++
        const sha = await fileSha256(target)
        if (sha !== this.asset.content_sha256) {
          throw new PermanentJobError(
            'downloaded bytes do not match the validation checksum', 'source_bytes_changed')
        }
        return target
      })()
      // A failed download/verification must not poison the session into
      // permanently returning the same rejection on a retried attempt path —
      // but sessions are attempt-scoped and the orchestrator fails the attempt
      // on the first rejection, so clearing keeps the invariant simple: the
      // memo only ever holds a SUCCESSFUL verified download.
      this.downloadPromise.catch(() => { this.downloadPromise = null })
    }
    return this.downloadPromise
  }

  get downloadsPerformed(): number {
    return this.metrics.downloads
  }

  dispose(): void {
    if (this.disposed) return // idempotent; the exactly-once guarantee is on byte access
    this.disposed = true
  }
}

// Bounded chunk pause used by the staging matrix to widen the during-download
// cancellation window; production callers pass 0.
export function matrixChunkPause(slowPoint: string, slowMs: number, active: string): number {
  return slowPoint === active ? Math.min(slowMs, 500) : 0
}

// Convenience: the download options a stage passes through, honouring that
// stage's configured matrix slow-point.
export function stageDownloadOpts(signal: AbortSignal, kind: 'inspect' | 'speech' | 'analyze'): DownloadOpts {
  if (kind === 'inspect') {
    return { signal, chunkPauseMs: matrixChunkPause(env.inspectSlowPoint, env.inspectSlowMs, 'during_download') }
  }
  if (kind === 'speech') {
    return { signal, chunkPauseMs: matrixChunkPause(env.speechSlowPoint, env.speechSlowMs, 'during_download') }
  }
  return { signal, chunkPauseMs: matrixChunkPause(env.analyzeSlowPoint, env.analyzeSlowMs, 'during_download') }
}

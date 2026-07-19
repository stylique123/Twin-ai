// The REAL `inspecting` stage (Phase 4). Governing rule: ANALYZE ONCE AND
// REUSE THE RESULT. Phase 1's validate_source already downloaded, checksummed
// and ffprobed the recording — this stage:
//   1. loads the ready source asset and re-checks eligibility
//   2. looks up the immutable per-asset inspection component
//      (source_asset_id, 'inspection', inspectorVersion) — cache hit = done
//   3. reconciles integrity CHEAPLY (storage etag vs the finalize etag)
//   4. converts the trusted Phase-1 facts into the canonical versioned
//      MediaInspection contract (integer milliseconds, rational frame rates)
//   5. downloads + reprobes ONLY when required facts are missing (assets
//      validated before probe_facts existed — the bounded one-time upgrade),
//      verifying the sha256 against the Phase-1 checksum
//   6. persists through the FENCED editor_record_inspection RPC (a stale or
//      cancelled worker cannot publish a result)
//
// Cancellation is cooperative: a poller watches cancel_requested_at and trips
// an AbortController; the download stream and the ffprobe PROCESS GROUP are
// torn down promptly — no waiting for a stage boundary.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { db, type Job } from '../db.js'
import { env } from '../env.js'
import { PermanentJobError } from '../errors.js'
import { downloadObject, headObject } from '../storage.js'
import { assessProbe, extractProbeFacts, type ProbeFacts, type ProbeResult } from './validateSource.js'

export const MEDIA_INSPECTION_SCHEMA_VERSION = 1

export class InspectionCancelledError extends Error {
  constructor(point: string) {
    super(`inspection cancelled at ${point}`)
    this.name = 'InspectionCancelledError'
  }
}

interface AssetRow {
  id: string
  owner_id: string
  generation_id: string | null
  bucket: string
  storage_path: string
  status: string
  kind: string
  content_sha256: string | null
  duration_ms: number | null
  width: number | null
  height: number | null
  rotation: number | null
  has_audio: boolean | null
  validation_version: number
  metadata: Record<string, unknown> | null
}

// ---- pure contract construction (unit-tested) ------------------------------
export interface InspectionFactInput {
  durationMs: number | null
  width: number | null
  height: number | null
  rotation: number | null
  hasAudio: boolean | null
  container: string | null
  videoCodec: string | null
  audioCodec: string | null
  probeFacts: ProbeFacts | null
}

export function parseRational(s: string | null | undefined): { num: number; den: number } | null {
  if (!s) return null
  const m = /^(\d+)\/(\d+)$/.exec(s.trim())
  if (!m) return null
  const num = Number(m[1]); const den = Number(m[2])
  if (!Number.isInteger(num) || !Number.isInteger(den) || den === 0 || num === 0) return null
  return { num, den }
}

export function normalizeRotation(r: number | null | undefined): 0 | 90 | 180 | 270 {
  const n = ((Math.round(Number(r ?? 0)) % 360) + 360) % 360
  return (n === 90 || n === 180 || n === 270 ? n : 0) as 0 | 90 | 180 | 270
}

// Which facts MUST exist to build the contract without another probe.
export function hasRequiredFacts(f: InspectionFactInput): boolean {
  return f.durationMs != null && f.durationMs > 0
    && f.width != null && f.height != null
    && f.hasAudio != null
    && !!f.container && !!f.videoCodec
    && parseRational(f.probeFacts?.frame_rate) != null
}

export function buildInspection(
  asset: { id: string; content_sha256: string; validation_version: number },
  f: InspectionFactInput,
  flags: { reusedValidationFacts: boolean; fallbackProbePerformed: boolean },
): Record<string, unknown> {
  const fr = parseRational(f.probeFacts?.frame_rate)
  if (!fr) throw new PermanentJobError('inspection: no usable frame rate', 'missing_frame_rate')
  const avg = parseRational(f.probeFacts?.avg_frame_rate)
  const rotation = normalizeRotation(f.rotation)
  const swap = rotation === 90 || rotation === 270
  const width = f.width ?? 0
  const height = f.height ?? 0
  // VFR heuristic: the container's average rate differing from the declared
  // stream rate marks variable timing (typical of phone recordings).
  const variableFrameRate = !!avg && (avg.num * fr.den !== fr.num * avg.den)
  const present = f.hasAudio === true

  return {
    schemaVersion: MEDIA_INSPECTION_SCHEMA_VERSION,
    inspectorVersion: env.inspectorVersion,
    sourceAssetId: asset.id,
    sourceChecksum: asset.content_sha256,
    sourceValidationVersion: asset.validation_version,
    container: f.container,
    durationMs: Math.round(f.durationMs ?? 0),
    video: {
      codec: f.videoCodec,
      width,
      height,
      displayWidth: swap ? height : width,
      displayHeight: swap ? width : height,
      frameRateNumerator: fr.num,
      frameRateDenominator: fr.den,
      ...(avg ? { averageFrameRateNumerator: avg.num, averageFrameRateDenominator: avg.den } : {}),
      variableFrameRate,
      rotation,
      ...(f.probeFacts?.pix_fmt ? { pixelFormat: f.probeFacts.pix_fmt } : {}),
      ...(f.probeFacts?.color_space ? { colorSpace: f.probeFacts.color_space } : {}),
    },
    audio: present
      ? {
          present: true,
          ...(f.audioCodec ? { codec: f.audioCodec } : {}),
          ...(f.probeFacts?.audio_sample_rate ? { sampleRate: f.probeFacts.audio_sample_rate } : {}),
          ...(f.probeFacts?.audio_channels ? { channels: f.probeFacts.audio_channels } : {}),
          ...(f.probeFacts?.audio_channel_layout ? { channelLayout: f.probeFacts.audio_channel_layout } : {}),
        }
      : { present: false },
    eligibility: present
      ? { editorEligible: true }
      : { editorEligible: false, rejectionCode: 'source_not_editor_eligible' },
    source: flags,
  }
}

// ---- cancellation plumbing --------------------------------------------------
interface CancelWatch { signal: AbortSignal; cancelled: () => boolean; stop: () => void }

function watchCancellation(projectId: string): CancelWatch {
  const ctrl = new AbortController()
  let flagged = false
  const t = setInterval(() => {
    db.from('edit_projects').select('cancel_requested_at').eq('id', projectId).maybeSingle()
      .then(({ data }) => {
        if (data?.cancel_requested_at) { flagged = true; ctrl.abort() }
      }, () => { /* transient read failure — next tick retries */ })
  }, 750)
  return { signal: ctrl.signal, cancelled: () => flagged || ctrl.signal.aborted, stop: () => clearInterval(t) }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Matrix-only hold at a named boundary; checks cancellation when it wakes.
async function slowPoint(point: string, watch: CancelWatch): Promise<void> {
  if (env.inspectSlowPoint === point) await sleep(env.inspectSlowMs)
  if (watch.cancelled()) throw new InspectionCancelledError(point)
}

// ---- ffprobe with process-group termination ---------------------------------
function ffprobeFile(path: string, watch: CancelWatch): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    // detached → own process group, so cancellation kills ffprobe AND any
    // children it spawned, immediately, not at the next stage boundary.
    const child = spawn('ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path],
      { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let settled = false
    const killGroup = () => { try { process.kill(-child.pid!, 'SIGKILL') } catch { /* already gone */ } }
    const timer = setTimeout(() => {
      killGroup()
      finish(new Error(`stage_timeout: ffprobe exceeded ${env.inspectProbeTimeoutMs}ms`))
    }, env.inspectProbeTimeoutMs)
    const onAbort = () => { killGroup(); finish(new InspectionCancelledError('during_probe')) }
    watch.signal.addEventListener('abort', onAbort, { once: true })
    function finish(err: Error | null, value?: ProbeResult) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      watch.signal.removeEventListener('abort', onAbort)
      if (err) reject(err); else resolve(value!)
    }
    child.stdout.on('data', (d) => { out += d })
    child.on('error', (e) => finish(e))
    child.on('close', async (code) => {
      // Matrix-only: hold AFTER the process exits but before the result is
      // consumed, so during-probe cancellation has a provable window even on
      // fast fixtures. Cancellation during the hold still wins.
      if (env.inspectSlowPoint === 'during_probe') {
        await sleep(env.inspectSlowMs)
        if (watch.cancelled()) return finish(new InspectionCancelledError('during_probe'))
      }
      if (code !== 0) return finish(new PermanentJobError(`ffprobe failed (exit ${code})`, 'probe_failed'))
      try { finish(null, JSON.parse(out) as ProbeResult) } catch { finish(new PermanentJobError('ffprobe produced unparseable output', 'probe_failed')) }
    })
  })
}

function fileSha256(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', (c) => hash.update(c))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

// ---- the stage --------------------------------------------------------------
export interface InspectOutcome {
  cacheHit: boolean
  reusedValidationFacts: boolean
  fallbackProbePerformed: boolean
  editorEligible: boolean
  rejectionCode?: string
}

export async function runInspectingStage(job: Job, projectId: string, dir: string): Promise<InspectOutcome> {
  const { data: proj, error: projErr } = await db
    .from('edit_projects').select('id, source_asset_id, cancel_requested_at').eq('id', projectId).maybeSingle()
  if (projErr) throw new Error(`inspect: project read failed: ${projErr.message}`)
  if (!proj) throw new PermanentJobError(`inspect: project ${projectId} missing`, 'project_missing')

  const { data: asset, error: assetErr } = await db
    .from('media_assets')
    .select('id, owner_id, generation_id, bucket, storage_path, status, kind, content_sha256, duration_ms, width, height, rotation, has_audio, validation_version, metadata')
    .eq('id', proj.source_asset_id)
    .maybeSingle<AssetRow>()
  if (assetErr) throw new Error(`inspect: asset read failed: ${assetErr.message}`)

  // Eligibility re-check at execution time — fail BEFORE any later stage.
  if (!asset) throw new PermanentJobError('inspect: source asset missing', 'source_missing')
  if (asset.status === 'deleted') throw new PermanentJobError('inspect: source deleted', 'source_deleted')
  if (asset.status === 'rejected') throw new PermanentJobError('inspect: source rejected', 'source_rejected')
  if (asset.status !== 'ready' || asset.kind !== 'source') {
    throw new PermanentJobError(`inspect: source not ready (${asset.kind}/${asset.status})`, 'source_not_ready')
  }
  if (!asset.content_sha256) throw new PermanentJobError('inspect: source has no validation checksum', 'missing_checksum')
  const meta = (asset.metadata ?? {}) as Record<string, unknown>
  if (meta.editor_eligible !== true) {
    throw new PermanentJobError('inspect: source is not editor-eligible (no audio)', 'source_not_editor_eligible')
  }

  const watch = watchCancellation(projectId)
  try {
    if (proj.cancel_requested_at) throw new InspectionCancelledError('before_inspection')

    // Integrity reconciliation runs BEFORE the cache lookup, every run: the
    // object in storage must still be the object finalize saw (etag). A
    // previously cached analysis must never legitimize changed bytes.
    const finalizedEtag = (meta as { finalized_etag?: string }).finalized_etag
    const head = await headObject(asset.bucket, asset.storage_path)
    if (!head) throw new PermanentJobError('inspect: storage object missing', 'object_missing')
    if (finalizedEtag && head.etag && head.etag !== finalizedEtag) {
      throw new PermanentJobError('inspect: storage bytes changed after finalize', 'source_bytes_changed')
    }

    // Cache: one immutable component per (asset, component, inspector version).
    const { data: cached } = await db
      .from('media_analyses').select('id, result, source_hash')
      .eq('source_asset_id', asset.id).eq('component', 'inspection')
      .eq('analyzer_bundle_version', env.inspectorVersion)
      .maybeSingle()
    if (cached) {
      if (cached.source_hash !== asset.content_sha256) {
        // Cannot happen through the fenced writer (it re-verifies) — treat a
        // divergent row as integrity failure, never silently reuse it.
        throw new PermanentJobError('inspect: cached component checksum mismatch', 'source_bytes_changed')
      }
      const r = cached.result as { eligibility?: { editorEligible?: boolean; rejectionCode?: string } }
      // Outcome flags describe THIS run's work: a cache hit did no rebuild and
      // no probe (how the cached row was produced lives inside its `source`).
      return {
        cacheHit: true,
        reusedValidationFacts: false,
        fallbackProbePerformed: false,
        editorEligible: r.eligibility?.editorEligible ?? true,
        rejectionCode: r.eligibility?.rejectionCode,
      }
    }

    let facts: InspectionFactInput = {
      durationMs: asset.duration_ms,
      width: asset.width,
      height: asset.height,
      rotation: asset.rotation,
      hasAudio: asset.has_audio,
      container: (meta.container as string) ?? null,
      videoCodec: (meta.video_codec as string) ?? null,
      audioCodec: (meta.audio_codec as string) ?? null,
      probeFacts: (meta.probe_facts as ProbeFacts) ?? null,
    }

    let reused = true
    let fallback = false
    if (!hasRequiredFacts(facts)) {
      // Bounded ONE-TIME upgrade for assets validated before probe_facts
      // existed: download (capped, abortable), verify the Phase-1 checksum,
      // reprobe, and merge the missing facts. The resulting component is
      // cached, so this runs at most once per (asset, inspector version).
      reused = false
      fallback = true
      await slowPoint('before_download', watch)
      const local = join(dir, 'inspect-source')
      try {
        await downloadObject(asset.bucket, asset.storage_path, local, {
          signal: watch.signal,
          chunkPauseMs: env.inspectSlowPoint === 'during_download' ? Math.min(env.inspectSlowMs, 500) : 0,
        })
      } catch (e) {
        // An abort tripped by the cancellation watcher is a CANCELLATION, not
        // a retryable transfer failure.
        if (watch.cancelled()) throw new InspectionCancelledError('during_download')
        throw e
      }
      if (watch.cancelled()) throw new InspectionCancelledError('during_download')

      const sha = await fileSha256(local)
      if (sha !== asset.content_sha256) {
        throw new PermanentJobError('inspect: downloaded bytes do not match validation checksum', 'source_bytes_changed')
      }

      await slowPoint('before_probe', watch)
      const probe = await ffprobeFile(local, watch)
      await slowPoint('after_probe', watch)

      const verdict = assessProbe(probe, {
        minDurationMs: env.sourceMinDurationMs,
        maxDurationMs: env.sourceMaxDurationMs,
        maxPixels: env.sourceMaxPixels,
      })
      if (!verdict.ok) throw new PermanentJobError(`inspect: media no longer passes validation: ${verdict.code}`, verdict.code)
      facts = {
        durationMs: verdict.durationMs,
        width: verdict.width,
        height: verdict.height,
        rotation: verdict.rotation,
        hasAudio: verdict.hasAudio,
        container: verdict.container,
        videoCodec: verdict.videoCodec,
        audioCodec: verdict.audioCodec,
        probeFacts: extractProbeFacts(probe),
      }
    }

    const inspection = buildInspection(
      { id: asset.id, content_sha256: asset.content_sha256, validation_version: asset.validation_version },
      facts,
      { reusedValidationFacts: reused, fallbackProbePerformed: fallback },
    )

    if (watch.cancelled()) throw new InspectionCancelledError('before_persist')

    // FENCED persistence: the RPC re-proves the lease AND that the checksum
    // matches the project's CURRENT source asset — a stale worker or a
    // repointed asset cannot publish, and concurrent misses converge on the
    // single cached row.
    const { error: recErr } = await db.rpc('editor_record_inspection', {
      p_project: projectId, p_job: job.id, p_worker: env.workerId, p_attempt: job.attempts,
      p_component: 'inspection', p_schema_version: MEDIA_INSPECTION_SCHEMA_VERSION,
      p_bundle_version: env.inspectorVersion, p_source_hash: asset.content_sha256,
      p_result: inspection,
    })
    if (recErr) throw recErr

    await slowPoint('after_persist', watch)

    const elig = inspection.eligibility as { editorEligible: boolean; rejectionCode?: string }
    return {
      cacheHit: false,
      reusedValidationFacts: reused,
      fallbackProbePerformed: fallback,
      editorEligible: elig.editorEligible,
      rejectionCode: elig.rejectionCode,
    }
  } finally {
    watch.stop()
  }
}

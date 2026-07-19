// validate_source — editor v2, Phase 1.
//
// Server-side truth for a source recording: download the uploaded object
// (bounded, streamed), checksum it, ffprobe it, and only then mark the
// media_assets row `ready` with real measured facts (duration/dimensions/
// rotation/audio). A file that is missing, corrupt, not video, or out of bounds
// is `rejected` with a structured reason. On `ready`, the generation gets its
// durable pointers via the editor_link_ready_source() DB function, which
// refuses to let an OLDER take's slow validation overwrite the pointer to a
// NEWER one (the retake race).
//
// This job VALIDATES media; it never edits it. The AI Edit path (editor_v2,
// Phase 2+) is a separate job type and cannot start from here.
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stat } from 'node:fs/promises'
import { db, type Job } from '../db.js'
import { env } from '../env.js'
import { downloadObject, headObject } from '../storage.js'

const run = promisify(execFile)

export interface ProbeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  side_data_list?: Array<{ rotation?: number }>
  r_frame_rate?: string
  avg_frame_rate?: string
  pix_fmt?: string
  color_space?: string
  sample_rate?: string
  channels?: number
  channel_layout?: string
}
export interface ProbeResult {
  streams?: ProbeStream[]
  format?: { duration?: string; size?: string; format_name?: string }
}

// The full fact set the editor's inspection contract needs, captured ONCE at
// validation so the inspecting stage can reuse it without re-downloading
// (docs/editor-v2-worker-orchestration.md: analyze once and reuse). Assets
// validated before this field existed take the bounded one-time upgrade probe.
export interface ProbeFacts {
  frame_rate: string | null      // rational, e.g. "30000/1001"
  avg_frame_rate: string | null
  pix_fmt: string | null
  color_space: string | null
  audio_sample_rate: number | null
  audio_channels: number | null
  audio_channel_layout: string | null
}

export function extractProbeFacts(probe: ProbeResult): ProbeFacts {
  const video = probe.streams?.find((s) => s.codec_type === 'video')
  const audio = probe.streams?.find((s) => s.codec_type === 'audio')
  return {
    frame_rate: video?.r_frame_rate ?? null,
    avg_frame_rate: video?.avg_frame_rate ?? null,
    pix_fmt: video?.pix_fmt ?? null,
    color_space: video?.color_space ?? null,
    audio_sample_rate: audio?.sample_rate ? Number(audio.sample_rate) : null,
    audio_channels: audio?.channels ?? null,
    audio_channel_layout: audio?.channel_layout ?? null,
  }
}

export interface SourceLimits {
  minDurationMs: number
  maxDurationMs: number
  maxPixels: number
}

export type ProbeAssessment =
  | {
      ok: true
      durationMs: number
      width: number | null
      height: number | null
      rotation: number
      hasAudio: boolean
      container: string | null
      videoCodec: string | null
      audioCodec: string | null
      sizeBytes: number | null
    }
  | { ok: false; code: string; detail: string }

// Pure assessment of an ffprobe result against the source bounds — separated
// from I/O so the accept/reject rules are unit-testable without ffmpeg.
export function assessProbe(probe: ProbeResult, limits: SourceLimits): ProbeAssessment {
  const video = probe.streams?.find((s) => s.codec_type === 'video')
  const audio = probe.streams?.find((s) => s.codec_type === 'audio')
  if (!video) return { ok: false, code: 'no_video_stream', detail: 'file contains no video stream' }

  const durationMs = Math.round(Number(probe.format?.duration ?? '0') * 1000)
  if (!Number.isFinite(durationMs) || durationMs < limits.minDurationMs) {
    return { ok: false, code: 'too_short', detail: `duration ${durationMs}ms below minimum ${limits.minDurationMs}ms` }
  }
  if (durationMs > limits.maxDurationMs) {
    return { ok: false, code: 'too_long', detail: `duration ${durationMs}ms above cap ${limits.maxDurationMs}ms` }
  }
  const pixels = (video.width ?? 0) * (video.height ?? 0)
  if (pixels > limits.maxPixels) {
    return {
      ok: false,
      code: 'resolution_too_high',
      detail: `${video.width}x${video.height} (${pixels}px) above cap ${limits.maxPixels}px`,
    }
  }
  const rotation = Math.abs(video.side_data_list?.find((d) => typeof d.rotation === 'number')?.rotation ?? 0) % 360

  return {
    ok: true,
    durationMs,
    width: video.width ?? null,
    height: video.height ?? null,
    rotation,
    hasAudio: !!audio,
    container: probe.format?.format_name ?? null,
    videoCodec: video.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    sizeBytes: Number(probe.format?.size ?? 0) || null,
  }
}

export async function handleValidateSource(job: Job): Promise<Record<string, unknown>> {
  const payload = job.payload as { asset_id?: string }
  const assetId = payload.asset_id
  if (!assetId) throw new Error('validate_source: missing asset_id')

  const { data: asset } = await db
    .from('media_assets')
    .select('id, owner_id, generation_id, bucket, storage_path, status, mime_type, size_bytes, metadata')
    .eq('id', assetId)
    .maybeSingle()
  if (!asset) throw new Error('validate_source: asset not found')
  // Idempotent: a retried/duplicate job for a settled asset is a no-op.
  if (asset.status !== 'validating') return { status: asset.status, idempotent: true }
  // Ownership re-check at execution time (not only at enqueue): the asset's
  // owner must still own the generation it claims to belong to.
  if (asset.generation_id) {
    const { data: gen } = await db
      .from('generations')
      .select('id')
      .eq('id', asset.generation_id)
      .eq('user_id', asset.owner_id)
      .maybeSingle()
    if (!gen) return await reject(assetId, 'ownership_mismatch', 'asset owner does not own the generation')
  }

  // The bytes we validate must be the bytes finalize saw. A signed upload token
  // (upsert, ~2h lifetime) replayed AFTER finalize could otherwise swap the
  // object's content between finalize and validation — compare the storage
  // etag/size recorded at finalize before trusting the object.
  const finalized = (asset.metadata ?? {}) as { finalized_etag?: string; finalized_bytes?: number }
  const head = await headObject(asset.bucket, asset.storage_path)
  if (!head) return await reject(assetId, 'object_missing', 'storage object disappeared before validation')
  if (finalized.finalized_etag && head.etag && head.etag !== finalized.finalized_etag) {
    return await reject(assetId, 'bytes_changed_after_finalize',
      `storage etag ${head.etag} != finalized ${finalized.finalized_etag}`)
  }

  const dir = await mkdtemp(join(tmpdir(), 'validate-src-'))
  try {
    const local = join(dir, 'source')
    try {
      await downloadObject(asset.bucket, asset.storage_path, local)
    } catch (e) {
      return await reject(assetId, 'download_failed', String(e).slice(0, 300))
    }
    const localBytes = (await stat(local)).size
    if (asset.size_bytes && localBytes !== Number(asset.size_bytes)) {
      return await reject(assetId, 'bytes_changed_after_finalize',
        `downloaded ${localBytes} bytes != finalized ${asset.size_bytes}`)
    }

    const sha256 = await fileSha256(local)

    let probe: ProbeResult
    try {
      const { stdout } = await run(
        'ffprobe',
        ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', local],
        { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
      )
      probe = JSON.parse(stdout) as ProbeResult
    } catch (e) {
      return await reject(assetId, 'probe_failed', `not decodable media: ${String(e).slice(0, 200)}`)
    }

    const verdict = assessProbe(probe, {
      minDurationMs: env.sourceMinDurationMs,
      maxDurationMs: env.sourceMaxDurationMs,
      maxPixels: env.sourceMaxPixels,
    })
    if (!verdict.ok) return await reject(assetId, verdict.code, verdict.detail)

    // The transition guard trigger enforces validating→ready; the status filter
    // here just keeps a lost race (another worker settled it) a clean no-op.
    const { error: upErr } = await db
      .from('media_assets')
      .update({
        status: 'ready',
        content_sha256: sha256,
        duration_ms: verdict.durationMs,
        width: verdict.width,
        height: verdict.height,
        rotation: verdict.rotation,
        has_audio: verdict.hasAudio,
        size_bytes: verdict.sizeBytes ?? undefined,
        validated_at: new Date().toISOString(),
        metadata: {
          container: verdict.container,
          video_codec: verdict.videoCodec,
          audio_codec: verdict.audioCodec,
          probe_facts: extractProbeFacts(probe),
          // Policy: a no-audio take is READY (playable, recoverable) but NOT
          // eligible for AI editing — the editor requires speech to analyze.
          // Phase 2's start-editor gate reads has_audio; this flag documents it.
          editor_eligible: verdict.hasAudio,
        },
      })
      .eq('id', assetId)
      .eq('status', 'validating')
    if (upErr) throw new Error(`validate_source: ready update failed: ${upErr.message}`)

    // Durable pointers on the generation via the guarded DB function:
    // source_asset_id (authoritative) + take_path (compatibility projection).
    // Returns false — correctly — when a NEWER take already owns the pointer.
    let linked = false
    if (asset.generation_id) {
      const { data, error: linkErr } = await db.rpc('editor_link_ready_source', { p_asset_id: assetId })
      if (linkErr) throw new Error(`validate_source: link failed: ${linkErr.message}`)
      linked = data === true
    }

    return { status: 'ready', duration_ms: verdict.durationMs, has_audio: verdict.hasAudio, sha256, linked }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// Mark rejected with a structured reason. Rejection is a SUCCESSFUL job outcome
// (the job did its work: it determined the media is unusable) — throwing here
// would burn worker retries re-probing a file that will never become valid.
// Only validating→rejected is legal (the transition guard enforces it too).
async function reject(assetId: string, code: string, detail: string): Promise<Record<string, unknown>> {
  await db
    .from('media_assets')
    .update({ status: 'rejected', metadata: { rejection_code: code, rejection_detail: detail } })
    .eq('id', assetId)
    .eq('status', 'validating')
  return { status: 'rejected', code, detail }
}

function fileSha256(path: string): Promise<string> {
  return new Promise((resolve, rejectP) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', rejectP)
  })
}

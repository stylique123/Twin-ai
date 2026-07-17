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
import { db, type Job } from '../db.js'
import { env } from '../env.js'
import { downloadObject } from '../storage.js'

const run = promisify(execFile)

export interface ProbeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  side_data_list?: Array<{ rotation?: number }>
}
export interface ProbeResult {
  streams?: ProbeStream[]
  format?: { duration?: string; size?: string; format_name?: string }
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
    .select('id, owner_id, generation_id, bucket, storage_path, status, mime_type')
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

  const dir = await mkdtemp(join(tmpdir(), 'validate-src-'))
  try {
    const local = join(dir, 'source')
    try {
      await downloadObject(asset.bucket, asset.storage_path, local)
    } catch (e) {
      return await reject(assetId, 'download_failed', String(e).slice(0, 300))
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

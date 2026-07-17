// validate_source — editor v2, Phase 1.
//
// Server-side truth for a source recording: download the uploaded object
// (bounded, streamed), checksum it, ffprobe it, and only then mark the
// media_assets row `ready` with real measured facts (duration/dimensions/
// rotation/audio). A file that is missing, corrupt, not video, or out of bounds
// is `rejected` with a structured reason. On `ready`, the generation gets its
// durable pointers in one service-role update: source_asset_id (authoritative)
// + take_path (compatibility projection for existing playback).
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
import { downloadObject } from '../storage.js'

const run = promisify(execFile)

const MIN_DURATION_MS = 500
const MAX_DURATION_MS = 30 * 60 * 1000 // hard sanity cap, above product limits

interface ProbeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  side_data_list?: Array<{ rotation?: number }>
}
interface ProbeResult {
  streams?: ProbeStream[]
  format?: { duration?: string; size?: string; format_name?: string }
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
  if (asset.status === 'ready' || asset.status === 'rejected') return { status: asset.status, idempotent: true }
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

    const video = probe.streams?.find((s) => s.codec_type === 'video')
    const audio = probe.streams?.find((s) => s.codec_type === 'audio')
    if (!video) return await reject(assetId, 'no_video_stream', 'file contains no video stream')

    const durationMs = Math.round(Number(probe.format?.duration ?? '0') * 1000)
    if (!Number.isFinite(durationMs) || durationMs < MIN_DURATION_MS) {
      return await reject(assetId, 'too_short', `duration ${durationMs}ms below minimum ${MIN_DURATION_MS}ms`)
    }
    if (durationMs > MAX_DURATION_MS) {
      return await reject(assetId, 'too_long', `duration ${durationMs}ms above cap ${MAX_DURATION_MS}ms`)
    }
    const rotation = Math.abs(video.side_data_list?.find((d) => typeof d.rotation === 'number')?.rotation ?? 0) % 360

    const { error: upErr } = await db
      .from('media_assets')
      .update({
        status: 'ready',
        content_sha256: sha256,
        duration_ms: durationMs,
        width: video.width ?? null,
        height: video.height ?? null,
        rotation,
        has_audio: !!audio,
        size_bytes: Number(probe.format?.size ?? 0) || undefined,
        validated_at: new Date().toISOString(),
        metadata: {
          container: probe.format?.format_name ?? null,
          video_codec: video.codec_name ?? null,
          audio_codec: audio?.codec_name ?? null,
        },
      })
      .eq('id', assetId)
      .eq('status', 'validating')
    if (upErr) throw new Error(`validate_source: ready update failed: ${upErr.message}`)

    // Durable pointers on the generation, in one privileged update:
    // source_asset_id is authoritative; take_path is the compatibility
    // projection existing playback (Result raw-take player) already reads.
    if (asset.generation_id) {
      await db
        .from('generations')
        .update({ source_asset_id: assetId, take_path: asset.storage_path })
        .eq('id', asset.generation_id)
        .eq('user_id', asset.owner_id)
    }

    return { status: 'ready', duration_ms: durationMs, has_audio: !!audio, sha256 }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// Mark rejected with a structured reason. Rejection is a SUCCESSFUL job outcome
// (the job did its work: it determined the media is unusable) — throwing here
// would burn worker retries re-probing a file that will never become valid.
async function reject(assetId: string, code: string, detail: string): Promise<Record<string, unknown>> {
  await db
    .from('media_assets')
    .update({ status: 'rejected', metadata: { rejection_code: code, rejection_detail: detail } })
    .eq('id', assetId)
    .in('status', ['validating', 'uploading'])
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

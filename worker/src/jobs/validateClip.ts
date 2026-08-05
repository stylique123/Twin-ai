// validate_clip — Phase 12 item 13.
//
// The measurement half of a screen capture. Download the uploaded object,
// checksum it, ffprobe it, and only then mark the `clip` asset ready with real
// facts — duration, dimensions, frame rate, checksum.
//
// ── WHY THIS EXISTS AT ALL, RATHER THAN A `ready` FLIP AT FINALIZE ────────
//
// `EditPlanV1.composition` (schema v7) requires each composed source to carry a
// real `durationMs` and a real `checksum`, and validates every overlay's span
// against that duration. Neither can be invented from an upload: the browser's
// own idea of how long a `getDisplayMedia` recording ran is the same class of
// claim as the recorder's active-time clock, which the capture contract already
// treats as INTENT and re-derives server-side. A clip marked ready without a
// probe would be a clip the compiler could place a cutaway inside using a
// duration nothing measured.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────
//
// It is not `validate_source` with a different name. It writes no capture
// manifest, binds no script snapshot, and — this is the load-bearing one —
// NEVER TOUCHES `generations.source_asset_id`. A clip is not the spine of a
// project, and the one bug worth being paranoid about here is a screen capture
// becoming the take the editor cuts because a pointer was written by reflex.
// There is no code path below that writes to `generations`.
//
// ── AND WHY IT ACCEPTS WHAT THE SOURCE VALIDATOR WOULD REJECT ────────────
//
// Two of the source bounds are wrong for a clip and both are relaxed on
// purpose, with the reason stated rather than the number quietly changed:
//
//   * NO AUDIO IS NORMAL. A source with no audio is not editor-eligible
//     (nothing to transcribe); a silent screen recording is the ordinary case,
//     since the composition model discards clip audio anyway.
//   * SHORTER IS FINE. A two-second look at a settings page is a legitimate
//     cutaway; a two-second take is not a video. The floor here is the
//     composition's own floor — long enough to be a window at all.
//
// The pixel cap is NOT relaxed: a 6K display capture is as expensive to decode
// as a 6K camera file, and the reason that cap exists is the decode.
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { db, type Job } from '../db.js'
import { env } from '../env.js'
import { downloadObject, headObject } from '../storage.js'
import {
  extractProbeFacts, parseFrameRate, probeDurationMs, type ProbeResult,
} from './validateSource.js'

const run = promisify(execFile)

/** The shortest span the plan contract will accept as an overlay window. A clip
 *  below it cannot be shown at all, so it is refused at measurement rather than
 *  being stored as a ready clip that every placement would then reject. */
export const CLIP_MIN_DURATION_MS = 500

export type ClipAssessment =
  | {
      ok: true
      durationMs: number
      width: number | null
      height: number | null
      rotation: number
      hasAudio: boolean
      container: string | null
      videoCodec: string | null
      sizeBytes: number | null
    }
  | { ok: false; code: string; detail: string }

/**
 * Pure assessment against the CLIP bounds, separated from I/O so the rules are
 * testable without ffmpeg — the same split `assessProbe` uses.
 *
 * `duration_unknown` is its own verdict here for exactly the reason it is one
 * there: a `MediaRecorder` WebM is written as a live stream and frequently
 * carries no Segment duration, and reading that absence as "too short" tells the
 * creator something false about their own recording. A screen capture is MORE
 * likely to hit it than a phone take, not less — it is always a MediaRecorder
 * stream, never a file the operating system finalized.
 */
export function assessClipProbe(
  probe: ProbeResult, limits: { minDurationMs: number; maxDurationMs: number; maxPixels: number },
): ClipAssessment {
  const video = probe.streams?.find((s) => s.codec_type === 'video')
  const audio = probe.streams?.find((s) => s.codec_type === 'audio')
  if (!video) return { ok: false, code: 'no_video_stream', detail: 'file contains no video stream' }

  const durationMs = probeDurationMs(probe)
  if (durationMs === null) {
    return {
      ok: false, code: 'duration_unknown',
      detail: 'the container reports no duration (format, stream, or DURATION tag) — cannot measure the clip',
    }
  }
  if (durationMs < limits.minDurationMs) {
    return { ok: false, code: 'too_short', detail: `duration ${durationMs}ms below minimum ${limits.minDurationMs}ms` }
  }
  if (durationMs > limits.maxDurationMs) {
    return { ok: false, code: 'too_long', detail: `duration ${durationMs}ms above cap ${limits.maxDurationMs}ms` }
  }
  const pixels = (video.width ?? 0) * (video.height ?? 0)
  if (pixels > limits.maxPixels) {
    return {
      ok: false, code: 'resolution_too_high',
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
    // Recorded as a FACT, never as an eligibility verdict: the composition model
    // discards clip audio, so a clip with audio and a clip without are equally
    // usable and the flag exists only so a reader can see which arrived.
    hasAudio: !!audio,
    container: probe.format?.format_name ?? null,
    videoCodec: video.codec_name ?? null,
    sizeBytes: Number(probe.format?.size ?? 0) || null,
  }
}

export async function handleValidateClip(job: Job): Promise<Record<string, unknown>> {
  const payload = job.payload as { asset_id?: string }
  const assetId = payload.asset_id
  if (!assetId) throw new Error('validate_clip: missing asset_id')

  const { data: asset } = await db
    .from('media_assets')
    .select('id, owner_id, generation_id, kind, bucket, storage_path, status, size_bytes, metadata')
    .eq('id', assetId)
    .maybeSingle()
  if (!asset) throw new Error('validate_clip: asset not found')
  // A clip validator that would probe a SOURCE is the mirror of 0091's
  // `source_validate_not_source`, and it fails for the same reason: this writes
  // no manifest and no script binding, so completing a take through it would
  // leave a ready source that never got the checks a take must pass.
  if (asset.kind !== 'clip') throw new Error(`validate_clip: asset ${assetId} is not a clip`)
  // Idempotent. There is deliberately no heal-on-retry branch here: the source
  // validator has one because a crash could strand a ready take with no
  // generation pointer, and a clip has no pointer to strand.
  if (asset.status !== 'validating') return { status: asset.status, idempotent: true }

  if (asset.generation_id) {
    const { data: gen, error: genErr } = await db
      .from('generations').select('id')
      .eq('id', asset.generation_id).eq('user_id', asset.owner_id).maybeSingle()
    // A transient read error is UNVERIFIED ownership, not disproven ownership.
    // Throwing retries; rejecting would kill a valid clip on a database blip.
    if (genErr) throw new Error(`validate_clip: ownership read failed: ${genErr.message}`)
    if (!gen) return await reject(assetId, 'ownership_mismatch', 'asset owner does not own the generation')
  }

  // The bytes measured must be the bytes finalize saw. A signed upload token is
  // upsert-capable and outlives finalize, so without this an attacker (or a
  // retrying tab) could swap the object between finalize and probe and have a
  // different file measured than the one the row describes.
  const finalized = (asset.metadata ?? {}) as { finalized_etag?: string; finalized_bytes?: number }
  const head = await headObject(asset.bucket, asset.storage_path)
  if (!head) return await reject(assetId, 'object_missing', 'storage object disappeared before validation')
  if (finalized.finalized_etag && head.etag && head.etag !== finalized.finalized_etag) {
    return await reject(assetId, 'bytes_changed_after_finalize',
      `storage etag ${head.etag} != finalized ${finalized.finalized_etag}`)
  }

  const dir = await mkdtemp(join(tmpdir(), 'validate-clip-'))
  try {
    const local = join(dir, 'clip')
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

    const verdict = assessClipProbe(probe, {
      minDurationMs: CLIP_MIN_DURATION_MS,
      // The take's ceiling, shared on purpose: it bounds how long a single
      // decode can run, which is the same cost whichever file it is.
      maxDurationMs: env.sourceMaxDurationMs,
      maxPixels: env.sourceMaxPixels,
    })
    if (!verdict.ok) return await reject(assetId, verdict.code, verdict.detail)

    const fr = parseFrameRate(probe)
    const { error: cErr } = await db.rpc('editor_complete_clip', {
      p_asset: assetId,
      p_content_sha: sha256,
      p_size_bytes: verdict.sizeBytes ?? null,
      p_duration_ms: verdict.durationMs,
      p_width: verdict.width,
      p_height: verdict.height,
      p_frame_rate_num: fr.num,
      p_frame_rate_den: fr.den,
      p_rotation: verdict.rotation,
      p_has_audio: verdict.hasAudio,
      p_probe: {
        container: verdict.container,
        video_codec: verdict.videoCodec,
        probe_facts: extractProbeFacts(probe),
      },
    })
    if (cErr) throw new Error(`validate_clip: ready update failed: ${cErr.message}`)

    return { status: 'ready', duration_ms: verdict.durationMs, sha256 }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// Rejection is a SUCCESSFUL job outcome — the job determined the media is
// unusable — so it never throws. A throw would burn retries re-probing a file
// that will never become valid.
async function reject(assetId: string, code: string, detail: string): Promise<Record<string, unknown>> {
  // Read-modify-write, guarded on `validating` and safe only because this worker
  // holds the asset's job lease. The compare-and-set below turns any violation
  // of that assumption into a loud failure rather than a lost write — the same
  // reasoning, and the same guard, as validateSource's own reject.
  const { data: cur, error: readErr } = await db
    .from('media_assets').select('metadata').eq('id', assetId).maybeSingle()
  if (readErr) throw new Error(`validate_clip: reject read failed: ${readErr.message}`)
  const { data: updated, error: upErr } = await db
    .from('media_assets')
    .update({
      status: 'rejected',
      metadata: { ...((cur?.metadata as Record<string, unknown>) ?? {}), rejection_code: code, rejection_detail: detail },
    })
    .eq('id', assetId)
    .eq('status', 'validating')
    .select('id')
  if (upErr) throw new Error(`validate_clip: reject write failed: ${upErr.message}`)
  if (!updated || updated.length === 0) {
    const { data: now } = await db
      .from('media_assets').select('status').eq('id', assetId).maybeSingle()
    const status = (now as { status?: string } | null)?.status ?? null
    if (status !== 'rejected') {
      throw new Error(`validate_clip: reject did not land — asset ${assetId} is now ${status ?? 'missing'}, not validating`)
    }
  }
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

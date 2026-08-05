// The verified local copies of a plan's COMPOSED CLIPS.
//
// `VerifiedSourceSession` does this for the one take. A clip needs the same
// guarantee and gets it here rather than by widening that class, because the
// thing each is verified AGAINST is different in a way that matters:
//
//   * a source is checked against `media_assets.content_sha256` — the checksum
//     the validator measured, i.e. "these are the bytes we validated";
//   * a clip is checked against `EditPlanV1.composition.sources[i].checksum` —
//     the checksum THE PLAN PINNED, i.e. "these are the bytes the creator
//     approved this render of".
//
// Those coincide right up until someone re-records a clip under the same label,
// at which point the asset row's checksum moves and the plan's does not. The
// plan is the contract for THIS render, so the plan's checksum is the one that
// must win — and a mismatch is a refusal, never a silent render of newer
// footage the plan never described.
//
// ONE DOWNLOAD PER CLIP PER ATTEMPT, memoized, and the bytes are verified
// BEFORE the path is handed to the graph builder. A clip whose bytes do not
// match is `source_bytes_changed`, the same established code the take uses for
// "these are not the bytes we agreed on" — one code for one meaning.
import { join } from 'node:path'
import { PermanentJobError } from '../errors.js'
import { db } from '../db.js'
import { downloadObject } from '../storage.js'
import { fileSha256 } from './editorInspect.js'
import type { EditPlanV1 } from './editPlanContract.js'

export interface ClipSessionMetrics {
  downloads: number
  hashVerifications: number
}

/**
 * Fetch every clip the plan composes, in `composition.sources` order.
 *
 * Returns paths INDEX-ALIGNED with `plan.composition.sources`, which is exactly
 * what `buildFfmpegGraph` expects — the alignment is the contract between the
 * two, and it is positional rather than by id so the graph builder never has to
 * resolve anything.
 *
 * A plan that composes nothing performs ZERO reads and returns an empty array,
 * so the ordinary render path is untouched by the existence of this file.
 */
export async function fetchComposedClips(
  plan: EditPlanV1,
  ownerId: string,
  dir: string,
  opts: { signal?: AbortSignal } = {},
  metrics: ClipSessionMetrics = { downloads: 0, hashVerifications: 0 },
): Promise<string[]> {
  const sources = plan.composition.sources
  if (sources.length === 0) return []

  const paths: string[] = []
  for (const clip of sources) {
    // OWNER-SCOPED AND KIND-SCOPED, re-checked here rather than trusted from the
    // plan. A plan is validated for shape and internal consistency; it is not
    // evidence that the asset it names belongs to this project's owner, and an
    // asset id is guessable in a way a checksum is not. This is the same posture
    // the source path takes: ownership is proven from the row at execution time.
    const { data: asset, error } = await db
      .from('media_assets')
      .select('id, owner_id, kind, bucket, storage_path, status, content_sha256')
      .eq('id', clip.assetId)
      .eq('owner_id', ownerId)
      .maybeSingle()
    // A read failure is UNVERIFIED, not disproven. Throwing retries; refusing
    // here would permanently fail a legitimate render on a database blip.
    if (error) throw new Error(`clip ${clip.index}: asset read failed: ${error.message}`)
    if (!asset) {
      throw new PermanentJobError(
        `clip ${clip.index}: asset ${clip.assetId} is not this owner's`, 'object_missing')
    }
    if (asset.kind !== 'clip') {
      throw new PermanentJobError(
        `clip ${clip.index}: asset ${clip.assetId} is a ${asset.kind}, not a clip`, 'render_graph_invalid')
    }
    // NOT-READY IS NOT A REASON TO WAIT — it is a plan naming a clip that was
    // never measured, and the plan's own duration for it came from somewhere
    // else. Refused rather than rendered.
    if (asset.status !== 'ready') {
      throw new PermanentJobError(
        `clip ${clip.index}: asset ${clip.assetId} is ${asset.status}, not ready`, 'render_graph_invalid')
    }

    const target = join(dir, `clip-${clip.index}-bytes`)
    metrics.downloads++
    await downloadObject(asset.bucket, asset.storage_path, target, opts)
    metrics.hashVerifications++
    const sha = await fileSha256(target)
    // AGAINST THE PLAN'S CHECKSUM, not the row's. See the header: they diverge
    // exactly when a clip is re-recorded under the same label, and the plan is
    // the contract for this render.
    if (sha !== clip.checksum) {
      throw new PermanentJobError(
        `clip ${clip.index}: bytes do not match the checksum the plan pinned`, 'source_bytes_changed')
    }
    paths.push(target)
  }
  return paths
}

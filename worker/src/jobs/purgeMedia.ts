import { db, type Job } from '../db.js'
import { removeObject } from '../storage.js'

// Handles `purge_media` jobs — the bytes half of deleting a recording.
//
// WHAT THIS CLOSES. Until now nothing in this repository ever deleted a stored
// object. Deleting a generation cascaded the `media_assets` rows; deleting an
// ACCOUNT cascaded from `auth.users` and dropped them too. The BYTES survived
// both, because storage has no foreign key to `auth.users` — so every raw take,
// a recording of a person's face and voice, stayed indefinitely, unreferenced
// and unauditable. `media_assets.status = 'deleted'` was a label nothing acted
// on.
//
// WHY A JOB AND NOT A CASCADE. Storage is a different service; it can be slow,
// rate-limited, or briefly down. Doing the delete inline with the database
// transaction would either block the user's delete on a network call or lose
// the intent when that call failed. A queued job retries, and the ROW is gone
// either way — the user's delete succeeds immediately and the bytes follow.
//
// The job is enqueued by a database trigger rather than by application code, so
// EVERY route to deletion is covered: an explicit delete, a generation cascade,
// an account cascade, and anything added later that nobody remembers to wire.
export async function handlePurgeMedia(job: Job): Promise<Record<string, unknown>> {
  const p = job.payload as { bucket?: string; path?: string; asset_id?: string }
  const bucket = String(p.bucket ?? '')
  const path = String(p.path ?? '')
  if (!bucket || !path) throw new Error('purge_media needs bucket and path')

  // REFUSE TO DELETE SOMETHING STILL IN USE. The trigger fires on a row that is
  // going away, but a re-render can mint a NEW asset at the same storage path
  // (the path is server-derived from ids, so it is stable across attempts). If
  // any live row still points here, the bytes are not orphaned and must stay —
  // a purge that deletes a file another project is serving is far worse than a
  // file that lingers.
  const { data: stillReferenced, error: refErr } = await db
    .from('media_assets')
    .select('id')
    .eq('bucket', bucket)
    .eq('storage_path', path)
    .limit(1)
  if (refErr) throw new Error(`purge_media: reference check failed: ${refErr.message}`)
  if (stillReferenced && stillReferenced.length > 0) {
    return { purged: false, reason: 'still referenced by a live media_asset' }
  }

  const { removed } = await removeObject(bucket, path)
  return { purged: true, bytes_existed: removed, asset_id: p.asset_id ?? null }
}

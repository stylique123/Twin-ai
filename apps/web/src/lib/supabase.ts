import { createClient } from '@supabase/supabase-js'
import { initApi } from '@twinai/shared'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Surface a clear error in dev rather than a cryptic runtime failure.
export const isSupabaseConfigured = Boolean(url && anon)

export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anon ?? 'placeholder-anon-key',
)

// Upload to a server-SIGNED target (editor-v2 source flow) with real progress.
// The signed URL authorizes a PUT of exactly one object — no bucket INSERT
// policy involved, so every object provably has a media_assets intent row.
// XHR gives upload.onprogress; any failure falls back to supabase-js
// uploadToSignedUrl so the critical path never regresses.
/**
 * How long a single upload PUT may take, from how big it is.
 *
 * ⚠️ XHR's DEFAULT TIMEOUT IS ZERO, MEANING NEVER, and combined with the missing
 * `ontimeout`/`onabort` handlers below that produced a promise which never
 * settled. Production shows exactly that: two takes — 59.8MB and 123.7MB —
 * stuck at `uploading` since 2026-08-09 with NO object in storage. The only
 * take that ever reached storage was 5.8MB.
 *
 * ⚖️ SCALED, NOT FIXED, because a fixed timeout is wrong at both ends: generous
 * enough for a 200MB take on hotel wifi is generous enough to leave somebody
 * watching a dead spinner for an hour on a 5MB one. 90s of headroom plus ~8s
 * per MB is roughly 1Mbps sustained, which is pessimistic on purpose — the cost
 * of being too patient is a slow failure, and the cost of being too strict is
 * killing an upload that would have finished.
 */
export function uploadTimeoutMs(bytes: number): number {
  const mb = Math.max(0, Number(bytes) || 0) / (1024 * 1024)
  return Math.min(30 * 60_000, Math.round(90_000 + mb * 8_000))
}

async function uploadSignedWithProgress(
  target: { bucket: string; path: string; token: string; signedUrl: string; contentType: string },
  blob: Blob,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  if (typeof XMLHttpRequest !== 'undefined') {
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', target.signedUrl)
        xhr.setRequestHeader('x-upsert', 'true')
        xhr.setRequestHeader('content-type', target.contentType)
        // ⚠️ EVERY TERMINAL PATH MUST SETTLE THIS PROMISE. It used to handle
        // `onload` and `onerror` only, so a timeout or an abort fired NEITHER
        // and the promise hung forever — the upload never finalized, the asset
        // stayed `uploading`, and `UploadOnce` (which clears its slot only in
        // `.catch()`) could never let the retry button run either. The creator
        // was left watching a dead progress bar with no way forward. Two real
        // takes are stuck in production in exactly that state.
        xhr.timeout = uploadTimeoutMs(blob.size)
        xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total) }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)))
        xhr.onerror = () => reject(new Error('upload network error'))
        xhr.ontimeout = () => reject(new Error(`upload timed out after ${xhr.timeout}ms`))
        xhr.onabort = () => reject(new Error('upload aborted'))
        xhr.send(blob)
      })
      onProgress?.(1)
      return
    } catch {
      // fall through to the supabase-js path below
    }
  }
  const { error } = await supabase.storage
    .from(target.bucket)
    .uploadToSignedUrl(target.path, target.token, blob, { contentType: target.contentType, upsert: true })
  if (error) throw error
  onProgress?.(1)
}

// Wire the web platform into the shared API layer (used by @twinai/shared/api).
// Importing this module (done early via AuthContext) initializes it once.
initApi({
  client: supabase,
  appOrigin: typeof window !== 'undefined' ? window.location.origin : '',
  uploadSigned: (target, file, onProgress) =>
    uploadSignedWithProgress(target, file.blob as Blob, onProgress),
})

import { createClient } from '@supabase/supabase-js'
import { initApi, classifyUploadFailure, mayRetry } from '@twinai/shared'

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
/** An upload failure that still carries the server's verdict. */
interface UploadError extends Error { status?: number }

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
        // ⚠️ THIS REACHES 1.0 WHEN THE BROWSER FINISHES WRITING THE BODY, not
        // when the server accepts it. A real creator watched it hit 100% and was
        // then refused for size. Callers must treat 1.0 as "uploading finished",
        // never as "saved" — see SaveStage in uploadCeiling.
        xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total) }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) { resolve(); return }
          // ⚠️ THE STATUS AND THE SERVER'S OWN WORDS ARE CARRIED OUT, not
          // replaced. `upload 413` alone cannot be classified, and the sentence
          // the creator was actually shown lives in the response body.
          const err = new Error(`upload ${xhr.status}: ${String(xhr.responseText ?? '').slice(0, 300)}`) as UploadError
          err.status = xhr.status
          reject(err)
        }
        xhr.onerror = () => reject(new Error('upload network error'))
        xhr.ontimeout = () => reject(new Error(`upload timed out after ${xhr.timeout}ms`))
        xhr.onabort = () => reject(new Error('upload aborted'))
        xhr.send(blob)
      })
      onProgress?.(1)
      return
    } catch (e) {
      // ⚠️ THE BARE `catch {}` THAT USED TO BE HERE IS THE REASON A FIVE-MINUTE
      // UPLOAD TOOK TEN. It discarded the error — status included — and silently
      // re-sent the ENTIRE blob through the supabase-js path below. For a size
      // rejection the second attempt is guaranteed to fail identically, so the
      // creator paid twice to be told once, and the real status code was thrown
      // away on the way past.
      //
      // ⚖️ THE FALLBACK IS FOR A BROKEN TRANSPORT, NOT A REFUSED REQUEST.
      const kind = classifyUploadFailure((e as UploadError)?.status ?? null, (e as Error)?.message)
      if (!mayRetry(kind)) throw e
    }
  }
  const { error } = await supabase.storage
    .from(target.bucket)
    .uploadToSignedUrl(target.path, target.token, blob, { contentType: target.contentType, upsert: true })
  if (error) throw error
  onProgress?.(1)
}

/** The access token the client already holds, without an await.
 *
 *  ⚠️ `getSession()` IS ASYNC AND THIS RUNS DURING `pagehide`, where a promise
 *  is a thing nobody will resolve. supabase-js keeps the session in localStorage
 *  under a project-scoped key; reading it directly is the only synchronous
 *  option, and a miss returns null rather than a guess — the caller then arms
 *  nothing instead of arming a beacon that would 401. */
function cachedAccessToken(): string | null {
  try {
    if (typeof localStorage === 'undefined' || !url) return null
    const ref = new URL(url).hostname.split('.')[0]
    const raw = localStorage.getItem(`sb-${ref}-auth-token`)
    if (!raw) return null
    const tok = (JSON.parse(raw) as { access_token?: unknown })?.access_token
    return typeof tok === 'string' && tok !== '' ? tok : null
  } catch {
    return null
  }
}

// Wire the web platform into the shared API layer (used by @twinai/shared/api).
// Importing this module (done early via AuthContext) initializes it once.
initApi({
  client: supabase,
  appOrigin: typeof window !== 'undefined' ? window.location.origin : '',
  uploadSigned: (target, file, onProgress) =>
    uploadSignedWithProgress(target, file.blob as Blob, onProgress),
  // ⚠️ READ AT SEND TIME, NOT AT INIT. The access token rotates; capturing it
  // once at startup would arm every later upload with a credential that expired
  // hours ago — and the failure would appear only as an abandonment that never
  // got recorded, which is indistinguishable from the silence we are fixing.
  //
  // ⚖️ SYNCHRONOUS ON PURPOSE. This is called inside a `pagehide` handler, where
  // an await is a promise nobody will ever resolve. `getSession()` is async, so
  // the token comes from the cached session the client already holds.
  beaconTarget: () => {
    const token = cachedAccessToken()
    if (!url || !anon || !token) return null
    return { url: `${url}/functions/v1/source-asset`, accessToken: token, apiKey: anon }
  },
})

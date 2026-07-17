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

// Upload a take with real progress. supabase-js `.upload()` exposes no progress
// events, so we PUT the bytes to the Storage REST endpoint via XHR (which does
// fire upload.onprogress) and report a 0..1 fraction. Any failure falls back to
// the battle-tested supabase-js upload so the critical path never regresses.
async function uploadTakeWithProgress(
  path: string,
  blob: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess.session?.access_token
  if (url && anon && token && typeof XMLHttpRequest !== 'undefined') {
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${url}/storage/v1/object/takes/${path}`)
        xhr.setRequestHeader('authorization', `Bearer ${token}`)
        xhr.setRequestHeader('apikey', anon)
        xhr.setRequestHeader('x-upsert', 'true')
        xhr.setRequestHeader('content-type', contentType)
        xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total) }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)))
        xhr.onerror = () => reject(new Error('upload network error'))
        xhr.send(blob)
      })
      onProgress?.(1)
      return
    } catch {
      // fall through to the supabase-js path below
    }
  }
  const { error } = await supabase.storage
    .from('takes')
    .upload(path, blob, { contentType, upsert: true })
  if (error) throw error
  onProgress?.(1)
}

// Upload to a server-SIGNED target (editor-v2 source flow) with real progress.
// The signed URL authorizes a PUT of exactly one object — no bucket INSERT
// policy involved, so every object provably has a media_assets intent row.
// XHR gives upload.onprogress; any failure falls back to supabase-js
// uploadToSignedUrl so the critical path never regresses.
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
        xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total) }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)))
        xhr.onerror = () => reject(new Error('upload network error'))
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
  uploadTake: (path, file, onProgress) =>
    uploadTakeWithProgress(path, file.blob as Blob, file.contentType || 'video/webm', onProgress),
  uploadSigned: (target, file, onProgress) =>
    uploadSignedWithProgress(target, file.blob as Blob, onProgress),
})

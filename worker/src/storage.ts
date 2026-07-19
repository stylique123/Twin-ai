import { createWriteStream } from 'node:fs'
import { once } from 'node:events'
import { writeFile, readFile, unlink } from 'node:fs/promises'
import { env } from './env.js'

// Minimal Supabase Storage client for the worker (service role → bypasses RLS).
// Storage helpers: pull a user's raw take / reference media, push job outputs.
const base = `${env.supabaseUrl}/storage/v1`
const auth = { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` }

// Download an object to a local path, STREAMING to disk with a hard byte cap.
// The single worker is the throughput bottleneck: buffering a whole object in
// memory (Buffer.from(await res.arrayBuffer())) let one large/corrupt take OOM
// the process and wedge the queue. We stream to disk and abort the moment we
// cross the cap (checking the declared content-length first, then enforcing it
// byte-by-byte in case the header is missing or lies).
export async function downloadObject(
  bucket: string, path: string, toFile: string,
  opts: { signal?: AbortSignal; chunkPauseMs?: number } = {},
): Promise<void> {
  const cap = env.maxDownloadBytes
  const res = await fetch(`${base}/object/${bucket}/${encodePath(path)}`, { headers: auth, signal: opts.signal })
  if (!res.ok) throw new Error(`storage download ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const declared = Number(res.headers.get('content-length') ?? '0')
  if (declared > cap) throw new Error(`storage download too large: ${declared} bytes > cap ${cap}`)
  if (!res.body) {
    // No stream (shouldn't happen on undici) — fall back to a capped buffer read.
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > cap) throw new Error(`storage download too large: ${buf.byteLength} bytes > cap ${cap}`)
    await writeFile(toFile, buf)
    return
  }
  // Pump the web stream to disk chunk-by-chunk, enforcing the cap as bytes
  // arrive (handles a missing/lying content-length) and honouring backpressure.
  const reader = (res.body as ReadableStream<Uint8Array>).getReader()
  const out = createWriteStream(toFile)
  let seen = 0
  try {
    for (;;) {
      if (opts.signal?.aborted) throw new Error('download aborted')
      const { done, value } = await reader.read()
      if (done) break
      seen += value.byteLength
      if (seen > cap) throw new Error(`storage download too large: exceeded cap ${cap} bytes`)
      if (!out.write(value)) await once(out, 'drain')
      // Matrix-only throttle: widens the during-download window so mid-transfer
      // cancellation is provable; 0 (production) adds nothing.
      if (opts.chunkPauseMs) await new Promise((r) => setTimeout(r, opts.chunkPauseMs))
    }
    out.end()
    await once(out, 'finish')
  } catch (e) {
    out.destroy()
    await reader.cancel().catch(() => {})
    await unlink(toFile).catch(() => {})
    throw e
  }
}

// HEAD an object: existence + size + etag, without downloading. Used by
// validate_source to prove the bytes it is about to download are the SAME
// bytes finalize saw (etag match) — an upload token replayed after finalize
// must not let different content get validated.
export async function headObject(bucket: string, path: string): Promise<{ sizeBytes: number; etag: string | null } | null> {
  const res = await fetch(`${base}/object/${bucket}/${encodePath(path)}`, { method: 'HEAD', headers: auth })
  if (!res.ok) return null
  return {
    sizeBytes: Number(res.headers.get('content-length') ?? '0'),
    etag: res.headers.get('etag'),
  }
}

// Upload a local file (overwrites if present).
export async function uploadObject(bucket: string, path: string, fromFile: string, contentType: string): Promise<void> {
  const body = await readFile(fromFile)
  const res = await fetch(`${base}/object/${bucket}/${encodePath(path)}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': contentType, 'x-upsert': 'true' },
    body,
  })
  if (!res.ok) throw new Error(`storage upload ${res.status}: ${(await res.text()).slice(0, 160)}`)
}

// Create a time-limited signed URL the browser can play/download.
export async function signObject(bucket: string, path: string, expiresInSecs: number): Promise<string> {
  const res = await fetch(`${base}/object/sign/${bucket}/${encodePath(path)}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: expiresInSecs }),
  })
  if (!res.ok) throw new Error(`storage sign ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const data = (await res.json()) as { signedURL?: string }
  if (!data.signedURL) throw new Error('storage sign: no signedURL')
  return `${env.supabaseUrl}/storage/v1${data.signedURL}`
}

// Encode each path segment but keep the slashes.
function encodePath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/')
}

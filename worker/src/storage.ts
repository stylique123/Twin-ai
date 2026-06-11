import { writeFile, readFile } from 'node:fs/promises'
import { env } from './env.js'

// Minimal Supabase Storage client for the worker (service role → bypasses RLS).
// Used by the auto-editor: pull the user's raw take, push the finished render.
const base = `${env.supabaseUrl}/storage/v1`
const auth = { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` }

// Download an object to a local path.
export async function downloadObject(bucket: string, path: string, toFile: string): Promise<void> {
  const res = await fetch(`${base}/object/${bucket}/${encodePath(path)}`, { headers: auth })
  if (!res.ok) throw new Error(`storage download ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(toFile, buf)
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

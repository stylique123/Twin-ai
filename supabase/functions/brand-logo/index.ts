// Supabase Edge Function: brand-logo
// Uploads a brand-kit logo to the `edits` bucket (which allows PNG/JPEG) on the
// caller's behalf — the client has no insert policy on that bucket, so a tiny
// service-role hop does the write, then the client saves the returned path into
// brand_voices.brand_kit. The auto-edit worker reads it back to burn it in.
//
//   POST { image_base64, content_type } -> { path }

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const MAX_BYTES = 3 * 1024 * 1024 // 3MB

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Not authenticated' }, 401)

  let body: { image_base64?: string; content_type?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const b64 = (body.image_base64 ?? '').replace(/^data:[^;]+;base64,/, '')
  const ct = body.content_type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
  if (!b64) return json({ error: 'image_base64 is required' }, 400)

  let bytes: Uint8Array
  try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) } catch { return json({ error: 'Bad base64' }, 400) }
  if (bytes.byteLength > MAX_BYTES) return json({ error: 'Logo too large (max 3MB).' }, 413)

  const ext = ct === 'image/jpeg' ? 'jpg' : 'png'
  const path = `${user.id}/brandkit/logo-${Date.now()}.${ext}`
  const up = await admin.storage.from('edits').upload(path, bytes, { contentType: ct, upsert: true })
  if (up.error) return json({ error: up.error.message }, 500)
  return json({ path })
})

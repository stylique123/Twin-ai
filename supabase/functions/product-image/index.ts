// Supabase Edge Function: product-image
// Uploads a photo of a PRODUCT to the `edits` bucket on the caller's behalf —
// the client has no insert policy on that bucket, so a tiny service-role hop
// does the write and returns the path. The worker later reads those paths and
// asks a vision model what it can see.
//
//   POST { image_base64, content_type } -> { path }
//
// ⚖️ A SEPARATE FUNCTION FROM `brand-logo`, NOT A `kind` PARAMETER ON IT. The two
// uploads look identical and mean different things: a logo is BRANDING and is
// applied to renders, while these are EVIDENCE and feed the claim rules. Sharing
// one endpoint would mean one path prefix, and the first person to list a
// creator's logos would get their product photos too.
//
// ⚠️ WHAT THE IMAGES MAY ESTABLISH IS DECIDED ELSEWHERE AND DELIBERATELY. See
// `imageFactAllowed` in productExtraction: a photograph can establish what a
// thing is and what it looks like, and never its price, plan, guarantee, benefit
// or claim. This endpoint only stores bytes; it grants nothing.

import { createClient } from 'jsr:@supabase/supabase-js@2.112.2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const MAX_BYTES = 6 * 1024 * 1024 // 6MB — a phone photo, unresized

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
  // ⚖️ AN ALLOW-LIST, NOT A PASS-THROUGH. The stored content type is what the
  // worker later hands the vision model as `mimeType`, so an unrecognised value
  // is refused rather than defaulted — a mislabelled image is a model call that
  // fails for a reason nobody can read.
  const ct = body.content_type === 'image/jpeg' ? 'image/jpeg'
    : body.content_type === 'image/webp' ? 'image/webp'
      : body.content_type === 'image/png' ? 'image/png'
        : null
  if (!b64) return json({ error: 'image_base64 is required' }, 400)
  if (!ct) return json({ error: 'Please upload a PNG, JPEG or WebP image.' }, 400)

  let bytes: Uint8Array
  try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) } catch { return json({ error: 'Bad base64' }, 400) }
  if (bytes.byteLength > MAX_BYTES) return json({ error: 'That image is too large (max 6MB).' }, 413)

  // ⚠️ OWNER-PREFIXED, WHICH IS WHAT THE WORKER VERIFIES BEFORE READING. Every
  // storage reader in this tree refuses a path that does not start with the
  // owner's id, so a path that skipped this prefix would be stored and then
  // silently ignored — an upload that appears to work and does nothing.
  const ext = ct === 'image/jpeg' ? 'jpg' : ct === 'image/webp' ? 'webp' : 'png'
  const path = `${user.id}/products/${crypto.randomUUID()}.${ext}`
  const up = await admin.storage.from('edits').upload(path, bytes, { contentType: ct, upsert: false })
  if (up.error) {
    console.error('product-image: upload failed', up.error)
    return json({ error: 'Could not save that image. Please try again.' }, 500)
  }
  return json({ path })
})

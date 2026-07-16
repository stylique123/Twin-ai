// Supabase Edge Function: generate-thumbnail
// On-demand: renders an AI cover image from a generation's packaging brief
// (blueprint.packaging.thumbnail) using Gemini's image model, stores it in the
// private `edits` bucket, and returns a signed URL. Called ONLY on a creator tap,
// so it costs nothing unless asked for. Rate-limited to bound the paid image calls.
//
// Deploy:  supabase functions deploy generate-thumbnail
// Secrets: GEMINI_API_KEY (shared); optional GEMINI_IMAGE_MODEL

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

type Thumb = { concept?: string; text_overlay?: string; expression?: string; composition?: string; colors?: string }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) return json({ error: 'Server missing GEMINI_API_KEY' }, 500)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''

  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
  const admin = createClient(supabaseUrl, serviceKey)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Not authenticated' }, 401)

  // Bound the paid image calls: a burst guard + a generous daily cap per user.
  const { data: burstOk } = await admin.rpc('check_rate_limit', { p_user: user.id, p_action: 'thumbnail', p_max: 6, p_window_secs: 60 })
  if (burstOk === false) return json({ error: 'Easy there — give it a few seconds between thumbnails.' }, 429)
  const { data: dailyOk } = await admin.rpc('check_rate_limit', { p_user: user.id, p_action: 'thumbnail_daily', p_max: Number(Deno.env.get('THUMBNAIL_DAILY_CAP') ?? '30'), p_window_secs: 86400 })
  if (dailyOk === false) return json({ error: "You've generated a lot of thumbnails today. Try again in a few hours." }, 429)

  let body: { generation_id?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }
  const generationId = (body.generation_id ?? '').trim()
  if (!generationId) return json({ error: 'generation_id is required' }, 400)

  // Load the generation (owner-checked) + its packaging brief.
  const { data: gen } = await admin
    .from('generations')
    .select('id, user_id, brand_voice_id, blueprint')
    .eq('id', generationId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!gen) return json({ error: 'Generation not found' }, 404)

  const thumb = ((gen.blueprint as { packaging?: { thumbnail?: Thumb } } | null)?.packaging?.thumbnail ?? null) as Thumb | null
  if (!thumb || !(thumb.concept || thumb.text_overlay || thumb.composition)) {
    return json({ error: 'This plan has no thumbnail brief yet — regenerate the plan first.' }, 400)
  }

  // Pull the creator's real palette (if set) so the thumbnail is on-brand.
  let paletteHex = ''
  if (gen.brand_voice_id) {
    const { data: bv } = await admin.from('brand_voices').select('brand_kit').eq('id', gen.brand_voice_id).maybeSingle()
    const pal = (bv?.brand_kit as { palette?: { primary?: string; secondary?: string; highlight?: string } } | null)?.palette ?? null
    paletteHex = [pal?.primary, pal?.secondary, pal?.highlight].filter(Boolean).join(', ')
  }

  const prompt = `Create a vertical 9:16 mobile short-form video COVER/thumbnail image, high-contrast and scroll-stopping, photographic and professional.
Visual concept: ${thumb.concept || 'a bold cover frame for a short video'}.
Scene and composition: ${thumb.composition || 'a clean, striking scene with one clear focal object'} — build it from the SUBJECT, OBJECTS, PRODUCT and SETTING of the concept.
Add large, bold, easily readable on-image text that says exactly: "${thumb.text_overlay || ''}". Keep the text short, high-contrast, and legible at thumbnail size; do not misspell it.
Color treatment: ${thumb.colors || 'punchy and vibrant'}${paletteHex ? `. Use these brand colors for the text and accents: ${paletteHex}` : ''}.
CRITICAL: do NOT include any human face, person, portrait, hands, or body — NO people at all. We do not have the creator's likeness, so any fabricated face would misrepresent them. Use only objects, product, environment, graphic shapes, and bold typography.
No borders, no watermark, no UI chrome, no fake play button.`

  const model = Deno.env.get('GEMINI_IMAGE_MODEL') ?? 'gemini-2.5-flash-image'
  // The image model intermittently returns empty / overloads / hits a safety no-op.
  // Retry a couple of times before giving up so a transient blip doesn't read as a
  // hard failure to the creator (the "could not render, try again" complaint).
  const attemptOnce = async (): Promise<{ b64: string; mime: string }> => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 40_000)
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } }),
      })
      if (!res.ok) throw new Error(`Image model ${res.status}: ${(await res.text()).slice(0, 300)}`)
      const data = await res.json()
      const parts = data?.candidates?.[0]?.content?.parts ?? []
      // deno-lint-ignore no-explicit-any
      const imgPart = parts.find((p: any) => p?.inlineData?.data)
      if (!imgPart) throw new Error('No image returned by the model')
      return { b64: imgPart.inlineData.data, mime: imgPart.inlineData.mimeType || 'image/png' }
    } finally {
      clearTimeout(timer)
    }
  }

  let b64 = ''
  let mime = 'image/png'
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await attemptOnce()
      b64 = r.b64; mime = r.mime
      break
    } catch (err) {
      lastErr = err
      console.error(`generate-thumbnail: attempt ${attempt + 1}/3 failed`, err instanceof Error ? err.message : err)
      // M9: back off with jitter between retries instead of hammering the paid image
      // API instantly (which amplifies provider overload). ~0.6s, ~1.4s.
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1) + Math.floor(Math.random() * 400)))
    }
  }
  if (!b64) {
    console.error('generate-thumbnail: all attempts failed', lastErr)
    return json({ error: 'The image engine is busy right now. Please tap again in a moment.' }, 502)
  }

  // base64 -> bytes
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)

  const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png'
  // The `edits` read policy allows a user to sign objects whose FIRST path folder is
  // their workspace id: (storage.foldername(name))[1] IN workspace_peers(). So the
  // user id MUST lead the path — otherwise the creator can't sign their own cover on
  // reload (the edge fn signs once with the service role, but the client can't).
  // `${user.id}/ai-thumb/…` keeps covers grouped yet inside the owner's folder.
  const path = `${user.id}/ai-thumb/${generationId}-${Date.now()}.${ext}`
  const { error: upErr } = await admin.storage.from('edits').upload(path, bytes, { contentType: mime, upsert: true })
  if (upErr) {
    console.error('generate-thumbnail: upload failed', upErr)
    return json({ error: 'Could not save the thumbnail. Please try again.' }, 500)
  }

  // Persist the path (service role) so the plan can re-show it for free, and sign
  // it for immediate display.
  await admin.from('generations').update({ ai_thumb_path: path }).eq('id', generationId)
  const { data: signed } = await admin.storage.from('edits').createSignedUrl(path, 60 * 60 * 24 * 30)

  await admin
    .from('analytics_events')
    .insert({ user_id: user.id, event: 'thumbnail_generated', props: { generation_id: generationId } })
    .then(() => {}, () => {})

  return json({ path, url: signed?.signedUrl ?? '' })
})

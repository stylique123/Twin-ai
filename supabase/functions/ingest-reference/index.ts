// Supabase Edge Function: ingest-reference
// Enqueues a worker `ingest` job for a reference URL (the worker downloads audio,
// transcribes it, and derives the real structure). Returns the job id; the
// frontend watches the job until done, then passes the resulting transcript_id
// to generate-blueprint so the blueprint is built from the REAL video.
//
// Deploy: supabase functions deploy ingest-reference

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

// Mirror the worker's SSRF allow-list — reject early, before enqueuing.
const ALLOWED = ['tiktok.com', 'instagram.com', 'youtube.com', 'youtu.be']
function allowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return false
    const h = u.hostname.toLowerCase()
    return ALLOWED.some((d) => h === d || h.endsWith('.' + d))
  } catch {
    return false
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''

  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const admin = createClient(supabaseUrl, serviceKey)

  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Not authenticated' }, 401)

  let body: { url?: string; platform?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const url = (body.url ?? '').trim()
  if (!url || url.length > 2048) return json({ error: 'A valid reference URL is required.' }, 400)
  if (!allowedUrl(url)) {
    return json({ error: 'For now we can analyze TikTok, Instagram, and YouTube links.' }, 400)
  }
  const platform = ['tiktok', 'instagram', 'youtube', 'other'].includes(body.platform ?? '')
    ? body.platform!
    : null

  // CACHE: if this exact reference was already transcribed + structured recently,
  // clone it into the caller's own row (server-side) and return a job that's
  // already done — skipping yt-dlp/Apify + whisper + the structure Gemini call.
  // Must match the worker's urlKey() normalization.
  const urlKey = (() => {
    try {
      const u = new URL(url)
      const host = u.hostname.toLowerCase().replace(/^www\./, '')
      const v = u.searchParams.get('v')
      const path = u.pathname.replace(/\/+$/, '').toLowerCase()
      return host + path + (v ? `?v=${v.toLowerCase()}` : '')
    } catch {
      return url.toLowerCase().trim()
    }
  })()
  const { data: cachedId } = await admin.rpc('clone_cached_transcript', { p_url_key: urlKey, p_owner: user.id })
  if (cachedId) {
    const { data: doneJob } = await admin
      .from('jobs')
      .insert({ owner_id: user.id, type: 'ingest', status: 'done', payload: { url, platform }, result: { transcript_id: cachedId, cached: true } })
      .select('id')
      .single()
    return json({ job_id: doneJob?.id ?? null, status: 'done', transcript_id: cachedId, cached: true })
  }

  // Transcription is real compute — rate-limit ingest per user.
  const { data: allowed } = await admin.rpc('check_rate_limit', {
    p_user: user.id,
    p_action: 'ingest',
    p_max: 20,
    p_window_secs: 3600,
  })
  if (allowed === false) {
    return json({ error: "You've analyzed a lot of videos recently — give it a few minutes." }, 429)
  }

  const { data: job, error } = await admin
    .from('jobs')
    .insert({ owner_id: user.id, type: 'ingest', status: 'queued', payload: { url, platform } })
    .select('id')
    .single()
  if (error || !job) {
    console.error('ingest-reference: enqueue failed', error)
    return json({ error: 'Could not start analysis. Please try again.' }, 500)
  }

  return json({ job_id: job.id, status: 'queued' })
})

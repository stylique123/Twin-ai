// Supabase Edge Function: start-dna
// Begins a Brand-DNA build for a creator handle: validates the handle, kicks off
// the Apify profile scrape asynchronously, creates a `brand_voices` row (status
// building) plus a `build_dna` job, and returns the brand voice + job ids. The
// frontend then polls `dna-poll` (or watches the row) until it goes ready.
//
// Deploy:  supabase functions deploy start-dna
// Secrets: APIFY_TOKEN, GEMINI_API_KEY (shared with generate-blueprint)

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cors, json, normalizeHandle, startApifyRun, type Platform } from '../_shared/dna.ts'

const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube', 'other']

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

  let body: { handle?: string; platform?: string; make_default?: boolean }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const handle = normalizeHandle(body.handle ?? '')
  if (!handle) return json({ error: 'A handle is required.' }, 400)
  if (handle.length > 60) return json({ error: 'That handle looks too long.' }, 400)

  const platform: Platform = PLATFORMS.includes(body.platform as Platform)
    ? (body.platform as Platform)
    : 'tiktok'
  const makeDefault = body.make_default !== false // default voices unless told otherwise

  // Create the brand voice row first so the frontend has something to watch.
  const { data: voice, error: voiceErr } = await admin
    .from('brand_voices')
    .insert({
      owner_id: user.id,
      handle,
      platform,
      label: `@${handle}`,
      status: 'building',
      is_default: makeDefault,
    })
    .select('*')
    .single()
  if (voiceErr || !voice) {
    console.error('start-dna: voice insert failed', voiceErr)
    return json({ error: 'Could not start. Please try again.' }, 500)
  }

  // Kick the Apify scrape asynchronously. If Apify isn't configured/healthy,
  // fail the voice cleanly so the UI can fall back to the manual quiz.
  try {
    const runId = await startApifyRun(platform, handle)
    const { data: job } = await admin
      .from('jobs')
      .insert({
        owner_id: user.id,
        type: 'build_dna',
        status: 'running',
        payload: { brand_voice_id: voice.id, apify_run_id: runId, handle, platform },
      })
      .select('id')
      .single()
    return json({ brand_voice_id: voice.id, job_id: job?.id ?? null, status: 'building' })
  } catch (err) {
    console.error('start-dna: apify start failed', err)
    await admin
      .from('brand_voices')
      .update({ status: 'failed', error: 'Could not reach the scraper.' })
      .eq('id', voice.id)
    return json(
      { error: 'Voice scan is unavailable right now — you can set up your voice manually.', brand_voice_id: voice.id },
      503,
    )
  }
})

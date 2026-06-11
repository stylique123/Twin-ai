// Supabase Edge Function: dna-poll
// Advances a build_dna job. The frontend calls this on an interval while a brand
// voice is "building". It is idempotent: it checks the Apify run, and the first
// time the scrape has SUCCEEDED it synthesizes the voice profile (Gemini) and
// flips the brand voice to "ready". Returns the current status either way.
//
// This is the serverless stand-in for the worker loop — no separate host needed
// for the text-only DNA build. (Video transcription stays a worker enhancement.)
//
// Deploy:  supabase functions deploy dna-poll

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { cors, extractPosts, json, pollApifyRun, synthesizeVoice, type Platform } from '../_shared/dna.ts'

const MAX_ATTEMPTS = Number(Deno.env.get('DNA_MAX_POLLS') ?? '40')

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

  let body: { brand_voice_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const voiceId = (body.brand_voice_id ?? '').trim()
  if (!voiceId) return json({ error: 'brand_voice_id is required' }, 400)

  // Load the voice (ownership enforced) and its job.
  const { data: voice } = await admin
    .from('brand_voices')
    .select('*')
    .eq('id', voiceId)
    .eq('owner_id', user.id)
    .single()
  if (!voice) return json({ error: 'Brand voice not found' }, 404)

  // Already settled — nothing to advance.
  if (voice.status === 'ready') return json({ status: 'ready', profile: voice.profile })
  if (voice.status === 'failed') return json({ status: 'failed', error: voice.error })

  const { data: job } = await admin
    .from('jobs')
    .select('*')
    .eq('type', 'build_dna')
    .eq('owner_id', user.id)
    .contains('payload', { brand_voice_id: voiceId })
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!job) {
    await admin.from('brand_voices').update({ status: 'failed', error: 'Lost the scan job.' }).eq('id', voiceId)
    return json({ status: 'failed', error: 'Lost the scan job.' }, 200)
  }

  const fail = async (msg: string) => {
    await admin.from('jobs').update({ status: 'failed', error: msg }).eq('id', job.id)
    await admin.from('brand_voices').update({ status: 'failed', error: msg }).eq('id', voiceId)
    return json({ status: 'failed', error: msg })
  }

  if (job.attempts >= MAX_ATTEMPTS) {
    return await fail('Scan took too long. You can set up your voice manually.')
  }

  try {
    const { status, items } = await pollApifyRun(job.payload.apify_run_id as string)
    await admin.from('jobs').update({ attempts: job.attempts + 1 }).eq('id', job.id)

    if (status === 'RUNNING') return json({ status: 'building' })
    if (status !== 'SUCCEEDED') return await fail('The scan could not finish. Try again or set up manually.')

    // Scrape done — synthesize the voice once and persist it.
    const posts = extractPosts(items ?? [])
    const profile = await synthesizeVoice(voice.handle, voice.platform as Platform, posts)

    await admin
      .from('brand_voices')
      .update({ status: 'ready', profile, error: null })
      .eq('id', voiceId)
    await admin
      .from('jobs')
      .update({ status: 'done', result: { posts_used: posts.length } })
      .eq('id', job.id)

    return json({ status: 'ready', profile })
  } catch (err) {
    console.error('dna-poll error:', err)
    return await fail('Something went wrong building your voice. You can set it up manually.')
  }
})

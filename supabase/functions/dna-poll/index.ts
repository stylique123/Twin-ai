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
import {
  cors,
  extractPosts,
  computeStats,
  extractImageUrls,
  extractProfileBio,
  extractVideoUrls,
  isPrivateProfile,
  json,
  pollApifyRun,
  postsOwnedBy,
  synthesizeVoice,
  type InlineImage,
  type Platform,
} from '../_shared/dna.ts'

const MAX_ATTEMPTS = Number(Deno.env.get('DNA_MAX_POLLS') ?? '60')

// Best-effort: fetch a few post thumbnails so the synth can read the real palette
// from the imagery (Gemini vision). Some CDNs (e.g. Instagram's scontent) can 403 a
// server IP — we simply skip any that fail and fall back to caption-only inference.
async function fetchInlineImages(urls: string[], max = 4): Promise<InlineImage[]> {
  const out: InlineImage[] = []
  for (const url of urls.slice(0, max)) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 6000)
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' },
      })
      clearTimeout(t)
      if (!res.ok) continue
      const mimeType = res.headers.get('content-type') || 'image/jpeg'
      if (!mimeType.startsWith('image/')) continue
      const buf = new Uint8Array(await res.arrayBuffer())
      if (!buf.byteLength || buf.byteLength > 3_000_000) continue // thumbnails are small; skip huge originals
      let bin = ''
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
      out.push({ mimeType, data: btoa(bin) })
    } catch {
      // skip this image — never let a bad thumbnail fail the whole synthesis
    }
  }
  return out
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

  // Bound client polling: each call hits the Apify status API and, on the ready
  // flip, a Gemini synthesis. Keep a tight loop from hammering the providers.
  const { data: allowed } = await admin.rpc('check_rate_limit', {
    p_user: user.id,
    p_action: 'dna_poll',
    p_max: 60,
    p_window_secs: 60,
  })
  if (allowed === false) {
    return json({ error: 'Polling too fast. Slow down and try again shortly.' }, 429)
  }

  let body: { brand_voice_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const voiceId = (body.brand_voice_id ?? '').trim()
  if (!voiceId) return json({ error: 'brand_voice_id is required' }, 400)

  // Load the voice (ownership enforced). Select only the columns we use — `select('*')`
  // pulled every column incl. the large profile JSON on every poll.
  const { data: voice } = await admin
    .from('brand_voices')
    .select('status, handle, platform, error, profile, brand_kit')
    .eq('id', voiceId)
    .eq('owner_id', user.id)
    .single()
  if (!voice) return json({ error: 'Brand voice not found' }, 404)

  // Already settled — nothing to advance.
  if (voice.status === 'ready') return json({ status: 'ready', profile: voice.profile })
  if (voice.status === 'failed') return json({ status: 'failed', error: voice.error })

  // One lookup for whichever DNA job exists: Apify `build_dna` (Instagram/YouTube)
  // or worker `scrape_dna` (TikTok). Avoids a second round-trip on the TikTok path.
  const { data: job } = await admin
    .from('jobs')
    .select('id, type, attempts, payload')
    .in('type', ['build_dna', 'scrape_dna'])
    .eq('owner_id', user.id)
    .contains('payload', { brand_voice_id: voiceId })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!job) {
    await admin.from('brand_voices').update({ status: 'failed', error: 'Lost the scan job.' }).eq('id', voiceId)
    return json({ status: 'failed', error: 'Lost the scan job.' }, 200)
  }

  // Worker-built DNA (TikTok via yt-dlp) has no Apify run to poll — the worker
  // updates the row directly (ready/failed), which the early returns above report.
  if (job.type === 'scrape_dna') return json({ status: 'building' })

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
    // A transient Apify hiccup (FAILED/TIMED-OUT/ABORTED) shouldn't kill the scan — keep
    // polling (attempts is bumped above); the MAX_ATTEMPTS guard ends it if it never recovers.
    if (status !== 'SUCCEEDED') return json({ status: 'building' })

    // Scrape done. A PRIVATE account can't be read; the actor returns OTHER
    // profiles' posts (Instagram) or none — refuse rather than build a voice from
    // content that isn't theirs. IG stamps `private`, TikTok `authorMeta.privateAccount`.
    const allItems = items ?? []
    if (isPrivateProfile(allItems)) {
      return await fail(
        `@${voice.handle} is private, so we can't read its posts — and we won't build a voice from ` +
          `anyone else's. Make it public for a moment, pick a public account, or set up your voice manually.`,
      )
    }
    // Backstop on every platform: only ever synthesize from posts the requested
    // handle actually OWNS, so related/tagged profiles can never leak into the voice.
    const ownItems = postsOwnedBy(allItems, voice.handle)

    // If nothing readable remains, the account is private, empty, or mistyped. Do
    // NOT fabricate a voice from nothing — fail honestly instead.
    const posts = extractPosts(ownItems)
    if (posts.length === 0) {
      return await fail(
        `We couldn't read any public posts from @${voice.handle}. If that account is private or empty, ` +
          `make it public for a moment, try a different public account, or set up your voice manually — ` +
          `we won't guess a voice we can't actually see.`,
      )
    }
    const bio = extractProfileBio(ownItems)

    // Atomically claim the synthesis so two concurrent polls (interval + a manual
    // refresh) can't both pay for a Gemini call: only the poll that flips the job
    // running->synthesizing proceeds; the other reports building. A stuck claim
    // self-heals via the MAX_ATTEMPTS check above.
    const { data: claim } = await admin
      .from('jobs')
      .update({ status: 'synthesizing' })
      .eq('id', job.id)
      .eq('status', 'running')
      .select('id')
      .maybeSingle()
    if (!claim) return json({ status: 'building' })

    // Read the real brand palette from the creator's actual post imagery (Gemini
    // vision) instead of guessing from captions. Best-effort — skipped images just
    // fall back to caption-only color inference.
    const inlineImages = await fetchInlineImages(extractImageUrls(ownItems, 4))
    const profile = await synthesizeVoice(voice.handle, voice.platform as Platform, posts, bio, inlineImages)
    const stats = computeStats(ownItems, posts)

    // Auto-fill the brand palette from the colors read off the imagery — but NEVER
    // clobber a palette the creator hand-picked ('manual'). A previously auto-learned
    // palette (or a legacy one with no source) IS refreshed, so re-scanning fixes an
    // earlier wrong guess. Only valid #RRGGBB values are kept.
    const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : undefined)
    const bc = (profile as { brand_colors?: { primary?: unknown; secondary?: unknown; highlight?: unknown } } | null)?.brand_colors
    const inferred = bc ? Object.fromEntries(Object.entries({ primary: hex(bc.primary), secondary: hex(bc.secondary), highlight: hex(bc.highlight) }).filter(([, v]) => v)) : {}
    const existingKit = (voice.brand_kit as { palette?: Record<string, string>; palette_source?: string } | null) ?? null
    const brandKitPatch = (existingKit?.palette_source !== 'manual' && Object.keys(inferred).length)
      ? { brand_kit: { ...existingKit, palette: inferred, palette_source: 'auto' } }
      : {}

    await admin
      .from('brand_voices')
      .update({ status: 'ready', profile, stats, error: null, ...brandKitPatch })
      .eq('id', voiceId)
    await admin
      .from('jobs')
      .update({ status: 'done', result: { posts_used: posts.length } })
      .eq('id', job.id)

    // Cache this synthesis so other users scanning the same handle skip the paid
    // scrape + synth. Written to the service-role `dna_cache` (never the
    // user-writable brand_voices.profile). Best-effort — never block the response.
    await admin
      .from('dna_cache')
      .upsert(
        { handle: voice.handle, platform: voice.platform, profile, created_at: new Date().toISOString() },
        { onConflict: 'handle,platform' },
      )

    // Data layer: a voice was built (activation funnel).
    await admin
      .from('analytics_events')
      .insert({ user_id: user.id, event: 'voice_built', time_saved_minutes: 15, props: { brand_voice_id: voiceId, platform: voice.platform } })
      .then(() => {}, () => {})

    // The caption voice is live now. Enqueue an audio upgrade: the worker
    // transcribes the creator's top videos and re-synthesizes from their actual
    // SPOKEN voice. Best-effort — if no worker is running, the caption voice
    // stays usable and this job simply waits.
    try {
      const urls = extractVideoUrls(ownItems, 5)
      if (urls.length) {
        await admin.from('jobs').insert({
          owner_id: user.id,
          type: 'build_voice',
          status: 'queued',
          // best-effort upgrade — NEVER retry: each retry re-runs up to 5 paid Apify
          // transcript calls, so a default 5 attempts could mean 25 paid calls (#10).
          max_attempts: 1,
          payload: { brand_voice_id: voiceId, handle: voice.handle, platform: voice.platform, urls },
        })
      }
    } catch (e) {
      console.error('dna-poll: could not enqueue build_voice', e)
    }

    return json({ status: 'ready', profile })
  } catch (err) {
    console.error('dna-poll error:', err)
    // Reset the job status back to 'running' so that a subsequent poll can retry the synthesis.
    // This protects against transient Gemini API overloads or Deno edge network timeouts.
    try {
      await admin.from('jobs').update({ status: 'running' }).eq('id', job.id)
    } catch (dbErr) {
      console.error('Failed to reset job status to running:', dbErr)
    }
    // Return building so the frontend keeps polling and retrying instead of showing a hard failure.
    return json({ status: 'building' })
  }
})

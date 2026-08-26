// Supabase Edge Function: start-dna
// Begins a Brand-DNA build for a creator handle: validates the handle, enforces
// the plan's brand-voice limit, kicks off the Apify profile scrape, creates (or
// reuses) a `brand_voices` row plus a `build_dna` job, and returns the ids. The
// frontend then polls `dna-poll` (or watches the row) until it goes ready.
//
// Deploy:  supabase functions deploy start-dna
// Secrets: APIFY_TOKEN, GEMINI_API_KEY (shared with generate-blueprint)

import { createClient } from 'jsr:@supabase/supabase-js@2.112.2'
import { cors, json, normalizeHandle, startApifyRun, type Platform } from '../_shared/dna.ts'
import { monthlyScanCeiling, scanAllowance } from '../_shared/scanCeiling.ts'

const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube', 'other']

// Brand voices included per plan. Non-agency plans are single-brand by design
// ("one voice profile per client" is the agency moat). Tunable later via billing.
const BRAND_LIMIT: Record<string, number> = { free: 1, aspiring: 1, professional: 1, studio: 1, agency: 15 }

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

  let body: { handle?: string; platform?: string; make_default?: boolean; refresh?: boolean; replace?: boolean; manual?: boolean }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  // A MANUAL setup skips the scrape entirely: the creator describes their own
  // voice in the confirm form (which saves a real, editable profile and marks the
  // row ready). This is the "no big account / scan is down" escape so a first run
  // can never dead-end. No Apify, no worker, no rate-limit needed.
  const isManual = body.manual === true
  // A REFRESH re-scans the creator's OWN existing voice to pull fresh stats + a
  // sharpened profile. It must SUPPORT, never hinder: it may re-scan a voice that
  // is already 'ready' (no "you already have a voice" wall) and it reads live data
  // instead of the cache. The existing profile stays intact throughout, so the
  // voice remains usable while the refresh runs, and a failed refresh leaves the
  // current voice exactly as it was (dna-poll/worker won't downgrade a voice that
  // still has a usable profile).
  const isRefresh = body.refresh === true
  // A REPLACE (onboarding only) repoints the creator's SINGLE voice slot to a new
  // handle/platform. When someone starts a scan, then taps Back (often within a
  // second, or after picking the wrong platform) and re-picks, we must not create a
  // second voice or wall them behind "you already have a voice" / the brand limit —
  // we reuse their one slot. Guarded to the classic onboarding case (≤1 voice).
  const isReplace = body.replace === true

  // Manual setups don't require a handle (the creator may have no account to scan);
  // fall back to a stable label so the row/reuse logic still works.
  const handle = normalizeHandle(body.handle ?? '') || (isManual ? 'my-voice' : '')
  if (!handle) return json({ error: 'A handle is required.' }, 400)
  if (handle.length > 60) return json({ error: 'That handle looks too long.' }, 400)

  const platform: Platform = PLATFORMS.includes(body.platform as Platform)
    ? (body.platform as Platform)
    : 'tiktok'
  const makeDefault = body.make_default !== false // default voices unless told otherwise

  // Each scan starts a paid Apify run, and a user can scan ANY handle (by design).
  // Cap scans per user/hour so the feature can't be scripted to burn our scraper
  // budget (the "extra cost / API attack" the security panel flagged). Manual
  // setups spend nothing, so they skip the limit.
  if (!isManual) {
    const { data: allowed } = await admin.rpc('check_rate_limit', {
      p_user: user.id,
      p_action: 'dna_build',
      p_max: 8,
      p_window_secs: 3600,
    })
    if (allowed === false) {
      return json(
        { error: "You've started several voice scans recently — give it a few minutes." },
        429,
      )
    }

    // ── AND A CEILING FOR THE MONTH, NOT ONLY A LIMIT FOR THE HOUR ──────────
    //
    // ⚠️ THE HOURLY LIMIT ABOVE LEAVES ~5,760 SCANS A MONTH OPEN. Eight an hour,
    // every hour, each one able to spend Apify and Gemini budget, and nothing
    // counts the total. `rate_events` cannot answer it: `check_rate_limit`
    // deletes every row older than its window, so the table holds zero rows in
    // production by design. The ledger below is the durable half.
    //
    // ⚖️ THE ORDER IS READ, DECIDE, THEN WRITE. Writing first would charge a
    // creator for a scan that the ceiling then refuses.
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)
    const { count: usedRaw, error: countErr } = await admin
      .from('scan_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('billable', true)
      .gte('created_at', monthStart.toISOString())

    // ⚠️ A COUNT WE COULD NOT READ IS NOT ZERO. Treating a failed read as "0 used"
    // would turn every database hiccup into an unlimited budget; treating it as
    // "over the ceiling" would lock out paying creators over a transient. So the
    // scan proceeds and the event is still recorded — the ledger stays honest and
    // the next request, which can read, enforces. Absent is neither zero nor a
    // refusal.
    if (!countErr && typeof usedRaw === 'number') {
      // ⚖️ READ HERE RATHER THAN REUSED FROM BELOW. The plan read further down
      // selects only `plan` and runs after this gate; widening it and moving it
      // up would couple the brand-voice cap to the spend ceiling, and a future
      // edit to either would silently change the other.
      const { data: ent } = await admin
        .from('profiles').select('entitlements').eq('id', user.id).maybeSingle()
      const ceiling = monthlyScanCeiling(
        (ent?.entitlements ?? null) as Record<string, unknown> | null,
      )
      const verdict = scanAllowance(usedRaw, ceiling)
      if (!verdict.allowed) {
        console.warn(JSON.stringify({
          event: 'scan_ceiling_reached',
          user_id: user.id, used: verdict.used, ceiling: verdict.ceiling,
        }))
        return json({ error: verdict.message }, 429)
      }
    }

    // ⚖️ RECORDED EVEN WHEN THE COUNT COULD NOT BE READ, and never allowed to
    // fail the scan. A creator must not lose a voice build because our ledger
    // insert had a bad moment — but the row is what makes next month's count
    // true, so it is attempted every time.
    const { error: ledgerErr } = await admin.from('scan_events').insert({
      user_id: user.id, handle, platform, billable: true,
    })
    if (ledgerErr) {
      console.warn(JSON.stringify({
        event: 'scan_event_not_recorded', user_id: user.id, reason: ledgerErr.message,
      }))
    }
  }

  // Enforce the plan's brand-voice cap. Failed scans do NOT count (a failure must
  // never lock you out of your only slot), and retrying the SAME handle reuses its
  // row instead of piling up duplicates — the "4/1 brand voices" bug.
  // Independent reads — run them concurrently instead of one-after-another.
  const [{ data: profile }, { data: existing }] = await Promise.all([
    admin.from('profiles').select('plan').eq('id', user.id).single(),
    admin.from('brand_voices').select('id, handle, platform, status, is_default').eq('owner_id', user.id),
  ])
  const limit = BRAND_LIMIT[profile?.plan ?? 'free'] ?? 1
  const sameHandle = (existing ?? []).find((v) => v.handle === handle && v.platform === platform)
  const activeCount = (existing ?? []).filter((v) => v.status !== 'failed').length
  const defaultVoice = (existing ?? []).find((v) => v.is_default) ?? (existing ?? [])[0]

  let voiceId: string
  if (sameHandle) {
    if (sameHandle.status === 'ready' && !isRefresh && !isReplace) {
      // Already have a working voice for this exact handle — nothing to rebuild.
      // (An explicit refresh/replace is allowed through below to re-scan it.)
      return json({ error: `You already have a voice for @${handle} on ${platform}.`, brand_voice_id: sameHandle.id }, 409)
    }
    // Retry of a failed/stuck scan, OR an explicit refresh of a ready voice: reuse
    // the row so it never consumes a new brand-voice slot. The profile is left in
    // place (only status/error are touched), so the current voice keeps working
    // while the re-scan runs and a failed re-scan can restore it untouched.
    await admin
      .from('brand_voices')
      .update({ status: 'building', error: null, is_default: makeDefault })
      .eq('id', sameHandle.id)
    voiceId = sameHandle.id
  } else if (isReplace && defaultVoice && (existing ?? []).length <= 1) {
    // Onboarding redo: the creator abandoned a scan (wrong platform, or Back within
    // a second) and is now scanning a DIFFERENT handle. Repoint their single slot to
    // the new handle/platform and start clean — clearing the abandoned profile/stats/
    // kit so the old (wrong) handle can never linger as their voice, and never
    // tripping the brand-voice limit. Old scan jobs are dropped so dna-poll can't
    // resurrect the stale run.
    await admin.from('jobs').delete().eq('owner_id', user.id).contains('payload', { brand_voice_id: defaultVoice.id })
    await admin
      .from('brand_voices')
      .update({ handle, platform, label: `@${handle}`, status: 'building', error: null, is_default: makeDefault, profile: null, stats: null, brand_kit: null })
      .eq('id', defaultVoice.id)
    voiceId = defaultVoice.id
  } else {
    if (activeCount >= limit) {
      return json(
        {
          error: `Your plan includes ${limit} brand voice${limit > 1 ? 's' : ''}. Remove one or upgrade to add more.`,
          code: 'BRAND_LIMIT',
        },
        402,
      )
    }
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
      .select('id')
      .single()
    if (voiceErr || !voice) {
      console.error('start-dna: voice insert failed', voiceErr)
      return json({ error: 'Could not start. Please try again.' }, 500)
    }
    voiceId = voice.id
  }

  // MANUAL: no scrape. The row exists (status 'building'); the creator fills the
  // confirm form, which saves their profile and flips it to ready. Return now so
  // the client jumps straight to that form — the first run can never hang here.
  if (isManual) {
    return json({ brand_voice_id: voiceId, job_id: null, status: 'manual' })
  }

  // HANDLE CACHE: a creator's public voice is identical no matter who scans it, so
  // if anyone built this exact handle+platform recently we reuse that profile and
  // skip the paid scrape + synth entirely — repeat/popular handles go near-instant,
  // with zero quality change (same posts, same profile). Tunable via DNA_CACHE_DAYS.
  // Read from `dna_cache` (service-role only), NOT brand_voices.profile, which is
  // user-writable and could be tampered to poison every later scanner (see 0017).
  // A refresh deliberately skips the cache — the whole point is fresh stats + a
  // re-read of the latest posts, not a recent snapshot.
  const cacheDays = Number(Deno.env.get('DNA_CACHE_DAYS') ?? '7')
  if (cacheDays > 0 && !isRefresh) {
    const cutoff = new Date(Date.now() - cacheDays * 86_400_000).toISOString()
    const { data: cached } = await admin
      .from('dna_cache')
      .select('profile')
      .eq('handle', handle)
      .eq('platform', platform)
      .gte('created_at', cutoff)
      .maybeSingle()
    if (cached?.profile) {
      // ⚠️ THE CACHE HOLDS HALF THE ARTEFACT, AND IT USED TO RETURN AS IF IT
      // HELD ALL OF IT. MEASURED IN PRODUCTION: brand voice d8049e9b sat at
      // `ready` with ZERO `creator_knowledge` rows while every other ready voice
      // had between 2 and 51. It was a second account scanning a handle somebody
      // had scanned days earlier — cache hit, profile copied, `job_id: null`, no
      // scan ever enqueued.
      //
      // The consequence reached the teleprompter. `creator_knowledge` is what
      // the entitlement check draws on, so with none of it every substantive
      // beat failed and `generate-blueprint` correctly refused to fabricate —
      // writing "Only you can supply this. What would you actually say here?"
      // as the spoken line on THREE OF SIX SCENES of a paid generation. The
      // creator saw a confident voice summary, signature phrases and recurring
      // CTAs rendered over an empty table.
      //
      // ⚖️ THE COMMENT ABOVE SAYS "zero quality change (same posts, same
      // profile)" AND THAT WAS TRUE WHEN IT WAS WRITTEN. The profile was the
      // whole artefact then. Knowledge extraction was added later, keyed to the
      // VOICE rather than to the handle, so the cache silently began reusing one
      // half of a thing that had become two. An accurate note that stops being
      // accurate reads exactly like one that never was.
      //
      // ⚖️ SO THE PROFILE STILL ARRIVES INSTANTLY AND THE SCAN STILL RUNS. The
      // creator is not made to wait for something we already have, and the voice
      // is not left claiming knowledge it does not hold. Marking it ready keeps
      // them unblocked; the queued scan fills the knowledge behind them.
      await admin
        .from('brand_voices')
        .update({ status: 'ready', profile: cached.profile, error: null })
        .eq('id', voiceId)
      const { data: knowledgeJob } = await admin
        .from('jobs')
        .insert({
          owner_id: user.id,
          type: 'scrape_dna',
          status: 'queued',
          max_attempts: 3,
          payload: { brand_voice_id: voiceId, handle, platform, owner_id: user.id },
        })
        .select('id')
        .single()
      return json({
        brand_voice_id: voiceId,
        job_id: knowledgeJob?.id ?? null,
        status: 'ready',
        cached: true,
      })
    }
  }

  // ── WHO BUILDS THIS DNA: THE WORKER, OR A BROWSER TAB ────────────────────
  //
  // ⚠️ THE `build_dna` PATH BELOW IS ADVANCED ONLY BY A POLLING BROWSER. Close
  // the tab, lose the connection, or hit the 60/min poll cap and the voice sits
  // in `building` until a reaper marks it failed 600s later — the infinite
  // spinner `0018_dna_reaper.sql` names in its own header. The worker's
  // `scrape_dna` has no such dependency: it claims the job, finishes it, and
  // flips the row, whether or not anyone is watching.
  //
  // ⚖️ AND THE WORKER PATH IS STRICTLY RICHER. It runs `measurePackaging`,
  // `assessScanTarget` (wrong-account detection) and caption knowledge
  // extraction — none of which the edge path has any equivalent of — and it
  // enqueues the `build_voice` upgrade itself, so nothing is lost by moving.
  //
  // ⚠️ YOUTUBE MOVES FIRST, INSTAGRAM DELIBERATELY LATER. YouTube is 9 of 27
  // production voices, currently succeeding 9/9, and its thumbnails are not
  // signed to the scraping IP the way Meta's are — so it exercises the new route
  // without also exercising the residential-proxy retry that Instagram depends
  // on. Instagram is the larger and more fragile half and gets its own flip once
  // this one has run clean.
  //
  // ⚖️ THE LIST IS ENV-OVERRIDABLE SO A BAD FLIP IS A SETTING, NOT A DEPLOY.
  // `WORKER_DNA_PLATFORMS=tiktok` reverts to the previous behaviour without
  // shipping anything. An unset or malformed value falls back to the default
  // rather than to "nothing" — an empty list would silently send every platform
  // down the browser path and look like the flip simply did not work.
  const workerPlatforms = new Set(
    (Deno.env.get('WORKER_DNA_PLATFORMS') ?? 'tiktok,youtube')
      .split(',').map((p) => p.trim().toLowerCase()).filter(Boolean),
  )
  // TikTok is built FREE by the worker (yt-dlp); YouTube and Instagram reach the
  // same worker job through Apify inside `scrapeProfile`. Same actors either way —
  // what changes is who drives the run to completion.
  if (workerPlatforms.has(platform)) {
    const { data: job } = await admin
      .from('jobs')
      .insert({
        owner_id: user.id,
        type: 'scrape_dna',
        status: 'queued',
        // Let a transient yt-dlp / Gemini hiccup retry with backoff instead of a hard fail.
        max_attempts: 3,
        payload: { brand_voice_id: voiceId, handle, platform, owner_id: user.id },
      })
      .select('id')
      .single()
    return json({ brand_voice_id: voiceId, job_id: job?.id ?? null, status: 'building' })
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
        payload: { brand_voice_id: voiceId, apify_run_id: runId, handle, platform },
      })
      .select('id')
      .single()
    return json({ brand_voice_id: voiceId, job_id: job?.id ?? null, status: 'building' })
  } catch (err) {
    console.error('start-dna: apify start failed', err)
    await admin
      .from('brand_voices')
      .update({ status: 'failed', error: 'Could not reach the scraper.' })
      .eq('id', voiceId)
    return json(
      { error: 'Voice scan is unavailable right now — you can set up your voice manually.', brand_voice_id: voiceId },
      503,
    )
  }
})

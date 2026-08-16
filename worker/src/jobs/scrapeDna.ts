import { db, type Job } from '../db.js'
import { scrapeProfile, UnsupportedPlatformError, type ScrapedPost } from '../media.js'
import { assessScanTarget } from '../scanTarget.js'
import { selectVideosToTranscribe, transcriptBudgetFor, scrapePoolFor } from '../transcriptSelection.js'
import { insertKnowledge, KNOWLEDGE_ROWS_PER_SCAN } from '../knowledgeInsert.js'
import { synthesizeVoiceFromPosts, extractKnowledgeFromCaptions } from '../voice.js'
import type { InlineImage } from '../gemini.js'
import { env } from '../env.js'
import { ProxyAgent } from 'undici'

// Instagram/Facebook image CDNs SIGN their URLs to the IP that scraped them, so a
// direct fetch from this worker gets a 403 and the palette comes back empty. The
// account was scraped THROUGH Apify, so Apify's residential proxy is the egress the
// CDN already accepted — re-fetching the thumbnail through it gets an IP that works.
//
// ⚠️ THIS IS PORTED FROM `dna-poll`, WHERE IT WAS ADDED BECAUSE IG PALETTES CAME
// BACK EMPTY. The worker scrapes Instagram via Apify too, so it inherits exactly the
// same signed-URL problem. Routing Instagram to the worker without this would have
// silently degraded every IG brand palette to caption-only inference — a regression
// with no error anywhere, which is the kind this repo keeps having to dig out.
const IG_CDN = /(cdninstagram|fbcdn|scontent)/i
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

/** A dispatcher bound to Apify's residential proxy, or null when it is not
 *  configured. Null is a legal state: the caller falls back to the direct fetch
 *  and, failing that, to caption-only inference. */
function apifyProxyDispatcher(): ProxyAgent | null {
  if (!env.apifyProxyPassword) return null
  try {
    return new ProxyAgent({
      uri: 'http://proxy.apify.com:8000',
      token: `Basic ${Buffer.from(`groups-RESIDENTIAL:${env.apifyProxyPassword}`).toString('base64')}`,
    })
  } catch {
    return null
  }
}

/** Download one thumbnail → base64, or null on ANY failure. A bad thumbnail must
 *  never fail a whole DNA build; the palette is an enrichment, not the product. */
async function fetchOneImage(url: string, dispatcher?: ProxyAgent): Promise<InlineImage | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': UA },
      // `dispatcher` is undici's, not in the DOM RequestInit types Node ships.
      ...(dispatcher ? { dispatcher } : {}),
    } as RequestInit)
    if (!res.ok) return null
    const mimeType = res.headers.get('content-type') || 'image/jpeg'
    if (!mimeType.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    // Thumbnails are small; a huge body is a page or a redirect, not a cover.
    if (!buf.byteLength || buf.byteLength > 3_000_000) return null
    return { mimeType, data: buf.toString('base64') }
  } catch {
    return null
  }
}

// Direct fetch first; retry through the residential proxy only for the IG/FB CDNs
// that block server IPs. Anything still unreadable is skipped, and the palette is
// recorded as not captured rather than guessed at.
async function fetchInlineImages(urls: string[], max = 4): Promise<InlineImage[]> {
  const out: InlineImage[] = []
  const proxy = apifyProxyDispatcher()
  try {
    for (const url of urls.slice(0, max)) {
      let img = await fetchOneImage(url)
      if (!img && proxy && IG_CDN.test(url)) img = await fetchOneImage(url, proxy)
      if (img) out.push(img)
    }
  } finally {
    // The worker is long-lived — an undispatched agent per job leaks sockets.
    await proxy?.close().catch(() => {})
  }
  return out
}

function topCovers(posts: ScrapedPost[], max = 4): string[] {
  return [...posts]
    .sort((a, b) => (b.plays || b.likes) - (a.plays || a.likes))
    .map((p) => p.cover)
    .filter((u): u is string => typeof u === 'string' && /^https:\/\//i.test(u))
    .slice(0, max)
}

// Handles `scrape_dna` jobs — the FREE TikTok DNA build (yt-dlp scrape + caption
// synth), replacing a paid Apify run for TikTok. The worker updates the brand_voice
// row directly; the frontend's dna-poll just reports that row's status.
// payload: { brand_voice_id, handle, platform, owner_id }
export async function handleScrapeDna(job: Job): Promise<Record<string, unknown>> {
  const p = job.payload as { brand_voice_id?: string; handle?: string; platform?: string; owner_id?: string }
  const voiceId = String(p.brand_voice_id ?? '')
  const handle = String(p.handle ?? '')
  const platform = String(p.platform ?? 'tiktok')
  const ownerId = String(p.owner_id ?? '')
  if (!voiceId || !handle) throw new Error('scrape_dna needs brand_voice_id and handle')

  // A failed (re)scan must not brick an already-built voice. If the row already
  // carries a usable profile (niche/tone/summary), keep it ready — the creator's
  // existing DNA stands, they just didn't get a fresh scan. Only mark 'failed'
  // when there's nothing to fall back to (a first scan that produced no voice).
  const fail = async (msg: string) => {
    const { data: cur } = await db.from('brand_voices').select('profile').eq('id', voiceId).maybeSingle()
    const vp = cur?.profile as { niche?: unknown; tone?: unknown; summary?: unknown } | null
    if (vp && (vp.niche || vp.tone || vp.summary)) {
      await db.from('brand_voices').update({ status: 'ready', error: null }).eq('id', voiceId)
      return { ok: false, reason: msg, kept_existing: true }
    }
    await db.from('brand_voices').update({ status: 'failed', error: msg }).eq('id', voiceId)
    return { ok: false, reason: msg }
  }

  // ── WHY WAS THIS CLAIM NOT MADE? (C8 item 3) ─────────────────────────────
  //
  // ⚠️ `dna_claims` HAS REAL DISCIPLINE ON THE OUTPUT — a correlation needs a
  // sample size, a hypothesis stays untested, a business claim needs attribution
  // — and there has never been any record of the RUN that produced it. Every
  // stage of a scan is best-effort by design: a failed brand kit, an empty
  // caption extraction and a skipped transcript enqueue all leave a voice that
  // says `ready`. So "the creator has no experiences" and "the extraction step
  // failed quietly three weeks ago" are the same observation from the outside.
  //
  // ⚖️ NO NEW TABLE, AND THAT IS THE DESIGN RATHER THAN A SHORTCUT. The ledger
  // says "modelled on edit_events", which is right for the editor: a long
  // multi-job pipeline needs an append-only stream with a seq. A scan is ONE job
  // whose row already exists, already survives, and is already queried — and
  // this session has now added five columns and three tables, each of which is
  // an owner action before it does anything. A stage record that ships with no
  // migration starts recording on the next scan instead of the next apply.
  const stages: Array<{ stage: string; outcome: 'ok' | 'failed' | 'skipped'; detail?: string }> = []
  const stage = (name: string, outcome: 'ok' | 'failed' | 'skipped', detail?: string) => {
    // ⚠️ THE REASON IS THE POINT. A stage list of bare names answers "did it run"
    // and not "why not", and "why not" is the question C8 asks.
    stages.push(detail ? { stage: name, outcome, detail: detail.slice(0, 300) } : { stage: name, outcome })
  }

  let posts
  let profileFacts
  try {
    // ⚠️ THE PLATFORM WAS THROWN AWAY HERE. This read `scrapeTikTokProfile(handle)`
    // for every voice, so a YouTube creator's scan asked tiktok.com for a handle
    // that does not exist there, read nothing, and reported `done`.
    // ⚠️ THE LIMIT WAS OMITTED AND THE DEFAULT WAS 12. That single missing
    // argument capped the whole pipeline: a TikTok scan carrying a transcript
    // budget of 25 reported `videos_offered: 12` in production, so the free
    // budget could never be spent and the yield measurement that was meant to
    // decide 10 → 15 was reading a default argument in media.ts. The pool is now
    // derived from the same place as the budget, so the two cannot drift apart
    // again.
    const scraped = await scrapeProfile(handle, platform, scrapePoolFor(platform))
    posts = scraped.posts
    profileFacts = scraped.facts
    stage('scrape_profile', 'ok', `${scraped.posts.length} posts`)
  } catch (err) {
    // ⚠️ THIS BLAMED THE CREATOR FOR OUR OWN MISSING DEPENDENCY. The old
    // message said "If that account is private or empty, try a public account"
    // — repeating a GUESS yt-dlp prints whenever it cannot read the page at
    // all. TikTok began requiring impersonation, this image installed no
    // backend for it (fixed in requirements.txt), and every affected creator
    // was told their own account was the problem. A scraper that cannot reach a
    // page does not know why, and must not pretend it does.
    // ⚠️ "WE CANNOT READ THIS PLATFORM" IS NOT "WE TRIED AND FAILED", and the
    // creator must not be told to try again for a thing that will never work.
    // Instagram used to reach the TikTok scraper here and could return a
    // DIFFERENT PERSON who happens to hold the same handle; it now refuses, and
    // the refusal has to arrive as an honest sentence rather than as the
    // transient-failure message beneath it.
    if (err instanceof UnsupportedPlatformError) {
      console.error(JSON.stringify({
        event: 'scrape_dna_unsupported_platform', handle, platform: err.platform,
      }))
      return await fail(
        `We can't scan ${platform} accounts yet. Connect a TikTok or YouTube account, or set up your voice manually.`,
      )
    }
    const detail = err instanceof Error ? err.message : String(err)
    const impersonation = /impersonat|secondary user ID/i.test(detail)
    console.error(JSON.stringify({
      event: 'scrape_dna_read_failed',
      handle, platform,
      // Distinguishes "our tooling cannot read this site" from every other
      // cause, because those need opposite responses and looked identical.
      likely_cause: impersonation ? 'yt_dlp_impersonation_unavailable' : 'unknown',
      detail: detail.slice(0, 500),
    }))
    return await fail(
      `We couldn't read @${handle} on ${platform} just now. This is usually on our side — try again shortly, or set up your voice manually.`,
    )
  }

  // Empty result = private / empty / mistyped. Never fabricate a voice from nothing.
  //
  // ⚠️ AND THIS IS THE SHAPE THAT HID FOR THREE DAYS. The scrape returns
  // nothing, `fail()` keeps the creator's existing voice, the JOB still records
  // `done` — so a run that wrote no knowledge, no entities and no questions is
  // indistinguishable from a healthy one on any dashboard. `creator_knowledge`
  // sat at 0 rows in production with 27 voices present and nothing reported.
  // The reasoning above is right — never fabricate a voice from nothing — but a
  // refusal has to be COUNTABLE or it is just silence with good manners.
  if (!posts.length) {
    console.error(JSON.stringify({
      event: 'scrape_dna_empty',
      handle, platform,
      // The scrape SUCCEEDED and returned nothing, which is a different fact
      // from being unable to read the page at all.
      resolved_handle: profileFacts?.resolvedHandle ?? null,
      post_count: profileFacts?.postCount ?? null,
    }))
    return await fail(
      `We couldn't read any public posts from @${handle}. If that account is private or empty, make it public ` +
        `for a moment, try a different public account, or set up your voice manually.`,
    )
  }

  // Read the real brand palette from the creator's actual post covers (Gemini
  // vision) instead of guessing from captions. Best-effort — a fetch failure just
  // falls back to caption-only color inference.
  const inlineImages = await fetchInlineImages(topCovers(posts))

  let profile: Record<string, unknown>
  try {
    profile = await synthesizeVoiceFromPosts(handle, platform, posts, '', inlineImages)
    stage('synthesize_voice', 'ok')
  } catch (err) {
    stage('synthesize_voice', 'failed', err instanceof Error ? err.message : String(err))
    console.error('scrape_dna: synth failed', err instanceof Error ? err.message : err)
    return await fail('We could not finish building your voice. Please try again or set it up manually.')
  }
  // Capture platform stats for the dashboard ("understand your brand"). The TikTok
  // path previously wrote none, so every TikTok creator's dashboard showed blank
  // analytics. yt-dlp's flat output gives per-video views/likes but not a reliable
  // follower count, so followers stays 0 until the audio-upgrade/Apify path fills it.
  let capturedKnowledge = 0
  const n = posts.length
  const stats = {
    // ⚖️ NOW READ WHERE THE PLATFORM GIVES IT. This was hardcoded to 0 with a
    // comment saying the count was unavailable — but yt-dlp returns it on the
    // profile payload this job was already fetching and discarding. `?? 0` keeps
    // the old shape for the dashboard, which cannot render a null; the honest
    // null survives in `scan_target`, where a human reads "audience not read"
    // rather than "0 followers".
    followers: profileFacts?.audience ?? 0,
    videos: n,
    avg_views: n ? Math.round(posts.reduce((a, x) => a + (x.plays || 0), 0) / n) : 0,
    avg_likes: n ? Math.round(posts.reduce((a, x) => a + (x.likes || 0), 0) / n) : 0,
  }

  // Auto-fill the brand palette from the colors read off the imagery — but NEVER
  // clobber a palette the creator hand-picked ('manual'). Mirrors the edge
  // dna-poll function so IG/YT and TikTok voices behave identically.
  const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : undefined)
  const bc = (profile as { brand_colors?: { primary?: unknown; secondary?: unknown; highlight?: unknown } } | null)?.brand_colors
  const inferred = bc ? Object.fromEntries(Object.entries({ primary: hex(bc.primary), secondary: hex(bc.secondary), highlight: hex(bc.highlight) }).filter(([, v]) => v)) : {}
  const { data: existingVoice } = await db.from('brand_voices').select('brand_kit').eq('id', voiceId).maybeSingle()
  const existingKit = (existingVoice?.brand_kit as { palette?: Record<string, string>; palette_source?: string } | null) ?? null
  const brandKitPatch = (existingKit?.palette_source !== 'manual' && Object.keys(inferred).length)
    ? { brand_kit: { ...existingKit, palette: inferred, palette_source: 'auto' } }
    : {}

  // HOW THEY PACKAGE, MEASURED — computed HERE because this is the only place the
  // titles exist. Storing the raw corpus so the blueprint could measure it later
  // would be a content store nobody asked for; storing the distillate is the same
  // rule Creator Knowledge follows, and it is ~10 numbers instead of 500 strings.
  //
  // ⚠️ WHY THIS MATTERS. Kallaway opens with a question 0 times in 50 titles, and
  // the writer — given only adjectives like "energetic" — gave him four
  // question-openers out of four. A rate can be violated; an adjective cannot.
  //
  // Duplicated from `voiceMetrics` in @twinai/shared: the worker has no runtime
  // dep on it (see directorContract.ts), and `voiceMetricsParity.test.ts` fails
  // if the two drift.
  // ── IS THIS THE ACCOUNT THEY MEANT? ────────────────────────────────────────
  //
  // ⚠️ THE DEFECT THIS READS FOR, WITH REAL NUMBERS. A scan of `@CarterPCs`
  // resolves — YouTube returns a real channel — but it is a channel called
  // "five" with 146 subscribers whose videos credit `@actuallycarterpcs`. The
  // creator meant the 3,150,000-subscriber account. The scan SUCCEEDED, built a
  // voice from a stranger's three videos, and reported no error at any point.
  // Third time this class has appeared; the original creator pack had 9 of 12
  // handles wrong.
  //
  // ⚖️ REPORTED, NOT REFUSED — and "small means wrong" is never the rule. A
  // creator with 146 subscribers is a real customer; this product exists for
  // people who are not famous yet, and a size threshold would turn away exactly
  // them while passing any well-followed impostor. What was detectable is that
  // the SIGNALS DISAGREE: a handle saying "CarterPCs" resolving to a name saying
  // "five". That is a reason to ask, never a reason to refuse — so the
  // assessment is stored beside the voice and the decision stays with the person
  // who knows which account they meant.
  const target = assessScanTarget({
    requestedHandle: handle.replace(/^@/, ''),
    resolvedHandle: profileFacts?.resolvedHandle ?? null,
    displayName: profileFacts?.displayName ?? null,
    audience: profileFacts?.audience ?? null,
    postCount: profileFacts?.postCount ?? null,
    // The most recent caption is the tell in the real case, and it is the one
    // fact a human recognises the account by instantly.
    sampleTitle: posts.length ? String(posts[0].text ?? '') || null : null,
    // Reaching here means posts were read, so the account is not missing. The
    // empty and unreadable cases already returned above.
    missing: false,
  })
  console.log(JSON.stringify({
    event: 'scan_target_assessed',
    voice: voiceId,
    verdict: target.verdict,
    codes: target.codes,
    requested: handle.replace(/^@/, ''),
    resolved: profileFacts?.resolvedHandle ?? null,
  }))

  const packaging = measurePackaging(posts.map((x) => String(x.text ?? '')).filter(Boolean))
  if (packaging.sampled) {
    console.log(JSON.stringify({ event: 'packaging_measured', voice: voiceId, ...packaging }))
  }

  await db.from('brand_voices').update({
    status: 'ready',
    // ⚖️ MERGED, NOT REPLACED. `profile` is the synthesised DNA blob; packaging is
    // a measurement beside it. Overwriting the blob to add a field would lose the
    // synthesis on every scan.
    // ⚖️ `scan_target` RIDES BESIDE THE SYNTHESIS, same rule as packaging: it is
    // a measurement ABOUT the scan, not part of the voice, and overwriting the
    // blob to add it would lose the synthesis on every scan.
    profile: { ...(profile as Record<string, unknown>), packaging, scan_target: target },
    stats,
    error: null,
    ...brandKitPatch,
  }).eq('id', voiceId)

  // Data layer: a voice was built (activation funnel).
  if (ownerId) {
    await db.from('analytics_events')
      .insert({ user_id: ownerId, event: 'voice_built', time_saved_minutes: 15, props: { brand_voice_id: voiceId, platform } })
      .then(() => {}, () => {})
  }

  // Cache the synthesis (service-role `dna_cache`) so other users scanning this
  // handle skip the scrape + synth. Best-effort.
  try {
    await db
      .from('dna_cache')
      .upsert({ handle, platform, profile, created_at: new Date().toISOString() }, { onConflict: 'handle,platform' })
  } catch (err) {
    console.error('scrape_dna: dna_cache upsert failed', err instanceof Error ? err.message : err)
  }

  // ── CAPTION KNOWLEDGE, BECAUSE ZERO IS WORSE THAN WEAK ────────────────────
  //
  // ⚠️ ONLY `build_voice` EVER WROTE `creator_knowledge`. This job — the DNA
  // scan itself — extracted none, so a creator whose audio upgrade never ran,
  // had no usable transcripts, or simply failed, ended up with NOTHING for the
  // blueprint to read. `generate-blueprint` selects from `creator_knowledge`;
  // an empty table there is the content-empty script, arrived at silently.
  //
  // The captions were already in hand and `extractKnowledgeFromCaptions` already
  // existed. Nothing called it. Same shape as `scanTargetConfirmation`: a
  // capability shipped, tested, and never wired to the path that needed it.
  //
  // ⚖️ WEAK ON PURPOSE, AND HONESTLY LABELLED. `clampCaptionBasis` forces every
  // caption item to `demonstrated`, so all of this resolves to COVERAGE on the
  // evidence ladder — safe to say "they covered it", never "they believe it".
  // That is correct: a title proves a video was made, not what it concluded. The
  // audio upgrade below still adds the `stated` positions this cannot.
  //
  // ⚖️ ENRICHMENT, NEVER A GATE — the rule the audio path already follows. A
  // creator whose extraction fails must still get their voice.
  if (ownerId) try {
    const captions = posts.map((x) => String(x.text ?? '')).filter((t) => t.trim().length > 0)
    const items = captions.length ? await extractKnowledgeFromCaptions(handle, platform, captions) : []
    const rows = items
      .filter((r) => typeof r?.text === 'string' && r.text.trim().length > 0)
      .slice(0, KNOWLEDGE_ROWS_PER_SCAN)
      .map((r) => ({
        owner_id: ownerId,
        voice_id: voiceId,
        kind: r.kind,
        text: r.text.trim().slice(0, 240),
        // An unreadable basis degrades to the WEAKEST reading, never the default.
        basis: ['stated', 'demonstrated', 'inferred'].includes(r.basis) ? r.basis : 'inferred',
        // This path reads TITLES. Recorded explicitly rather than inferred from
        // the `demonstrated` clamp, which only correlates by coincidence.
        source: 'caption',
      }))
    if (rows.length) {
      const { error: kErr } = await insertKnowledge(db as never, rows)
      if (kErr) console.error('scrape_dna: knowledge insert failed', kErr.message)
      else capturedKnowledge = rows.length
    }
    // ⚠️ THE COMPOSITION, NOT JUST THE COUNT. `knowledge_items: 40` says nothing
    // about whether a single one of them can license an opinion beat. Reading
    // the corpus, 479 of 479 stored items were coverage-level and no count
    // anywhere would have shown it.
    const byKind: Record<string, number> = {}
    for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1
    console.log(JSON.stringify({
      event: 'caption_knowledge_stored', voice: voiceId,
      items: capturedKnowledge, by_kind: byKind,
      // Caption items are clamped to `demonstrated`, so this is coverage by
      // construction. Logged anyway: if it is ever not, something changed.
      stated: rows.filter((r) => r.basis === 'stated').length,
    }))
    // ⚖️ ZERO IS A RESULT, NOT AN ABSENCE. A stage list recording only failures
    // cannot separate "extracted and found nothing" from "never ran" — the exact
    // ambiguity C8 item 3 exists to remove.
    stage('caption_knowledge', capturedKnowledge ? 'ok' : 'skipped',
      capturedKnowledge ? `${capturedKnowledge} items` : 'no items extracted from captions')
  } catch (err) {
    // ⚠️ THE STAGE THAT SILENTLY DECIDES WHETHER A CREATOR HAS ANY KNOWLEDGE AT
    // ALL. It is caught and swallowed on purpose — a voice is still useful
    // without it — and until now that decision left no trace.
    stage('caption_knowledge', 'failed', err instanceof Error ? err.message : String(err))
    console.error('scrape_dna: caption knowledge failed', err instanceof Error ? err.message : err)
  }

  // Best-effort audio upgrade: transcribe the creator's top TikToks and refine the
  // voice from their actual spoken audio (TikTok yt-dlp+whisper works from our IP).
  try {
    // ⚠️ WAS TOP-5-BY-VIEWS, WHICH SAMPLES ONE THING: WHAT WENT VIRAL. Viral
    // videos are systematically the least representative source of belief —
    // they skew to spectacle and to older uploads that had time to accumulate
    // reach. Transcripts are the ONLY source that can produce `stated`
    // positions, so which few get transcribed decides whether Twin can ever say
    // anything the creator actually believes.
    // ⚠️ THE BUDGET IS PER PLATFORM BECAUSE THE PRICE IS. TikTok transcribes
    // locally and free; Instagram is paid on every video. One number priced the
    // free platform as if it were the expensive one — and this budget is the
    // ceiling on the only input measured to change script quality.
    const urls = selectVideosToTranscribe(posts.map((x) => ({
      url: x.url, plays: x.plays, likes: x.likes, text: x.text,
    })), transcriptBudgetFor(platform))
    stage('transcripts_selected', urls.length ? 'ok' : 'skipped',
      urls.length ? `${urls.length} of ${posts.length} posts` : 'no usable video urls')
    if (urls.length && ownerId) {
      await db.from('jobs').insert({
        owner_id: ownerId,
        type: 'build_voice',
        status: 'queued',
        // best-effort upgrade — NEVER retry (a retry re-runs the paid transcript
        // calls; default 5 attempts could mean up to 25 paid calls) (#10).
        max_attempts: 1,
        payload: { brand_voice_id: voiceId, handle, platform, urls, captions: posts.map((x) => x.text).filter(Boolean).slice(0, 120) },
      })
      stage('transcripts_enqueued', 'ok', `${urls.length} queued`)
    } else if (!ownerId) {
      // ⚠️ A REAL BRANCH, AND PREVIOUSLY INVISIBLE. No owner means the upgrade is
      // never queued, so the creator's store can only ever hold caption items —
      // 13% substance, zero experiences — and nothing said so.
      stage('transcripts_enqueued', 'skipped', 'no owner on the voice')
    }
  } catch (err) {
    stage('transcripts_enqueued', 'failed', err instanceof Error ? err.message : String(err))
    console.error('scrape_dna: could not enqueue build_voice', err)
  }

  // ⚖️ THE STAGES TRAVEL WITH THE RESULT, so "why was this claim not made" is a
  // query against `jobs` rather than an archaeology dig through expired logs.
  return { ok: true, posts_used: posts.length, stages }
}

/** Measured packaging habits. See the call site for why this lives in the worker.
 *  ⚖️ Every rate is a count over `sampled`, so a creator with 12 titles and one
 *  with 200 are never silently compared. */
export function measurePackaging(titles: readonly string[]) {
  const QUESTION = /\?|^(?:is|are|can|does|do|should|would|why|how|what|who|when|which)\b/i
  const NUMBER = /\b\d+\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\b/i
  const FIRST_PERSON = /\b(?:i|i'm|i've|my|mine|me)\b/i
  const SECOND_PERSON = /\b(?:you|your|you're)\b/i
  const SHOUT = /\b[A-Z]{3,}\b/
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
  const IMPERATIVE = /^(?:stop|start|try|meet|watch|look|check|buy|get|don'?t|never|always|forget)\b/i
  const ARTICLES = new Set(['the', 'a', 'an'])
  const t = titles.map((x) => String(x ?? '').trim()).filter((x) => x.length > 0)
  const n = t.length
  const rate = (c: number) => (n ? Math.round((100 * c) / n) : 0)
  const words = t.map((x) => x.split(/\s+/).length).sort((a, b) => a - b)
  const mid = Math.floor(words.length / 2)
  const medianWords = !words.length ? 0
    : words.length % 2 ? words[mid] : Math.round((words[mid - 1] + words[mid]) / 2)
  const counts = new Map<string, number>()
  for (const x of t) {
    const w = (x.match(/^[A-Za-z']+/)?.[0] ?? '').toLowerCase()
    if (w && !ARTICLES.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  let topOpener: string | null = null
  let best = 0
  for (const [w, c] of counts) if (c > best) { best = c; topOpener = w }
  if (n === 0 || best < Math.max(3, n * 0.1)) topOpener = null
  return {
    sampled: n,
    questionOpenRate: rate(t.filter((x) => QUESTION.test(x)).length),
    medianWords,
    numberRate: rate(t.filter((x) => NUMBER.test(x)).length),
    firstPersonRate: rate(t.filter((x) => FIRST_PERSON.test(x)).length),
    secondPersonRate: rate(t.filter((x) => SECOND_PERSON.test(x)).length),
    shoutRate: rate(t.filter((x) => SHOUT.test(x)).length),
    emojiRate: rate(t.filter((x) => EMOJI.test(x)).length),
    imperativeOpenRate: rate(t.filter((x) => IMPERATIVE.test(x)).length),
    topOpener,
  }
}

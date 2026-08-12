import { db, type Job } from '../db.js'
import { scrapeProfile, type ScrapedPost } from '../media.js'
import { assessScanTarget } from '../scanTarget.js'
import { selectVideosToTranscribe } from '../transcriptSelection.js'
import { insertKnowledge } from '../knowledgeInsert.js'
import { synthesizeVoiceFromPosts, extractKnowledgeFromCaptions } from '../voice.js'
import type { InlineImage } from '../gemini.js'

// Best-effort: fetch a few post cover images so the synth can read the real brand
// palette from the imagery (Gemini vision), mirroring the edge dna-poll function.
// Any cover that fails to fetch is skipped — falls back to caption-only inference.
async function fetchInlineImages(urls: string[], max = 4): Promise<InlineImage[]> {
  const out: InlineImage[] = []
  for (const url of urls.slice(0, max)) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' },
      })
      if (!res.ok) continue
      const mimeType = res.headers.get('content-type') || 'image/jpeg'
      if (!mimeType.startsWith('image/')) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (!buf.byteLength || buf.byteLength > 3_000_000) continue
      out.push({ mimeType, data: buf.toString('base64') })
    } catch {
      // skip this image — never let a bad thumbnail fail the whole synthesis
    }
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

  let posts
  let profileFacts
  try {
    // ⚠️ THE PLATFORM WAS THROWN AWAY HERE. This read `scrapeTikTokProfile(handle)`
    // for every voice, so a YouTube creator's scan asked tiktok.com for a handle
    // that does not exist there, read nothing, and reported `done`.
    const scraped = await scrapeProfile(handle, platform)
    posts = scraped.posts
    profileFacts = scraped.facts
  } catch (err) {
    // ⚠️ THIS BLAMED THE CREATOR FOR OUR OWN MISSING DEPENDENCY. The old
    // message said "If that account is private or empty, try a public account"
    // — repeating a GUESS yt-dlp prints whenever it cannot read the page at
    // all. TikTok began requiring impersonation, this image installed no
    // backend for it (fixed in requirements.txt), and every affected creator
    // was told their own account was the problem. A scraper that cannot reach a
    // page does not know why, and must not pretend it does.
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
  } catch (err) {
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
      .slice(0, 40)
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
  } catch (err) {
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
    const urls = selectVideosToTranscribe(posts.map((x) => ({
      url: x.url, plays: x.plays, likes: x.likes, text: x.text,
    })))
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
    }
  } catch (err) {
    console.error('scrape_dna: could not enqueue build_voice', err)
  }

  return { ok: true, posts_used: posts.length }
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

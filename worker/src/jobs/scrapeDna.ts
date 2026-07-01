import { db, type Job } from '../db.js'
import { scrapeTikTokPosts, type ScrapedPost } from '../media.js'
import { synthesizeVoiceFromPosts } from '../voice.js'
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

  const fail = async (msg: string) => {
    await db.from('brand_voices').update({ status: 'failed', error: msg }).eq('id', voiceId)
    return { ok: false, reason: msg }
  }

  let posts
  try {
    posts = await scrapeTikTokPosts(handle)
  } catch (err) {
    console.error('scrape_dna: yt-dlp failed', handle, err instanceof Error ? err.message : err)
    return await fail(
      `We couldn't read @${handle} on ${platform}. If that account is private or empty, try a public account or set up your voice manually.`,
    )
  }

  // Empty result = private / empty / mistyped. Never fabricate a voice from nothing.
  if (!posts.length) {
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
  const n = posts.length
  const stats = {
    followers: 0,
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

  await db.from('brand_voices').update({ status: 'ready', profile, stats, error: null, ...brandKitPatch }).eq('id', voiceId)

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

  // Best-effort audio upgrade: transcribe the creator's top TikToks and refine the
  // voice from their actual spoken audio (TikTok yt-dlp+whisper works from our IP).
  try {
    const urls = [...posts]
      .sort((a, b) => (b.plays || b.likes) - (a.plays || a.likes))
      .map((x) => x.url)
      .filter((u) => /^https:\/\//i.test(u))
      .slice(0, 5)
    if (urls.length && ownerId) {
      await db.from('jobs').insert({
        owner_id: ownerId,
        type: 'build_voice',
        status: 'queued',
        // best-effort upgrade — NEVER retry (a retry re-runs the paid transcript
        // calls; default 5 attempts could mean up to 25 paid calls) (#10).
        max_attempts: 1,
        payload: { brand_voice_id: voiceId, handle, platform, urls },
      })
    }
  } catch (err) {
    console.error('scrape_dna: could not enqueue build_voice', err)
  }

  return { ok: true, posts_used: posts.length }
}

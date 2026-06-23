import { db, type Job } from '../db.js'
import { scrapeTikTokPosts } from '../media.js'
import { synthesizeVoiceFromPosts } from '../voice.js'

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

  let profile: Record<string, unknown>
  try {
    profile = await synthesizeVoiceFromPosts(handle, platform, posts)
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
  await db.from('brand_voices').update({ status: 'ready', profile, stats, error: null }).eq('id', voiceId)

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

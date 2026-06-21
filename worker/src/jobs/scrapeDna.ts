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
  await db.from('brand_voices').update({ status: 'ready', profile, error: null }).eq('id', voiceId)

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
        payload: { brand_voice_id: voiceId, handle, platform, urls },
      })
    }
  } catch (err) {
    console.error('scrape_dna: could not enqueue build_voice', err)
  }

  return { ok: true, posts_used: posts.length }
}

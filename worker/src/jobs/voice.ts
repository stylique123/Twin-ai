import { db, type Job } from '../db.js'
import { transcribeFromUrl } from '../media.js'
import { synthesizeVoiceFromAudio } from '../voice.js'

// Handles `build_voice` jobs — the audio upgrade for a brand voice.
// payload: { brand_voice_id, handle, platform, urls: string[] }
// Transcribes the creator's top videos and re-synthesizes the voice from their
// actual spoken audio, then updates the (already-ready) brand_voices.profile.
export async function handleBuildVoice(job: Job): Promise<Record<string, unknown>> {
  const p = job.payload as { brand_voice_id?: string; handle?: string; platform?: string; urls?: string[] }
  const voiceId = String(p.brand_voice_id ?? '')
  const handle = String(p.handle ?? '')
  const platform = String(p.platform ?? 'tiktok')
  const urls = Array.isArray(p.urls) ? p.urls.slice(0, 5) : []
  if (!voiceId || !urls.length) throw new Error('build_voice needs brand_voice_id and urls')

  // Best-effort: skip any video that fails (private / blocked / no speech).
  const transcripts: string[] = []
  for (const url of urls) {
    try {
      const t = await transcribeFromUrl(url)
      if (t.text && t.text.trim().length > 20) transcripts.push(t.text.trim())
    } catch (err) {
      console.error('build_voice: transcript failed', url, err instanceof Error ? err.message : err)
    }
  }

  if (!transcripts.length) {
    // Nothing usable — leave the caption voice in place. Not a hard failure.
    return { upgraded: false, reason: 'no usable spoken transcripts' }
  }

  const profile = await synthesizeVoiceFromAudio(handle, platform, transcripts)

  // MERGE, don't replace: the audio re-synthesis refines tone/pacing/vocabulary/
  // hooks, but it does NOT produce the audience/audience_pain/dream_outcome/offer/
  // editing_style fields the edge-function voice scan stored. A blind overwrite
  // dropped those — and the blueprint generator depends on them. Spreading the new
  // profile over the existing one keeps the richer fields and updates the rest.
  const { data: existing } = await db
    .from('brand_voices')
    .select('profile')
    .eq('id', voiceId)
    .maybeSingle()
  const merged = { ...((existing?.profile as Record<string, unknown> | null) ?? {}), ...profile }

  // Only upgrade a voice that's still ready (don't resurrect a deleted/failed one).
  const { error } = await db
    .from('brand_voices')
    .update({ profile: merged })
    .eq('id', voiceId)
    .eq('status', 'ready')
  if (error) throw error

  return { upgraded: true, videos_used: transcripts.length }
}

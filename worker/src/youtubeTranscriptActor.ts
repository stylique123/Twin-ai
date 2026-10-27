// YOUTUBE TRANSCRIPT: VIDEO-ID CACHE KEY + ACTOR SELECTION (Apify policy v2).
//
// Pure helpers only; media.ts wires them into transcribeFromUrl so every caller
// (assessReference, transcribe, voice, extractionParity) shares one cache.

/** The 11-char YouTube video id for youtu.be/<id>, watch?v=<id>, /shorts/<id>,
 *  /embed/<id> or /live/<id>; null for anything else. */
export function youtubeVideoId(rawUrl: string): string | null {
  let u: URL
  try { u = new URL(rawUrl) } catch { return null }
  const h = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '')
  let id: string | null = null
  if (h === 'youtu.be') id = u.pathname.split('/')[1] ?? null
  else if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v')
    else {
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/)
      id = m ? m[2] : null
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
}

/** reference_transcripts is keyed on `url`; a YouTube video is stored under this
 *  synthetic key so every url form of the same video shares one row. */
export function youtubeCacheKey(videoId: string): string {
  return `youtube:${videoId}`
}

export const YOUTUBE_CACHE_TTL_MS = 30 * 86_400_000

/** A cached YouTube transcript is usable for 30 days from captured_at. */
export function youtubeCacheFresh(capturedAt: string, now = Date.now()): boolean {
  const t = Date.parse(capturedAt)
  return Number.isFinite(t) && now - t < YOUTUBE_CACHE_TTL_MS && t <= now + 60_000
}

export type TranscriptActorChoice = 'pintostudio' | 'starvibe'

/** APIFY_TRANSCRIPT_ACTOR: 'starvibe' opts in to the cheaper actor; anything
 *  else (including unset) keeps pintostudio, the default. */
export function transcriptActorChoice(v: string | undefined = process.env.APIFY_TRANSCRIPT_ACTOR): TranscriptActorChoice {
  const s = String(v ?? '').trim().toLowerCase()
  return s === 'starvibe' || s === 'starvibe/youtube-video-transcript' || s === 'starvibe~youtube-video-transcript'
    ? 'starvibe' : 'pintostudio'
}

export const STARVIBE_ACTOR = 'starvibe~youtube-video-transcript'

/**
 * Input for starvibe/youtube-video-transcript ($5 per 1,000).
 * ⚠️ UNVERIFIED: apify.com could not be reached when this was written, so the
 * input field names are a best guess. Confirm against the actor's input schema
 * before setting APIFY_TRANSCRIPT_ACTOR=starvibe in production.
 */
export function starvibeInput(rawUrl: string): Record<string, unknown> {
  return { youtube_url: rawUrl, language: 'en' }
}

export type CaptionRow = { start: number; dur: number; text: string }

/**
 * Map starvibe output to the pintostudio shape [{ data: [{ start, dur, text }] }]
 * that youtubeTranscriptViaApify already parses.
 * ⚠️ UNVERIFIED OUTPUT SCHEMA (apify.com unreachable from here). Tolerates the
 * likely shapes: items carrying `transcript` / `data` / `captions` / `segments`
 * arrays, or flat caption rows; times as `start`/`offset`, lengths as
 * `dur`/`duration` or derived from `end`. Returns [{ data: [] }] when nothing maps.
 */
export function starvibeToCaptionItems(items: unknown): { data: CaptionRow[] }[] {
  const arr = Array.isArray(items) ? items : []
  const rows: CaptionRow[] = []
  const pushRow = (r: unknown) => {
    if (!r || typeof r !== 'object') return
    const o = r as Record<string, unknown>
    const text = String(o.text ?? o.caption ?? '').trim()
    if (!text) return
    const start = Number(o.start ?? o.offset ?? o.startTime ?? 0) || 0
    const end = Number(o.end ?? o.endTime)
    const dur = Number(o.dur ?? o.duration) || (Number.isFinite(end) ? Math.max(0, end - start) : 0)
    rows.push({ start, dur, text })
  }
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue
    const o = it as Record<string, unknown>
    const nested = [o.transcript, o.data, o.captions, o.segments].find(Array.isArray) as unknown[] | undefined
    if (nested) nested.forEach(pushRow)
    else pushRow(o)
  }
  return [{ data: rows }]
}

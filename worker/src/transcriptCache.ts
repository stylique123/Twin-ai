// THE ACQUISITION, KEPT SEPARATELY FROM THE OPINION ABOUT IT.
//
// ⚠️ THE RETRY IS THE WHOLE JOB, AND THAT IS WHY THIS EXISTS. When the Gemini
// call throws, the worker retries `handleAssessReference` from its first line —
// which re-downloads the video and re-runs whisper to reach the same model wall
// again. On the daily-quota refusal that produced 145 failed jobs, that is up to
// four wasted downloads per reference.
//
// ⚖️ A MISS IS NEVER AN ERROR. Every function here degrades to "we do not have
// it, go and get it". A cache that can fail the job it was added to speed up
// would be a worse trade than the downloads it saves.

import { db } from './db.js'
import type { Transcript } from './media.js'

/** What was stored, and enough about how it was obtained to keep the profile
 *  row's cost columns truthful when a retry never touches the network. */
export interface CachedTranscript {
  transcript: Transcript
  chars: number
  capturedAt: string
}

/**
 * The transcript we already have for this URL, or null.
 *
 * ⚠️ NULL ON ANY DOUBT. A malformed row, a missing text field, a database that
 * would not answer — all mean "re-acquire", because assessing a half-read
 * transcript would produce a profile that looks like every other profile and is
 * not comparable with any of them.
 */
export async function readCachedTranscript(url: string): Promise<CachedTranscript | null> {
  try {
    const { data, error } = await db.from('reference_transcripts')
      .select('transcript, chars, captured_at').eq('url', url).maybeSingle()
    if (error || !data) return null
    const t = data.transcript as Transcript | null
    if (!t || typeof t.text !== 'string') return null
    return { transcript: t, chars: typeof data.chars === 'number' ? data.chars : t.text.length,
      capturedAt: String(data.captured_at) }
  } catch {
    return null
  }
}

/**
 * Record what acquisition produced, so the next attempt does not repeat it.
 *
 * ⚖️ BEST-EFFORT, AND DELIBERATELY SO. A failed cache write costs one repeated
 * download later; a cache write that throws would cost the transcript that was
 * successfully obtained a moment ago. Those are not close.
 */
export async function writeCachedTranscript(url: string, t: Transcript): Promise<void> {
  try {
    await db.from('reference_transcripts').upsert({
      url,
      transcript: t,
      // ⚠️ THE LENGTH OF WHAT WAS SAID, not of what the model will be shown. The
      // 24,000-character cap is an assessment decision and belongs on the
      // profile row; storing the capped number here would make a long video look
      // short to anyone reading acquisition costs.
      chars: (t.text ?? '').length,
      source: t.source ?? null,
      paid_because: t.paidBecause ?? null,
      download_route: t.downloadRoute ?? null,
    }, { onConflict: 'url' })
  } catch (e) {
    console.error(JSON.stringify({ event: 'transcript_cache_write_failed', url,
      error: e instanceof Error ? e.message : String(e) }))
  }
}

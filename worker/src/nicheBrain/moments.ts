// THE MOMENT WATCHER — once a day per niche, what is the world talking about?
//
// ⚠️ OUR OWN CORPUS CANNOT ANSWER THIS. Measured 2026-09-24: words that spiked
// across the library were the scraper's own search seeds. So this asks Google
// (grounded search) and keeps an answer ONLY when Google attached real sources;
// a model's unsourced list of "trends" is exactly the invention we refuse.

import { db } from '../db.js'
import { geminiGroundedSearch } from '../gemini.js'
import { modelForTask } from '../modelRouting.js'
import { BRAIN_BUCKETS } from './reader.js'

export const MOMENTS_CHECK_MS = 60 * 60 * 1000 // look once an hour; each bucket refreshes once a day
import { MOMENTS_SYSTEM, momentsPrompt, parseMoments } from './momentsParse.js'
export { MOMENTS_SYSTEM, momentsPrompt, parseMoments }

type Log = (level: string, msg: string, extra?: Record<string, unknown>) => void
let lastCheck = 0

/** At most one bucket per call, so the sweep stays short. */
export async function runMomentWatcher(log: Log): Promise<void> {
  if (Date.now() - lastCheck < MOMENTS_CHECK_MS) return
  const today = new Date().toISOString().slice(0, 10)
  const { data: done, error } = await db.from('brain_moments').select('bucket').eq('day', today)
  if (error) { log('error', 'moments_read_failed', { error: error.message }); lastCheck = Date.now(); return }
  const have = new Set((done ?? []).map((r) => r.bucket as string))
  const bucket = BRAIN_BUCKETS.find((b) => !have.has(b))
  if (!bucket) { lastCheck = Date.now(); return }
  const model = modelForTask('search')
  try {
    const ans = await geminiGroundedSearch(MOMENTS_SYSTEM, momentsPrompt(bucket, today), model)
    // ⚠️ NO SOURCES, NO MOMENTS: an unsourced list is the model's opinion.
    const moments = ans.sources.length > 0 ? parseMoments(ans.text) : []
    await db.from('brain_moments').upsert({
      bucket, day: today, moments,
      sources: ans.sources.slice(0, 10).map((s) => ({ title: s.title ?? null, url: s.uri ?? null })),
      queries: ans.queries ?? [], model,
    }, { onConflict: 'bucket,day' })
    log('info', 'moments', { event: 'moments', bucket, moments: moments.length, sources: ans.sources.length })
  } catch (err) {
    lastCheck = Date.now() // back off an hour on failure
    log('error', 'moments_failed', { bucket, error: err instanceof Error ? err.message.slice(0, 200) : String(err) })
  }
}

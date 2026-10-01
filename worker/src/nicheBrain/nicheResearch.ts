// THE NICHE RESEARCHER — every sub-niche a creator brings is researched on its
// own: dates, news, new products, competitors, live questions (owner, 2026-10-01).
//
// ⚖️ Grounded search only, and an answer is kept ONLY when Google attached real
// sources (the moment watcher's rule). One niche per call; a niche is refreshed
// weekly; a NEW niche (no row yet) always goes first.

import { db } from '../db.js'
import { geminiGroundedSearch } from '../gemini.js'
import { modelForTask } from '../modelRouting.js'
import { RESEARCH_SYSTEM, researchPrompt, parseResearch, nicheKey } from './nicheResearchParse.js'

type Log = (level: string, msg: string, extra?: Record<string, unknown>) => void
export const RESEARCH_CHECK_MS = 10 * 60 * 1000
export const RESEARCH_TTL_DAYS = 7
let lastCheck = 0

export async function runNicheResearch(log: Log): Promise<void> {
  if (Date.now() - lastCheck < RESEARCH_CHECK_MS) return
  lastCheck = Date.now()
  const { data, error } = await db.rpc('niche_research_due', { p_ttl_days: RESEARCH_TTL_DAYS })
  if (error) { log('error', 'niche_research_due_failed', { error: error.message }); return }
  const due = (Array.isArray(data) ? data[0] : null) as { sub_niche: string; niche: string | null } | null
  if (!due) return
  const key = nicheKey(due.sub_niche)
  if (!key) return
  const today = new Date().toISOString().slice(0, 10)
  const model = modelForTask('search')
  try {
    const ans = await geminiGroundedSearch(RESEARCH_SYSTEM, researchPrompt(due.sub_niche, due.niche, today), model)
    const items = ans.sources.length > 0 ? parseResearch(ans.text) : []
    await db.from('niche_research').upsert({
      niche_key: key, sub_niche: due.sub_niche.slice(0, 120), niche: due.niche?.slice(0, 120) ?? null,
      items, sources: ans.sources.slice(0, 12).map((s) => ({ title: s.title ?? null, url: s.uri ?? null })),
      model, researched_at: new Date().toISOString(),
    }, { onConflict: 'niche_key' })
    log('info', 'niche_research', { event: 'niche_research', niche: key, items: items.length, sources: ans.sources.length })
  } catch (err) {
    log('error', 'niche_research_failed', { niche: key, error: err instanceof Error ? err.message.slice(0, 200) : String(err) })
  }
}

// FOUND YOU ELSEWHERE (24-ideas #15, #16) — finds podcasts, interviews and
// press about a creator once a month, keeps them as CANDIDATES, and files only
// the ones she confirms into her knowledge (source 'user': she said so).
//
// ⚖️ ON TOP OF THE SYSTEM: one voice per kick, every 10 minutes at most, any
// failure logged and the voice stamped so it is not retried until next month.

import { db } from '../db.js'
import { geminiGroundedSearch } from '../gemini.js'
import { modelForTask } from '../modelRouting.js'
import { insertKnowledge } from '../knowledgeInsert.js'
import { MENTIONS_SYSTEM, mentionsPrompt, parseMentions, mentionKnowledge } from './mentionsParse.js'

type Log = (level: string, msg: string, extra?: Record<string, unknown>) => void
export const MENTIONS_INTERVAL_MS = 10 * 60 * 1000
let last = 0

export async function runMentionFinder(log: Log): Promise<void> {
  if (Date.now() - last < MENTIONS_INTERVAL_MS) return
  last = Date.now()
  const { data, error } = await db.rpc('mentions_due', { p_limit: 1 })
  if (error) { log('error', 'mentions_due_failed', { error: error.message }); return }
  const v = (Array.isArray(data) ? data[0] : null) as
    { voice_id: string; owner_id: string; handle: string | null; platform: string | null; label: string | null; niche: string | null } | null
  if (!v) return
  const stamp = () => db.from('mention_searches').upsert({ voice_id: v.voice_id, searched_at: new Date().toISOString() }, { onConflict: 'voice_id' })
  try {
    const ans = await geminiGroundedSearch(MENTIONS_SYSTEM, mentionsPrompt(v), modelForTask('search'))
    const found = ans.sources.length > 0 ? parseMentions(ans.text, ans.sources) : []
    if (found.length) {
      await db.from('creator_mentions').upsert(found.map((m) => ({
        owner_id: v.owner_id, voice_id: v.voice_id, kind: m.kind, title: m.title, outlet: m.outlet, url: m.url, published: m.published,
      })), { onConflict: 'owner_id,url', ignoreDuplicates: true })
    }
    await stamp()
    log('info', 'mentions_found', { event: 'mentions_found', voice: v.voice_id, found: found.length, sources: ans.sources.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : String(err)
    if (/quota|429|API key|GEMINI_API_KEY/i.test(msg)) { log('error', 'mentions_stopped', { error: msg }); return }
    await stamp()
    log('error', 'mentions_failed', { voice: v.voice_id, error: msg })
  }
}

/** Only what she confirmed becomes knowledge. */
export async function fileConfirmedMentions(log: Log): Promise<void> {
  const { data } = await db.from('creator_mentions')
    .select('id, owner_id, voice_id, kind, title, outlet, url').eq('status', 'confirmed').is('filed_at', null).limit(10)
  let filed = 0
  for (const m of (data ?? []) as Array<{ id: string; owner_id: string; voice_id: string | null; kind: string; title: string; outlet: string; url: string }>) {
    const k = mentionKnowledge(m)
    const { error } = await insertKnowledge(db as never, [{
      owner_id: m.owner_id, voice_id: m.voice_id, kind: k.kind, text: k.text, basis: 'stated', source: 'user',
      confidence: 1, times_seen: 1, source_url: m.url, source_ref: `mention:${m.id}`,
    }] as never)
    if (!error) filed += 1
    else log('error', 'mention_file_failed', { error: String(error.message ?? '').slice(0, 200) })
    await db.from('creator_mentions').update({ filed_at: new Date().toISOString() }).eq('id', m.id)
  }
  if (filed) log('info', 'mentions_filed', { event: 'mentions_filed', filed })
}

// THE IDEA WRITER — "post these next", once a day per creator voice.
//
// ⚖️ IT READS WHAT THE BRAIN ALREADY KNOWS; it adds no new source. One voice per
// run, every ten minutes, so it never competes with a creator's own jobs.

import { db } from '../db.js'
import { geminiJson, geminiEmbed } from '../gemini.js'
import { modelForTask } from '../modelRouting.js'
import { IDEAS_SCHEMA, IDEAS_SYSTEM, normalizeIdeas } from './ideasParse.js'

export const IDEAS_INTERVAL_MS = 10 * 60 * 1000
type Log = (level: string, msg: string, extra?: Record<string, unknown>) => void
let last = 0

const j = (v: unknown, n = 1800) => JSON.stringify(v ?? null).slice(0, n)

export async function runIdeaWriter(log: Log): Promise<void> {
  if (Date.now() - last < IDEAS_INTERVAL_MS) return
  last = Date.now()
  const day = new Date().toISOString().slice(0, 10)
  const { data: due, error } = await db.rpc('ideas_due', { p_day: day, p_limit: 1 })
  if (error) { log('error', 'ideas_due_failed', { error: error.message }); return }
  const v = Array.isArray(due) ? due[0] as { voice_id: string; owner_id: string; profile: Record<string, unknown> } : null
  if (!v) return
  const p = v.profile ?? {}
  const niche = String(p.niche ?? ''), sub = String(p.sub_niche ?? '')
  try {
    const { data: products } = await db.from('product_entities')
      .select('id, name, offer, creator_summary').eq('owner_id', v.owner_id).is('archived_at', null).limit(12)
    const productIds = new Set((products ?? []).map((r) => r.id as string))
    const [{ data: record }, { data: trends }, { data: moments }] = await Promise.all([
      db.rpc('creator_track_record', { p_owner: v.owner_id, p_voice: v.voice_id }),
      db.rpc('brain_trends', { p_bucket: null, p_sub_niche: sub || null }),
      db.from('brain_moments').select('bucket, moments').order('day', { ascending: false }).limit(12),
    ])
    const emb = await geminiEmbed([sub, niche, String(p.audience ?? '')].filter(Boolean).join(' | '))
    const notes = emb
      ? (await db.rpc('brain_brief_scoped', { p_embedding: `[${emb.join(',')}]`, p_owner: v.owner_id, p_k: 18 })).data
      : []
    const prompt = [
      `CREATOR DNA: ${j({ niche, sub_niche: sub, audience: p.audience, formats: p.formats, tone: p.voice ?? p.tone, goal: p.goal }, 1200)}`,
      `PRODUCTS (use these ids only): ${j(products, 1500)}`,
      `HER TRACK RECORD: ${j(record, 2500)}`,
      `RISING IN HER LANE: ${j((Array.isArray(trends) ? trends : []).filter((t: { kind?: string }) => t.kind !== 'moment').slice(0, 6), 800)}`,
      `WORLD MOMENTS (all niches, pick only relevant): ${j(moments, 2000)}`,
      `NICHE PATTERNS: ${j((Array.isArray(notes) ? notes : []).map((n: { kind: string; title: string; is_hers?: boolean }) => `${n.kind}${n.is_hers ? ' (hers)' : ''}: ${n.title}`), 2500)}`,
    ].join('\n\n')
    const raw = await geminiJson(IDEAS_SYSTEM, prompt, IDEAS_SCHEMA, 60_000, 0, modelForTask('read'))
    const ideas = normalizeIdeas(raw, productIds)
    if (ideas.length === 0) { log('info', 'ideas', { event: 'ideas', voice: v.voice_id, written: 0 }); return }
    const { error: insErr } = await db.from('creator_ideas').insert(
      ideas.map((i) => ({ ...i, owner_id: v.owner_id, voice_id: v.voice_id, batch_day: day })),
    )
    if (insErr) throw new Error(insErr.message)
    log('info', 'ideas', { event: 'ideas', voice: v.voice_id, written: ideas.length })
  } catch (err) {
    log('error', 'ideas_failed', { voice: v.voice_id, error: err instanceof Error ? err.message.slice(0, 200) : String(err) })
  }
}

// WHAT IS EACH FACT FOR? (owner 2026-10-02) — labels every fact with the
// objectives it may serve. Rules first (free); the model only for what the
// rules cannot place; her own plan-screen choices correct both.
//
// ⚖️ ON TOP OF THE SYSTEM: small batches each sweep, every failure logged and
// swallowed. A fact the model cannot place is stored as serving nothing
// (basis 'none') — ineligible until her choices teach it (owner's call).

import { db } from '../db.js'
import { geminiJson } from '../gemini.js'
import { modelForTask } from '../modelRouting.js'
import {
  purposeByRules, cleanModelPurpose, PURPOSE_MODEL_SYSTEM, PURPOSE_MODEL_SCHEMA, PURPOSE_GOALS,
} from '../generated/factPurpose.js'

type Log = (level: string, msg: string, extra?: Record<string, unknown>) => void
const RULE_BATCH = 300
const MODEL_BATCH = 25
const MODEL_CALLS_PER_SWEEP = 2

async function label(id: string, serves: string[], basis: 'rule' | 'model' | 'none' | 'her'): Promise<boolean> {
  const { error } = await db.from('creator_knowledge')
    .update({ serves, serves_basis: basis, serves_at: new Date().toISOString() }).eq('id', id)
  return !error
}

export async function runFactPurposeLabeler(log: Log): Promise<void> {
  let rule = 0, model = 0, none = 0
  const { data } = await db.from('creator_knowledge')
    .select('id, kind, text, source').is('serves_at', null).order('created_at', { ascending: true }).limit(RULE_BATCH)
  const rows = (data ?? []) as Array<{ id: string; kind: string; text: string; source: string | null }>
  const unsure: typeof rows = []
  for (const r of rows) {
    const p = purposeByRules(r)
    if (p.confident) { if (await label(r.id, p.serves, 'rule')) rule++ }
    else unsure.push(r)
  }
  for (let i = 0; i < Math.min(unsure.length, MODEL_BATCH * MODEL_CALLS_PER_SWEEP); i += MODEL_BATCH) {
    const batch = unsure.slice(i, i + MODEL_BATCH)
    try {
      const raw = await geminiJson(PURPOSE_MODEL_SYSTEM,
        batch.map((r) => `id: ${r.id}\nkind: ${r.kind}\nfact: ${r.text}`).join('\n\n'),
        PURPOSE_MODEL_SCHEMA, 45_000, 0, modelForTask('read')) as Array<{ id?: unknown; serves?: unknown; confidence?: unknown }>
      const byId = new Map((Array.isArray(raw) ? raw : []).map((x) => [String(x.id ?? ''), x]))
      for (const r of batch) {
        const s = cleanModelPurpose(byId.get(r.id) ?? {}, r.text)
        if (await label(r.id, s, s.length ? 'model' : 'none')) { if (s.length) model++; else none++ }
      }
    } catch (err) {
      log('warn', 'fact_purpose_model_failed', { event: 'fact_purpose_model_failed', error: err instanceof Error ? err.message.slice(0, 200) : String(err) })
      break
    }
  }
  if (rule + model + none) log('info', 'fact_purposes_labeled', { event: 'fact_purposes_labeled', rule, model, none })
  await learnFromHerChoices(log)
}

/**
 * Her plan-screen choices, per objective: switched ON for an objective adds it
 * (she chose it herself); switched OFF twice for an objective removes it.
 */
export async function learnFromHerChoices(log: Log): Promise<void> {
  const { data } = await db.from('fact_purpose_votes')
    .select('id, owner_id, knowledge_id, goal').is('learned_at', null).limit(200)
  const votes = (data ?? []) as Array<{ id: number; owner_id: string; knowledge_id: string; goal: string }>
  const pairs = new Map<string, { owner_id: string; knowledge_id: string; goal: string; ids: number[] }>()
  for (const v of votes) {
    const k = `${v.knowledge_id}|${v.goal}`
    const p = pairs.get(k) ?? { owner_id: v.owner_id, knowledge_id: v.knowledge_id, goal: v.goal, ids: [] }
    p.ids.push(v.id); pairs.set(k, p)
  }
  let changed = 0
  for (const p of pairs.values()) {
    if (!(PURPOSE_GOALS as readonly string[]).includes(p.goal)) continue
    // The ids came from a browser: only her own fact is ever changed, by her own votes.
    const { data: all } = await db.from('fact_purpose_votes').select('vote')
      .eq('knowledge_id', p.knowledge_id).eq('goal', p.goal).eq('owner_id', p.owner_id)
    const ups = (all ?? []).filter((x: { vote: number }) => x.vote > 0).length
    const downs = (all ?? []).filter((x: { vote: number }) => x.vote < 0).length
    const { data: row } = await db.from('creator_knowledge').select('serves')
      .eq('id', p.knowledge_id).eq('owner_id', p.owner_id).maybeSingle()
    if (!row) { await db.from('fact_purpose_votes').update({ learned_at: new Date().toISOString() }).in('id', p.ids); continue }
    const cur = new Set<string>(Array.isArray(row?.serves) ? row!.serves as string[] : [])
    const before = cur.has(p.goal)
    if (ups > downs) cur.add(p.goal)
    else if (downs >= 2) cur.delete(p.goal)
    if (cur.has(p.goal) !== before && await label(p.knowledge_id, [...cur], 'her')) changed++
    await db.from('fact_purpose_votes').update({ learned_at: new Date().toISOString() }).in('id', p.ids)
  }
  if (changed) log('info', 'fact_purposes_learned', { event: 'fact_purposes_learned', changed })
}

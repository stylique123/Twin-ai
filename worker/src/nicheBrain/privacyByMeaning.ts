// PRIVATE BY MEANING (owner 2026-10-04): every stored fact, every account,
// old and new, is read once by a model that judges whether it is private.
//
// ⚖️ One way only: it can mark a fact private, never public. A fact she
// confirmed herself is left as she has it. Small batches each sweep; failures
// are logged and swallowed, and the fact is re-checked next sweep.

import { db } from '../db.js'
import { geminiJson } from '../gemini.js'
import { modelForTask } from '../modelRouting.js'
import { PRIVACY_SYSTEM, PRIVACY_SCHEMA, cleanPrivacy, privacyPrompt } from './privacyByMeaningParse.js'

type Log = (level: string, msg: string, extra?: Record<string, unknown>) => void
const BATCH = 40
const CALLS_PER_SWEEP = 3

export async function runPrivacyByMeaning(log: Log): Promise<void> {
  let marked = 0, checked = 0
  for (let call = 0; call < CALLS_PER_SWEEP; call++) {
    const { data } = await db.from('creator_knowledge')
      .select('id, text, evidence, sensitive, creator_confirmed_at')
      .is('privacy_checked_at', null).order('created_at', { ascending: true }).limit(BATCH)
    const rows = (data ?? []) as Array<{ id: string; text: string; evidence: string | null; sensitive: boolean | null; creator_confirmed_at: string | null }>
    if (!rows.length) break
    const now = new Date().toISOString()
    const done = rows.filter((r) => r.sensitive || r.creator_confirmed_at)
    const ask = rows.filter((r) => !r.sensitive && !r.creator_confirmed_at)
    let verdicts = new Map<string, { private: boolean; category: string }>()
    if (ask.length) {
      try {
        verdicts = cleanPrivacy(await geminiJson(PRIVACY_SYSTEM, privacyPrompt(ask), PRIVACY_SCHEMA, 45_000, 0, modelForTask('read')), ask.map((r) => r.id))
      } catch (err) {
        log('warn', 'privacy_by_meaning_failed', { event: 'privacy_by_meaning_failed', error: err instanceof Error ? err.message.slice(0, 200) : String(err) })
        break
      }
    }
    for (const r of ask) {
      const v = verdicts.get(r.id)
      if (!v) continue // unanswered → re-checked next sweep
      const patch: Record<string, unknown> = { privacy_checked_at: now }
      if (v.private) { patch.sensitive = true; marked++ }
      const { error } = await db.from('creator_knowledge').update(patch).eq('id', r.id).is('creator_confirmed_at', null)
      if (!error) checked++
    }
    if (done.length) await db.from('creator_knowledge').update({ privacy_checked_at: now }).in('id', done.map((r) => r.id))
    checked += done.length
  }
  if (checked) log('info', 'privacy_by_meaning', { event: 'privacy_by_meaning', checked, marked })
}

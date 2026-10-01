// A CHANGE OF MIND, ACROSS TIME (24-ideas #8). Once a month per creator with
// dated opinions 60+ days apart: the model proposes reversals, the dates are
// re-checked, she confirms, and only confirmed ones become knowledge (source
// 'user', kind 'experience', both of her sentences kept as evidence).

import { db } from '../db.js'
import { geminiJson } from '../gemini.js'
import { modelForTask } from '../modelRouting.js'
import { insertKnowledge } from '../knowledgeInsert.js'
import { SHIFTS_SYSTEM, shiftsPrompt, parseShifts, shiftKnowledge, type DatedOpinion } from './shiftsParse.js'

type Log = (level: string, msg: string, extra?: Record<string, unknown>) => void
const SCHEMA = {
  type: 'OBJECT',
  properties: { pairs: { type: 'ARRAY', items: { type: 'OBJECT', properties: { earlier: { type: 'INTEGER' }, later: { type: 'INTEGER' }, summary: { type: 'STRING' } }, required: ['earlier', 'later', 'summary'] } } },
  required: ['pairs'],
}
export const SHIFTS_INTERVAL_MS = 10 * 60 * 1000
let last = 0

export async function runShiftFinder(log: Log): Promise<void> {
  if (Date.now() - last < SHIFTS_INTERVAL_MS) return
  last = Date.now()
  const { data, error } = await db.rpc('shifts_due', { p_limit: 1 })
  if (error) { log('error', 'shifts_due_failed', { error: error.message }); return }
  const owner = (Array.isArray(data) ? data[0] : null)?.owner_id as string | undefined
  if (!owner) return
  const stamp = () => db.from('shift_searches').upsert({ owner_id: owner, searched_at: new Date().toISOString() }, { onConflict: 'owner_id' })
  try {
    const { data: rows } = await db.from('creator_knowledge')
      .select('id, text, video_posted_at, voice_id').eq('owner_id', owner).eq('kind', 'opinion').eq('source', 'transcript')
      .not('video_posted_at', 'is', null).order('video_posted_at').limit(60)
    const ops: DatedOpinion[] = ((rows ?? []) as Array<{ id: string; text: string; video_posted_at: string }>)
      .map((r) => ({ id: r.id, text: r.text, at: r.video_posted_at }))
    const voice = ((rows ?? [])[0] as { voice_id?: string | null } | undefined)?.voice_id ?? null
    const shifts = ops.length >= 2 ? parseShifts(await geminiJson(SHIFTS_SYSTEM, shiftsPrompt(ops), SCHEMA, 45_000, 0, modelForTask('read')), ops) : []
    if (shifts.length) {
      await db.from('creator_shifts').upsert(shifts.map((s) => ({
        owner_id: owner, voice_id: voice, earlier_id: s.earlier.id, later_id: s.later.id,
        earlier_text: s.earlier.text, later_text: s.later.text, earlier_at: s.earlier.at, later_at: s.later.at, summary: s.summary,
      })), { onConflict: 'earlier_id,later_id', ignoreDuplicates: true })
    }
    await stamp()
    log('info', 'shifts_found', { event: 'shifts_found', owner, opinions: ops.length, found: shifts.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : String(err)
    if (/quota|429|API key|GEMINI_API_KEY/i.test(msg)) { log('error', 'shifts_stopped', { error: msg }); return }
    await stamp()
    log('error', 'shifts_failed', { owner, error: msg })
  }
}

export async function fileConfirmedShifts(log: Log): Promise<void> {
  const { data } = await db.from('creator_shifts')
    .select('id, owner_id, voice_id, earlier_text, later_text, summary').eq('status', 'confirmed').is('filed_at', null).limit(10)
  let filed = 0
  for (const s of (data ?? []) as Array<{ id: string; owner_id: string; voice_id: string | null; earlier_text: string; later_text: string; summary: string }>) {
    const { error } = await insertKnowledge(db as never, [{
      owner_id: s.owner_id, voice_id: s.voice_id, kind: 'experience', text: shiftKnowledge(s),
      // ⚠️ AUDIT 2026-10-01 (B2): the summary is Twin's wording of two of her
      // opinions, so it is inferred; her own words stay in the evidence.
      basis: 'inferred', source: 'user',
      confidence: 1, times_seen: 1, source_ref: `shift:${s.id}`,
      evidence: `Earlier: ${s.earlier_text} | Later: ${s.later_text}`.slice(0, 240),
    }] as never)
    if (!error) filed += 1
    await db.from('creator_shifts').update({ filed_at: new Date().toISOString() }).eq('id', s.id)
  }
  if (filed) log('info', 'shifts_filed', { event: 'shifts_filed', filed })
}

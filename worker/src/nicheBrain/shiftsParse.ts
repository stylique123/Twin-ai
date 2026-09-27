// A CHANGE OF MIND, ACROSS TIME (24-ideas #8) — pure part.
//
// ⚖️ "I used to think X, now I think Y" is some of the richest material a
// creator has, and it only exists when the same topic comes up twice, months
// apart. The model proposes pairs; every pair is re-checked here against the
// real video dates (60+ days apart, later really later) and she confirms it
// before anything uses it.

export interface DatedOpinion { id: string; text: string; at: string }
export interface Shift { earlier: DatedOpinion; later: DatedOpinion; summary: string }

export const SHIFTS_SYSTEM = [
  'You are given a creator\'s own stated opinions, each with the date of the video it came from.',
  'Find pairs where a LATER opinion clearly reverses, softens or contradicts an EARLIER one on the same topic — a real change of mind, not two different topics.',
  'Return JSON only: {"pairs":[{"earlier":<index>,"later":<index>,"summary":"<one plain sentence: she used to …, now she …>"}]}. At most 3. An empty list is a good answer.',
].join('\n')

export function shiftsPrompt(ops: readonly DatedOpinion[]): string {
  return ops.map((o, i) => `${i}. [${o.at.slice(0, 10)}] ${o.text}`).join('\n')
}

const DAY = 86_400_000

export function parseShifts(raw: unknown, ops: readonly DatedOpinion[]): Shift[] {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { pairs?: unknown }
  const out: Shift[] = []
  const seen = new Set<string>()
  for (const p of Array.isArray(r.pairs) ? r.pairs : []) {
    const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
    const e = ops[Number(o.earlier)], l = ops[Number(o.later)]
    const summary = typeof o.summary === 'string' ? o.summary.replace(/\s+/g, ' ').trim().slice(0, 240) : ''
    if (!e || !l || e.id === l.id || summary.length < 4) continue
    if (Date.parse(l.at) - Date.parse(e.at) < 60 * DAY) continue
    const key = `${e.id}:${l.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ earlier: e, later: l, summary })
  }
  return out.slice(0, 3)
}

/** What a CONFIRMED change of mind becomes in her knowledge. */
export function shiftKnowledge(s: { earlier_text: string; later_text: string; summary: string }): string {
  return `Changed her mind: ${s.summary}`.slice(0, 240)
}

// THE "USING" LIST'S TWO BUTTONS (web UI from #1300, UsingList.tsx; trial only).
//
//   Remove from this script → the sentences traced to that item leave THIS
//     script, and the gap is refilled by the panel-10 relevance rules
//     (relevantRefillUnits): only her items for this request, never a second
//     story, never a repeat, stopping where relevance ends.
//   Never use → a per-creator block list, stored on her default voice
//     (brand_voices.profile.never_use, the same per-creator store the voice card
//     edits use; no migration). It covers every item kind the list shows: her
//     facts (also switched off with creator_excluded_at, as before), her
//     answers, a product's facts, the brand, and outside items. The planner,
//     every refill, Plan B and the outside selection read their items through
//     filterLedgerByNeverUse / outsideAllowed, so a blocked item never returns.
//
// ⚖️ PURE. No I/O; the edge and the worker do the reads and writes.

import { contentWords, nearDuplicate, relevantRefillUnits, sameText, spokenLineCount, splitSentences, SPOKEN_LINE_FLOOR, type LedgerItem, type RefillContext } from './inventionGate.js'

export type NeverUseKind = 'fact' | 'answer' | 'product' | 'brand' | 'outside'
export interface NeverUseEntry {
  kind: NeverUseKind
  /** creator_knowledge id (facts) or ledger id, when known. */
  id: string | null
  /** product_entities id (product entries). */
  product_id: string | null
  /** Her item's text (or its clipped label), without the list's prefix. */
  text: string
  at?: string
}

/** One row of the Using list, as the web sends it (a `line_sources[].from[]` hit). */
export interface UsingItemRef { kind: string; label: string; id?: string | null }

export const NEVER_USE_MAX = 200
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KINDS: ReadonlySet<string> = new Set(['fact', 'answer', 'product', 'brand', 'outside'])

const clean = (t: string) => t.replace(/[…]+$|\.{3}$/, '').replace(/\s+/g, ' ').trim()
const norm = (t: string) => clean(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** The stored list, read defensively (anything malformed is dropped). Pure. */
export function sanitizeNeverUse(raw: unknown): NeverUseEntry[] {
  if (!Array.isArray(raw)) return []
  const out: NeverUseEntry[] = []
  for (const r of raw) {
    const e = (r ?? {}) as Record<string, unknown>
    if (typeof e.kind !== 'string' || !KINDS.has(e.kind)) continue
    const text = typeof e.text === 'string' ? clean(e.text).slice(0, 400) : ''
    const id = typeof e.id === 'string' && e.id.length <= 120 ? e.id : null
    const product_id = typeof e.product_id === 'string' && UUID.test(e.product_id) ? e.product_id : null
    if (!text && !id && !product_id && e.kind !== 'brand') continue
    out.push({ kind: e.kind as NeverUseKind, id, product_id, text, ...(typeof e.at === 'string' ? { at: e.at.slice(0, 40) } : {}) })
  }
  return out.slice(-NEVER_USE_MAX)
}

/** The block entry for a Using-list row, or null when the row cannot be blocked
 *  (her idea for this video is the request itself). Pure. */
export function neverUseEntryOf(item: UsingItemRef, productId: string | null = null): NeverUseEntry | null {
  const label = clean(String(item.label ?? ''))
  const id = typeof item.id === 'string' && item.id ? item.id : null
  switch (item.kind) {
    case 'fact': return id || label ? { kind: 'fact', id, product_id: null, text: label } : null
    case 'her_words': {
      const m = /^Your answer:\s*(.+)$/i.exec(label)
      return m ? { kind: 'answer', id, product_id: null, text: clean(m[1]!) } : null
    }
    case 'product': return label || productId ? { kind: 'product', id: null, product_id: productId, text: label } : null
    case 'brand': return { kind: 'brand', id: null, product_id: null, text: '' }
    case 'audience': case 'niche': case 'world': {
      const t = clean(label.replace(/^(?:Reddit|Niche)\s+[a-z_]*:\s*|^Research:\s*/i, ''))
      return t ? { kind: 'outside', id, product_id: null, text: t } : null
    }
    default: return null
  }
}

/** The list with `e` added once. Pure. */
export function addNeverUse(list: readonly NeverUseEntry[], e: NeverUseEntry): NeverUseEntry[] {
  const same = (a: NeverUseEntry) => a.kind === e.kind && (a.id ?? '') === (e.id ?? '') && (a.product_id ?? '') === (e.product_id ?? '') && norm(a.text) === norm(e.text)
  return list.some(same) ? [...list] : [...list, e].slice(-NEVER_USE_MAX)
}

/** Her text matches a blocked text: same words, one a prefix of the other (a clipped label), or a near duplicate. Pure. */
export function textMatches(text: string, blocked: string): boolean {
  const a = norm(text)
  const b = norm(blocked)
  if (!a || !b) return false
  if (a === b) return true
  if (b.length >= 12 && a.startsWith(b)) return true
  if (a.length >= 12 && b.startsWith(a)) return true
  return contentWords(b).size >= 4 && nearDuplicate(text, blocked)
}

const HER: ReadonlySet<string> = new Set(['her_story', 'her_fact', 'her_answer'])
const OUTSIDE: ReadonlySet<string> = new Set(['outside_research', 'outside_moment', 'niche_note', 'audience_question'])

/** Whether one ledger item is blocked. Pure. */
export function ledgerItemBlocked(it: Pick<LedgerItem, 'id' | 'origin' | 'product_id' | 'text'>, list: readonly NeverUseEntry[]): boolean {
  for (const e of list) {
    if (e.id && it.id.replace(/#\d+$/, '') === e.id) return true
    switch (e.kind) {
      case 'fact': case 'answer': if (HER.has(it.origin) && e.text && textMatches(it.text, e.text)) return true; break
      case 'outside': if (OUTSIDE.has(it.origin) && e.text && textMatches(it.text, e.text)) return true; break
      case 'product': if ((it.origin === 'product_fact' || it.origin === 'offer' || it.origin === 'urgency') && !!e.product_id && it.product_id === e.product_id) return true; break
      case 'brand': if ((it.origin === 'offer' || it.origin === 'urgency') && !it.product_id) return true; break
    }
  }
  return false
}

/** The ledger without her blocked items (planner, refill, Plan B all read it). Pure. */
export function filterLedgerByNeverUse<T extends Pick<LedgerItem, 'id' | 'origin' | 'product_id' | 'text'>>(ledger: readonly T[], list: readonly NeverUseEntry[]): T[] {
  return list.length ? ledger.filter((it) => !ledgerItemBlocked(it, list)) : [...ledger]
}

/** A knowledge row (creator_knowledge shape) she has blocked, by id or text. Pure. */
export function knowledgeBlocked(row: { id?: unknown; text?: unknown }, list: readonly NeverUseEntry[]): boolean {
  const id = String(row.id ?? '')
  const text = String(row.text ?? '')
  return list.some((e) => (e.kind === 'fact' || e.kind === 'answer')
    && ((!!e.id && e.id === id) || (!!e.text && textMatches(text, e.text))))
}

/** Her answers for this request without the blocked ones. Pure. */
export function answersAllowed<T>(answers: Record<string, T>, list: readonly NeverUseEntry[]): Record<string, T> {
  const blocked = list.filter((e) => e.kind === 'answer' && e.text)
  if (!blocked.length) return { ...answers }
  return Object.fromEntries(Object.entries(answers).filter(([, v]) => !(typeof v === 'string' && blocked.some((e) => textMatches(v, e.text)))))
}

/** An outside item (any list: notes, trends, moments, research, reddit) she has not blocked. Pure. */
export function outsideAllowed(item: unknown, list: readonly NeverUseEntry[]): boolean {
  const blocked = list.filter((e) => e.kind === 'outside' && e.text)
  if (!blocked.length) return true
  const r = (item ?? {}) as Record<string, unknown>
  const texts = ['text', 'name', 'title', 'claim', 'detail'].map((k) => r[k]).filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  return !texts.some((t) => blocked.some((e) => textMatches(t, e.text)))
}

// ── REMOVE FROM THIS SCRIPT ─────────────────────────────────────────────────

export interface TracedRow { beat: number; sentence: string; from: Array<{ kind: string; label: string; id?: string }> }

/** Whether a traced source hit is the Using-list row. Pure. */
export function hitIs(h: { kind?: unknown; label?: unknown; id?: unknown }, item: UsingItemRef): boolean {
  if (h.kind !== item.kind) return false
  if (item.id && typeof h.id === 'string') return h.id === item.id
  return typeof h.label === 'string' && h.label === item.label
}

export interface RemoveUsingResult<B> {
  script: Array<B | { section: string; line: string; refill: true }>
  line_sources: TracedRow[]
  removed: number
  beats_dropped: number
  refilled: number
}

/**
 * Drop every sentence traced to `item` from this script, then refill up to the
 * number removed (at least to the spoken floor) from her other items by the
 * panel-10 relevance rules. The item itself (and anything she has blocked) is
 * never a refill. Pure.
 */
export function removeUsingItem<B extends { section?: unknown; line?: unknown }>(
  script: readonly B[],
  lineSources: readonly TracedRow[],
  item: UsingItemRef,
  opts: { ledger: readonly LedgerItem[]; targetProductId: string | null; ctx: RefillContext; productId?: string | null; neverUse?: readonly NeverUseEntry[] },
): RemoveUsingResult<B> {
  const cut = new Map<number, string[]>()
  for (const t of lineSources) if (Array.isArray(t.from) && t.from.some((h) => hitIs(h, item))) cut.set(t.beat, [...(cut.get(t.beat) ?? []), t.sentence])
  let removed = 0
  let beatsDropped = 0
  const kept: B[] = []
  script.forEach((b, bi) => {
    const drop = cut.get(bi)
    if (!drop || typeof b.line !== 'string') { kept.push(b); return }
    const ss = splitSentences(b.line)
    const left = ss.filter((s) => !drop.some((d) => sameText(d, s)))
    removed += ss.length - left.length
    if (left.length) kept.push(left.length === ss.length ? b : { ...b, line: left.join(' ') })
    else beatsDropped++
  })
  const entry = neverUseEntryOf(item, opts.productId ?? null)
  const pool = filterLedgerByNeverUse(opts.ledger, [...(opts.neverUse ?? []), ...(entry ? [entry] : [])])
  const out: Array<B | { section: string; line: string; refill: true }> = [...kept]
  let refilled = 0
  const want = removed ? Math.max(1, Math.min(removed, 3)) : 0
  while (refilled < want || spokenLineCount(out as Array<{ line?: unknown }>) < SPOKEN_LINE_FLOOR) {
    if (!removed) break
    const lines = out.map((b) => (typeof b?.line === 'string' ? b.line : ''))
    const next = relevantRefillUnits(pool, opts.targetProductId, lines, opts.ctx)[0]?.text
    if (!next) break
    out.splice(Math.max(1, out.length - 1), 0, { section: 'body', line: next, refill: true })
    refilled++
  }
  // The trace follows the new script: a kept sentence keeps its sources; a refill is traced to nothing yet.
  const traced: TracedRow[] = []
  out.forEach((b, bi) => {
    if (typeof b.line !== 'string') return
    for (const s of splitSentences(b.line)) {
      const old = lineSources.find((t) => sameText(t.sentence, s) && !(t.from ?? []).some((h) => hitIs(h, item)))
      traced.push({ beat: bi, sentence: s, from: old ? old.from : [] })
    }
  })
  return { script: out, line_sources: traced, removed, beats_dropped: beatsDropped, refilled }
}

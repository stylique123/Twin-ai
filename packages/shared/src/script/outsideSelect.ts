// OUTSIDE ITEMS: ONLY THE RELEVANT FEW REACH THE WRITER (owner A4).
//
// Measured: ~45 outside items (niche notes, trends, moments, research, Reddit)
// reached the writer per script and 0 sentences traced to them; most were off
// topic. This scorer is deterministic — no model call — and keeps the top
// `cap` items whose score clears `minScore`, nothing below it.
//
//   score = overlap (content words shared with the request / spine / pillars,
//           1 per word, max 4)
//         + recency  (0..0.5: dated within 14 days 0.5, within 60 days 0.25)
//         + verification (0..0.5: sourced 0.5, measured 0.35, corpus 0.25,
//           audience 0.1)
//
// An item with zero overlap is never kept, whatever its recency: a fresh,
// verified item about something else is still about something else.

export type OutsideVerification = 'sourced' | 'measured' | 'corpus' | 'audience'
export interface OutsideItem { id: string; kind: string; text: string; when?: string | null; verification: OutsideVerification }
export interface OutsideScored extends OutsideItem { score: number; overlap: number }
export interface OutsideSelectOptions { minScore?: number; cap?: number; now?: number }
export interface OutsideSelected { offered: number; kept: number; min_score: number }

export const OUTSIDE_MIN_SCORE = 1.25
export const OUTSIDE_CAP = 8

const STOP = new Set(('a an and are as at be but by can do does for from has have her his how i if in into is it its just me my no not of on or our she so than that the their them then there these they this to too up us was we what when where which who why will with you your about after all also any been being more most much only other over some such very want get got make made like one two new'
  ).split(' '))

/** Content words of a text: lower-case, 3+ letters, stop words out, crude plural fold. */
export function contentWords(text: string): Set<string> {
  const out = new Set<string>()
  for (const w0 of String(text ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (w0.length < 3 || STOP.has(w0)) continue
    out.add(w0.length > 4 && w0.endsWith('s') && !w0.endsWith('ss') ? w0.slice(0, -1) : w0)
  }
  return out
}

const VERIFY: Record<OutsideVerification, number> = { sourced: 0.5, measured: 0.35, corpus: 0.25, audience: 0.1 }

function recency(when: string | null | undefined, now: number): number {
  if (!when) return 0
  const t = Date.parse(String(when))
  if (!Number.isFinite(t)) return 0
  const days = Math.abs(now - t) / 86_400_000
  return days <= 14 ? 0.5 : days <= 60 ? 0.25 : 0
}

export function scoreOutside(item: OutsideItem, topic: ReadonlySet<string>, now: number): OutsideScored {
  let overlap = 0
  for (const w of contentWords(item.text)) if (topic.has(w)) overlap++
  const score = overlap === 0 ? 0 : Math.min(overlap, 4) + recency(item.when, now) + VERIFY[item.verification]
  return { ...item, overlap, score: Math.round(score * 100) / 100 }
}

/**
 * Keep the top `cap` items scoring at least `minScore` against the request,
 * spine and pillar texts. Ties break by id so the same inputs always keep the
 * same items.
 */
export function selectOutside(items: readonly OutsideItem[], topicTexts: readonly string[], opts: OutsideSelectOptions = {}): { kept: OutsideScored[]; record: OutsideSelected } {
  const minScore = opts.minScore ?? OUTSIDE_MIN_SCORE
  const cap = opts.cap ?? OUTSIDE_CAP
  const now = opts.now ?? Date.now()
  const topic = new Set<string>()
  for (const t of topicTexts) for (const w of contentWords(t)) topic.add(w)
  const kept = items.map((i) => scoreOutside(i, topic, now))
    .filter((s) => s.overlap > 0 && s.score >= minScore)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, cap)
  return { kept, record: { offered: items.length, kept: kept.length, min_score: minScore } }
}

/** The five outside lists the edge reads, in their stored shapes (loosely typed). */
export interface OutsideLists<N, T, M, R, D> { notes: N[]; trends: T[]; moments: M[]; research: R[]; reddit: D[] }

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Score every outside list together and return each list cut to its kept rows,
 * order preserved. Verification: research is sourced, trends are measured from
 * the library, niche notes and moments are corpus/search, Reddit is audience.
 */
export function pickOutsideForWriter<N, T, M, R, D>(lists: OutsideLists<N, T, M, R, D>, topicTexts: readonly string[], opts: OutsideSelectOptions = {}): { lists: OutsideLists<N, T, M, R, D>; record: OutsideSelected } {
  const items: OutsideItem[] = []
  const add = (prefix: string, rows: readonly unknown[], text: (r: Record<string, unknown>) => string, verification: OutsideVerification) => {
    rows.forEach((r, i) => {
      const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
      items.push({ id: `${prefix}:${i}`, kind: prefix, text: text(o), when: str(o.when) || null, verification })
    })
  }
  add('note', lists.notes, (o) => `${str(o.title)} ${str(o.body)}`, 'corpus')
  add('trend', lists.trends, (o) => `${str(o.label)} ${str(o.sample)}`, 'measured')
  add('moment', lists.moments, (o) => `${str(o.name)} ${str(o.angle)}`, 'corpus')
  add('research', lists.research, (o) => `${str(o.name)} ${str(o.detail)}`, 'sourced')
  add('reddit', lists.reddit, (o) => str(o.text), 'audience')
  const { kept, record } = selectOutside(items, topicTexts, opts)
  const ids = new Set(kept.map((k) => k.id))
  const keep = <X>(prefix: string, rows: X[]): X[] => rows.filter((_r, i) => ids.has(`${prefix}:${i}`))
  return {
    lists: { notes: keep('note', lists.notes), trends: keep('trend', lists.trends), moments: keep('moment', lists.moments), research: keep('research', lists.research), reddit: keep('reddit', lists.reddit) },
    record,
  }
}

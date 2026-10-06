// ⚠️ BLIND SET 2 (owner 2026-10-05): cart-call scripts used "a DIY coffee bar
// built from reclaimed materials and thrifted tiles" and "La Marzocco". Why:
// her knowledge reaches the writer as the top 40 rows by times_seen, filtered
// only by GOAL (servesObjective). Nothing asked whether a row is about THIS
// product or THIS ask, so a frequent caption about a different project rode in.
//
// A scanned row (caption/transcript) is kept for a product or note-led video
// only when it shares a DISTINCTIVE word with the ask: a word of 4+ letters
// that is not in her common vocabulary (present in ≥ commonFrac of her rows —
// "coffee" is in everything she says and proves nothing). Her answers, her
// confirmed comments and anything she switched on are never filtered.

const STOP = new Set(['that', 'this', 'with', 'from', 'your', 'they', 'have', 'what', 'when', 'about', 'into', 'just', 'like', 'more', 'than', 'then', 'them', 'will', 'were', 'been', 'their', 'there', 'would', 'which', 'how', 'make', 'made', 'really', 'every', 'some', 'only', 'very'])

function words(t: string): Set<string> {
  return new Set((String(t ?? '').toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []).map((w) => w.replace(/(?:'s|s)$/, '')).filter((w) => !STOP.has(w)))
}

export interface RelevanceResult<R> { kept: R[]; dropped: R[] }

export function relevantToAsk<R extends { text?: unknown }>(
  rows: readonly R[],
  askText: string,
  opts: { exempt?: (r: R) => boolean; commonFrac?: number; minShared?: number } = {},
): RelevanceResult<R> {
  const commonFrac = opts.commonFrac ?? 0.15
  const minShared = opts.minShared ?? 1
  const bags = rows.map((r) => words(String(r.text ?? '')))
  const df = new Map<string, number>()
  for (const b of bags) for (const w of b) df.set(w, (df.get(w) ?? 0) + 1)
  const common = (w: string) => rows.length >= 5 && (df.get(w) ?? 0) / rows.length >= commonFrac
  const ask = [...words(askText)].filter((w) => !common(w))
  const kept: R[] = [], dropped: R[] = []
  rows.forEach((r, i) => {
    if (opts.exempt?.(r) || !ask.length) { kept.push(r); return }
    const shared = ask.filter((w) => bags[i]!.has(w)).length
    ;(shared >= minShared ? kept : dropped).push(r)
  })
  return { kept, dropped }
}

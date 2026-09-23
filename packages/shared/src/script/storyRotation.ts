// ONE STORY, EIGHT SCRIPTS IN A ROW — ONCE ON A PRODUCT IT WAS NOT ABOUT.
//
// ⚠️ MEASURED 2026-09-23 on production `creator_knowledge`: two `experience`
// rows ("I bought a bulk roll of snap fasteners…", "A customer sent me a video
// of her dog…") each carried `used_count = 8`, all stamped within days of each
// other. `knowledgeRotation` only breaks TIES inside a relevance bucket, so a
// story that shares one word with every video ("bandana", "order") wins its
// bucket every time and is never rested. And a store with three rows supplies
// all three regardless of relevance, which is how a wedding-candle story
// reached a video about a different product.
//
// ⚖️ TWO RULES, BOTH ABOUT STORIES ONLY. Claims, opinions and product facts
// are left to the existing ranking — a fact can be true in every script; a
// story told in every script is a creator repeating herself on camera.
//
//   1. NEVER ATTACH A STORY TO A PRODUCT IT IS NOT ABOUT. On a product-led
//      video a story must share at least one content word with the product
//      (name, offer, summary). No overlap, no supply.
//   2. A STORY RESTS AFTER IT HAS BEEN SUPPLIED TWICE IN THE CREATOR'S LAST
//      FIVE GENERATIONS. Read from the insert-only ledger
//      (`creator_knowledge_uses`, 0215), not from `used_count`, because a
//      lifetime counter cannot tell "twice last week" from "twice last year".
//
// Deno copy is GENERATED (scripts/ci/generate_shared_pilot_core.mjs); no imports.

/** The kinds that are a told episode rather than a position or a fact. */
export const STORY_KINDS: ReadonlySet<string> = new Set(['experience', 'story'])

/** How many of the creator's most recent generations count as "recent". */
export const STORY_RECENT_GENERATIONS = 5

/** Supplied this many times within the window, a story rests. */
export const STORY_REST_AFTER = 2

const STOP: ReadonlySet<string> = new Set([
  'this', 'that', 'with', 'your', 'from', 'have', 'they', 'them', 'their', 'what',
  'when', 'were', 'will', 'just', 'like', 'more', 'most', 'into', 'over', 'about',
  'made', 'make', 'makes', 'every', 'each', 'than', 'then', 'only', 'also', 'very',
  'handmade', 'custom', 'order', 'orders', 'customer', 'customers', 'product',
  'products', 'shop', 'store', 'brand', 'made', 'best', 'great', 'perfect',
])

/** Content words of a text: lower-case, length > 3, not a stop word, with a
 *  trailing plural `s` folded so "candles" meets "candle". */
export function contentTerms(text: unknown): Set<string> {
  const out = new Set<string>()
  for (const raw of String(text ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length <= 3 || STOP.has(raw)) continue
    out.add(raw.length > 4 && raw.endsWith('s') ? raw.slice(0, -1) : raw)
  }
  return out
}

export interface LedgerRow {
  knowledge_id?: unknown
  generation_id?: unknown
  used_at?: unknown
}

/** How many of the creator's last `window` generations supplied each item.
 *  Rows without a generation id are ignored: they cannot be placed in a window. */
export function recentSupplyCounts(
  rows: readonly LedgerRow[] | null | undefined,
  window: number = STORY_RECENT_GENERATIONS,
): Map<string, number> {
  const list = Array.isArray(rows) ? rows : []
  const genAt = new Map<string, number>()
  for (const r of list) {
    const g = String(r?.generation_id ?? '').trim()
    if (g === '') continue
    const t = Date.parse(String(r?.used_at ?? ''))
    const at = Number.isFinite(t) ? t : 0
    genAt.set(g, Math.max(genAt.get(g) ?? 0, at))
  }
  const recent = new Set(
    [...genAt.entries()].sort((a, b) => b[1] - a[1]).slice(0, Math.max(0, window)).map(([g]) => g))
  const out = new Map<string, number>()
  for (const r of list) {
    const g = String(r?.generation_id ?? '').trim()
    const k = String(r?.knowledge_id ?? '').trim()
    if (g === '' || k === '' || !recent.has(g)) continue
    out.set(k, (out.get(k) ?? 0) + 1)
  }
  return out
}

export interface StoryCandidate {
  id?: unknown
  kind: string
  text?: unknown
  evidence?: unknown
}

export interface StoryGateResult<T> {
  kept: T[]
  offProduct: T[]
  resting: T[]
}

/**
 * Drop stories that are off-product or resting; everything else passes in its
 * incoming order. `productText` empty means the video is not product-led and
 * rule 1 does not apply.
 */
export function gateStories<T extends StoryCandidate>(
  ranked: readonly T[],
  opts: { productText?: string | null; recent?: ReadonlyMap<string, number> | null },
): StoryGateResult<T> {
  const productTerms = contentTerms(opts.productText ?? '')
  const recent = opts.recent ?? new Map<string, number>()
  const kept: T[] = []
  const offProduct: T[] = []
  const resting: T[] = []
  for (const item of ranked) {
    if (!STORY_KINDS.has(String(item?.kind ?? ''))) { kept.push(item); continue }
    if (productTerms.size > 0) {
      const own = contentTerms(`${String(item.text ?? '')} ${String(item.evidence ?? '')}`)
      let shared = false
      for (const w of own) if (productTerms.has(w)) { shared = true; break }
      if (!shared) { offProduct.push(item); continue }
    }
    const id = String(item.id ?? '').trim()
    if (id !== '' && (recent.get(id) ?? 0) >= STORY_REST_AFTER) { resting.push(item); continue }
    kept.push(item)
  }
  return { kept, offProduct, resting }
}

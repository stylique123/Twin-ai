// GENERATED FROM packages/shared/src/script/storyRotation.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
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
//   3. (owner, coffee report 1.1) A STORY TOLD IN HER LAST SCRIPT RESTS in
//      this one, so the same episode never runs back to back.
//   4. A SENSITIVE ITEM — health or mental health, pregnancy, legal or
//      regulatory trouble, police, family loss, money hardship — is OPT-IN:
//      supplied only when her own words for THIS script raise it. Any kind,
//      not only stories: a claim can be just as private.
//   5. WITH NO PRODUCT, A STORY MUST MATCH WHAT THIS VIDEO IS ABOUT (her
//      paragraph, answers, reference note). A relocation story reached "get
//      people to try it" because nothing checked. No topic, no story: the
//      writer shortens the beat instead.
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
  sensitive: T[]
  offTopic: T[]
}

/** Private matters that never reach a script unless she raises them there. */
export const SENSITIVE = /\b(postpartum|post-partum|depress\w*|anxiety|panic attacks?|mental health|therap(y|ist)|miscarr\w*|pregnan\w*|infertil\w*|cancer|diagnos\w*|illness|surgery|hospital\w*|disorder|addict\w*|rehab|suicid\w*|divorc\w*|custody|funeral|passed away|died|death|grief|abus\w*|police|arrest\w*|lawsuit|sued|lawyer|attorney|code enforcement|evict\w*|shut (us|me|it) down|fined|citation|violation|illegal\w*|bankrupt\w*|foreclos\w*|laid off|lost my job|got fired|unemploy\w*|in debt|my debt|debts|ivf|fertility|my ex|ex-?husband|ex-?wife|ex-?boyfriend|ex-?girlfriend|break-?up|sober|sobriety|relapse\w*|jail|prison|immigra\w*|deport\w*|visa status|home address|my address|salary|neighbou?r complain\w*|(my|our) (son|daughter|kid|kids|child|children)'?s? school)\b/i

/** The ids supplied in the creator's single most recent generation. */
export function lastSupplied(rows: readonly LedgerRow[] | null | undefined): Set<string> {
  const list = Array.isArray(rows) ? rows : []
  let lastGen = '', lastAt = -1
  for (const r of list) {
    const g = String(r?.generation_id ?? '').trim()
    const t = Date.parse(String(r?.used_at ?? ''))
    if (g !== '' && Number.isFinite(t) && t > lastAt) { lastAt = t; lastGen = g }
  }
  return new Set(list.filter((r) => String(r?.generation_id ?? '').trim() === lastGen && lastGen !== '')
    .map((r) => String(r?.knowledge_id ?? '').trim()).filter(Boolean))
}

/**
 * Drop stories that are off-product or resting; everything else passes in its
 * incoming order. `productText` empty means the video is not product-led and
 * rule 1 does not apply.
 */
export function gateStories<T extends StoryCandidate>(
  ranked: readonly T[],
  opts: {
    productText?: string | null
    recent?: ReadonlyMap<string, number> | null
    /** Ids supplied in her last script: a story among them rests. */
    last?: ReadonlySet<string> | null
    /** Her own words for THIS script (paragraph, answers, reference note). */
    chosenText?: string | null
    /** What this video is about when no product is chosen. Rule 5 applies
     *  only when it is given (null keeps the old behaviour). */
    topicText?: string | null
  },
): StoryGateResult<T> {
  const productTerms = contentTerms(opts.productText ?? '')
  const recent = opts.recent ?? new Map<string, number>()
  const last = opts.last ?? new Set<string>()
  const chosen = String(opts.chosenText ?? '')
  const chosenTerms = contentTerms(chosen)
  const raisedSensitive = SENSITIVE.test(chosen)
  const topicTerms = opts.topicText == null ? null : contentTerms(opts.topicText)
  const kept: T[] = []
  const offProduct: T[] = []
  const resting: T[] = []
  const sensitive: T[] = []
  const offTopic: T[] = []
  for (const item of ranked) {
    const own = contentTerms(`${String(item?.text ?? '')} ${String(item?.evidence ?? '')}`)
    const overlaps = (terms: Set<string>) => { for (const w of own) if (terms.has(w)) return true; return false }
    if (SENSITIVE.test(`${String(item?.text ?? '')} ${String(item?.evidence ?? '')}`)
      && !(raisedSensitive && overlaps(chosenTerms))) { sensitive.push(item); continue }
    if (!STORY_KINDS.has(String(item?.kind ?? ''))) { kept.push(item); continue }
    if (productTerms.size > 0) {
      if (!overlaps(productTerms)) { offProduct.push(item); continue }
    } else if (topicTerms !== null) {
      if (topicTerms.size === 0 || !overlaps(topicTerms)) { offTopic.push(item); continue }
    }
    const id = String(item.id ?? '').trim()
    if (id !== '' && ((recent.get(id) ?? 0) >= STORY_REST_AFTER || last.has(id))) { resting.push(item); continue }
    kept.push(item)
  }
  return { kept, offProduct, resting, sensitive, offTopic }
}

// GENERATED FROM packages/shared/src/script/productFactScope.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// PRODUCT FACT SCOPE + ASK WHEN THERE IS NO MATERIAL (panel 13 labels, 7 Nov).
//
// Panel 13: 10 of 48 scripts carried invented lines, 6 of them a REAL fact
// about the WRONG product ("hand-thrown and fired twice" is the Tide Mug's; it
// was said of the Moss Bowl). Every fact was true, so the honesty check passed
// it. Rule: each product fact belongs to one product. A script about product A
// never says product B's facts, and no sentence mixes two products' facts.
//
// A fact is recognised by its distinctive phrases: hyphenated words
// ("fragrance-free"), adjacent content-word pairs ("synthetic fragrance",
// "fired twice") and 3-word runs ("poured by hand"). A phrase two products
// share is nobody's, so it is never used to judge. Pure; the edge copy is
// generated. Panel accounts only (the edge gates it).

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'at', 'from', 'is', 'are', 'was', 'it', 'its', 'this', 'that', 'my', 'your', 'our', 'i', 'we', 'you', 'be', 'as', 'so', 'no', 'not', 'every', 'each', 'one', 'all'])
// Words every product's facts can use: never evidence of WHICH product.
const GENERIC = new Set(['price', 'prices', 'launch', 'month', 'until', 'small', 'batch', 'batches', 'holds', 'about', 'made', 'there', 'these', 'those', 'which', 'first', 'every', 'their', 'other', 'better', 'great', 'quality', 'premium', 'order', 'orders', 'customer', 'customers', 'people', 'product', 'products', 'store', 'online', 'perfect', 'simple', 'today', 'right', 'really'])
const toks = (t: string) => String(t ?? '').toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? []

/** Distinctive phrases of one fact text. */
export function factPhrases(text: string): string[] {
  const w = toks(text)
  const out = new Set<string>()
  for (const x of w) {
    if (x.includes('-')) out.add(x)
    // Single content words of 5+ letters ("fragrance", "fired"): a fact's
    // subject word, unless it is generic commerce or size talk.
    for (const part of x.split('-')) if (part.length >= 5 && !STOP.has(part) && !GENERIC.has(part) && !/\d/.test(part)) out.add(part)
  }
  for (let i = 0; i + 1 < w.length; i++) if (!STOP.has(w[i]) && !STOP.has(w[i + 1])) out.add(`${w[i]} ${w[i + 1]}`)
  for (let i = 0; i + 2 < w.length; i++) if (!STOP.has(w[i]) && !STOP.has(w[i + 2])) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`)
  return [...out]
}

export interface ScopedProduct { id: string; name: string; facts: readonly string[] }

/** product id → phrases only that product's facts use. */
export function ownedPhrases(products: readonly ScopedProduct[]): Map<string, Set<string>> {
  const count = new Map<string, number>()
  const per = products.map((p) => new Set(p.facts.flatMap(factPhrases)))
  for (const s of per) for (const ph of s) count.set(ph, (count.get(ph) ?? 0) + 1)
  return new Map(products.map((p, i) => [p.id, new Set([...per[i]].filter((ph) => count.get(ph) === 1))]))
}

/** Ids of the products whose facts a sentence uses. */
export function factOwnersIn(sentence: string, owned: Map<string, Set<string>>): string[] {
  const w = toks(sentence)
  const grams = new Set<string>(w.flatMap((x) => [x, ...x.split('-')]))
  for (let i = 0; i + 1 < w.length; i++) grams.add(`${w[i]} ${w[i + 1]}`)
  for (let i = 0; i + 2 < w.length; i++) grams.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`)
  const out: string[] = []
  for (const [id, set] of owned) for (const ph of set) if (grams.has(ph)) { out.push(id); break }
  return out
}

const sentencesOf = (l: string) => String(l ?? '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)

export interface WrongProductCut { sentences: number; beats: number; wrong: number; mixed: number }

/**
 * Cuts each sentence that uses another product's fact (when the script is
 * about `subjectId`) or mixes two products' facts (any script). A beat left
 * empty is dropped. Only cuts; never adds. Below `floor` spoken beats nothing
 * is cut and the count is still returned, so the gate can see it.
 */
export function dropWrongProductFacts<T extends { line?: unknown }>(beats: readonly T[], products: readonly ScopedProduct[], subjectId: string | null, floor = 3): { beats: T[]; cut: WrongProductCut } {
  const none = { beats: [...beats], cut: { sentences: 0, beats: 0, wrong: 0, mixed: 0 } }
  if (products.length < 2) return none
  const owned = ownedPhrases(products)
  let wrong = 0, mixed = 0, emptied = 0
  const out: T[] = []
  for (const b of beats) {
    const line = typeof b?.line === 'string' ? b.line : ''
    if (!line.trim()) { out.push(b); continue }
    const ss = sentencesOf(line)
    const kept = ss.filter((s) => {
      const owners = factOwnersIn(s, owned)
      if (owners.length >= 2) { mixed++; return false }
      if (subjectId && owners.length === 1 && owners[0] !== subjectId) { wrong++; return false }
      return true
    })
    if (kept.length === ss.length) { out.push(b); continue }
    let text = kept.join(' ').trim().replace(/^(?:and|so|but)\s+/i, '')
    if (text) text = text.charAt(0).toUpperCase() + text.slice(1)
    if (!text || !/[a-z0-9]/i.test(text)) { emptied++; continue }
    out.push({ ...b, line: text })
  }
  const sentences = wrong + mixed
  const spoken = out.filter((b) => typeof b?.line === 'string' && String(b.line).trim()).length
  if (!sentences || spoken < floor) return { ...none, cut: { ...none.cut, wrong, mixed, sentences } }
  return { beats: out, cut: { sentences, beats: emptied, wrong, mixed } }
}

// ── ASK WHEN THERE IS NO MATERIAL ──────────────────────────────────────────
// "why I weave in silence" for a creator with no stories was written anyway,
// from nothing. A request that asks WHY or for THE DAY I… needs her own truth;
// when nothing she has said touches the request's topic, she is asked first.

const ASK_TRIGGER = /\bwhy\b|\bthe day (?:i|we)\b/i
const TOPIC_STOP = new Set([...STOP, 'why', 'day', 'how', 'what', 'when', 'should', 'yet', 'do', 'does', 'did', 'nearly', 'about', 'video', 'use', 'shape', 'copy', 'stay', 'close', 'remix', 'structure', 'pacing', 'format', 'quiet', 'confession', 'actually', 'just', 'really', 'thing', 'things', 'only', 'one', 'there', 'their', 'them', 'they', 'me', 'have', 'has'])
const stem = (w: string) => w.slice(0, 5)

/** The request's topic stems (content words, 4+ letters). */
export function topicStems(request: string): string[] {
  return [...new Set(toks(request).flatMap((w) => w.split('-')).filter((w) => w.length >= 4 && !TOPIC_STOP.has(w)).map(stem))]
}

/**
 * True when the request asks why / for "the day I…" and NONE of her material
 * (her stories, her answers) shares a topic word with it. Empty material asks.
 */
export function needsStoryAsk(request: string, material: readonly string[]): { ask: boolean; topic: string[] } {
  if (!ASK_TRIGGER.test(String(request ?? ''))) return { ask: false, topic: [] }
  const topic = topicStems(request)
  const have = new Set(material.flatMap((m) => toks(m).flatMap((w) => w.split('-')).map(stem)))
  const hit = topic.some((t) => have.has(t))
  return { ask: !hit, topic }
}

/** The one question she is asked instead. */
export function storyQuestion(request: string): string {
  const r = String(request ?? '').trim().replace(/[.?!]+$/, '')
  return `Before I write "${r}": what really happened, or what is your reason, in your own words? I have nothing from you on this yet, and I won't make it up.`
}

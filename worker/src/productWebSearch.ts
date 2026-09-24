// FIND HER PRODUCT ON THE WIDER WEB — WHEN THERE IS NOTHING ELSE TO READ.
//
// ⚖️ THE LAST RESORT, NOT A SHORTCUT. It runs only when a product has no link,
// no photo, and its brand has no website (or the brand's shop search found
// nothing). Everything else is a better source, because she pointed at it.
//
// ⚠️ THE MODEL NEVER GETS TO INVENT A URL. Gemini's Google Search grounding
// returns the pages it actually retrieved (`groundingChunks`). The model's
// answer is only a pointer INTO that list: a URL that is not among the sources
// is refused, however confident the model sounds.
//
// ⚠️ AND THE PAGE MUST NAME HER PRODUCT, WORD FOR WORD. The fetched page's own
// title must contain every word of the name she typed — the same strict rule
// as the shop lookup (shopProductLookup.ts, MIN_NAME_MATCH = 1), re-implemented
// here because the worker never imports @twinai/shared and this file should not
// lean on the shop module's internals. "Reversible Scrunchie Bandana" must not
// land on "Scrunchie Bandana Mystery Packs".
//
// Pure except for the injected `search` and `fetchPage`, so every refusal is
// testable without the network.
/** A page Google retrieved for a grounded answer (`groundingChunks[].web`). */
export interface GroundingSource { uri: string; title: string }
export interface GroundedAnswer { text: string; sources: GroundingSource[]; queries?: string[] }

/** Pull the text and the grounding sources out of a generateContent response.
 *  Never throws; an unfamiliar shape yields empty text and no sources. */
export function readGroundedResponse(raw: unknown): GroundedAnswer {
  const cand = (raw as { candidates?: Array<Record<string, unknown>> } | null)?.candidates?.[0]
  const parts = ((cand?.content as { parts?: Array<{ text?: unknown }> } | undefined)?.parts) ?? []
  const text = parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('')
  const chunks = ((cand?.groundingMetadata as { groundingChunks?: unknown[] } | undefined)?.groundingChunks) ?? []
  const sources: GroundingSource[] = []
  for (const c of Array.isArray(chunks) ? chunks : []) {
    const web = (c as { web?: { uri?: unknown; title?: unknown } } | null)?.web
    if (web && typeof web.uri === 'string') sources.push({ uri: web.uri, title: typeof web.title === 'string' ? web.title : '' })
  }
  // ⚖️ WHAT GOOGLE WAS ASKED. Zero sources can mean "searched, found nothing"
  // or "never searched" (2026-09-24); the queries tell the two apart.
  const q = (cand?.groundingMetadata as { webSearchQueries?: unknown } | undefined)?.webSearchQueries
  const queries = Array.isArray(q) ? q.filter((x): x is string => typeof x === 'string') : []
  return { text, sources, queries }
}


export type WebSearchFn = (system: string, prompt: string) => Promise<GroundedAnswer>
export type FetchPageFn = (url: string) => Promise<string | null>

export interface WebProductMatch {
  url: string
  host: string
  pageTitle: string
  confidence: string
  /** The fetched page, so the caller does not read it twice. */
  text: string
}

export type WebSearchOutcome =
  | { ok: true; match: WebProductMatch }
  | { ok: false; reason: 'no_name' | 'search_failed' | 'no_answer' | 'low_confidence' | 'not_in_sources'
      | 'unreadable' | 'name_mismatch'; detail?: string; sources: number }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const stem = (w: string) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)
const words = (s: string) => new Set(norm(s).split(' ').filter((x) => x.length > 1).map(stem))

/** Every word of her name must appear in the title (extra title words are fine). */
export const MIN_WEB_NAME_MATCH = 1
export function webNameMatch(wanted: string, title: string): number {
  const w = words(wanted)
  const t = words(title)
  if (w.size === 0) return 0
  let hit = 0
  for (const x of w) if (t.has(x)) hit++
  return hit / w.size
}

const hostOf = (u: string): string | null => {
  try { return new URL(u).host.toLowerCase().replace(/^www\./, '') } catch { return null }
}
const canon = (u: string): string | null => {
  try {
    const x = new URL(u)
    return `${x.host.toLowerCase().replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch { return null }
}

/**
 * Is this URL one Google actually retrieved?
 *
 * ⚖️ TWO FORMS OF THE SAME EVIDENCE. A grounding chunk carries the page's URI —
 * often a Google redirect — and a title that is the page's DOMAIN. So the model's
 * URL is accepted when it equals a source URI, or when its host is exactly a
 * source's domain title. Anything else is a URL the model wrote on its own.
 */
export function urlInSources(url: string, sources: readonly GroundingSource[]): boolean {
  if (!/^https:\/\//i.test(url)) return false
  const c = canon(url)
  const h = hostOf(url)
  if (!c || !h) return false
  return sources.some((s) => {
    if (canon(s.uri) === c) return true
    const t = s.title.trim().toLowerCase().replace(/^www\./, '')
    return t !== '' && t === h
  })
}

/** Pull `{ "url": …, "confidence": … }` out of free text. Never throws. */
export function readSearchAnswer(text: string): { url: string; confidence: string } | null {
  const line = text.match(/URL:\s*(https?:\/\/\S+?)\s*\|\s*CONFIDENCE:\s*(high|medium|low)/i)
  if (line) return { url: line[1].replace(/[).,]+$/, ''), confidence: line[2].toLowerCase() }
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const o = JSON.parse(m[0]) as { url?: unknown; confidence?: unknown }
    const url = typeof o.url === 'string' ? o.url.trim() : ''
    if (url === '') return null
    return { url, confidence: typeof o.confidence === 'string' ? o.confidence.toLowerCase().trim() : 'low' }
  } catch { return null }
}

/** The page's own name, from the head lines `fetchPageText` puts first. */
export function pageTitlesOf(text: string): string[] {
  const out: string[] = []
  for (const line of text.split('\n')) {
    const m = line.match(/^(TITLE|OG:TITLE):\s*(.+)$/)
    if (m) out.push(m[2].trim())
  }
  return out
}

export const WEB_SEARCH_SYSTEM = [
  'You find the official web page for ONE specific product.',
  'ALWAYS run a Google Search first — never answer from memory (measured 2026-09-23:',
  'an answer with zero search sources). Search the product name with the brand name,',
  'then the product name alone.',
  'Prefer, in order: the brand\'s own product page; then a',
  'marketplace listing of that exact product (Etsy, Amazon, and similar).',
  'Never return a homepage, a search results page, a review, or a different product.',
  'If you are not sure it is the same product, say confidence "low".',
  // ⚠️ NOT "ONLY JSON". Measured 2026-09-24: with a JSON-only instruction the
  // model answered straight away and ran no search at all (webSearchQueries
  // empty). It may write freely; the verdict is one plain last line.
  'Write what you found in a sentence or two, then finish with exactly one line:',
  'URL: <https url> | CONFIDENCE: high|medium|low',
  'If nothing matches, finish with: URL: none | CONFIDENCE: low',
].join('\n')

export async function findProductOnWeb(input: {
  productName: string
  brandName?: string | null
  search: WebSearchFn
  fetchPage: FetchPageFn
}): Promise<WebSearchOutcome> {
  const name = input.productName.trim()
  if (name === '') return { ok: false, reason: 'no_name', sources: 0 }
  const brand = (input.brandName ?? '').trim()
  const query = brand && !norm(name).includes(norm(brand)) ? `${name} ${brand}` : name

  let answer: GroundedAnswer
  try {
    answer = await input.search(WEB_SEARCH_SYSTEM, `Search Google for this product and find its page: ${query}`)
  } catch (e) {
    return { ok: false, reason: 'search_failed', detail: (e instanceof Error ? e.message : String(e)).slice(0, 200), sources: 0 }
  }
  const n = answer.sources.length
  const picked = readSearchAnswer(answer.text)
  if (!picked) return { ok: false, reason: 'no_answer', detail: `${answer.text.replace(/\s+/g, ' ').trim().slice(0, 160)} | queries: ${(answer.queries ?? []).join(' ; ') || 'none'}`, sources: n }
  if (picked.confidence !== 'high' && picked.confidence !== 'medium') return { ok: false, reason: 'low_confidence', sources: n }
  if (!urlInSources(picked.url, answer.sources)) return { ok: false, reason: 'not_in_sources', detail: hostOf(picked.url) ?? '', sources: n }

  let text: string | null = null
  try { text = await input.fetchPage(picked.url) } catch { text = null }
  if (!text || text.length < 80) return { ok: false, reason: 'unreadable', detail: hostOf(picked.url) ?? '', sources: n }
  const titles = pageTitlesOf(text)
  const best = titles.find((t) => webNameMatch(name, t) >= MIN_WEB_NAME_MATCH)
  if (!best) return { ok: false, reason: 'name_mismatch', detail: hostOf(picked.url) ?? '', sources: n }

  return {
    ok: true,
    match: { url: picked.url, host: hostOf(picked.url) ?? '', pageTitle: best, confidence: picked.confidence, text },
  }
}

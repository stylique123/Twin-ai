// FOUND YOU ELSEWHERE (24-ideas #15 podcasts / interviews, #16 press) — pure part.
//
// ⚖️ A NAME SEARCH CAN FIND SOMEONE ELSE. Nothing found here is used until the
// creator herself says "yes, that's me". Before that it is a candidate, shown
// to her and to nobody's script.
//
// ⚖️ AND A LINK THE MODEL WROTE IS NOT A LINK GOOGLE RETURNED. Every candidate
// must sit on a site that appears among the grounded search's own sources;
// anything else is dropped as invented.

export type MentionKind = 'podcast' | 'interview' | 'press'
export interface Mention { kind: MentionKind; title: string; outlet: string; url: string; published: string | null }

export const MENTIONS_SYSTEM = [
  'Find places OTHER than her own channels where this creator appeared: podcast episodes she was a guest on, interviews with her, and press articles about her or her business.',
  'Only list items clearly about THIS creator (her handle, her business, her niche all fit). If unsure, leave it out. Never list her own posts or profiles.',
  'Return JSON only: {"items":[{"kind":"podcast|interview|press","title":"...","outlet":"...","url":"https://...","published":"YYYY-MM-DD or null"}]}. At most 6 items. An empty list is a good answer.',
].join('\n')

export function mentionsPrompt(v: { handle: string | null; platform: string | null; label: string | null; niche: string | null }): string {
  return `CREATOR: ${[v.label, v.handle ? `@${v.handle.replace(/^@/, '')}` : null, v.platform ? `on ${v.platform}` : null].filter(Boolean).join(' ')}\nNICHE: ${v.niche ?? 'unknown'}`
}

const host = (u: string): string => {
  try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' }
}
const OWN = /(?:^|\.)(?:instagram|tiktok|youtube|youtu|facebook|x|twitter|linkedin|pinterest|threads)\.(?:com|be|net)$/

/** Candidates the model listed, kept only when their site is one the search returned. */
export function parseMentions(text: string, sources: ReadonlyArray<{ uri: string; title: string }>): Mention[] {
  const m = String(text ?? '').match(/\{[\s\S]*\}/)
  let items: unknown[] = []
  try { const j = JSON.parse(m ? m[0] : '{}'); items = Array.isArray(j?.items) ? j.items : [] } catch { return [] }
  const sourceSites = new Set(sources.flatMap((s) => [host(s.uri), String(s.title ?? '').toLowerCase().replace(/^www\./, '')]).filter(Boolean))
  const out: Mention[] = []
  const seen = new Set<string>()
  for (const it of items) {
    const o = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>
    const kind = ['podcast', 'interview', 'press'].includes(String(o.kind)) ? o.kind as MentionKind : null
    const url = typeof o.url === 'string' && /^https:\/\//.test(o.url) ? o.url.slice(0, 400) : null
    const title = typeof o.title === 'string' ? o.title.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
    const outlet = typeof o.outlet === 'string' ? o.outlet.replace(/\s+/g, ' ').trim().slice(0, 120) : ''
    if (!kind || !url || title.length < 4 || !outlet) continue
    const h = host(url)
    if (!h || OWN.test(h) || seen.has(url)) continue
    if (![...sourceSites].some((s) => s === h || s.endsWith(`.${h}`) || h.endsWith(`.${s}`))) continue
    seen.add(url)
    const pub = typeof o.published === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.published) ? o.published : null
    out.push({ kind, title, outlet, url, published: pub })
  }
  return out.slice(0, 6)
}

/** What a CONFIRMED mention becomes in her knowledge: a fact about her, in plain words. */
export function mentionKnowledge(m: { kind: string; title: string; outlet: string }): { kind: 'experience' | 'fact'; text: string } {
  const text = m.kind === 'press'
    ? `Featured in ${m.outlet}: "${m.title}"`
    : `Was a guest on ${m.outlet}${m.kind === 'podcast' ? ' (podcast)' : ''}: "${m.title}"`
  return { kind: m.kind === 'press' ? 'fact' : 'experience', text: text.slice(0, 240) }
}

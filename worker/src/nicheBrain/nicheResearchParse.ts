// Pure half of the niche researcher (no DB import), so it can be tested.
//
// ⚠️ OWNER 2026-10-01: "when a new niche comes in, identify it and start your
// research" — dates, events, news, new products, competitors. The corpus
// scrape alone gives a new niche a handful of video cards; this gives it the
// world around it, sub-niche by sub-niche, from Google with real sources only.

export const RESEARCH_KINDS = ['date', 'news', 'product', 'competitor', 'question'] as const
export type ResearchKind = (typeof RESEARCH_KINDS)[number]
export interface ResearchItem { kind: ResearchKind; name: string; when: string | null; detail: string | null }
export const MAX_ITEMS = 14

export const RESEARCH_SYSTEM = [
  'You research one specific creator niche for short-form talking-head video creators. Search the web.',
  'Find, ONLY from search results (never from memory):',
  '- DATE: dated days, seasons, events, trade shows, awareness days or launches in the next 8 weeks that this niche cares about.',
  '- NEWS: what changed in this niche in the last 4 weeks (rules, prices, trends, studies, controversies).',
  '- PRODUCT: notable new products, tools or ingredients people in this niche are talking about now.',
  '- COMPETITOR: well-known creators or brands in this exact niche and what they are known for (public facts only).',
  '- QUESTION: questions real people in this niche keep asking right now.',
  'Answer with up to 14 lines, each exactly: <KIND>: <name> | WHEN: <dates, "now" or "-"> | DETAIL: <one plain sentence>',
  'If you found nothing current and specific, answer exactly: NONE',
].join('\n')

export function researchPrompt(subNiche: string, niche: string | null, today: string): string {
  return `Today is ${today}. Niche: ${subNiche}${niche && niche.toLowerCase() !== subNiche.toLowerCase() ? ` (part of ${niche})` : ''}. Research what is happening in this niche.`
}

/** The research key: one row per sub-niche, whatever the casing or spacing. */
export function nicheKey(subNiche: unknown): string {
  return String(subNiche ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80)
}

export function parseResearch(text: string): ResearchItem[] {
  if (!text || /^\s*NONE\s*$/i.test(text)) return []
  const out: ResearchItem[] = []
  for (const line of text.split('\n')) {
    const m = line.replace(/[*_`]/g, '').match(/^\W*(DATE|NEWS|PRODUCT|COMPETITOR|QUESTION):\s*(.+?)\s*\|\s*WHEN:\s*(.+?)\s*\|\s*DETAIL:\s*(.+)$/i)
    if (!m) continue
    const name = m[2].replace(/[*_`]/g, '').trim().slice(0, 120)
    if (name.length < 3) continue
    const when = m[3].trim()
    out.push({ kind: m[1].toLowerCase() as ResearchKind, name, when: when && when !== '-' ? when.slice(0, 60) : null, detail: m[4].trim().slice(0, 260) || null })
    if (out.length >= MAX_ITEMS) break
  }
  return out
}

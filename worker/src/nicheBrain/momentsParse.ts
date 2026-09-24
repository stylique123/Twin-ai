// Pure half of the moment watcher (no DB import), so it can be tested.

export const MAX_MOMENTS = 6

export interface Moment { name: string; when: string | null; angle: string | null }

export const MOMENTS_SYSTEM = [
  'You find what is happening in the world RIGHT NOW that short-form video creators in a given niche could make timely content about:',
  'events, holidays, sports tournaments, product launches, news, seasonal moments and formats currently going viral.',
  'Search the web. Only list things you found in search results from the last two weeks or scheduled in the next three weeks.',
  'Answer with up to 6 lines, each exactly: MOMENT: <name> | WHEN: <dates or "now"> | ANGLE: <one sentence on how a creator in this niche could use it>',
  'If you found nothing current and relevant, answer exactly: NONE',
].join('\n')

const NICHE_WORDS: Record<string, string> = {
  business: 'business, entrepreneurship, small business and side hustles',
  tech: 'technology, AI tools and gadgets',
  entertainment: 'entertainment, comedy, music and pop culture',
  health: 'health, fitness and wellness',
  beauty_fashion: 'beauty, skincare and fashion',
  food: 'food, cooking and recipes',
  creator: 'content creation and social media growth',
  making: 'handmade crafts, DIY, pottery, sewing, candles and small maker brands',
  education: 'education, learning and study tips',
  mindset: 'mindset, motivation and personal development',
  lifestyle: 'lifestyle, home, pets and everyday life',
  automotive: 'cars, car repair and automotive',
}

export function momentsPrompt(bucket: string, today: string): string {
  return `Today is ${today}. Niche: ${NICHE_WORDS[bucket] ?? bucket}. What are the current and upcoming moments these creators could make timely videos about?`
}

/** Parse the MOMENT lines; anything else is dropped. */
export function parseMoments(text: string): Moment[] {
  if (!text || /^\s*NONE\s*$/i.test(text)) return []
  const out: Moment[] = []
  for (const line of text.split('\n')) {
    const m = line.match(/MOMENT:\s*(.+?)\s*\|\s*WHEN:\s*(.+?)\s*\|\s*ANGLE:\s*(.+)$/i)
    if (!m) continue
    const name = m[1].replace(/[*_`]/g, '').trim().slice(0, 100)
    if (name.length < 3) continue
    out.push({ name, when: m[2].trim().slice(0, 60) || null, angle: m[3].trim().slice(0, 240) || null })
    if (out.length >= MAX_MOMENTS) break
  }
  return out
}


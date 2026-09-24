// THE READER — what one corpus video actually teaches.
//
// ⚠️ MEASURED 2026-09-24: `gallery_items.niche` is the niche of whoever's search
// found the video (108 labels) and `why` is a template on almost every row. So
// the corpus could not answer "what is this about, how does it open, what is said
// before and after the ask". This reads it once, in any language, and writes the
// answer in English so the library sorts one vocabulary.
//
// Pure: prompt, schema and normalisation only. The sweep does the I/O.

/** Bump to make the sweep re-read every video with a better reader. */
export const CORPUS_READ_VERSION = 1

/** Kept in step with NICHE_BUCKETS in packages/shared/src/nicheQuestions.ts.
 *  The worker must not import @twinai/shared, so the list is restated here and
 *  a test pins it against the shared one. */
export const BRAIN_BUCKETS = [
  'business', 'tech', 'entertainment', 'health', 'beauty_fashion', 'food', 'creator', 'making',
  'education', 'mindset', 'lifestyle', 'automotive',
] as const

export const MODES = ['educate', 'entertain', 'teach', 'inspire', 'sell'] as const
export const GOALS = ['views', 'leads', 'sales', 'authority', 'community'] as const

export interface CorpusCard {
  id: string
  title?: string | null
  niche?: string | null
  creator?: string | null
  reach?: string | null
  platform?: string | null
}

export interface CorpusRead {
  readable: boolean
  bucket: string | null
  sub_niche: string | null
  topic: string | null
  mode: string | null
  goal: string | null
  language: string | null
  hook_type: string | null
  hook_pattern: string | null
  structure: { before_ask: string | null; ask: string | null; after_ask: string | null } | null
  persuasion: { proof: string | null; objection: string | null; cta: string | null } | null
  why_it_works: string | null
}

export const READER_SYSTEM = [
  'You are a short-form content strategist cataloguing a library of real social videos.',
  'You get the caption/title of ONE video (any language) plus light metadata.',
  'Describe what it TEACHES a creator who wants results, in English, as reusable patterns — never copy the caption.',
  '- bucket: one of the allowed buckets.',
  '- sub_niche: 2–5 words, specific (e.g. "handmade soy candles", "postpartum fitness"). REUSE one of the listed existing sub-niches when it fits; only invent when none does.',
  '- topic: what this specific video is about, 3–10 words.',
  '- mode and goal: what it is trying to do.',
  '- hook_type: a short label (e.g. "question", "bold claim", "pov", "result first", "myth bust", "list").',
  '- hook_pattern: the opening as a reusable template with [slots], not the literal words.',
  '- structure: what comes before the ask/payoff, the ask or payoff, and after it.',
  '- persuasion: proof used, objection answered, call to action — null where absent.',
  '- why_it_works: one concrete sentence a creator can act on. No generic "uses hashtags".',
  'If the caption is only hashtags, emojis, or gives no idea what the video is, set readable=false and leave the rest null. Never guess.',
].join('\n')

const S = { type: 'STRING', nullable: true }
export const READER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    readable: { type: 'BOOLEAN' },
    bucket: { type: 'STRING', nullable: true, enum: [...BRAIN_BUCKETS] },
    sub_niche: S, topic: S,
    mode: { type: 'STRING', nullable: true, enum: [...MODES] },
    goal: { type: 'STRING', nullable: true, enum: [...GOALS] },
    language: S, hook_type: S, hook_pattern: S,
    structure: { type: 'OBJECT', nullable: true, properties: { before_ask: S, ask: S, after_ask: S } },
    persuasion: { type: 'OBJECT', nullable: true, properties: { proof: S, objection: S, cta: S } },
    why_it_works: S,
  },
  required: ['readable'],
}

export function readerPrompt(card: CorpusCard, knownSubNiches: readonly string[]): string {
  return [
    `CAPTION: ${(card.title ?? '').slice(0, 1200)}`,
    `PLATFORM: ${card.platform ?? 'unknown'}`,
    `REACH: ${card.reach ?? 'unknown'}`,
    `FOUND WHILE SEARCHING NICHE (a hint only, may be wrong): ${card.niche ?? 'unknown'}`,
    `ALLOWED BUCKETS: ${BRAIN_BUCKETS.join(', ')}`,
    `EXISTING SUB-NICHES: ${knownSubNiches.length ? knownSubNiches.join(' | ') : '(none yet)'}`,
  ].join('\n')
}

const txt = (v: unknown, max = 300): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
}
const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null

/** Anything the model returns is untrusted: clamp every field, drop the rest. */
export function normalizeRead(raw: unknown): CorpusRead {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const st = (r.structure && typeof r.structure === 'object' ? r.structure : null) as Record<string, unknown> | null
  const pe = (r.persuasion && typeof r.persuasion === 'object' ? r.persuasion : null) as Record<string, unknown> | null
  const topic = txt(r.topic, 120)
  const readable = r.readable === true && topic !== null
  if (!readable) {
    return {
      readable: false, bucket: null, sub_niche: null, topic: null, mode: null, goal: null, language: null,
      hook_type: null, hook_pattern: null, structure: null, persuasion: null, why_it_works: null,
    }
  }
  return {
    readable,
    bucket: pick(r.bucket, BRAIN_BUCKETS),
    sub_niche: txt(r.sub_niche, 60)?.toLowerCase() ?? null,
    topic,
    mode: pick(r.mode, MODES),
    goal: pick(r.goal, GOALS),
    language: txt(r.language, 30),
    hook_type: txt(r.hook_type, 40)?.toLowerCase() ?? null,
    hook_pattern: txt(r.hook_pattern, 200),
    structure: st ? { before_ask: txt(st.before_ask), ask: txt(st.ask), after_ask: txt(st.after_ask) } : null,
    persuasion: pe ? { proof: txt(pe.proof), objection: txt(pe.objection), cta: txt(pe.cta) } : null,
    why_it_works: txt(r.why_it_works, 300),
  }
}

/** "9.7M views", "998 views with…", "964.2K" → a number; null when unreadable. */
export function viewsFromReach(reach: unknown): number | null {
  if (typeof reach !== 'string') return null
  const m = reach.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*([KkMmBb])?\s*views?/)
  if (!m) return null
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? '').toLowerCase() as 'k' | 'm' | 'b'] ?? 1
  return Math.round(Number(m[1]) * mult)
}

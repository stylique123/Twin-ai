// Pure half of the idea writer (no DB import), so it can be tested.

export const IDEA_MODES = ['educate', 'entertain', 'teach', 'inspire', 'sell'] as const
export const IDEA_GOALS = ['views', 'leads', 'sales', 'authority', 'community'] as const
export const MAX_IDEAS = 6
export const IDEA_BASES = ['own', 'event', 'trend', 'product'] as const
/** A "why" line is one plain sentence: the fact, then the payoff. */
export const WHY_MAX_WORDS = 14
/** Mechanism words the creator should never read. */
const MECHANISM = /\b(search[- ]driven|niche pattern|proven pattern|algorithm|engagement rate|view brackets?|top[- ]performing|optimi[sz]ed)\b/i

export interface Idea {
  title: string; premise: string; mode: string | null; goal: string | null
  why: string | null; hook: string | null; product_id: string | null
  basis: string | null; event_day: string | null
  /** DERIVED here, never taken from the model: see `isReadyDraft`. */
  ready: boolean
}

export const IDEAS_SYSTEM = [
  'You are a short-form content strategist planning what ONE creator should post next.',
  'You get her DNA, her products, her own best and weakest posts, the scripts already written for her,',
  'what is rising in her lane, what the world is talking about, and patterns that work in her niche.',
  'Write up to 6 video ideas. Each must be specific to HER (her voice, her products, her audience),',
  'mix modes (educate / entertain / teach / inspire / sell), never repeat an already-written premise,',
  'MODES: teach = a HOW-TO, the viewer does it step by step; educate = an EXPLAINER, why or how something works, not steps;',
  'entertain = story or humour first; inspire = behind the scenes or the journey; sell = a direct pitch.',
  'TITLE — one plain sentence under 12 words saying what the video is, in her words, no colons or jargon ("Why your grocery-store coffee tastes flat").',
  'Give each idea a HOOK: the first spoken line, in her voice.',
  'and give a one-sentence WHY grounded in the evidence you were given (name it: "your best post…", "rising in your lane…", "the World Cup…").',
  'Only tie a product in when it fits naturally; use product_id from the list given, or null.',
  'Never invent facts, numbers or results about her or her products.',
  'BASIS — say what each idea is built from: "own" = only her own best posts and facts she already confirmed;',
  '"event" = a dated moment (then give event_day as YYYY-MM-DD); "trend" = something rising in her niche, not proven for her;',
  '"product" = leans on a product detail she has not confirmed (a new item, a price). Pick the most cautious that applies.',
  'WHY — one short plain sentence, at most 12 words: the fact, then the payoff. No mechanism words',
  '(never "search-driven", "niche pattern", "algorithm", "top-performing"). Good: "Coffee Day is October 1st — good timing for a fresh-roast video."',
  'Good: "Packaging videos do well for small coffee brands like yours." Good: "Your coffee-cart cost breakdown is your most-watched video."',
  'You also get her OPEN ideas (do not repeat them), ideas she HID (never bring back the same idea unless there is a clearly new reason),',
  'and LAST YEAR AROUND NOW (dated ideas from this season last year and whether she used them — raise the good ones again, freshly).',
].join('\n')

const S = { type: 'STRING', nullable: true }
export const IDEAS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    ideas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' }, premise: { type: 'STRING' },
          mode: { type: 'STRING', nullable: true, enum: [...IDEA_MODES] },
          goal: { type: 'STRING', nullable: true, enum: [...IDEA_GOALS] },
          why: S, hook: S, product_id: S,
          basis: { type: 'STRING', nullable: true, enum: [...IDEA_BASES] },
          event_day: S,
        },
        required: ['title', 'premise'],
      },
    },
  },
  required: ['ideas'],
}

const t = (v: unknown, n: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.replace(/\s+/g, ' ').trim()
  return s ? s.slice(0, n) : null
}

/** A "why" the creator can read in one glance, or null. */
export function cleanWhy(v: unknown): string | null {
  const s = t(v, 240)
  if (!s || MECHANISM.test(s)) return null
  const words = s.split(' ')
  return words.length <= WHY_MAX_WORDS ? s : null
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** ⚖️ THE ONLY IDEAS SAFE TO SKIP THE FOLLOW-UP QUESTIONS: built entirely from
 *  her own confirmed record, not dated, not selling, and not leaning on an
 *  unconfirmed product detail. Everything else is surfaced for her to confirm. */
export function isReadyDraft(i: Pick<Idea, 'basis' | 'event_day' | 'mode' | 'goal'>): boolean {
  return i.basis === 'own' && !i.event_day && i.mode !== 'sell' && i.goal !== 'sales'
}

/** Clamp model output; a product_id is kept only if it is one of hers. */
export function normalizeIdeas(raw: unknown, productIds: ReadonlySet<string>): Idea[] {
  const list = (raw as { ideas?: unknown[] } | null)?.ideas
  if (!Array.isArray(list)) return []
  const out: Idea[] = []
  const seen = new Set<string>()
  for (const r of list) {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const title = t(o.title, 90)
    const premise = t(o.premise, 400)
    if (!title || !premise) continue
    const k = title.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    const pid = t(o.product_id, 64)
    const day = t(o.event_day, 10)
    const event_day = day && DAY.test(day) && !Number.isNaN(Date.parse(day)) ? day : null
    // ⚠️ A DATE MAKES IT AN EVENT WHATEVER THE MODEL CALLED IT, and an unknown
    // basis is treated as a guess ('trend'), never as her own record.
    const said = (IDEA_BASES as readonly string[]).includes(String(o.basis)) ? String(o.basis) : 'trend'
    const basis = event_day ? 'event' : said === 'event' ? 'trend' : said
    const idea = {
      title, premise,
      mode: (IDEA_MODES as readonly string[]).includes(String(o.mode)) ? String(o.mode) : null,
      goal: (IDEA_GOALS as readonly string[]).includes(String(o.goal)) ? String(o.goal) : null,
      why: cleanWhy(o.why), hook: t(o.hook, 160),
      product_id: pid && productIds.has(pid) ? pid : null,
      basis, event_day, ready: false,
    }
    idea.ready = isReadyDraft(idea)
    out.push(idea)
    if (out.length >= MAX_IDEAS) break
  }
  return out
}

// Pure half of the idea writer (no DB import), so it can be tested.

export const IDEA_MODES = ['educate', 'entertain', 'teach', 'inspire', 'sell'] as const
export const IDEA_GOALS = ['views', 'leads', 'sales', 'authority', 'community'] as const
export const MAX_IDEAS = 6

export interface Idea {
  title: string; premise: string; mode: string | null; goal: string | null
  why: string | null; hook: string | null; product_id: string | null
}

export const IDEAS_SYSTEM = [
  'You are a short-form content strategist planning what ONE creator should post next.',
  'You get her DNA, her products, her own best and weakest posts, the scripts already written for her,',
  'what is rising in her lane, what the world is talking about, and patterns that work in her niche.',
  'Write up to 6 video ideas. Each must be specific to HER (her voice, her products, her audience),',
  'mix modes (educate / entertain / teach / inspire / sell), never repeat an already-written premise,',
  'and give a one-sentence WHY grounded in the evidence you were given (name it: "your best post…", "rising in your lane…", "the World Cup…").',
  'Only tie a product in when it fits naturally; use product_id from the list given, or null.',
  'Never invent facts, numbers or results about her or her products.',
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
    out.push({
      title, premise,
      mode: (IDEA_MODES as readonly string[]).includes(String(o.mode)) ? String(o.mode) : null,
      goal: (IDEA_GOALS as readonly string[]).includes(String(o.goal)) ? String(o.goal) : null,
      why: t(o.why, 240), hook: t(o.hook, 160),
      product_id: pid && productIds.has(pid) ? pid : null,
    })
    if (out.length >= MAX_IDEAS) break
  }
  return out
}

// WHAT TWIN HAS LEARNED FROM HER (owner, 2026-09-28): "create a system where it's
// actually learning from it — the ratings, the personas, the hooks."
//
// Until now her ratings were saved and read by nothing on the writing side. A
// lesson is one short rule with a source she can see and remove:
//   · rating notes  → "don't add X", "keep Y a habit, not a rule" (her words);
//   · rating tags   → "Too long" twice means shorter;
//   · test viewers  → the hook shape that stopped most, the gap they kept flagging;
//   · her hook pick → the hook she chose over Twin's.
// Every script is written with her active lessons, and checked against the
// "never say" phrases afterwards. This file is the one set of rules; the worker
// and the edge function run a generated copy (scripts/ci/generate_shared_pilot_core.mjs).

export type LessonKind = 'avoid' | 'prefer' | 'style' | 'hook'
export type LessonSource = 'rating' | 'rating_tag' | 'audience' | 'hook_pick'

export interface CreatorLesson {
  kind: LessonKind
  text: string
  /** Exact words never to say again, checked after writing. Null for guidance. */
  phrase: string | null
  source: LessonSource
  weight: number
}

/** The most lessons the writer is given; avoid-rules first, then heaviest. */
export const LESSONS_IN_PROMPT = 14

// Tags on the rating card → a standing style lesson. Only negative tags teach a
// correction; positive ones reinforce what already happened.
const TAG_LESSON: Record<string, { kind: LessonKind; text: string }> = {
  'Too long': { kind: 'style', text: 'Keep it shorter: fewer scenes and tighter lines.' },
  'Too salesy': { kind: 'style', text: 'Less selling: earn the product mention, keep the pitch to the close.' },
  'Hook is weak': { kind: 'style', text: 'Open on a concrete moment or a sharp claim, not a greeting or a general question.' },
  'Hard to film': { kind: 'style', text: 'Only ask for shots she can film alone at home or in her workspace.' },
  'Wrong product facts': { kind: 'avoid', text: 'Never state a product detail she has not given; leave it out instead.' },
  'Not my voice': { kind: 'style', text: 'Use her own phrasing and sentence length; no polished marketing lines.' },
  'Strong hook': { kind: 'prefer', text: 'Hooks that name a specific moment or mistake work for her; keep that shape.' },
  'Love it': { kind: 'prefer', text: 'This kind of script is what she wants; keep its structure and length.' },
  'Sounds like me': { kind: 'prefer', text: 'Keep writing in her plain, direct voice.' },
}

/** Tag lessons from one rating (deterministic; weight grows by repetition in the store). */
export function lessonsFromTags(tags: readonly string[]): CreatorLesson[] {
  const out: CreatorLesson[] = []
  for (const t of tags) {
    const l = TAG_LESSON[t]
    if (l) out.push({ ...l, phrase: null, source: 'rating_tag', weight: 1 })
  }
  return out
}

/** Model instructions for turning one "what would you change?" note into lessons. */
export const RATING_LESSON_SYSTEM = [
  'A creator rated a video script and wrote what she would change. Turn her note into short, reusable lessons for writing HER future scripts.',
  'Each lesson is one plain sentence under 25 words, written as an instruction ("Never say...", "Keep ... as a habit, not a rule", "Explain the product before any story").',
  'kind: "avoid" for something to never do or say again, "prefer" for something to keep doing, "style" for length, tone or structure.',
  'phrase: when she objects to specific words, copy those exact words (2-8 words) so they can be checked later; otherwise null.',
  'Only lessons that would apply beyond this one script. Never invent a preference she did not state. At most 5 lessons.',
].join('\n')

export const RATING_LESSON_SCHEMA = {
  type: 'object',
  properties: {
    lessons: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['avoid', 'prefer', 'style'] },
          text: { type: 'string' },
          phrase: { type: 'string', nullable: true },
        },
        required: ['kind', 'text'],
      },
    },
  },
  required: ['lessons'],
} as const

const norm = (s: string) => s.toLowerCase().replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim()

/** Clean the model's lessons against her note: a phrase must be words she quoted. */
export function cleanRatingLessons(raw: unknown, note: string): CreatorLesson[] {
  const list = (raw as { lessons?: unknown })?.lessons
  if (!Array.isArray(list)) return []
  const said = norm(note)
  const out: CreatorLesson[] = []
  for (const r of list.slice(0, 5)) {
    const kind = (r as { kind?: unknown })?.kind
    const text = String((r as { text?: unknown })?.text ?? '').trim().slice(0, 200)
    if (!text || (kind !== 'avoid' && kind !== 'prefer' && kind !== 'style')) continue
    const p = String((r as { phrase?: unknown })?.phrase ?? '').trim()
    const words = norm(p).split(' ').filter(Boolean).length
    const phrase = p && words >= 1 && words <= 8 && said.includes(norm(p)) ? p.replace(/^["“']|["”']$/g, '').slice(0, 80) : null
    out.push({ kind, text, phrase, source: 'rating', weight: 2 })
  }
  return out
}

interface AudienceTestLike {
  hooks?: unknown
  fixes?: unknown
  panel_size?: unknown
}

/** What her test viewers taught: the winning hook as an example, a repeated gap as a rule. */
export function lessonsFromAudience(t: AudienceTestLike): CreatorLesson[] {
  const out: CreatorLesson[] = []
  const hooks = Array.isArray(t.hooks) ? t.hooks as Array<{ hook?: unknown; stopped?: unknown }> : []
  const best = [...hooks].filter((h) => typeof h?.hook === 'string' && Number(h?.stopped) > 0)
    .sort((a, b) => Number(b.stopped) - Number(a.stopped))[0]
  const panel = Number(t.panel_size) || 10
  if (best && Number(best.stopped) >= Math.ceil(panel * 0.6)) {
    out.push({
      kind: 'hook', phrase: null, source: 'audience', weight: 1,
      text: `A hook that stopped ${Number(best.stopped)} of ${panel} of her test viewers: "${String(best.hook).slice(0, 140)}". Similar shapes work for her.`,
    })
  }
  const fixes = Array.isArray(t.fixes) ? t.fixes as Array<{ issue?: unknown; fix?: unknown; count?: unknown }> : []
  const ISSUE: Record<string, string> = {
    unanswered_question: 'Answer every question the script raises before the close.',
    weak_ending: 'End on a direct, specific invitation, not a generic question.',
    weak_hook: 'Lead with the highest-stakes line; no warm-up before the hook.',
    too_long: 'Cut any line that repeats a point already made.',
    unclear: 'Say the concrete thing plainly; no vague setup lines.',
  }
  for (const f of fixes) {
    const issue = String(f?.issue ?? '')
    if (ISSUE[issue] && Number(f?.count) >= 3) {
      out.push({ kind: 'style', phrase: null, source: 'audience', weight: 1, text: ISSUE[issue] })
    }
  }
  return out
}

/** Her own hook choice over Twin's default. */
export function lessonFromHookPick(picked: string, twinDefault: string | null): CreatorLesson | null {
  const p = picked.trim()
  if (!p || (twinDefault && norm(twinDefault) === norm(p))) return null
  return { kind: 'hook', phrase: null, source: 'hook_pick', weight: 2, text: `She chose this hook over Twin's pick: "${p.slice(0, 140)}". Favour hooks like it.` }
}

interface StoredLesson { kind: string; text: string; phrase?: string | null; weight?: number | null }

/** Avoid-rules first, then heaviest; capped. The writer and the plan read the same order. */
export function orderLessons<T extends StoredLesson>(rows: readonly T[]): T[] {
  const rank = (k: string) => (k === 'avoid' ? 0 : k === 'style' ? 1 : k === 'prefer' ? 2 : 3)
  return [...rows].sort((a, b) => rank(a.kind) - rank(b.kind) || Number(b.weight ?? 1) - Number(a.weight ?? 1))
    .slice(0, LESSONS_IN_PROMPT)
}

/** The prompt block. Empty string when she has taught nothing yet. */
export function lessonsPromptBlock(rows: readonly StoredLesson[]): string {
  const ordered = orderLessons(rows)
  if (!ordered.length) return ''
  const lines = ordered.map((l) => `- ${l.text}${l.phrase ? ` (never write: "${l.phrase}")` : ''}`)
  return `\n\nWHAT SHE HAS TAUGHT TWIN (from her ratings, her test viewers and her own picks — these outrank style defaults):\n${lines.join('\n')}`
}

/** "Never say" phrases the finished script still contains. */
export function brokenLessons(scriptText: string, rows: readonly StoredLesson[]): string[] {
  const t = norm(scriptText)
  return rows.filter((l) => l.kind === 'avoid' && l.phrase && norm(l.phrase).length > 3 && t.includes(norm(l.phrase)))
    .map((l) => String(l.phrase))
}

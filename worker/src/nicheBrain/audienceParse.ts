// TEST VIEWERS — pure part: prompt, schema, and clamping what comes back.
//
// ⚖️ HONEST NUMBERS. The panel is ~10 pretend viewers, so results are counts
// ("8 of 10"), never a percentage that reads like a forecast. Every count is
// recomputed here from the viewers themselves, so a model that says "9 stopped"
// while listing 6 cannot inflate the number she sees.

export const PANEL_SIZE = 10

/** Closed list so the mistakes log can count the same mistake across scripts. */
export const ISSUES = [
  'slow_start', 'weak_hook', 'missing_price', 'unanswered_question', 'unclear_product',
  'too_long', 'weak_ending', 'too_salesy', 'not_believable', 'hard_to_follow',
] as const
export type Issue = typeof ISSUES[number]

export const AUDIENCE_SYSTEM = [
  'You run a test audience for a short-form video creator, BEFORE she films.',
  `Invent exactly ${PANEL_SIZE} realistic viewers who would actually see this video in her niche: mix loyal fans, gift/first-time buyers, sceptics, and fast scrollers. Base them on her DNA, her audience, and the known objections in her niche.`,
  'Each viewer reads the hook options and the script, then answers honestly as that person — not as a marketer.',
  '- who: a short label for the viewer (e.g. "Gift buyer", "Price sceptic", "Pottery lover", "Fast scroller").',
  '- stops_for: the 0-based index of the ONE hook option that would make them stop scrolling, or -1 if none would.',
  '- leaves_at: the 0-based script line where they would scroll away, or -1 if they watch to the end.',
  '- quote: one sentence in their own casual words about the video (max 20 words).',
  '- question: the question they would type in the comments, or null.',
  'Then list at most 3 fixes the panel points to, each with an issue from the allowed list, a concrete fix in one sentence, and the 0-based script line it applies to (-1 for the whole video).',
  'NEVER suggest adding facts that are not already in the script or the product facts given (no invented prices, numbers, awards or claims). If a viewer asks for a missing fact, the fix is "say it if true", not a made-up value.',
  'Be tough but fair: a good script can have zero fixes.',
].join('\n')

const S = { type: 'STRING' }
const N = { type: 'INTEGER' }
export const AUDIENCE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    viewers: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { who: S, stops_for: N, leaves_at: N, quote: S, question: { type: 'STRING', nullable: true } },
        required: ['who', 'stops_for', 'leaves_at', 'quote'],
      },
    },
    fixes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { issue: { type: 'STRING', enum: [...ISSUES] }, fix: S, beat: N },
        required: ['issue', 'fix', 'beat'],
      },
    },
    summary: S,
  },
  required: ['viewers', 'fixes', 'summary'],
}

export interface ScriptForTest {
  hooks: string[]
  lines: string[]
  concept?: string | null
}

export function scriptFromBlueprint(bp: unknown): ScriptForTest | null {
  const b = (bp && typeof bp === 'object' ? bp : {}) as Record<string, unknown>
  const hooks = Array.isArray(b.hook_options)
    ? (b.hook_options as unknown[]).filter((h): h is string => typeof h === 'string' && !!h.trim()).slice(0, 5)
    : []
  const lines = Array.isArray(b.script)
    ? (b.script as Array<{ line?: unknown }>).map((s) => (typeof s?.line === 'string' ? s.line.trim() : '')).filter(Boolean)
    : []
  if (hooks.length === 0 || lines.length === 0) return null
  const c = b.concept as { premise?: unknown } | undefined
  return { hooks, lines, concept: typeof c?.premise === 'string' ? c.premise : null }
}

export function audiencePrompt(s: ScriptForTest, ctx: { dna: unknown; product?: string | null; objections: string[]; lessons: unknown }): string {
  const j = (v: unknown, n: number) => JSON.stringify(v ?? null).slice(0, n)
  return [
    `CREATOR DNA: ${j(ctx.dna, 1200)}`,
    ctx.product ? `PRODUCT FACTS (the only facts that exist): ${ctx.product.slice(0, 1200)}` : '',
    ctx.objections.length ? `KNOWN QUESTIONS/OBJECTIONS IN HER NICHE: ${ctx.objections.slice(0, 8).join(' | ')}` : '',
    `WHAT PAST TEST PANELS KEPT FLAGGING FOR HER: ${j(ctx.lessons, 500)}`,
    s.concept ? `IDEA: ${s.concept}` : '',
    `HOOK OPTIONS:\n${s.hooks.map((h, i) => `${i}. ${h}`).join('\n')}`,
    `SCRIPT (line 0 is spoken with whichever hook she picks):\n${s.lines.map((l, i) => `${i}. ${l}`).join('\n')}`,
  ].filter(Boolean).join('\n\n')
}

export interface Viewer { who: string; quote: string; stops_for: number; leaves_at: number; question: string | null }
export interface Fix { issue: Issue; fix: string; beat: number; count: number }
export interface AudienceResult {
  viewers: Viewer[]
  hooks: Array<{ hook: string; stopped: number }>
  best_hook: number | null
  fixes: Fix[]
  summary: string | null
}

const txt = (v: unknown, n: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, n) : null
}
const int = (v: unknown, lo: number, hi: number, dflt: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : dflt

/** Model output is untrusted: clamp every field and recount every number. */
export function normalizeAudience(raw: unknown, s: ScriptForTest): AudienceResult | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const viewers: Viewer[] = (Array.isArray(r.viewers) ? r.viewers : []).slice(0, PANEL_SIZE).flatMap((v) => {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
    const who = txt(o.who, 40), quote = txt(o.quote, 160)
    if (!who || !quote) return []
    return [{
      who, quote,
      stops_for: int(o.stops_for, -1, s.hooks.length - 1, -1),
      leaves_at: int(o.leaves_at, -1, s.lines.length - 1, -1),
      question: txt(o.question, 140),
    }]
  })
  if (viewers.length < 3) return null

  const hooks = s.hooks.map((hook, i) => ({ hook, stopped: viewers.filter((v) => v.stops_for === i).length }))
  const top = Math.max(...hooks.map((h) => h.stopped))
  const best_hook = top > 0 ? hooks.findIndex((h) => h.stopped === top) : null

  const leaving = (beat: number) => viewers.filter((v) => v.leaves_at === beat).length
  const fixes: Fix[] = (Array.isArray(r.fixes) ? r.fixes : []).slice(0, 3).flatMap((f) => {
    const o = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>
    const issue = (ISSUES as readonly string[]).includes(o.issue as string) ? (o.issue as Issue) : null
    const fix = txt(o.fix, 220)
    if (!issue || !fix) return []
    const beat = int(o.beat, -1, s.lines.length - 1, -1)
    // How many viewers back this fix up: those who left at that line, or asked a question for question-type issues.
    const count = issue === 'unanswered_question' || issue === 'missing_price'
      ? viewers.filter((v) => v.question).length
      : beat >= 0 ? leaving(beat) : 0
    return [{ issue, fix, beat, count }]
  })

  return { viewers, hooks, best_hook, fixes, summary: txt(r.summary, 300) }
}

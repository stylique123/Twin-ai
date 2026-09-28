// TEST VIEWERS — pure part: prompt, schema, and clamping what comes back.
//
// ⚖️ HONEST NUMBERS. The panel is ~10 pretend viewers, so results are counts
// ("8 of 10"), never a percentage that reads like a forecast. Every count is
// recomputed here from the viewers themselves, so a model that says "9 stopped"
// while listing 6 cannot inflate the number she sees.

export const PANEL_SIZE = 10
const S0 = { type: 'STRING' }

/** Closed list so the mistakes log can count the same mistake across scripts. */
export const ISSUES = [
  'slow_start', 'weak_hook', 'missing_price', 'unanswered_question', 'unclear_product',
  'too_long', 'weak_ending', 'too_salesy', 'not_believable', 'hard_to_follow',
] as const
export type Issue = typeof ISSUES[number]

// ── HER PANEL: the fixed viewers, built once per voice from her real posts ──
export interface Persona { who: string; about: string; stops_for: string; scrolls_when: string; asks: string | null }

export const PANEL_SYSTEM = [
  `Build the ${PANEL_SIZE} viewers who REALLY watch this creator, from her DNA and her real posts with their plays and likes.`,
  'Her best posts show what her audience rewards; her weakest show what makes them scroll. Every persona must be traceable to that evidence or her DNA — no generic marketing personas.',
  'Mix: loyal fans, first-time or gift buyers, sceptics (price, quality, trust), and fast scrollers, in the proportions her numbers suggest.',
  '- who: short label (e.g. "Gift buyer", "Price sceptic").',
  '- about: one line on who they are and why they follow her.',
  '- stops_for: what makes them stop scrolling, grounded in her best posts.',
  '- scrolls_when: what makes them leave, grounded in her weakest posts.',
  '- asks: the question they typically ask in comments, or null.',
].join('\n')

export const PANEL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    personas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { who: S0, about: S0, stops_for: S0, scrolls_when: S0, asks: { type: 'STRING', nullable: true } },
        required: ['who', 'about', 'stops_for', 'scrolls_when'],
      },
    },
  },
  required: ['personas'],
}

export function normalizePanel(raw: unknown): Persona[] {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const t = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, n) : null)
  return (Array.isArray(r.personas) ? r.personas : []).flatMap((p) => {
    const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
    const who = t(o.who, 40), about = t(o.about, 200), stops = t(o.stops_for, 200), scrolls = t(o.scrolls_when, 200)
    if (!who || !about || !stops || !scrolls) return []
    return [{ who, about, stops_for: stops, scrolls_when: scrolls, asks: t(o.asks, 140) }]
  }).slice(0, PANEL_SIZE)
}

export const AUDIENCE_SYSTEM = [
  'You run a test audience for a short-form video creator, BEFORE she films.',
  'If HER PANEL is given, play exactly those viewers (same labels, same order) — do not invent others.',
  `Otherwise invent exactly ${PANEL_SIZE} realistic viewers who would actually see this video in her niche: mix loyal fans, gift/first-time buyers, sceptics, and fast scrollers. Base them on her DNA, her audience, and the known objections in her niche.`,
  'Each viewer reads the hook options and the script, then answers honestly as that person — not as a marketer.',
  '- who: a short label for the viewer (e.g. "Gift buyer", "Price sceptic", "Pottery lover", "Fast scroller").',
  '- would_stop: the 0-based indexes of EVERY hook option that would make this viewer stop scrolling — judge each hook on its own, not against the others. Empty if none would.',
  '- stops_for: the 0-based index of the ONE hook they like most, or -1 if none would stop them.',
  '- leaves_at: the 0-based script line where they would scroll away, or -1 if they watch to the end.',
  '- quote: one sentence in their own casual words about the video (max 20 words).',
  '- question: the question they would type in the comments, or null.',
  'Then list at most 3 fixes the panel points to, each with an issue from the allowed list, a concrete fix in one sentence, and the 0-based script line it applies to (-1 for the whole video).',
  'NEVER suggest adding facts that are not already in the script or the product facts given (no invented prices, numbers, awards or claims). If a viewer asks for a missing fact, the fix is "say it if true", not a made-up value.',
  'Be tough but fair: a good script can have zero fixes.',
].join('\n')

const S = S0
const N = { type: 'INTEGER' }
export const AUDIENCE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    viewers: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { who: S, would_stop: { type: 'ARRAY', items: N }, stops_for: N, leaves_at: N, quote: S, question: { type: 'STRING', nullable: true } },
        required: ['who', 'would_stop', 'stops_for', 'leaves_at', 'quote'],
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
  /** The shot each line is filmed as, so viewers judge the scenes too. */
  shots?: Array<string | null>
  /** Position of each line in `blueprint.script`, for writing a rewrite back. */
  at?: number[]
}

export function scriptFromBlueprint(bp: unknown): ScriptForTest | null {
  const b = (bp && typeof bp === 'object' ? bp : {}) as Record<string, unknown>
  const hooks = Array.isArray(b.hook_options)
    ? (b.hook_options as unknown[]).filter((h): h is string => typeof h === 'string' && !!h.trim()).slice(0, 5)
    : []
  const lines: string[] = [], at: number[] = []
  if (Array.isArray(b.script)) {
    (b.script as Array<{ line?: unknown }>).forEach((s, i) => {
      const t = typeof s?.line === 'string' ? s.line.trim() : ''
      if (t) { lines.push(t); at.push(i) }
    })
  }
  if (hooks.length === 0 || lines.length === 0) return null
  const rows = Array.isArray(b.shot_list) ? b.shot_list as Array<Record<string, unknown>> : []
  const shots = lines.map((l) => {
    const r = rows.find((x) => typeof x?.spoken_text === 'string' && x.spoken_text.trim() === l)
    if (!r) return null
    const d = [r.shot, r.framing, r.b_roll_visual, r.notes].filter((v) => typeof v === 'string' && v.trim()).join(' · ')
    return d ? d.slice(0, 160) : null
  })
  const c = b.concept as { premise?: unknown } | undefined
  return { hooks, lines, at, shots, concept: typeof c?.premise === 'string' ? c.premise : null }
}

export function audiencePrompt(s: ScriptForTest, ctx: { dna: unknown; product?: string | null; objections: string[]; lessons: unknown; panel?: Persona[] }): string {
  const j = (v: unknown, n: number) => JSON.stringify(v ?? null).slice(0, n)
  return [
    `CREATOR DNA: ${j(ctx.dna, 1200)}`,
    ctx.panel?.length ? `HER PANEL (play these viewers):\n${ctx.panel.map((p, i) => `${i}. ${p.who} — ${p.about} Stops for: ${p.stops_for} Scrolls when: ${p.scrolls_when}${p.asks ? ` Asks: ${p.asks}` : ''}`).join('\n')}` : '',
    ctx.product ? `PRODUCT FACTS (the only facts that exist): ${ctx.product.slice(0, 1200)}` : '',
    ctx.objections.length ? `KNOWN QUESTIONS/OBJECTIONS IN HER NICHE: ${ctx.objections.slice(0, 8).join(' | ')}` : '',
    `WHAT PAST TEST PANELS KEPT FLAGGING FOR HER: ${j(ctx.lessons, 500)}`,
    s.concept ? `IDEA: ${s.concept}` : '',
    `HOOK OPTIONS:\n${s.hooks.map((h, i) => `${i}. ${h}`).join('\n')}`,
    `SCRIPT (line 0 is spoken with whichever hook she picks; [scene] is what is on screen):\n${s.lines.map((l, i) => `${i}. ${l}${s.shots?.[i] ? ` [scene: ${s.shots[i]}]` : ''}`).join('\n')}`,
  ].filter(Boolean).join('\n\n')
}

export interface Viewer { who: string; quote: string; stops_for: number; leaves_at: number; question: string | null; would_stop: number[] }
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
      would_stop: [...new Set((Array.isArray(o.would_stop) ? o.would_stop : [])
        .filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < s.hooks.length))],
      leaves_at: int(o.leaves_at, -1, s.lines.length - 1, -1),
      question: txt(o.question, 140),
    }]
  })
  if (viewers.length < 3) return null

  // ⚠️ EACH VIEWER JUDGES EVERY HOOK. Counting only each viewer's single
  // favourite split ten votes across five hooks, so the best hook could never
  // read above ~4 of 10 however good it was (owner: "why is the best one 3/10?").
  // A favourite always counts as a stop, so an older answer still scores.
  const stopsOn = (v: Viewer, i: number) => v.would_stop.includes(i) || v.stops_for === i
  const hooks = s.hooks.map((hook, i) => ({ hook, stopped: viewers.filter((v) => stopsOn(v, i)).length }))
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

// ── MAKE THE HOOK BETTER, THEN SHOW IT (owner: the panel must change the
// script, not only grade it). When the best hook stops fewer than this many
// viewers, Twin writes new hooks from what the viewers said and tests again.
export const HOOK_TARGET = 7
export const HOOK_ROUNDS = 2
export const HOOK_REWRITE_SYSTEM = [
  'You rewrite the opening hook of a short-form video so more of her real viewers stop scrolling.',
  'You get the script, the hooks already tested with how many of 10 viewers each stopped, and what each viewer said.',
  'Write 3 NEW hooks: each a single spoken line under 15 words, in her voice, true to the script — the same topic and claims, no new facts, numbers, names or promises.',
  'Fix what the viewers said was missing (curiosity, stakes, who it is for). Each hook must be a DIFFERENT idea, not a paraphrase of another or of an old hook.',
].join('\n')
export const HOOK_REWRITE_SCHEMA = {
  type: 'OBJECT',
  properties: { hooks: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['hooks'],
}
export function hookRewritePrompt(s: ScriptForTest, tested: Array<{ hook: string; stopped: number }>, viewers: Viewer[]): string {
  return [
    `SCRIPT:\n${s.lines.map((l, i) => `${i}. ${l}`).join('\n')}`,
    `HOOKS TESTED (stopped / 10):\n${tested.map((h) => `${h.stopped} — ${h.hook}`).join('\n')}`,
    `WHAT THE VIEWERS SAID:\n${viewers.map((v) => `${v.who}: ${v.quote}`).join('\n')}`,
  ].join('\n\n')
}
export function cleanNewHooks(raw: unknown, existing: readonly string[]): string[] {
  const list = (raw as { hooks?: unknown } | null)?.hooks
  if (!Array.isArray(list)) return []
  const seen = new Set(existing.map((h) => h.toLowerCase().trim()))
  const out: string[] = []
  for (const h of list) {
    const t = typeof h === 'string' ? h.replace(/\s+/g, ' ').trim() : ''
    if (!t || t.split(' ').length > 18 || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase()); out.push(t)
    if (out.length >= 3) break
  }
  return out
}

// ── MAKE THE WHOLE SCRIPT BETTER, THEN SHOW IT (owner: "check the structure,
// the words, the scenes, show it to everyone, and only the best version is the
// one she sees"). After the hooks, while fewer than SCRIPT_TARGET of 10 would
// watch to the end, Twin rewrites ONLY the lines the viewers left at or flagged,
// tests the new version on the same viewers, and keeps it only if more stay.
export const SCRIPT_TARGET = 6
export const SCRIPT_ROUNDS = 2
export const MAX_LINE_CHANGES = 4
export const watchedToEnd = (viewers: readonly { leaves_at: number }[]) => viewers.filter((v) => v.leaves_at === -1).length

export const SCRIPT_REWRITE_SYSTEM = [
  'You edit a short-form video script so more of her real viewers watch to the end.',
  'You get the script line by line (with the scene on screen), where each viewer scrolled away, what they said, and the fixes they pointed to.',
  `Rewrite at most ${MAX_LINE_CHANGES} lines — the ones viewers left at or flagged. Tighten, reorder the idea within the line, sharpen the words, make the scene\'s payoff land sooner.`,
  'Keep her voice. Keep every line doing the same job (hook stays a hook, the close stays the close). Keep each line about as long or shorter.',
  'NEVER add a fact that is not already in the script: no new numbers, prices, names, places, awards, results or promises. If a viewer wanted a missing fact, leave that line alone.',
  'Return only the lines you changed, by their 0-based index. Return an empty list if the script is already right.',
].join('\n')
export const SCRIPT_REWRITE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    lines: { type: 'ARRAY', items: { type: 'OBJECT', properties: { index: N, text: S }, required: ['index', 'text'] } },
  },
  required: ['lines'],
}
export function scriptRewritePrompt(s: ScriptForTest, r: AudienceResult): string {
  const left = (i: number) => r.viewers.filter((v) => v.leaves_at === i).map((v) => v.who)
  return [
    `SCRIPT:\n${s.lines.map((l, i) => `${i}. ${l}${s.shots?.[i] ? ` [scene: ${s.shots[i]}]` : ''}${left(i).length ? `  ← ${left(i).length} left here (${left(i).join(', ')})` : ''}`).join('\n')}`,
    `WATCHED TO THE END: ${watchedToEnd(r.viewers)} of ${r.viewers.length}`,
    `WHAT THE VIEWERS SAID:\n${r.viewers.map((v) => `${v.who}: ${v.quote}`).join('\n')}`,
    r.fixes.length ? `FIXES THEY POINTED TO:\n${r.fixes.map((f) => `${f.beat >= 0 ? `line ${f.beat}` : 'whole video'} — ${f.issue}: ${f.fix}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
}

const numbersIn = (t: string) => (t.toLowerCase().match(/\d[\d.,]*|\b(?:hundred|thousand|million|billion|percent)\b/g) ?? []).map((x) => x.replace(/[.,]+$/, ''))
const namesIn = (t: string) => (t.match(/(?<!^|[.!?]\s)\b[A-Z][a-z]{2,}\b/g) ?? [])

/** Apply a rewrite, refusing any line that brings in a number or name the
 *  script did not already have, or grows much longer. Returns null if nothing
 *  usable changed. */
export function applyLineRewrites(lines: readonly string[], raw: unknown): { lines: string[]; changed: number[] } | null {
  const list = (raw as { lines?: unknown } | null)?.lines
  if (!Array.isArray(list)) return null
  const all = lines.join(' ')
  const known = new Set(numbersIn(all))
  const knownNames = new Set((all.match(/\b[A-Z][a-z]{2,}\b/g) ?? []).map((x) => x.toLowerCase()))
  const out = [...lines]
  const changed: number[] = []
  for (const item of list) {
    const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const i = typeof o.index === 'number' && Number.isInteger(o.index) ? o.index : -1
    const t = typeof o.text === 'string' ? o.text.replace(/\s+/g, ' ').trim() : ''
    if (i < 0 || i >= lines.length || !t || changed.includes(i) || t === lines[i]) continue
    if (t.split(' ').length > lines[i].split(' ').length * 1.3 + 4) continue
    if (numbersIn(t).some((n) => !known.has(n))) continue
    if (namesIn(t).some((n) => !knownNames.has(n.toLowerCase()))) continue
    out[i] = t; changed.push(i)
    if (changed.length >= MAX_LINE_CHANGES) break
  }
  return changed.length ? { lines: out, changed } : null
}

/** A new version wins only if more viewers watch to the end and the best
 *  hook did not get worse. */
export function betterVersion(before: AudienceResult, after: AudienceResult): boolean {
  const best = (x: AudienceResult) => Math.max(0, ...x.hooks.map((h) => h.stopped))
  return watchedToEnd(after.viewers) > watchedToEnd(before.viewers) && best(after) >= best(before)
}

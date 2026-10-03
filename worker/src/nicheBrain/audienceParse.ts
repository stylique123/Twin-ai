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
  'too_long', 'weak_ending', 'too_salesy', 'not_believable', 'hard_to_follow', 'promise_not_kept',
] as const
export type Issue = typeof ISSUES[number]

import { SCRIPT_FAMILIES } from '../generated/scriptFamily.js'
// ── HER PANEL: the fixed viewers, built once per voice from her real posts ──
export interface Persona { who: string; about: string; stops_for: string; scrolls_when: string; asks: string | null; kind?: string | null; watches?: string[] }

/** ⚠️ AUDIT 2026-10-01 (persona brief): the panel had no visible make-up. Each
 *  viewer now carries one of these kinds, shown on the page. */
export const PERSONA_KINDS = ['loyal_fan', 'buyer', 'sceptic', 'cold_scroller', 'learner', 'peer'] as const
/** The video families the writer uses (one shared list, generated from packages/shared). */
export const VIDEO_FAMILIES = SCRIPT_FAMILIES
/** v2: built from her posts AND her niche's real high-reach videos; bump to rebuild every panel. */
export const PANEL_VERSION = 2

export const PANEL_SYSTEM = [
  `Build the ${PANEL_SIZE} viewers who REALLY watch this creator, from her DNA and her real posts with their plays and likes.`,
  'Her best posts show what her audience rewards; her weakest show what makes them scroll. Every persona must be traceable to that evidence or her DNA — no generic marketing personas.',
  'Mix: loyal fans, first-time or gift buyers, sceptics (price, quality, trust), fast scrollers who do not know her yet, learners, and peers in her trade, in the proportions her numbers suggest.',
  'NICHE EVIDENCE lists what real high-reach videos in her niche teach and the objections real viewers in it raise: use it so cold viewers and sceptics are real people of this niche, not stock types.',
  `- kind: one of ${PERSONA_KINDS.join(', ')}.`,
  `- watches: which kinds of HER videos this viewer actually watches, from: ${VIDEO_FAMILIES.join(', ')} (product = her selling a product, coach_expert = advice/business, educator = how-to, community = her story/life, entertainer = fun). Base it on which of her posts they would have engaged with.`,
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
        properties: {
          who: S0, about: S0, stops_for: S0, scrolls_when: S0, asks: { type: 'STRING', nullable: true },
          kind: { type: 'STRING', enum: [...PERSONA_KINDS] },
          watches: { type: 'ARRAY', items: { type: 'STRING', enum: [...VIDEO_FAMILIES] } },
        },
        required: ['who', 'about', 'stops_for', 'scrolls_when', 'kind', 'watches'],
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
    const kind = (PERSONA_KINDS as readonly string[]).includes(o.kind as string) ? (o.kind as string) : null
    const watches = (Array.isArray(o.watches) ? o.watches : []).filter((w): w is string => (VIDEO_FAMILIES as readonly string[]).includes(w as string))
    return [{ who, about, stops_for: stops, scrolls_when: scrolls, asks: t(o.asks, 140), kind, watches: [...new Set(watches)] }]
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
  'promise_kept: true if a script line BEFORE the call to action delivers what hook option 0 opens (every promised item, the answer to its question, the result it teased); false if the video never closes it. If false, include a promise_not_kept fix on the line that should deliver it.',
  'fits: for each viewer, true if THIS KIND of video (see VIDEO TYPE) is one this viewer would actually be shown and watch from her; false if they only watch her other kinds of videos. A viewer who does not fit still answers, but their wish for another kind of video is not a fix for this one.',
  'NEVER flag a fix that asks for content belonging to a different kind of video (e.g. business numbers on a craft-process video). Fixes serve THIS video\'s purpose and shape.',
  'VERIFIED FACTS and PRODUCT FACTS are everything she has actually said. A specific detail in the script (a number, a measurement, a technique, a sensory claim, a result) that is not backed by them earns NO credit from any viewer — list it in unverified, word for word as short as possible. Never praise it.',
  'working: up to 3 things that work in this script and WHY, each tied to a line (or -1 for the whole video): the positive signal she and Twin learn from. Only things backed by her facts.',
  'needs_her: up to 2 questions to HER (the creator), in plain words, for a fact the script needs that only she can give and that is not in her facts — e.g. "What size batch do you actually roast — how many pounds at a time?". Each with the 0-based line it belongs in and why viewers need it. Never ask for something already in her facts. Empty if nothing is missing.',
  'Finally, closed_hooks: the 0-based indexes of hooks that ANSWER THEIR OWN QUESTION — the hook already states the conclusion, so nothing is left to stay for (e.g. "A belly band will not heal your core"). A hook that raises a question or tension and holds the answer back is open. Judge the wording, not the topic.',
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
        properties: { who: S, would_stop: { type: 'ARRAY', items: N }, stops_for: N, leaves_at: N, quote: S, question: { type: 'STRING', nullable: true }, fits: { type: 'BOOLEAN' } },
        required: ['who', 'would_stop', 'stops_for', 'leaves_at', 'quote', 'fits'],
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
    closed_hooks: { type: 'ARRAY', items: N },
    working: { type: 'ARRAY', items: { type: 'OBJECT', properties: { what: S, why: S, beat: N }, required: ['what', 'why', 'beat'] } },
    needs_her: { type: 'ARRAY', items: { type: 'OBJECT', properties: { question: S, why: S, beat: N }, required: ['question', 'why', 'beat'] } },
    unverified: { type: 'ARRAY', items: S },
    promise_kept: { type: 'BOOLEAN' },
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

export function audiencePrompt(s: ScriptForTest, ctx: { dna: unknown; product?: string | null; objections: string[]; lessons: unknown; panel?: Persona[]; family?: string | null; shape?: string | null; facts?: string[] }): string {
  const j = (v: unknown, n: number) => JSON.stringify(v ?? null).slice(0, n)
  return [
    `CREATOR DNA: ${j(ctx.dna, 1200)}`,
    ctx.panel?.length ? `HER PANEL (play these viewers):\n${ctx.panel.map((p, i) => `${i}. ${p.who}${p.kind ? ` [${p.kind}]` : ''} — ${p.about} Stops for: ${p.stops_for} Scrolls when: ${p.scrolls_when}${p.asks ? ` Asks: ${p.asks}` : ''}${p.watches?.length ? ` Watches her: ${p.watches.join(', ')}` : ''}`).join('\n')}` : '',
    ctx.family ? `VIDEO TYPE: ${ctx.family}${ctx.shape ? `. Real high-reach videos of this type follow: ${ctx.shape}` : ''}` : '',
    ctx.product ? `PRODUCT FACTS (the only facts that exist): ${ctx.product.slice(0, 1200)}` : '',
    ctx.facts?.length ? `VERIFIED FACTS (what she has actually said):\n${ctx.facts.slice(0, 40).map((f) => `- ${f}`).join('\n')}` : 'VERIFIED FACTS: none beyond the product facts.',
    ctx.objections.length ? `KNOWN QUESTIONS/OBJECTIONS IN HER NICHE: ${ctx.objections.slice(0, 8).join(' | ')}` : '',
    `WHAT PAST TEST PANELS KEPT FLAGGING FOR HER: ${j(ctx.lessons, 500)}`,
    s.concept ? `IDEA: ${s.concept}` : '',
    `HOOK OPTIONS:\n${s.hooks.map((h, i) => `${i}. ${h}`).join('\n')}`,
    `SCRIPT (line 0 is spoken with whichever hook she picks; [scene] is what is on screen):\n${s.lines.map((l, i) => `${i}. ${l}${s.shots?.[i] ? ` [scene: ${s.shots[i]}]` : ''}`).join('\n')}`,
  ].filter(Boolean).join('\n\n')
}

export interface Viewer { who: string; quote: string; stops_for: number; leaves_at: number; question: string | null; would_stop: number[]; fits?: boolean }
export interface Working { what: string; why: string; beat: number }
export interface NeedsHer { question: string; why: string; beat: number }
/** Viewers who would not watch this kind of video are left out of the score while at least this many remain. */
export const MIN_FITTING_VIEWERS = 6
export interface Fix { issue: Issue; fix: string; beat: number; count: number }
export interface AudienceResult {
  viewers: Viewer[]
  hooks: Array<{ hook: string; stopped: number; closed?: boolean }>
  best_hook: number | null
  fixes: Fix[]
  summary: string | null
  /** Did a line before the ask close what hook 0 opened? Null when not judged. */
  promise_kept: boolean | null
  working: Working[]
  needs_her: NeedsHer[]
  unverified: string[]
  /** Viewers left out of the score because they would not watch this kind of video. */
  out_of_scope: number
}

const txt = (v: unknown, n: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, n) : null
}
const int = (v: unknown, lo: number, hi: number, dflt: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : dflt

/** Model output is untrusted: clamp every field and recount every number. */
/** ⚠️ COFFEE REPORT 1.5: the prompt numbers lines and hooks from 0, so the
 *  model's own words said "line 2" for what the page shows as Line 3. Words
 *  are shifted to the 1-based numbers she sees; index fields stay 0-based. */
export function oneBased(t: string | null): string | null {
  return t == null ? t : t.replace(/\b(line|hook|beat|scene)\s+(\d{1,2})\b/gi, (_, w: string, n: string) => `${w} ${Number(n) + 1}`)
}

export function normalizeAudience(raw: unknown, s: ScriptForTest): AudienceResult | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const viewers: Viewer[] = (Array.isArray(r.viewers) ? r.viewers : []).slice(0, PANEL_SIZE).flatMap((v) => {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
    const who = txt(o.who, 40), quote = oneBased(txt(o.quote, 160))
    if (!who || !quote) return []
    return [{
      who, quote,
      stops_for: int(o.stops_for, -1, s.hooks.length - 1, -1),
      would_stop: [...new Set((Array.isArray(o.would_stop) ? o.would_stop : [])
        .filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < s.hooks.length))],
      leaves_at: int(o.leaves_at, -1, s.lines.length - 1, -1),
      question: txt(o.question, 140),
      fits: o.fits !== false,
    }]
  })
  if (viewers.length < 3) return null
  // ⚠️ AUDIT 2026-10-01: a craft video was scored by viewers who only watch her
  // business posts ("give me margins"). Those who would not watch THIS kind of
  // video are left out of the score while enough remain to mean something.
  const fitting = viewers.filter((v) => v.fits !== false)
  const scored = fitting.length >= MIN_FITTING_VIEWERS ? fitting : viewers
  const out_of_scope = viewers.length - scored.length
  viewers.splice(0, viewers.length, ...scored)

  // ⚠️ EACH VIEWER JUDGES EVERY HOOK. Counting only each viewer's single
  // favourite split ten votes across five hooks, so the best hook could never
  // read above ~4 of 10 however good it was (owner: "why is the best one 3/10?").
  // A favourite always counts as a stop, so an older answer still scores.
  const stopsOn = (v: Viewer, i: number) => v.would_stop.includes(i) || v.stops_for === i
  const closed = new Set((Array.isArray(r.closed_hooks) ? r.closed_hooks : [])
    .filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < s.hooks.length))
  const hooks = s.hooks.map((hook, i) => ({ hook, stopped: viewers.filter((v) => stopsOn(v, i)).length, closed: closed.has(i) }))
  const top = Math.max(...hooks.map((h) => h.stopped))
  const best_hook = top > 0 ? hooks.findIndex((h) => h.stopped === top) : null

  const leaving = (beat: number) => viewers.filter((v) => v.leaves_at === beat).length
  const fixes: Fix[] = (Array.isArray(r.fixes) ? r.fixes : []).slice(0, 3).flatMap((f) => {
    const o = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>
    const issue = (ISSUES as readonly string[]).includes(o.issue as string) ? (o.issue as Issue) : null
    const fix = oneBased(txt(o.fix, 220))
    if (!issue || !fix) return []
    const beat = int(o.beat, -1, s.lines.length - 1, -1)
    // How many viewers back this fix up: those who left at that line, or asked a question for question-type issues.
    const count = issue === 'unanswered_question' || issue === 'missing_price'
      ? viewers.filter((v) => v.question).length
      : beat >= 0 ? leaving(beat) : 0
    return [{ issue, fix, beat, count }]
  })

  const beatOf = (v: unknown) => int(v, -1, s.lines.length - 1, -1)
  const working: Working[] = (Array.isArray(r.working) ? r.working : []).slice(0, 3).flatMap((w) => {
    const o = (w && typeof w === 'object' ? w : {}) as Record<string, unknown>
    const what = oneBased(txt(o.what, 160)), why = oneBased(txt(o.why, 200))
    return what && why ? [{ what, why, beat: beatOf(o.beat) }] : []
  })
  const needs_her: NeedsHer[] = (Array.isArray(r.needs_her) ? r.needs_her : []).slice(0, 2).flatMap((q) => {
    const o = (q && typeof q === 'object' ? q : {}) as Record<string, unknown>
    const question = txt(o.question, 200), why = oneBased(txt(o.why, 200))
    return question && why && question.endsWith('?') ? [{ question, why, beat: beatOf(o.beat) }] : []
  })
  const unverified = [...new Set((Array.isArray(r.unverified) ? r.unverified : [])
    .map((u) => txt(u, 120)).filter((u): u is string => !!u))].slice(0, 6)
  return {
    viewers, hooks, best_hook, fixes, summary: oneBased(txt(r.summary, 300)),
    promise_kept: typeof r.promise_kept === 'boolean' ? r.promise_kept : null,
    working, needs_her, unverified, out_of_scope,
  }
}

// ── MAKE THE HOOK BETTER, THEN SHOW IT (owner: the panel must change the
// script, not only grade it). When the best hook stops fewer than this many
// viewers, Twin writes new hooks from what the viewers said and tests again.
export const HOOK_TARGET = 7
export const HOOK_ROUNDS = 3
/** Quality over quantity (owner, 2026-09-28: "why eleven hooks?"): she sees at most this many. */
export const HOOKS_SHOWN = 5
/** Never test more than this many hooks in total (5 written + 2 rewrite rounds of 2). Owner audit: 4–16 hooks, weakest at the high end. */
export const MAX_TESTED_HOOKS = 9
/** How many viewers a self-answering hook is treated as losing when ordering. */
export const CLOSED_PENALTY = 2
export const HOOK_REWRITE_SYSTEM = [
  'You rewrite the opening hook of a short-form video so more of her real viewers stop scrolling.',
  'You get the script, the hooks already tested with how many of 10 viewers each stopped, and what each viewer said.',
  'Aim for a hook that stops at least 7 of 10 of these viewers. Write 2 NEW hooks: each a single spoken line under 15 words, in her voice, true to the script — the same topic and claims, no new facts, numbers, names or promises.',
  'Fix what the viewers said was missing (curiosity, stakes, who it is for). Each hook must be a DIFFERENT idea, not a paraphrase of another or of an old hook.',
  'Each hook keeps its question OPEN: raise it and hold the answer back for the video. Never state the conclusion inside the hook.',
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
    if (out.length >= 2) break
  }
  return out
}

// ── MAKE THE WHOLE SCRIPT BETTER, THEN SHOW IT (owner: "check the structure,
// the words, the scenes, show it to everyone, and only the best version is the
// one she sees"). After the hooks, while fewer than SCRIPT_TARGET of 10 would
// watch to the end, Twin rewrites ONLY the lines the viewers left at or flagged,
// tests the new version on the same viewers, and keeps it only if more stay.
export const SCRIPT_TARGET = 6
export const SCRIPT_ROUNDS = 3
export const MAX_LINE_CHANGES = 6
/** Lines the panel may ADD when viewers said something is missing (owner 2026-10-03). */
export const MAX_LINE_ADDS = 2
export const watchedToEnd = (viewers: readonly { leaves_at: number }[]) => viewers.filter((v) => v.leaves_at === -1).length

export const SCRIPT_REWRITE_SYSTEM = [
  'You edit a short-form video script so more of her real viewers watch to the end.',
  'You get the script line by line (with the scene on screen), where each viewer scrolled away, what they said, and the fixes they pointed to.',
  `Rewrite at most ${MAX_LINE_CHANGES} lines — the ones viewers left at or flagged. Tighten, reorder the idea within the line, sharpen the words, make the scene\'s payoff land sooner.`,
  'Keep her voice. Keep every line doing the same job (hook stays a hook, the close stays the close). Keep each line about as long or shorter.',
  'You MAY use anything under HER FACTS: that is what she has actually said. NEVER add a fact that is in neither the script nor HER FACTS: no new numbers, prices, names, places, awards, results or promises.',
  `When viewers said something is MISSING (the promised trick, the step, the recap, the product never named), you may ADD up to ${MAX_LINE_ADDS} new lines that deliver it from HER FACTS — each placed after the line it follows, with the physical action she does while saying it and the camera: front (talking to the lens, the default) or back (only for a moment that shows the product or a screen while she keeps talking). Never add a hook or a second close.`,
  'Return only the lines you changed, by their 0-based index, and any lines you added. Return empty lists if the script is already right.',
].join('\n')
export const SCRIPT_REWRITE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    lines: { type: 'ARRAY', items: { type: 'OBJECT', properties: { index: N, text: S }, required: ['index', 'text'] } },
    add: { type: 'ARRAY', items: { type: 'OBJECT', properties: { after: N, text: S, action: S, camera: S }, required: ['after', 'text', 'action', 'camera'] } },
  },
  required: ['lines'],
}
export function scriptRewritePrompt(s: ScriptForTest, r: AudienceResult, facts: readonly string[] = []): string {
  const left = (i: number) => r.viewers.filter((v) => v.leaves_at === i).map((v) => v.who)
  return [
    facts.length ? `HER FACTS (you may use these):\n${facts.slice(0, 40).map((f) => `- ${f}`).join('\n')}` : '',
    `SCRIPT:\n${s.lines.map((l, i) => `${i}. ${l}${s.shots?.[i] ? ` [scene: ${s.shots[i]}]` : ''}${left(i).length ? `  ← ${left(i).length} left here (${left(i).join(', ')})` : ''}`).join('\n')}`,
    `WATCHED TO THE END: ${watchedToEnd(r.viewers)} of ${r.viewers.length}`,
    `WHAT THE VIEWERS SAID:\n${r.viewers.map((v) => `${v.who}: ${v.quote}`).join('\n')}`,
    r.fixes.length ? `FIXES THEY POINTED TO:\n${r.fixes.map((f) => `${f.beat >= 0 ? `line ${f.beat}` : 'whole video'} — ${f.issue}: ${f.fix}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
}

// ── HER ANSWER, WRITTEN IN (Option C): one or two lines change, using only her words.
export const ANSWER_REWRITE_SYSTEM = [
  'She answered a question her test viewers needed answered. Work her answer into the script line it belongs in.',
  'Change only that line (or the one next to it if it fits better). Keep her voice, keep the line doing the same job, keep it about as long.',
  'Use her answer as given: no number, name or detail beyond what she wrote and what the script already says.',
  'Return only the lines you changed, by their 0-based index.',
].join('\n')
export function answerRewritePrompt(s: ScriptForTest, answers: Array<{ question: string; answer: string; beat: number }>): string {
  return [
    `SCRIPT:\n${s.lines.map((l, i) => `${i}. ${l}`).join('\n')}`,
    `HER ANSWERS:\n${answers.map((a) => `line ${a.beat >= 0 ? a.beat : '(best fit)'} — Q: ${a.question}\nA: ${a.answer}`).join('\n')}`,
  ].join('\n\n')
}

const numbersIn = (t: string) => (t.toLowerCase().match(/\d[\d.,]*|\b(?:hundred|thousand|million|billion|percent)\b/g) ?? []).map((x) => x.replace(/[.,]+$/, ''))
const namesIn = (t: string) => (t.match(/(?<!^|[.!?]\s)\b[A-Z][a-z]{2,}\b/g) ?? [])

/** Apply a rewrite, refusing any line that brings in a number or name the
 *  script did not already have, or grows much longer. Returns null if nothing
 *  usable changed. */
export function applyLineRewrites(lines: readonly string[], raw: unknown, herAnswers = ''): { lines: string[]; changed: number[] } | null {
  const list = (raw as { lines?: unknown } | null)?.lines
  if (!Array.isArray(list)) return null
  // Her own answers to the panel's questions are facts she just gave: their numbers and names may enter.
  const all = `${lines.join(' ')} ${herAnswers}`
  const known = new Set(numbersIn(all))
  const knownNames = new Set((all.match(/\b[A-Z][a-z]{2,}\b/g) ?? []).map((x) => x.toLowerCase()))
  const out = [...lines]
  const changed: number[] = []
  for (const item of list) {
    const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const i = typeof o.index === 'number' && Number.isInteger(o.index) ? o.index : -1
    const t = typeof o.text === 'string' ? o.text.replace(/\s+/g, ' ').trim() : ''
    if (i < 0 || i >= lines.length || !t || changed.includes(i) || t === lines[i]) continue
    if (t.split(' ').length > lines[i].split(' ').length * 1.8 + 8) continue
    if (numbersIn(t).some((n) => !known.has(n))) continue
    if (namesIn(t).some((n) => !knownNames.has(n.toLowerCase()))) continue
    out[i] = t; changed.push(i)
    if (changed.length >= MAX_LINE_CHANGES) break
  }
  return changed.length ? { lines: out, changed } : null
}

/** Lines the panel added, kept only when every number and name in them is
 *  already in the script or her facts. `after` is an index into `lines`. */
export function cleanAddedLines(lines: readonly string[], raw: unknown, known = ''): Array<{ after: number; text: string; action: string; camera: 'front' | 'back' }> {
  const list = (raw as { add?: unknown } | null)?.add
  if (!Array.isArray(list)) return []
  const all = `${lines.join(' ')} ${known}`
  const nums = new Set(numbersIn(all))
  const names = new Set((all.match(/\b[A-Z][a-z]{2,}\b/g) ?? []).map((x) => x.toLowerCase()))
  const out: Array<{ after: number; text: string; action: string; camera: 'front' | 'back' }> = []
  for (const item of list) {
    const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const after = typeof o.after === 'number' && Number.isInteger(o.after) ? o.after : -1
    const text = typeof o.text === 'string' ? o.text.replace(/\s+/g, ' ').trim() : ''
    // Never before the hook, never after the close.
    if (after < 0 || after >= lines.length - 1 || text.split(' ').length < 4 || text.split(' ').length > 60) continue
    if (numbersIn(text).some((n) => !nums.has(n))) continue
    if (namesIn(text).some((n) => !names.has(n.toLowerCase()))) continue
    if (lines.some((l) => l.toLowerCase() === text.toLowerCase())) continue
    out.push({ after, text, action: typeof o.action === 'string' ? o.action.trim().slice(0, 240) : '', camera: String(o.camera ?? '').toLowerCase() === 'back' ? 'back' : 'front' })
    if (out.length >= MAX_LINE_ADDS) break
  }
  return out
}

/** A new version wins when more viewers watch to the end, or — owner
 *  2026-10-03, "anything they improve should actually be improved" — when as
 *  many watch and fewer of their fixes are still open. The best hook may never
 *  get worse. */
export function betterVersion(before: AudienceResult, after: AudienceResult): boolean {
  const best = (x: AudienceResult) => Math.max(0, ...x.hooks.map((h) => h.stopped))
  if (best(after) < best(before)) return false
  // Closing a hook the video left open counts, as long as nobody more leaves.
  if (before.promise_kept === false && after.promise_kept === true) return watchedToEnd(after.viewers) >= watchedToEnd(before.viewers)
  if (after.promise_kept === false) return false
  if (watchedToEnd(after.viewers) > watchedToEnd(before.viewers)) return true
  return watchedToEnd(after.viewers) === watchedToEnd(before.viewers) && after.fixes.length < before.fixes.length
}

/**
 * HOOKS BEST-FIRST (round 2, Part 5, protected by a regression test). Ordered
 * by how many viewers stopped; a hook that stopped nobody is dropped when three
 * others did better; at most HOOKS_SHOWN.
 */
export function orderHooksBestFirst(hooks: ReadonlyArray<{ hook: string; stopped: number; closed?: boolean }>): string[] {
  // ⚠️ OWNER BRIEF 2026-10-01: a hook that answers its own question leaves
  // nothing to stay for (59–78% of real high-reach hooks keep it open). It
  // ranks as if CLOSED_PENALTY fewer viewers stopped — demoted, never deleted.
  const score = (h: { stopped: number; closed?: boolean }) => h.stopped - (h.closed ? CLOSED_PENALTY : 0)
  const ranked = [...hooks].sort((a, b) => score(b) - score(a))
  const keep = ranked.filter((h) => h.stopped > 0).length >= 3 ? ranked.filter((h) => h.stopped > 0) : ranked
  return keep.map((h) => h.hook).slice(0, HOOKS_SHOWN)
}

/** The script's default hook after the rewrite step: the best one, unless she picked her own. */
export function defaultHookAfterTest(ordered: readonly string[], creatorPick: string | null): string | null {
  return creatorPick ?? ordered[0] ?? null
}

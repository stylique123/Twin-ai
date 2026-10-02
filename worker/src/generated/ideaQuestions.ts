// GENERATED FROM packages/shared/src/script/ideaQuestions.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// IDEA MODE ASKS ABOUT HER PARAGRAPH, OR NOT AT ALL (owner, coffee report 2.1, 2.2).
//
// ⚠️ MEASURED ON FOUR IDEAS: "What specific moment or tension is at the center
// of what you just described?" and "What's the one feeling you want someone to
// still have after watching?" appeared unchanged every time. The owner's rule:
// if a question could be asked unchanged of another paragraph, cut it.
//
// ⚖️ ONE SMALL MODEL CALL reads the paragraph and returns 0-3 questions, each
// pointing at her own words, plus its reading of WHY the video exists. This file
// is the pure half: the prompt, the schema and the checks that throw away any
// question that does not quote her. The call fails open — no questions, build
// goes ahead — because a slow courtesy must never block a script.
//
// Deno copy is GENERATED (scripts/ci/generate_shared_pilot_core.mjs); no imports.

export const IDEA_PURPOSES = [
  { value: 'personal_brand', label: 'your story' },
  { value: 'educate', label: 'teaching something' },
  { value: 'conversations', label: 'answering a question' },
  { value: 'authority', label: 'showing how you do it' },
  { value: 'entertain', label: 'something fun to watch' },
  { value: 'sell', label: 'promoting something you sell' },
] as const
export type IdeaPurpose = (typeof IDEA_PURPOSES)[number]['value']

export const IDEA_Q_SYSTEM = [
  'A creator typed a short paragraph about a video she wants to make. Decide what is MISSING for a script that uses only her words and facts, and why the video exists.',
  'Return AT MOST ONE question: the single missing fact the script would otherwise have to invent. Return none when the paragraph already has a concrete moment, fact or answer to build on — say so in "enough".',
  'Every question must point at her own words: put the exact phrase from her paragraph it is about in "quote" (copied character for character, 2-8 words).',
  'Ask for a MOMENT, a FACT or WHAT SHE DOES ("Think of one batch where you noticed it: what was different in the cup?"). Never ask for a feeling, a goal, an audience, a call to action or a hashtag.',
  'Match her tone: if she sounds neutral or proud, do not frame the question around a mess, mistake, problem or failure unless she named one. "You just figure it out step by step" asks for one step she figured out, not for something that went wrong.',
  'Never ask something the paragraph already answers. Never suggest an answer. Plain words, under 20 words, one question each.',
  'purpose: pick the ONE reason the video exists from: personal_brand (her story), educate (teaching something), conversations (answering a question people ask), authority (showing how she does it), entertain (fun to watch), sell (promoting something she sells). Pick sell ONLY if she says she wants people to buy, order, book or try something she sells. confidence 0-1 (under 0.5 when the paragraph is too thin to tell). signal: the phrase that told you.',
].join('\n')

export const IDEA_Q_SCHEMA = {
  type: 'OBJECT',
  properties: {
    enough: { type: 'BOOLEAN' },
    questions: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { quote: { type: 'STRING' }, question: { type: 'STRING' } }, required: ['quote', 'question'] },
    },
    purpose: { type: 'STRING' },
    confidence: { type: 'NUMBER' },
    signal: { type: 'STRING' },
    angles: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { kind: { type: 'STRING' }, gist: { type: 'STRING' } }, required: ['kind', 'gist'] },
    },
  },
  required: ['enough', 'questions', 'purpose', 'confidence'],
}

export interface IdeaQuestion { quote: string; question: string }
export interface IdeaRead {
  questions: IdeaQuestion[]
  purpose: { value: IdeaPurpose; label: string; confidence: number; signal: string | null } | null
  /** Three distinct directions (owner brief 2026-10-01); empty when the model gave none usable. */
  angles?: IdeaAngle[]
}

const norm = (t: string) => t.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Questions a template could have asked of any paragraph. */
const GENERIC = /\b(feel|feeling|emotion|audience|viewers? (should|to)|call to action|cta|hashtag|goal of|takeaway|message you want)\b/i

/** Keep only questions that quote her paragraph and ask for material. */
export function cleanIdeaRead(raw: unknown, paragraph: string): IdeaRead {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const para = norm(paragraph)
  const questions: IdeaQuestion[] = []
  const seen = new Set<string>()
  for (const q of Array.isArray(r.questions) ? r.questions : []) {
    const o = (q && typeof q === 'object' ? q : {}) as Record<string, unknown>
    const quote = typeof o.quote === 'string' ? o.quote.trim() : ''
    const question = typeof o.question === 'string' ? o.question.replace(/\s+/g, ' ').trim() : ''
    const nq = norm(quote)
    if (!question || question.length > 160 || !question.endsWith('?')) continue
    if (nq.split(' ').length < 2 || !para.includes(nq)) continue
    if (GENERIC.test(question) || seen.has(norm(question))) continue
    seen.add(norm(question))
    questions.push({ quote: quote.slice(0, 80), question })
    if (questions.length >= 1) break
  }
  const p = IDEA_PURPOSES.find((x) => x.value === r.purpose)
  const confidence = typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? Math.max(0, Math.min(1, r.confidence)) : 0
  const signal = typeof r.signal === 'string' && para.includes(norm(r.signal)) && norm(r.signal) !== '' ? r.signal.trim().slice(0, 80) : null
  // ⚖️ SELL AND LEADS NEED HER OWN WORDS BEHIND THEM: a guessed commercial
  // purpose would grant a pitch nobody asked for.
  const commercial = p?.value === 'sell'
  // Round 2 (Part 4): the signal must itself be a buying word, not any phrase —
  // "coffee roastery" is not "buy my coffee".
  const BUY = /\b(buy|order|shop|book|try|purchase|pre-?order|sale|discount|link in bio|available|launch)/i
  const purpose = p && confidence >= 0.5 && (!commercial || (signal && BUY.test(signal)))
    ? { value: p.value, label: p.label, confidence, signal } : null
  return { questions: r.enough === true ? [] : questions, purpose, angles: cleanAngles(r.angles, paragraph) }
}

// ── THE ANGLE: WHICH DIRECTION THE VIDEO TAKES (owner brief 2026-10-01) ──────
//
// Not the hook (the first line) and not the structure (the beats): the
// direction above both. Shown as three one-sentence options in the SAME small
// call that reads her paragraph, so it costs what the purpose guess costs.
//
// ⚖️ RESEARCH (docs/research/angle-picker-2026-10-01.md), 4,000+ read corpus
// videos, top-quarter share vs overall share per niche: teach/list over-indexes
// in EVERY niche (education 25%→52%, mindset 11%→24%); result-first leads where
// there is something to show (food 42%, making 36%); the bold/contrarian claim
// is the most common angle but under-indexes everywhere; problem-question
// under-indexes almost everywhere. So the order is per niche, not one list.

export const ANGLE_KINDS = {
  teach_list: { label: 'Teach it in steps', how: 'a counted list or steps of what she knows; every item delivered' },
  result_first: { label: 'Show the result first', how: 'open on the finished result or the moment it works, then how she got there' },
  contrarian_claim: { label: 'Say what most people get wrong', how: 'name a common belief in her world and say why she does it differently' },
  feeling_story: { label: 'Tell the moment it happened', how: 'one real moment from her own life, told as it happened' },
  problem_question: { label: 'Answer the question people ask', how: 'the exact question her viewer has, answered straight away' },
  curiosity: { label: 'Hold back the answer', how: 'raise one specific question and pay it off at the end' },
} as const
export type AngleKind = keyof typeof ANGLE_KINDS

/** Top-quarter share ÷ overall share, per niche bucket (measured; see the research doc). */
export const NICHE_ANGLE_LIFT: Record<string, Partial<Record<AngleKind, number>>> = {
  beauty_fashion: { teach_list: 1.9, result_first: 1.4, contrarian_claim: 0.8, problem_question: 0.4, feeling_story: 0.5 },
  business: { teach_list: 1.3, contrarian_claim: 0.9, problem_question: 0.9, result_first: 0.8 },
  education: { teach_list: 2.1, result_first: 1.1, contrarian_claim: 0.6, problem_question: 0.3, feeling_story: 1.5, curiosity: 1.5 },
  entertainment: { teach_list: 3.2, result_first: 1.4, feeling_story: 0.9, contrarian_claim: 0.9, problem_question: 0.6 },
  food: { result_first: 1.0, teach_list: 1.9, contrarian_claim: 0.9, problem_question: 0.6, feeling_story: 0.5 },
  health: { teach_list: 1.1, result_first: 1.1, contrarian_claim: 0.9, curiosity: 2.3, problem_question: 0.9 },
  lifestyle: { teach_list: 1.7, result_first: 1.3, contrarian_claim: 0.8, feeling_story: 0.9, problem_question: 0.7 },
  making: { teach_list: 1.0, result_first: 1.1, contrarian_claim: 0.8, curiosity: 3.0 },
  mindset: { teach_list: 2.2, contrarian_claim: 0.9, problem_question: 0.6 },
  tech: { teach_list: 1.3, result_first: 1.3, contrarian_claim: 0.9, problem_question: 0.6 },
}

/** Her voice leans: a confession/story-led voice is offered the story angle first, a direct one is not. */
export function voiceLeans(hookPatterns: readonly string[]): AngleKind[] {
  const t = hookPatterns.join(' ').toLowerCase()
  const out: AngleKind[] = []
  if (/\b(i |my |confess|story|when i|the day|moment)\b/.test(t)) out.push('feeling_story')
  if (/\b(\d+ (things|ways|tips|steps)|how to|step)\b/.test(t)) out.push('teach_list')
  if (/\b(stop|never|wrong|myth|nobody|unpopular)\b/.test(t)) out.push('contrarian_claim')
  if (/\?/.test(t)) out.push('problem_question')
  return out
}

/** The ranking the model is told to follow: her voice first, then what wins in her niche. */
export function angleOrder(bucket: string | null, hookPatterns: readonly string[]): AngleKind[] {
  const lift = (bucket && NICHE_ANGLE_LIFT[bucket]) || {}
  const byNiche = (Object.keys(ANGLE_KINDS) as AngleKind[]).sort((a, b) => (lift[b] ?? 1) - (lift[a] ?? 1))
  return [...new Set([...voiceLeans(hookPatterns), ...byNiche])]
}

export function angleBrief(bucket: string | null, hookPatterns: readonly string[]): string {
  const order = angleOrder(bucket, hookPatterns)
  return [
    'ANGLES: also return exactly 3 angles for this video — three DIFFERENT directions the same material could take, before any wording exists.',
    'Each angle is one plain sentence (under 25 words) in her terms, built only from what her paragraph says. No numbers, names or facts she did not write. Not a hook line.',
    'Each must be a different kind, from this list, best first for HER (her voice, then what holds viewers in her niche):',
    ...order.map((k) => `  - ${k}: ${ANGLE_KINDS[k].how}`),
    'Three rewordings of one idea are ONE angle. Different kinds change what the viewer watches, not the wording.',
  ].join('\n')
}

export const ANGLE_SCHEMA_PART = {
  type: 'ARRAY',
  items: { type: 'OBJECT', properties: { kind: { type: 'STRING' }, gist: { type: 'STRING' } }, required: ['kind', 'gist'] },
}

export interface IdeaAngle { kind: AngleKind; label: string; gist: string }

/** Three distinct kinds, her facts only (no number she did not write), at most 3. */
export function cleanAngles(raw: unknown, paragraph: string): IdeaAngle[] {
  const para = norm(paragraph)
  const paraNums = new Set(para.match(/\d+/g) ?? [])
  const out: IdeaAngle[] = []
  const kinds = new Set<string>()
  for (const a of Array.isArray(raw) ? raw : []) {
    const o = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>
    const kind = String(o.kind ?? '').trim() as AngleKind
    const gist = typeof o.gist === 'string' ? o.gist.replace(/\s+/g, ' ').trim() : ''
    if (!(kind in ANGLE_KINDS) || kinds.has(kind)) continue
    if (gist.length < 12 || gist.length > 180) continue
    if ((gist.match(/\d+/g) ?? []).some((n) => !paraNums.has(n))) continue
    kinds.add(kind)
    out.push({ kind, label: ANGLE_KINDS[kind].label, gist })
    if (out.length >= 3) break
  }
  return out.length >= 2 ? out : []
}

/** The writer's contract for the angle she picked. */
export function angleContract(a: { kind: string; gist: string } | null | undefined): string {
  if (!a || !(a.kind in ANGLE_KINDS) || !a.gist) return ''
  const k = ANGLE_KINDS[a.kind as AngleKind]
  return `THE ANGLE SHE PICKED (she chose this before the script was written — the whole video takes this direction): ${k.label} — "${a.gist.slice(0, 200)}". ${k.how}. hook_options[0] opens this angle and the body delivers it to the end; do not drift into another angle partway through.`
}

/** She chose a different direction than Twin's first: a 'prefer' lesson (same path as hook picks). */
export function lessonFromAnglePick(raw: unknown): { kind: 'prefer'; source: 'angle_pick'; phrase: null; weight: number; text: string } | null {
  const a = (raw && typeof raw === 'object' ? raw : {}) as { kind?: unknown; offered?: unknown }
  const kind = String(a.kind ?? '')
  const first = Array.isArray(a.offered) ? String(a.offered[0] ?? '') : ''
  if (!(kind in ANGLE_KINDS) || !(first in ANGLE_KINDS) || kind === first) return null
  return {
    kind: 'prefer', source: 'angle_pick', phrase: null, weight: 1,
    text: `For her videos, lean to the "${ANGLE_KINDS[kind as AngleKind].label}" angle over "${ANGLE_KINDS[first as AngleKind].label}".`,
  }
}

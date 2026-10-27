// GENERATED FROM packages/shared/src/script/questionUsefulness.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// QUESTION-USEFULNESS (Master Prompt v3, 15 Oct). Plugs into the Need Check
// (itemFormat.ts needCheck): a question is asked only when the missing piece is
// required by the chosen angle or template, is not on file, and the answer
// would change the script. At most three, one piece each, ranked story →
// product slot → niche → profile (profile once). Never a presumed event, a date
// or scarcity. Skip always works. Pure; records carry ids and counts, no text.

import type { Slot } from './itemFormat.ts'
import { nextBeat, ladderTemplate, validateLadderQuestion, isDuplicateQuestion, LADDER, angleTemplate, type LadderLevel, type AngleKind } from './questionLadder.ts'

export type QuestionKind = 'story' | 'product_slot' | 'niche' | 'profile'
const RANK: Record<QuestionKind, number> = { story: 0, product_slot: 1, niche: 2, profile: 3 }

export interface QuestionCandidate {
  kind: QuestionKind
  /** The one piece asked for (a slot or a profile field). */
  piece: string
  /** What the writer falls back to if unanswered. */
  fallback: 'invented' | 'general' | 'none'
}

export interface UsefulnessInput {
  candidates: readonly QuestionCandidate[]
  /** Slots required by the chosen angle and template. */
  required: readonly Slot[]
  /** Slots already on file. */
  onFile: readonly Slot[]
  /** Profile already asked in an earlier request. */
  profileAsked?: boolean
}

export interface UsefulQuestion extends QuestionCandidate { skippable: true }

const FORBIDDEN_PIECE = /date|deadline|when|launch|event|urgency|scarcity|stock|limited|sold_?out|countdown/i

export function isForbiddenPiece(piece: string): boolean { return FORBIDDEN_PIECE.test(piece) }

export function usefulQuestions(i: UsefulnessInput): UsefulQuestion[] {
  const req = new Set(i.required)
  const have = new Set(i.onFile)
  const seen = new Set<string>()
  let profile = !!i.profileAsked
  const out: UsefulQuestion[] = []
  const sorted = [...i.candidates].sort((a, b) => RANK[a.kind] - RANK[b.kind])
  for (const c of sorted) {
    if (out.length === 3) break
    if (isForbiddenPiece(c.piece) || seen.has(c.piece)) continue
    if (c.kind === 'profile') { if (profile) continue; profile = true } else {
      if (!req.has(c.piece as Slot) || have.has(c.piece as Slot)) continue
    }
    // The answer must change the script: a piece with no fallback cost does not.
    if (c.fallback === 'none' && c.kind !== 'profile') continue
    seen.add(c.piece)
    out.push({ ...c, skippable: true })
  }
  return out
}

/** Need Check ask list → candidates, using the angle's gaps for the product piece. */
export function candidatesFromNeedCheck(ask: readonly string[], gaps: readonly Slot[]): QuestionCandidate[] {
  const out: QuestionCandidate[] = []
  for (const a of ask) {
    if (a === 'catalyst') out.push({ kind: 'story', piece: 'story', fallback: 'invented' })
    else if (a === 'product_slot') { for (const g of gaps) if (g !== 'story') out.push({ kind: 'product_slot', piece: g, fallback: 'general' }) }
    else if (a === 'profile') out.push({ kind: 'profile', piece: 'profile', fallback: 'general' })
  }
  return out
}

/** question_necessity: per asked piece, which fallback the question avoided. */
export function questionNecessity(qs: readonly UsefulQuestion[]) {
  return {
    asked: qs.length,
    avoided_invented: qs.filter((q) => q.fallback === 'invented').length,
    avoided_general: qs.filter((q) => q.fallback === 'general').length,
    pieces: qs.map((q) => ({ kind: q.kind, piece: q.piece, avoided: q.fallback })),
  }
}

// ⚠️ PANEL-6: question_use.used was 0 on every script. Two causes. (1) Every
// "answered" was the app's skip ("Nothing specific, keep it general."), which
// was counted as an answer and can never appear in a script — the counter
// read like a broken matcher. (2) The match was exact-word, so "glazed"
// never met "glaze" and a curly apostrophe split a word. Skips are now
// counted apart, and words are compared on a light stem.
const NON_ANSWER = /^(nothing( specific| really| much)?|none|no|n\/a|na|idk|i don'?t know|not sure|skip|keep it general|nothing specific,? keep it general|no idea|not really)\b/
export function isSkipAnswer(v: unknown): boolean {
  const t = String(v ?? '').trim().toLowerCase().replace(/[’‘]/g, "'").replace(/[.!\s]+$/, '')
  if (!t) return true
  if (t.split(/\s+/).length > 12) return false
  return NON_ANSWER.test(t) || /\bkeep it general\b/.test(t)
}
const STOP = new Set(['that', 'this', 'with', 'have', 'from', 'they', 'were', 'what', 'when', 'your', 'just', 'about', 'there', 'their', 'then', 'them', 'been', 'into', 'would', 'could', 'because', 'really', 'very'])
const stem = (w: string): string => w.replace(/'s$/, '').replace(/(?:ing|ed|es|s|ly)$/, '') || w
// ⚠️ v5.1 M: a number is content at any length ("$40", "12 jars"), and it is
// never stemmed ("1200s" is not a word). Before, an answer made only of short
// words and numbers had no tokens and was dropped from `answered` entirely.
const words = (t: string): string[] => {
  const s = t.toLowerCase().replace(/[’‘]/g, "'").replace(/(\d),(\d)/g, '$1$2')
  const nums = s.match(/\d+(?:\.\d+)?/g) ?? []
  const ws = (s.match(/[a-z][a-z0-9']{3,}/g) ?? []).filter((w) => !STOP.has(w)).map(stem).filter((w) => w.length >= 3)
  return [...ws, ...nums]
}

/** question_use: which answer keys reach the final script (≥3 shared content
 *  words, or all of a short answer). A skip is `skipped`, never `answered`. */
export function questionUse(answers: Record<string, unknown>, lines: readonly string[]) {
  const script = new Set(words(lines.join(' ')))
  const used: string[] = []
  let answered = 0
  let skipped = 0
  for (const [k, v] of Object.entries(answers ?? {})) {
    if (typeof v !== 'string' || !v.trim()) continue
    if (isSkipAnswer(v)) { skipped++; continue }
    answered++
    const w = [...new Set(words(v))]
    if (!w.length) continue
    const hit = w.filter((x) => script.has(x)).length
    if (hit >= Math.min(3, w.length)) used.push(k)
  }
  return { answered, skipped, used: used.length, used_keys: used }
}

// ── PLAN v5.1 ITEM M: QUESTIONS ──────────────────────────────────────────
// Produced under the picked angle, BEFORE writing. Ask only when the piece is
// required by the angle or template, is missing, and the answer changes the
// script. At most three (about 1.5 on average: niche and profile questions
// only top up to two). One piece per question. Never a presumed event, a date
// or scarcity. Skip always works, and a skipped question key is never asked
// again. Ranked by expected value: her story, a product slot the script can't
// do without, a niche-informed question, a profile question (once ever).
// Candidates come from every source: her material, product facts, niche or
// outside research, audience questions and the pain map. Wording is fixed
// templates (no model), so nothing can be presumed.

export type QuestionSource = 'her_material' | 'product' | 'niche' | 'audience' | 'pain_map' | 'profile'

export interface PlanQuestion {
  /** Stable key: what skip-never-again and saved facts are keyed on. */
  key: string
  kind: QuestionKind
  source: QuestionSource
  piece: string
  text: string
  skippable: true
}

export interface OutsideItem { id: string; text: string; origin?: string }

/**
 * Tier-1 pain map only (painMap.ts, table audience_pain_map, 0289): hand-written
 * rows, active, unexpired, this niche. Anything without origin 'audience_pain'
 * (e.g. automated Reddit items, Tier 2, OFF) yields nothing. Missing or empty
 * table → [] — that is fine.
 */
/**
 * Plan v7.1 WP5: the scan stores a niche KEY ("home coffee", "home-coffee"),
 * her profile says it in her words ("Home coffee & roasting"). Exact equality
 * matched neither, so her pains never reached her questions. Same niche when
 * the normalised forms are equal, one contains the other, or they share a
 * specific word (5+ letters).
 */
export function nicheMatches(a: string, b: string): boolean {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const x = norm(a); const y = norm(b)
  if (!x || !y) return false
  if (x === y || x.includes(y) || y.includes(x)) return true
  const wy = new Set(y.split(' ').filter((w) => w.length >= 5))
  return x.split(' ').some((w) => w.length >= 5 && wy.has(w))
}

export function painItemsFromMap(rows: readonly unknown[] | null | undefined, niche: string, today: string): OutsideItem[] {
  const n = niche.trim().toLowerCase()
  if (!n) return []
  const out: OutsideItem[] = []
  for (const r of rows ?? []) {
    const x = r as { id?: unknown; niche?: unknown; pain_sentence?: unknown; status?: unknown; origin?: unknown; expiry?: unknown }
    if (!x || x.origin !== 'audience_pain' || x.status !== 'active') continue
    if (typeof x.pain_sentence !== 'string' || !x.pain_sentence.trim()) continue
    if (!nicheMatches(String(x.niche ?? ''), n)) continue
    if (typeof x.expiry === 'string' && x.expiry < today) continue
    out.push({ id: String(x.id ?? x.pain_sentence).slice(0, 40), text: x.pain_sentence.trim(), origin: 'audience_pain' })
    if (out.length === 3) break
  }
  return out
}

export interface QuestionPlanInput {
  angle: string
  /** Slots the picked angle needs (ANGLE_SPECS[angle].needs). */
  angleNeeds: readonly Slot[]
  /** Extra slots the template requires. */
  templateNeeds?: readonly Slot[]
  /** Slots already on file (her material and product facts, confirmed or usable). */
  onFile: readonly Slot[]
  hasProduct: boolean
  /** 'none' or 'product:<id>': product questions are per product. */
  entityKey?: string
  niche?: readonly OutsideItem[]
  audience?: readonly OutsideItem[]
  /** Tier-1 pain map rows only (painItemsFromMap); other origins are ignored. */
  painMap?: readonly OutsideItem[]
  /** Keys she skipped before (question_asks outcome 'skipped'). Never asked again. */
  skippedKeys?: readonly string[]
  /** A profile question was asked before, ever. */
  profileAskedEver?: boolean
  /** The profile field is still missing. */
  profileMissing?: boolean
  /**
   * Story ladder (#1148 questionLadder.ts). OFF unless `on: true`. When on and
   * the angle needs a story: no story on file asks the anchored level-0 door;
   * a story on file climbs to its next missing beat. Every ladder question is
   * checked by validateLadderQuestion and dropped when it fails.
   */
  ladder?: { on: boolean; storyId?: string; anchor?: string; have?: readonly LadderLevel[]; topic?: string; herWords?: string }
  /** Questions already asked (any key): a meaning-duplicate is never asked again. Applied only with ladder on. */
  askedTexts?: readonly string[]
  /**
   * The missing-problem question, asked BEFORE writing. OFF unless `on: true`.
   * Asked only when no problem line is on file and she has not skipped it.
   */
  problem?: { on: boolean; onFile: boolean }
  /**
   * ANGLE_TEMPLATES (default OFF, test and panel accounts only): word her
   * missing-slot question with the picked angle's template (questionLadder
   * angleTemplate) about this topic. Absent = today's slot wording.
   */
  angleWording?: { topic: string }
}

/** Key and wording of the pre-writing problem question (same words as spineComplete's MISSING_PROBLEM_QUESTION). */
export const PROBLEM_QUESTION_KEY = 'mn:problem'
export const PROBLEM_QUESTION_TEXT = 'What problem does this solve for your customer, in your words?'


const PRODUCT_SLOT_TEXT: Partial<Record<Slot, string>> = {
  what_it_is: 'In one sentence, what is it?',
  show_it: 'What part of it could you show on camera?',
  proof: 'Has anyone told you what changed for them after using it? If so, what did they say?',
  close: 'What should someone do next if they want it?',
  objection: 'What makes people hesitate before buying it, if anything?',
  process: 'What is one step of how you make it that people never see?',
}
const HER_SLOT_TEXT: Partial<Record<Slot, string>> = {
  story: 'Is there a moment with this you still think about? If so, what happened?',
  stance: 'Is there something most people in your space say that you disagree with?',
  process: 'What is one step of how you do it that people never see?',
  proof: 'Has anything you could point to changed because of this? If so, what?',
  objection: 'Is there a question people ask you about this? If so, what is it?',
  context: 'Is there a common belief about this you would want to correct?',
}
/** Which of her slots each angle template words, and with which template slot. */
const ANGLE_TEMPLATE_SLOT: Partial<Record<AngleKind, Partial<Record<Slot, string>>>> = {
  myth: { stance: 'truth', context: 'assumption' },
  answer: { objection: '' },
  stand: { stance: '' },
  behind: { process: '' },
  beforeafter: { proof: '' },
  // 'offer' is left out: its template names a product detail ("roast") that
  // is not hers, which the add-nothing rule forbids. 'moment' and 'show' have none.
}

/** The angle's own wording for her slot, or null to keep the slot text. */
export function angleSlotText(angle: string, slot: Slot, topic: string | undefined): string | null {
  const t = (topic ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  const m = ANGLE_TEMPLATE_SLOT[angle as AngleKind]
  if (!t || !m || !(slot in m)) return null
  const text = angleTemplate(angle as AngleKind, m[slot]!, t)
  return text && !questionBreaksRules(text) ? text : null
}

const short = (t: string): string => {
  const s = t.replace(/\s+/g, ' ').trim()
  return s.length > 90 ? `${s.slice(0, 87).replace(/\s+\S*$/, '')}…` : s
}
const FORBIDDEN_TEXT = /\b(date|deadline|when (?:is|does|did|will)|how many (?:are )?left|sold out|limited|last chance|only \d+|countdown|ends? (?:on|soon)|launch(?:es|ed|ing)? on|in stock)\b/i

/** True when a question presumes an event happened, or asks for a date or scarcity. */
export function questionBreaksRules(text: string): boolean {
  if (FORBIDDEN_TEXT.test(text)) return true
  const t = text.trim().toLowerCase()
  // Presumes it happened: "What did the customer say when…" with no "if" or yes/no door.
  if (/^(what|which|who|how) (did|was|were)\b/.test(t) && !/\bif (so|any|anything|ever)\b/.test(t)) return true
  return false
}

const HARD = new Set<QuestionKind>(['story', 'product_slot'])

const safeId = (t: string): string => t.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 40) || 'x'

/** The story-ladder question for this angle, validated; null when none applies or it fails the checks. */
export function ladderQuestion(i: QuestionPlanInput, needsStory: boolean, storyMissing: boolean): { key: string; piece: string; text: string; level: LadderLevel } | null {
  const l = i.ladder
  if (!l?.on || !needsStory) return null
  const topic = (l.topic ?? '').replace(/\s+/g, ' ').trim()
  const anchor = storyMissing ? '' : (l.anchor ?? '').trim()
  // Level 0 needs a topic to anchor in; without one the fixed story template stands.
  if (storyMissing && !topic) return null
  const level = nextBeat({ storyId: l.storyId ?? 'story', anchor, have: [...(l.have ?? [])] })
  if (level === null) return null
  const text = ladderTemplate(level, anchor, topic)
  const check = validateLadderQuestion(text, {
    herWords: `${l.herWords ?? ''}\n${anchor}`, topic, asked: i.askedTexts ?? [], followUp: level === 4 || level === 5,
  })
  if (!check.ok) return null
  const sid = safeId(l.storyId ?? 'story')
  return { key: level === 0 ? 'mn:story' : `mn:ladder:${sid}:${level}`, piece: level === 0 ? 'story' : `story.${LADDER[level].beat}`, text, level }
}

/** All candidates from every source, before ranking. */
export function questionCandidates(i: QuestionPlanInput): PlanQuestion[] {
  const required = new Set<Slot>([...i.angleNeeds, ...(i.templateNeeds ?? [])])
  const have = new Set(i.onFile)
  const missing = [...required].filter((s) => !have.has(s))
  const ek = (i.entityKey ?? 'none').slice(0, 80)
  const out: PlanQuestion[] = []
  const q = (key: string, kind: QuestionKind, source: QuestionSource, piece: string, text: string) =>
    out.push({ key, kind, source, piece, text, skippable: true })
  const lad = i.ladder?.on ? ladderQuestion(i, required.has('story'), missing.includes('story')) : null
  if (lad) q(lad.key, 'story', 'her_material', lad.piece, lad.text)
  for (const s of missing) {
    if (s === 'story' && lad) continue
    if (s === 'story') q('mn:story', 'story', 'her_material', 'story', HER_SLOT_TEXT.story!)
    else if (i.hasProduct && PRODUCT_SLOT_TEXT[s]) q(`mn:${ek}:${s}`, 'product_slot', 'product', s, PRODUCT_SLOT_TEXT[s]!)
    else if (HER_SLOT_TEXT[s]) q(`mn:her:${s}`, 'niche', 'her_material', s, (i.angleWording && angleSlotText(i.angle, s, i.angleWording.topic)) || HER_SLOT_TEXT[s]!)
  }
  // Outside sources answer a missing slot with her own experience of it.
  if (missing.includes('objection') || missing.includes('context')) {
    const piece: Slot = missing.includes('objection') ? 'objection' : 'context'
    for (const a of i.audience ?? []) q(`mn:aud:${a.id}`, 'niche', 'audience', piece, `People ask "${short(a.text)}". Do you get asked this? If so, what do you tell them?`)
    // Tier-1 rows only; a pain is a topic seed, never quoted, never her experience.
    for (const p of (i.painMap ?? []).filter((x) => x.origin === 'audience_pain')) q(`mn:pain:${p.id}`, 'niche', 'pain_map', piece, `A common frustration in your space: ${short(p.text).replace(/["“”]/g, '')}. Do you see this? If so, what do you say about it?`)
  }
  if (missing.includes('stance') || missing.includes('context')) {
    const piece: Slot = missing.includes('stance') ? 'stance' : 'context'
    for (const n of i.niche ?? []) q(`mn:niche:${n.id}`, 'niche', 'niche', piece, `Others in your niche say "${short(n.text)}". Do you agree? If not, why not?`)
  }
  if (i.problem?.on && !i.problem.onFile) q(PROBLEM_QUESTION_KEY, i.hasProduct ? 'product_slot' : 'niche', i.hasProduct ? 'product' : 'her_material', 'problem', PROBLEM_QUESTION_TEXT)
  if (i.profileMissing && !i.profileAskedEver) q('mn:profile', 'profile', 'profile', 'profile', 'Who do you mostly make videos for?')
  return out
}

/** The questions to ask, ranked by expected value. */
export function planQuestionsForAngle(i: QuestionPlanInput): PlanQuestion[] {
  const skipped = new Set(i.skippedKeys ?? [])
  const pieces = new Set<string>()
  const ranked = questionCandidates(i)
    .map((c, idx) => ({ c, idx }))
    .sort((a, b) => RANK[a.c.kind] - RANK[b.c.kind] || a.idx - b.idx)
  const out: PlanQuestion[] = []
  for (const { c } of ranked) {
    if (out.length === 3) break
    if (skipped.has(c.key) || pieces.has(c.piece)) continue
    // A ladder follow-up (turn, resolution…) follows a story she already told:
    // validateLadderQuestion did the presume check; dates and scarcity still block.
    const followUp = c.key.startsWith('mn:ladder:')
    if (isForbiddenPiece(c.piece) || (followUp ? FORBIDDEN_TEXT.test(c.text) : questionBreaksRules(c.text))) continue
    if (i.ladder?.on && isDuplicateQuestion(c.text, i.askedTexts ?? [])) continue
    // Soft questions only top up to two: the average stays near 1.5.
    if (!HARD.has(c.kind) && out.length >= 2) continue
    pieces.add(c.piece)
    out.push(c)
  }
  return out
}

export interface AnswerFactRow {
  owner_id: string
  voice_id: string | null
  product_entity_id: string | null
  kind: 'experience' | 'claim'
  text: string
  evidence: string
  basis: 'stated'
  source: 'asked'
  source_ref: string
  confidence: number
  times_seen: number
  creator_confirmed_at: string
  last_observed_at: string
}

/** Her answer as her own confirmed fact (creator_knowledge row). A skip is no fact. */
export function answerFactRow(a: { ownerId: string; voiceId?: string | null; productId?: string | null; key: string; piece: string; answer: unknown; now: string }): AnswerFactRow | null {
  const text = typeof a.answer === 'string' ? a.answer.replace(/\s+/g, ' ').trim() : ''
  if (!text || isSkipAnswer(text)) return null
  const cut = text.length <= 240 ? text : (text.slice(0, 240).match(/^.*[.!?](?=\s|$)/)?.[0] ?? text.slice(0, 240))
  return {
    owner_id: a.ownerId, voice_id: a.voiceId ?? null, product_entity_id: a.productId ?? null,
    kind: a.piece === 'story' || a.piece.startsWith('story.') ? 'experience' : 'claim',
    text: cut, evidence: text.slice(0, 4000), basis: 'stated', source: 'asked',
    source_ref: `asked:${a.key}`.slice(0, 200), confidence: 0.9, times_seen: 1,
    creator_confirmed_at: a.now, last_observed_at: a.now,
  }
}

/** Log record: kinds, sources and pieces. No text. */
export function questionPlanRecord(qs: readonly PlanQuestion[]) {
  return { asked: qs.length, items: qs.map((q) => ({ kind: q.kind, source: q.source, piece: q.piece })) }
}

/**
 * Whether a creator_knowledge row may feed the angle cards (angle_plan).
 * A claim is "unconfirmed" by default (itemFromCreatorKnowledge), but a row she
 * TYPED as an answer (basis 'stated') and confirmed (creator_confirmed_at) is
 * hers: without this, every non-story answer from the question panel
 * (answerFactRow kind 'claim') was saved and then never read back as material,
 * so the same gap was asked again on the next Create. Sensitive rows never feed.
 */
export function angleMaterialUsable(row: { sensitive?: unknown; basis?: unknown; creator_confirmed_at?: unknown }, itemStatus: string | null | undefined): boolean {
  if (row.sensitive === true) return false
  if (!itemStatus) return false
  if (itemStatus !== 'unconfirmed') return true
  return row.basis === 'stated' && typeof row.creator_confirmed_at === 'string' && row.creator_confirmed_at !== ''
}

import { blockWrongProductLines, buildTargetedCheckLinesV2, type TargetedItemV2, type TargetedProduct } from './checkLines.js'
import type { GateBlueprint } from './inventionGate.js'

/**
 * THE CRAFT JUDGE — a deterministic, unpaid scorer for craft rubric v1.
 *
 * The advisor's rubric (22 Oct, 109 labeled scripts) names seven things a
 * craft-5 script has. Each is measured here from the script lines alone:
 *
 *  1. one_thread  — content-word overlap: every line shares a topic word with
 *                   the rest; an unrelated story dumped in scores low.
 *  2. hook        — the hook judge (hookJudge.ts) on line 1, rescaled to 0..1.
 *  3. proof       — a first-person past-tense story line AFTER the hook and
 *                   BEFORE the close (her proof in the right place).
 *  4. middle      — share of middle lines carrying a step, rule, cause, number,
 *                   price or trial (something useful, not filler).
 *  5. cta         — exactly one call to action, in the last line; an offer CTA
 *                   (link in bio, trial, call) beats a bare "comment below".
 *  6. length_flow — the length band (Standard 90-145 words best; under 50 is
 *                   almost never postable) less filler lines.
 *  7. voice       — only when `context.voice` is given (style note signals:
 *                   sentence length, exclamations, signature words); neutral
 *                   0.5 otherwise, so it never moves an uncontextual score.
 *
 * craft = intercept + Σ weight × feature, clamped to 1..7, then the caps:
 *   - a spoken placeholder ("[Your answer: …]") caps craft at 1;
 *   - a repeated sentence or story (near-duplicate lines) caps it at 3;
 *   - an invented or wrong-product line caps it at 3 — ⚠️ NOT DETECTABLE
 *     OFFLINE. The judge cannot tell an invented number from a true one; the
 *     caller passes `context.invented: true` when the claim gate flagged one.
 *
 * Weights were fitted on panels P5-P8 ONLY (scripts/calibrate-judges.mjs,
 * ridge least squares); P10 is the held-out test. The rubric's own weights
 * (0.20/0.20/0.15/0.15/0.10/0.10/0.10) are kept in `rubric` for the readable
 * breakdown; the fitted model is what produces `craft`.
 *
 * Mirrored into supabase/functions/_shared by
 * scripts/ci/generate_shared_pilot_core.mjs; its only import is the hook judge.
 */
import { scoreHook } from './hookJudge.js'

export const CRAFT_FEATURES = [
  'one_thread', 'hook', 'proof', 'middle', 'cta', 'length_flow', 'voice',
  'words_norm', 'story_lines', 'filler', 'offer_cta', 'offer_fact', 'stray_story', 'sentences_norm',
] as const
export type CraftFeature = typeof CRAFT_FEATURES[number]

/** The rubric's own weights for the seven criteria (readable breakdown only). */
export const RUBRIC_WEIGHTS = { one_thread: 0.2, hook: 0.2, proof: 0.15, middle: 0.15, cta: 0.1, length_flow: 0.1, voice: 0.1 } as const

export type VoiceContext = {
  /** Her typical sentence length in words, if known. */
  avgSentenceWords?: number
  /** Does she use exclamation marks? */
  exclaims?: boolean
  /** Her signature words or phrases. */
  signatureWords?: string[]
}
export type CraftContext = { voice?: VoiceContext; invented?: boolean }

const STOP = new Set(('a an the and or but so if then than that this these those to of in on at for with from by as is are was were be been being '
  + 'it its it\'s i i\'m i\'ve me my we our us you your you\'re he she her his they them their what which who when where why how '
  + 'do does did done not no yes just really very can could would should will all any every some more most one first here there '
  + 'about into out up down over after before because like get got have has had make made keep kept tell told let know thing '
  + 'time way much many even also only still now today then once ever never thing things stop start going go').split(' '))

const stem = (w: string) => w.replace(/'s$/, '').replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '')
export function contentWords(s: string): Set<string> {
  const ws = s.toLowerCase().replace(/[’']/g, "'").match(/[a-z][a-z'-]+/g) ?? []
  return new Set(ws.filter((w) => w.length > 2 && !STOP.has(w)).map(stem).filter((w) => w.length > 2))
}
const jacc = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0
  let n = 0
  for (const x of a) if (b.has(x)) n++
  return n / (a.size + b.size - n)
}
const wc = (s: string) => (s.match(/[A-Za-z0-9$][A-Za-z0-9$'’.,-]*/g) ?? []).length
const sentences = (s: string) => (s.match(/[^.!?]+[.!?]*/g) ?? []).map((x) => x.trim()).filter((x) => wc(x) >= 4)

/** "1. line\n2. line" (the calibration set's format) → lines. */
export function splitScriptText(text: string): string[] {
  return text.split(/\n+/).map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean)
}

export const PLACEHOLDER = /\[(your answer|insert|add |todo|tbd|placeholder)|\{\{|\[[A-Z][A-Z _]{3,}\]/i
const STORY = /\b(i|my|we|our|she|he|one of my|a regular|a buyer|a customer|my client)\b[^.?!]*\b(was|were|had|came|went|got|lost|found|caught|threw|told|asked|ran|built|started|kept|tried|made|glued|ruined|quoted|wrote|fixed|spent|skipped|pulled|burned|broke|separated|failed|learned|realized|bought|sold|copied|hurt|picked|turned|trained|took|felt|said|[a-z]{3,}ed)\b/i
const CTA = /\b(link in (my )?bio|comment|comments|tell me|let me know|drop (your|it|a)|save this|send this|share this|follow|book|dm me|message me|sign up|start (your|a) (free )?trial|try it|grab (it|yours|one)|shop|click|check (it|out)|below|subscribe|join)\b/i
const OFFER_CTA = /\b(link in (my )?bio|book|trial|sign up|dm me|message me|intro call|shop|order|grab (it|yours|one)|join)\b/i
const USEFUL = /(\$\s?\d|\b\d|\bstep\b|\brule\b|\bbecause\b|\bwhich is why\b|\bthat is (how|why)\b|\bthat's (how|why)\b|\bso (i|we)\b|\bfirst\b|\bthen\b|\binstead\b|\bper (month|week)\b|\btrial\b|\bfree\b|\bwhat it is\b|\bbuilt\b|\bmade\b|\bcheck\b|\bkeep\b|\buse\b|\bstore\b|\btry\b)/i
const FILLER = /^(you have got this|you've got this|here is the thing|here's the thing|real talk|trust me|let's go|that's it|simple as that|minus the hype)[.,!]?/i

function lengthBand(words: number): number {
  if (words < 50) return 0
  if (words <= 75) return 0.3
  if (words < 90) return 0.7
  if (words <= 145) return 1
  return 0.8
}

function voiceScore(lines: string[], v?: VoiceContext): number {
  if (!v) return 0.5
  const text = lines.join(' ')
  const sents = text.match(/[^.!?]+[.!?]*/g) ?? []
  const avg = sents.length ? sents.reduce((s, x) => s + wc(x), 0) / sents.length : 0
  let parts = 0, got = 0
  if (v.avgSentenceWords) { parts++; got += Math.max(0, 1 - Math.abs(avg - v.avgSentenceWords) / v.avgSentenceWords) }
  if (v.exclaims != null) { parts++; got += (text.includes('!') === v.exclaims) ? 1 : 0 }
  if (v.signatureWords?.length) { parts++; got += v.signatureWords.some((w) => text.toLowerCase().includes(w.toLowerCase())) ? 1 : 0 }
  return parts ? got / parts : 0.5
}

/** Near-duplicate sentences (a repeated story or sentence). */
export function repeatedSentence(lines: string[]): boolean {
  const ss = lines.flatMap(sentences).map(contentWords).filter((s) => s.size >= 3)
  for (let i = 0; i < ss.length; i++) for (let j = i + 1; j < ss.length; j++) if (jacc(ss[i]!, ss[j]!) >= 0.6) return true
  return false
}

/** The measurable features, each roughly 0..1. */
export function craftFeatures(lines: string[], ctx: CraftContext = {}): Record<CraftFeature, number> {
  const L = lines.map((l) => l.trim()).filter(Boolean)
  const n = L.length
  const words = L.reduce((s, l) => s + wc(l), 0)
  const cw = L.map(contentWords)
  // 1. One thread: share of lines that share a topic word with another line.
  let linked = 0
  for (let i = 0; i < n; i++) if (cw.some((o, j) => j !== i && jacc(cw[i]!, o) > 0.04)) linked++
  const ctaIdx = L.map((l, i) => (CTA.test(l) ? i : -1)).filter((i) => i >= 0)
  const thread = n ? linked / Math.max(1, n - (ctaIdx.includes(n - 1) ? 1 : 0)) : 0
  // 2. Hook.
  const hook = n ? (scoreHook(L[0]!).raw - 1) / 4 : 0
  // 3. Proof: a story line after the hook and before the close.
  const storyAt = L.map((l, i) => (STORY.test(l) ? i : -1)).filter((i) => i >= 0)
  const mid = storyAt.filter((i) => i >= 1 && i < n - 1)
  const proof = mid.length ? 1 : storyAt.length ? 0.4 : 0
  // 4. Middle: useful middle lines.
  const middleLines = L.slice(1, Math.max(1, n - 1))
  const middle = middleLines.length ? middleLines.filter((l) => USEFUL.test(l)).length / middleLines.length : 0
  // 5. One CTA at the end.
  const lastCta = ctaIdx.includes(n - 1)
  const cta = !ctaIdx.length ? 0 : lastCta && ctaIdx.length === 1 ? 1 : lastCta ? 0.6 : 0.3
  const offerCta = n && OFFER_CTA.test(L[n - 1]!) ? 1 : 0
  // 6. Length and flow.
  const filler = n ? L.filter((l) => FILLER.test(l) || wc(l) < 5).length / n : 0
  const lengthFlow = Math.max(0, lengthBand(words) - 0.5 * filler)
  // Sell/lead middle: what it is plus a price or trial.
  const offerFact = L.some((l) => /(\$\s?\d|\b\d+ (dollars|per)|dollars?\b|\bper (month|week|bag|jar)\b|\bfree trial\b|\b\d+-day\b|\btrial\b)/i.test(l)) ? 1 : 0
  // A story line that shares no topic word with the hook nor the line before it.
  const strayStory = storyAt.filter((i) => i >= 1 && jacc(cw[i]!, cw[0]!) === 0 && jacc(cw[i]!, cw[i - 1]!) === 0).length
  const sentCount = L.flatMap((l) => l.match(/[^.!?]+[.!?]*/g) ?? []).filter((x) => wc(x) >= 3).length
  return {
    one_thread: Math.min(1, thread), hook, proof, middle, cta, length_flow: lengthFlow,
    voice: voiceScore(L, ctx.voice),
    words_norm: Math.min(2, words / 100), story_lines: Math.min(4, storyAt.length) / 4, filler, offer_cta: offerCta,
    offer_fact: offerFact, stray_story: Math.min(3, strayStory) / 3, sentences_norm: Math.min(12, sentCount) / 12,
  }
}

/** Fitted on P5-P8 (scripts/calibrate-judges.mjs --fit). Intercept first. */
export const CRAFT_WEIGHTS: { intercept: number } & Record<CraftFeature, number> = {
  intercept: 1.86,
  one_thread: 0.36, hook: 0.08, proof: 0.66, middle: 0.14, cta: 0.15, length_flow: 0.54, voice: 0,
  words_norm: 0.37, story_lines: 0.1, filler: 0.13, offer_cta: 0.16, offer_fact: 0.31, stray_story: 0.1, sentences_norm: 0.12,
}

export type CraftCap = 'placeholder' | 'repeated_sentence' | 'invented'
export type CraftScore = {
  /** Integer craft 1..7 after caps. */
  craft: number
  /** Unrounded model score after caps (for ranking). */
  raw: number
  /** The seven rubric criteria, each 0..1. */
  criteria: Record<keyof typeof RUBRIC_WEIGHTS, number>
  /** 1 + 6 × the rubric-weighted sum (readable, uncalibrated). */
  rubric: number
  caps: CraftCap[]
  features: Record<CraftFeature, number>
}

/** Score one script (its spoken lines, in order). Deterministic, no I/O. */
export function scoreCraft(lines: string[], ctx: CraftContext & { weights?: typeof CRAFT_WEIGHTS } = {}): CraftScore {
  const W = ctx.weights ?? CRAFT_WEIGHTS
  const f = craftFeatures(lines, ctx)
  let raw = W.intercept
  for (const k of CRAFT_FEATURES) raw += W[k] * f[k]
  raw = Math.max(1, Math.min(7, raw))
  const caps: CraftCap[] = []
  if (lines.some((l) => PLACEHOLDER.test(l))) { caps.push('placeholder'); raw = Math.min(raw, 1) }
  if (repeatedSentence(lines)) { caps.push('repeated_sentence'); raw = Math.min(raw, 3) }
  if (ctx.invented) { caps.push('invented'); raw = Math.min(raw, 3) }
  const criteria = { one_thread: f.one_thread, hook: f.hook, proof: f.proof, middle: f.middle, cta: f.cta, length_flow: f.length_flow, voice: f.voice }
  let sum = 0
  for (const k of Object.keys(RUBRIC_WEIGHTS) as Array<keyof typeof RUBRIC_WEIGHTS>) sum += RUBRIC_WEIGHTS[k] * criteria[k]
  return { craft: Math.round(raw), raw, criteria, rubric: 1 + 6 * sum, caps, features: f }
}

// ⚖️ BEST-OF-N (trial, test accounts only; BEST_OF_N_JUDGE kill switch, default OFF).
// Where the writer hedge already holds two finished drafts, ship the one this
// judge scores higher; Plan B's script is a third candidate when Plan B is on.
// It never waits for a draft: only drafts already finished are compared.

/** On only for a test/trial account AND BEST_OF_N_JUDGE=on|true. Default off. */
export function bestOfNOn(testAccount: boolean, flag: string | undefined | null): boolean {
  const f = String(flag ?? '').trim().toLowerCase()
  return testAccount && (f === 'on' || f === 'true' || f === '1')
}

/** The spoken lines of a blueprint (`script[].line`), from an object or its JSON text. */
export function blueprintLines(bp: unknown): string[] {
  let b = bp
  if (typeof b === 'string') { try { b = JSON.parse(b) } catch { return [] } }
  const s = (b as { script?: unknown } | null)?.script
  if (!Array.isArray(s)) return []
  return s.map((x) => (typeof (x as { line?: unknown })?.line === 'string' ? String((x as { line: string }).line) : '')).filter((l) => l.trim())
}

/** Craft score for ranking candidates (raw, 2 decimals); an empty script scores 0. */
export function candidateScore(lines: string[]): number {
  return lines.length ? Math.round(scoreCraft(lines).raw * 100) / 100 : 0
}

/** Pick the higher-scoring of the two hedge drafts; a tie keeps attempt 0. */
export function pickByCraft(texts: [string, string]): { scores: [number, number]; chosen: 0 | 1 } {
  const scores: [number, number] = [candidateScore(blueprintLines(texts[0])), candidateScore(blueprintLines(texts[1]))]
  return { scores, chosen: scores[1] > scores[0] ? 1 : 0 }
}

// ⚖️ BEST-OF-N ELIGIBILITY (owner rule, 22 Oct). Before any comparison, every
// candidate runs targeted flags v2 (TARGETED_FLAGS_V2) and the wrong-product
// check (WRONG_PRODUCT_BLOCK). Only a candidate with ZERO blocking flags is
// eligible; with fewer than two eligible there is no comparison and today's
// choice ships. A higher craft score never buys a flagged line.

/** The flag context the edge holds at writer time (ledger items + product names). */
export interface BestOfNFlagCtx {
  items: readonly TargetedItemV2[]
  products: readonly TargetedProduct[]
  /** TARGETED_FLAGS_V2 on (default on unless 'false'). */
  v2: boolean
  /** WRONG_PRODUCT_BLOCK on (default on unless 'false'). */
  wrongProduct: boolean
}

/** One candidate's eligibility: reason ids only (never text). */
export interface CandidateCheck { score: number; eligible: boolean; flags: string[] }

/** Blocking flags of one script (its spoken lines): wrong-product blocks and every v2 targeted flag. */
export function blockingFlags(lines: string[], ctx: BestOfNFlagCtx): string[] {
  const bp = { script: lines.map((line) => ({ line })) } as unknown as GateBlueprint
  const out: string[] = []
  if (ctx.wrongProduct) for (const b of blockWrongProductLines(bp, ctx.items, ctx.products).blocked) out.push(`wrong_product@${b.line_index}`)
  if (ctx.v2) for (const c of buildTargetedCheckLinesV2(bp, ctx.items, ctx.products)) out.push(`${c.reason}@${c.line_index}`)
  return [...new Set(out)]
}

/** Score + flags + eligibility of one candidate. An empty script is never eligible. */
export function checkCandidate(lines: string[], ctx: BestOfNFlagCtx): CandidateCheck {
  const flags = blockingFlags(lines, ctx)
  return { score: candidateScore(lines), eligible: lines.length > 0 && flags.length === 0, flags }
}

export interface FlagAwarePick {
  scores: [number, number]
  /** The draft that ships: the judge's pick when compared, else today's (`fallback`). */
  chosen: 0 | 1
  /** Both drafts eligible, so the judge decided. */
  compared: boolean
  checks: [CandidateCheck, CandidateCheck]
}

/** Best-of-N over the two hedge drafts under the eligibility rule. `fallback`
 *  is the draft today's code ships; it stays unless BOTH are eligible. */
export function pickEligible(texts: [string, string], ctx: BestOfNFlagCtx, fallback: 0 | 1): FlagAwarePick {
  const checks: [CandidateCheck, CandidateCheck] = [checkCandidate(blueprintLines(texts[0]), ctx), checkCandidate(blueprintLines(texts[1]), ctx)]
  const scores: [number, number] = [checks[0].score, checks[1].score]
  const compared = checks[0].eligible && checks[1].eligible
  const chosen: 0 | 1 = compared ? (scores[1] > scores[0] ? 1 : scores[0] > scores[1] ? 0 : fallback) : fallback
  return { scores, chosen, compared, checks }
}

/** Plan B vs the writer's script: Plan B is replaced ONLY when the writer's
 *  script has zero blocking flags AND wins by the judge (Plan B must be eligible
 *  too, or there is no comparison and Plan B stays). */
export function keepWriterOverPlanB(writer: CandidateCheck, planB: CandidateCheck): boolean {
  return writer.eligible && planB.eligible && writer.score > planB.score
}

/** Grace for the second hedge draft (rule 3): the longest it may keep running
 *  after the first valid draft, and only if it still ends inside the writer deadline. */
export const BEST_OF_N_GRACE_MS = 5_000
/** How long to let the other draft finish: min(grace, time left before the
 *  deadline); 0 (cancel as today) when elapsed + grace would pass the deadline. */
export function graceMs(leftMs: number, grace: number = BEST_OF_N_GRACE_MS): number {
  if (!(leftMs > 0) || leftMs < grace) return 0
  return Math.max(0, Math.min(grace, leftMs))
}

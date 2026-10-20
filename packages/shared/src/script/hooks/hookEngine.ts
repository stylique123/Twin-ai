// THE HOOK ENGINE (A5): candidates → gate → score → pick, on top of the shape
// library in hookShapes.ts.
//
// 1. The writer is asked, IN ITS EXISTING CALL, for 8–10 hook candidates spread
//    across the eligible shapes (`renderHookCandidateRule`). No new model call.
// 2. Each candidate is gated by the cheap invention-gate rules the shape
//    library already carries (`checkHookAgainstShape`): no number not in an
//    item, no universal quantifier without a count, no invented experience.
// 3. Each candidate is scored deterministically on shape fit, specificity (how
//    much of it is drawn from her own ledger items) and length.
// 4. The top 3 passing candidates are picked, preferring distinct shapes.
// 5. The record (`hook_candidates`) carries counts, shape ids, scores and
//    pass/fail reasons — never the candidate text — so it is safe to log.
//
// ⚖️ PURE AND DETERMINISTIC. No I/O, no model calls, no clock.
// Every example in tests is made up; none is creator or third-party text.

import type { LedgerItem, ProductName } from '../inventionGate.js'
import { contentWords, wordCount, ruleRead, splitSentences, inventedElement, FIRST_PERSON_ELEMENTS } from '../inventionGate.js'
import { hookShape, eligibleShapes, checkHookAgainstShape, hookNumbers, type HookShape } from './hookShapes.js'

export const HOOK_CANDIDATE_MIN = 8
export const HOOK_CANDIDATE_MAX = 10
export const HOOK_PICK_COUNT = 3

/** Score weights. Sum to 1. */
export const HOOK_SCORE_WEIGHTS = { fit: 0.4, specificity: 0.4, length: 0.2 } as const

export interface HookCandidateInput { shape?: unknown; text?: unknown }

export interface HookCandidateScore {
  fit: number; specificity: number; length: number; total: number
  /** Trial scorer only: the appeal read (see `appealScore`). */
  appeal?: number
}

/** Where a candidate came from. Writer candidates are the default. */
export type HookCandidateSource = 'writer' | 'story_open' | 'fact_open'

export interface HookCandidateRecord {
  index: number
  shape: string
  ok: boolean
  /** Failed rule ids (empty when ok). */
  reasons: string[]
  words: number
  score: HookCandidateScore
  /** Trial engine only. */
  source?: HookCandidateSource
}

export interface HookCandidatesRecord {
  eligible_shapes: string[]
  requested: number
  received: number
  passed: number
  failed: number
  shapes_used: number
  candidates: HookCandidateRecord[]
}

export interface HookPick {
  indices: number[]
  shapes: string[]
  scores: number[]
  /** The picked hook lines (blueprint only; never logged). */
  hooks: string[]
}

/**
 * Shape quota for N candidates: round-robin over the eligible shapes, so the
 * spread is as even as N allows. Empty when no shape is eligible.
 */
export function candidateQuota(eligible: readonly HookShape[], n = 9): string[] {
  if (eligible.length === 0) return []
  const count = Math.max(HOOK_CANDIDATE_MIN, Math.min(HOOK_CANDIDATE_MAX, n))
  return Array.from({ length: count }, (_, i) => eligible[i % eligible.length]!.id)
}

/** The writer-prompt block that asks for candidates in the same response. '' when nothing is eligible. */
export function renderHookCandidateRule(ledger: readonly LedgerItem[], opts: { noBareFact?: boolean } = {}): string {
  const eligible = eligibleShapes(ledger).filter((s) => !(opts.noBareFact && BARE_FACT_SHAPES.has(s.id)))
  const quota = candidateQuota(eligible)
  if (quota.length === 0) return ''
  const per = new Map<string, number>()
  for (const id of quota) per.set(id, (per.get(id) ?? 0) + 1)
  const lines = eligible.map((s) => `  - ${s.id} (${per.get(s.id) ?? 0}): ${s.pattern}`)
  return [
    `HOOK CANDIDATES: also return hook_candidates, ${quota.length} entries of { shape, text }, spread across these shapes (count in brackets):`,
    ...lines,
    '  Each text is one spoken line built only from the material above. Use no number that is not in her material, no "everyone", "nobody" or "most" without a real count, and no first-person event she did not tell you about.',
    ...(opts.noBareFact ? [BARE_FACT_PROMPT_RULE] : []),
  ].join('\n')
}

/** Plan v5.4 §20 (trial; kill HOOK_BARE_FACT_GEN=false): the writer is told not to write a bare fact as a hook. */
export const BARE_FACT_PROMPT_RULE = '  Never write a bare fact as a hook: no price-and-size line, no spec list, no line that only states how the product is made. A hook speaks to the viewer, asks, warns or opens her story.'

const PRONOUN_RE = /\b(?:i|i'm|i've|me|my|we|our|us|you|your|you're|yours)\b/i
/** Opens on a price, a quantity, or a made/process participle ("Hand-thrown, …", "Roasted on …"). */
const SPEC_START_RE = /^(?:[$£€]\s?\d|\d|(?:a|an)\s+(?:\d|free\b)|(?:hand[- ]\w+|made|roasted|brewed|fired|thrown|trimmed|glazed|built|designed|crafted|sewn|baked|shipped|packed|poured|available)\b)/i
/** A bare spec line: opens on a price, size or process, with no person and no question in it, and short. */
export function isBareSpecLine(text: string): boolean {
  const t = String(text ?? '').trim().replace(/’/g, "'")
  if (!t || /\?/.test(t) || PRONOUN_RE.test(t) || !SPEC_START_RE.test(t)) return false
  return wordCount(t) <= 12
}

function round3(n: number): number { return Math.round(n * 1000) / 1000 }

/** 1 inside 6–12 words, falling off linearly to 0 at 2 and at 24. */
export function lengthScore(words: number): number {
  if (words >= 6 && words <= 12) return 1
  if (words < 6) return Math.max(0, (words - 2) / 4)
  return Math.max(0, (24 - words) / 12)
}

/** Share of the hook's content words found in her first-party ledger items (her own material). */
export function specificityScore(text: string, ledger: readonly LedgerItem[]): number {
  const hook = contentWords(text)
  if (hook.size === 0) return 0
  const own = new Set<string>()
  for (const it of ledger) if (it.first_party) for (const w of contentWords(it.text)) own.add(w)
  let hit = 0
  for (const w of hook) if (own.has(w)) hit++
  return hit / hook.size
}

/** Shape fit: the shape is known and eligible (0.5), and the cheap check passes (0.5). */
function fitScore(shape: HookShape | undefined, eligibleIds: Set<string>, ok: boolean): number {
  if (!shape) return 0
  return (eligibleIds.has(shape.id) ? 0.5 : 0) + (ok ? 0.5 : 0)
}

export function scoreCandidates(
  candidates: readonly HookCandidateInput[],
  ledger: readonly LedgerItem[],
): { records: HookCandidateRecord[]; texts: string[] } {
  const eligibleIds = new Set(eligibleShapes(ledger).map((s) => s.id))
  const records: HookCandidateRecord[] = []
  const texts: string[] = []
  candidates.slice(0, HOOK_CANDIDATE_MAX).forEach((c, index) => {
    const text = typeof c?.text === 'string' ? c.text.trim() : ''
    const shapeId = typeof c?.shape === 'string' ? c.shape.trim() : ''
    const shape = hookShape(shapeId)
    const reasons: string[] = []
    if (!text) reasons.push('empty')
    if (!shape) reasons.push('unknown_shape')
    let ok = false
    if (text && shape) {
      const check = checkHookAgainstShape(text, shape, ledger)
      for (const i of check.issues) if (!reasons.includes(i.rule)) reasons.push(i.rule)
      // The invention-gate rule holds for EVERY shape, not only the ones that
      // list `unbacked_number`: no number in a hook that no item carries.
      const ledgerNums = new Set(ledger.flatMap((it) => it.numbers.map((n) => n.value)))
      const unbacked = hookNumbers(text).some((n) => !ledgerNums.has(n))
      if (unbacked && !reasons.includes('unbacked_number')) reasons.push('unbacked_number')
      ok = check.ok && !unbacked
    }
    const words = text ? wordCount(text) : 0
    const fit = fitScore(shape, eligibleIds, ok)
    const specificity = text ? specificityScore(text, ledger) : 0
    const length = lengthScore(words)
    const total = HOOK_SCORE_WEIGHTS.fit * fit + HOOK_SCORE_WEIGHTS.specificity * specificity + HOOK_SCORE_WEIGHTS.length * length
    records.push({
      index, shape: shape ? shape.id : 'unknown', ok, reasons, words,
      score: { fit: round3(fit), specificity: round3(specificity), length: round3(length), total: round3(total) },
    })
    texts.push(text)
  })
  return { records, texts }
}

/** Top N passing candidates by score; distinct shapes first, ties by index. */
export function pickTop(records: readonly HookCandidateRecord[], n = HOOK_PICK_COUNT): HookCandidateRecord[] {
  const passing = records.filter((r) => r.ok).sort((a, b) => b.score.total - a.score.total || a.index - b.index)
  const out: HookCandidateRecord[] = []
  const seen = new Set<string>()
  for (const r of passing) if (out.length < n && !seen.has(r.shape)) { out.push(r); seen.add(r.shape) }
  for (const r of passing) if (out.length < n && !out.includes(r)) out.push(r)
  return out
}

// ── TRIAL SCORER (A5b) ───────────────────────────────────────────────────────
// The v1 total (fit / ledger-overlap / length) did not track an advisor's
// scroll-stop ratings (r ≈ 0.23 on a rated set). A feature read of those
// ratings found: a first-person real story is the strongest lift; a specific
// real fact helps; self-promotion ("our X", prices, "test our"), filler
// phrases ("watch this", "here's the thing"), "If you…" openers and plain
// questions drag; "Stop/Never…" and blunt "You…" statements lift; longer
// lines drag. `appealScore` encodes those as fixed weights (no fitting at
// runtime). It is used only when the caller passes `trial: true`.

// ⚖️ RE-SCORED ON PANEL-6 RATINGS (owner, 19 Oct; 145 blind-rated hooks, ratings
// kept out of the repo). Two-fold fits agreed on two moves only, so only those
// changed: a trailing question reads weaker (-0.05 → -0.10), and LENGTH IS NOT
// A PENALTY — hooks of 7 words or fewer were rated lowest, 11-13 words highest,
// so each word past 9 now adds a little (-0.02 → +0.03). Spearman against the
// ratings 0.29 → 0.48; mean rating of the top-scored third 3.35 → 3.63.
export const APPEAL_WEIGHTS = {
  base: 0.5,
  story: 0.35,
  fact: 0.15,
  promo: -0.25,
  generic: -0.1,
  stop_open: 0.12,
  you_open: 0.12,
  question: -0.1,
  if_open: -0.08,
  per_word_over_9: 0.03,
} as const

const STORY_LEAD_RE = /^(?:(?:my|our)\b[^.?!]*\b(?:was|were|found|separated|broke|cracked|failed|sold|went|came|took)\b|i\s+\w+ed\b|i\s+(?:threw|lost|made|sold|broke|found|tried|spent|wrote|got|had|ran|took|burned|forgot)\b)/i
const STORY_ANY_RE = /\b(?:quoted|told|asked|sent|emailed|showed)\s+(?:me|my)\b|\bmy\s+\w+[^.?!]*\bi\s+never\b/i
const PROMO_RE = /\b(?:our|we)\b|\$\s?\d|\bdollars?\b|\bhere is (?:our|how it works)\b|\bwhat you get\b/i
const GENERIC_RE = /\b(?:watch (?:this|till the end)|watch\.|have you ever|here(?:'s| is) (?:the (?:thing|truth|reality|deal))|let'?s talk about|you won'?t believe|game.?changer|changes everything|right here|actually|completely|literally)\b/gi
const STOP_OPEN_RE = /^(?:stop|never|don'?t|do not)\b/i
const YOU_OPEN_RE = /^(?:you|you're|you are)\b/i
const IF_OPEN_RE = /^if\b/i

export interface HookFeatures {
  story: boolean; promo: boolean; generic: number; question: boolean
  stop_open: boolean; you_open: boolean; if_open: boolean; words: number
}

/** Text-only features of one hook line. Pure. */
export function hookFeatures(text: string): HookFeatures {
  const t = text.trim()
  const story = STORY_LEAD_RE.test(t) || STORY_ANY_RE.test(t)
  return {
    story,
    promo: !story && PROMO_RE.test(t),
    generic: Math.min(2, (t.match(GENERIC_RE) ?? []).length),
    question: /\?\s*$/.test(t),
    stop_open: STOP_OPEN_RE.test(t),
    you_open: YOU_OPEN_RE.test(t),
    if_open: IF_OPEN_RE.test(t),
    words: wordCount(t),
  }
}

function overlapShare(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0
  let hit = 0
  for (const w of a) if (b.has(w)) hit++
  return hit / a.size
}

/** Share of the hook carried by her own story items (0–1). */
function storyBacking(text: string, ledger: readonly LedgerItem[]): number {
  const hook = contentWords(text)
  let best = 0
  for (const it of ledger) if (it.origin === 'her_story' && it.first_party) best = Math.max(best, overlapShare(hook, contentWords(it.text)))
  return best
}

/**
 * Appeal score (0–1): how likely the line is to stop a scroll, read off the
 * text plus her ledger. A line is a story when it reads as a first-person
 * event OR is mostly her story item's words.
 */
export function appealScore(text: string, ledger: readonly LedgerItem[], weights: { readonly [K in keyof typeof APPEAL_WEIGHTS]: number } = APPEAL_WEIGHTS): number {
  const f = hookFeatures(text)
  if (f.words === 0) return 0
  const W = weights
  const story = f.story || storyBacking(text, ledger) >= 0.6
  let s = W.base
  if (story) s += W.story
  s += W.fact * specificityScore(text, ledger)
  if (f.promo && !story) s += W.promo
  s += W.generic * f.generic
  if (f.stop_open) s += W.stop_open
  if (f.you_open) s += W.you_open
  if (f.question) s += W.question
  if (f.if_open) s += W.if_open
  s += W.per_word_over_9 * Math.max(0, f.words - 9)
  return Math.max(0, Math.min(1, s))
}

// ── STORY-OPEN / FACT-OPEN candidates (trial) ────────────────────────────────
// When one of her stories, or a specific first-party fact, matches the
// request, its own first sentence is offered as a hook FIRST — verbatim or
// near-verbatim (whitespace, capital, end mark only). Nothing is added, so no
// claim is added; it still goes through the same hook check and invention
// check as every writer candidate.

export const OPEN_MAX_WORDS = 16
const FACT_ORIGINS = new Set<LedgerItem['origin']>(['her_fact', 'her_answer', 'product_fact'])

/** Near-verbatim: first sentence, trimmed, capitalised, with an end mark. Null when too long. */
export function openLine(itemText: string): string | null {
  const first = (splitSentences(itemText.trim())[0] ?? '').replace(/\s+/g, ' ').trim()
  if (!first) return null
  const n = wordCount(first)
  if (n < 4 || n > OPEN_MAX_WORDS) return null
  const cap = first[0]!.toUpperCase() + first.slice(1)
  return /[.!?]["”')]*$/.test(cap) ? cap : `${cap}.`
}

function matchesRequest(it: LedgerItem, request: Set<string>, targetId: string | null): boolean {
  if (targetId && it.product_id === targetId) return true
  const w = contentWords(it.text)
  for (const x of request) if (w.has(x)) return true
  return false
}

/** Specific: carries a number, or at least 4 content words (a real detail, not a label). */
function isSpecificFact(it: LedgerItem): boolean {
  return it.numbers.length > 0 || contentWords(it.text).size >= 4
}

const SURPRISE_RE = /\b(?:but|never|only|instead|actually|than|without|stopped|wrong|mistake|nobody|most people|zero|half|twice|every)\b/i
/**
 * ⚠️ PANEL-6: a bare product spec (a plan description, a monthly price)
 * opened 16 picked hooks and rated low. A
 * fact opens a hook only when it carries a SURPRISING specific: a number inside
 * a real sentence (6+ words), or a contrast / reversal word. Her own fact or
 * answer qualifies the same way; a product fact with neither never does.
 */
export function isSurprisingSpecific(it: LedgerItem): boolean {
  const words = wordCount(it.text)
  if (it.numbers.length > 0 && words >= 6) return true
  return SURPRISE_RE.test(it.text) && isSpecificFact(it)
}

const FACT_SHAPES = ['price_or_proof', 'number_promise', 'stop_doing', 'if_then_check'] as const

/** STORY-OPEN then FACT-OPEN candidates for this request, story first, ledger order. */
export function openCandidates(
  ledger: readonly LedgerItem[],
  opts: { request?: string; targetProductId?: string | null } = {},
): (HookCandidateInput & { source: HookCandidateSource })[] {
  const request = contentWords(opts.request ?? '')
  const target = opts.targetProductId ?? null
  if (request.size === 0 && !target) return []
  const eligible = new Set(eligibleShapes(ledger).map((s) => s.id))
  const out: (HookCandidateInput & { source: HookCandidateSource })[] = []
  const seen = new Set<string>()
  const push = (text: string | null, shape: string, source: HookCandidateSource) => {
    if (!text || seen.has(text.toLowerCase())) return
    seen.add(text.toLowerCase())
    out.push({ shape, text, source })
  }
  for (const it of ledger) {
    if (it.origin === 'her_story' && it.first_party && matchesRequest(it, request, target)) push(openLine(it.text), 'story_open', 'story_open')
  }
  for (const it of ledger) {
    if (!FACT_ORIGINS.has(it.origin) || !it.first_party || !isSurprisingSpecific(it) || !matchesRequest(it, request, target)) continue
    const line = openLine(it.text)
    if (!line) continue
    const shape = FACT_SHAPES.find((id) => eligible.has(id) && checkHookAgainstShape(line, hookShape(id)!, ledger).ok)
    if (shape) push(line, shape, 'fact_open')
  }
  return out
}

/** The invention check on one hook line: no hard (invented) verdict from the rule read. */
export function hookInventionOk(
  text: string,
  ledger: readonly LedgerItem[],
  products: readonly ProductName[] = [],
  targetId: string | null = null,
): { ok: boolean; reason: string | null } {
  for (const [k, sentence] of splitSentences(text).entries()) {
    const r = ruleRead({ i: k, surface: 'hook_option', at: 0, k, text: sentence }, ledger, products, targetId)
    if (r.hard) return { ok: false, reason: r.hard.reason }
  }
  return { ok: true, reason: null }
}

/** Plan v5.3 §19: the same first-person claim check the gate runs on lines
 *  (experience, habit, positioning, origin, stance with no item of hers). */
export function hookClaimOk(text: string, ledger: readonly LedgerItem[], products: readonly ProductName[] = []): { ok: boolean; reason: string | null } {
  const el = inventedElement(text, ledger, products)
  return el && FIRST_PERSON_ELEMENTS.has(el.element) ? { ok: false, reason: `first_person_claim:${el.element}` } : { ok: true, reason: null }
}

/** Bare-fact hook shapes (panel 6 and 7: a price or spec line as the hook). */
export const BARE_FACT_SHAPES: ReadonlySet<string> = new Set(['price_or_proof'])

/** Is this candidate a bare-fact hook (a price_or_proof shape, or a fact_open line)? */
export function isBareFactHook(c: { shape?: unknown; source?: HookCandidateSource }): boolean {
  return c.source === 'fact_open' || BARE_FACT_SHAPES.has(String(c.shape ?? ''))
}

export interface HookEngineOptions {
  /** trialOn: the appeal scorer, open candidates and the invention check. Off = v1 exactly. */
  trial?: boolean
  /** Trial (plan v5.3 §19; kill HOOK_BARE_FACT=false): no bare-fact hook
   *  (price_or_proof shape, fact_open source) is ever picked. */
  noBareFact?: boolean
  /** Trial (plan v5.4 §20; kill HOOK_BARE_FACT_GEN=false): bare-fact hooks are
   *  never GENERATED: no fact_open candidate, and a writer candidate with a
   *  bare-fact shape or a bare spec line is dropped before scoring. */
  noBareFactGen?: boolean
  /** Trial (plan v5.3 §19; kill HOOK_CLAIM_CHECK=false): a hook with an
   *  unbacked first-person claim fails (hookClaimOk). */
  claimCheck?: boolean
  /** The request (topic / note) used to match stories and facts. */
  request?: string
  products?: readonly ProductName[]
  targetProductId?: string | null
}

function runTrial(
  writer: readonly HookCandidateInput[],
  ledger: readonly LedgerItem[],
  opts: HookEngineOptions,
): { records: HookCandidateRecord[]; texts: string[] } {
  const bareGen = (c: HookCandidateInput & { source: HookCandidateSource }) =>
    !!opts.noBareFactGen && (isBareFactHook(c) || isBareSpecLine(typeof c?.text === 'string' ? c.text : ''))
  const opens = openCandidates(ledger, { request: opts.request, targetProductId: opts.targetProductId })
  const writerTexts = new Set(writer.map((c) => (typeof c?.text === 'string' ? c.text.trim().toLowerCase() : '')))
  const all: (HookCandidateInput & { source: HookCandidateSource })[] = [
    ...opens.filter((c) => !writerTexts.has(String(c.text).toLowerCase())),
    ...writer.slice(0, HOOK_CANDIDATE_MAX).map((c) => ({ ...c, source: 'writer' as const })),
  ].filter((c) => !bareGen(c))
  const records: HookCandidateRecord[] = []
  const texts: string[] = []
  all.forEach((c, index) => {
    const one = scoreCandidates([c], ledger)
    const rec = one.records[0]!
    const text = one.texts[0]!
    const reasons = [...rec.reasons]
    let ok = rec.ok
    if (text) {
      const inv = hookInventionOk(text, ledger, opts.products ?? [], opts.targetProductId ?? null)
      if (!inv.ok) { ok = false; reasons.push(`invention:${inv.reason}`) }
      if (opts.claimCheck) {
        const cl = hookClaimOk(text, ledger, opts.products ?? [])
        if (!cl.ok) { ok = false; reasons.push(`invention:${cl.reason}`) }
      }
    }
    if (opts.noBareFact && isBareFactHook({ shape: rec.shape, source: c.source })) { ok = false; reasons.push('bare_fact') }
    const appeal = text ? appealScore(text, ledger) : 0
    // Opens are offered FIRST: a passing open outranks any writer line.
    // Story-open is preferred over fact-open (owner 19 Oct): both outrank a
    // writer line, a story-open outranks a fact-open.
    const total = (ok ? 1 : 0.5) * appeal + (ok ? (c.source === 'story_open' ? 1.2 : c.source === 'fact_open' ? 1 : 0) : 0)
    records.push({ ...rec, index, ok, reasons, source: c.source, score: { ...rec.score, appeal: round3(appeal), total: round3(total) } })
    texts.push(text)
  })
  return { records, texts }
}

/** Run the engine over the writer's candidates. `opts.trial` switches on the A5b scorer. */
export function runHookEngine(
  candidates: readonly HookCandidateInput[] | null | undefined,
  ledger: readonly LedgerItem[],
  opts: HookEngineOptions = {},
): { record: HookCandidatesRecord; pick: HookPick } {
  const eligible = eligibleShapes(ledger)
  const list = Array.isArray(candidates) ? candidates : []
  const { records, texts } = opts.trial ? runTrial(list, ledger, opts) : scoreCandidates(list, ledger)
  const top = pickTop(records)
  const passed = records.filter((r) => r.ok).length
  return {
    record: {
      eligible_shapes: eligible.map((s) => s.id),
      requested: candidateQuota(eligible).length,
      received: list.length,
      passed,
      failed: records.length - passed,
      shapes_used: new Set(records.map((r) => r.shape).filter((s) => s !== 'unknown')).size,
      candidates: records,
    },
    pick: {
      indices: top.map((r) => r.index),
      shapes: top.map((r) => r.shape),
      scores: top.map((r) => r.score.total),
      hooks: top.map((r) => texts[r.index]!),
    },
  }
}

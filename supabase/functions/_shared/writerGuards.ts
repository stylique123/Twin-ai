// GENERATED FROM packages/shared/src/script/writerGuards.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// DETERMINISTIC WRITER GUARDS (panel-current-5, trial only).
//
// Pure: no I/O, no model call. The edge (under `trialOn`) runs `guardScript`
// over the writer's script and hook options before the hook engine and the
// invention gate. Every guard only DROPS a sentence (or a hook option); none
// writes a word. Records hold rule ids and counts, never text.
//
// Why these five, from panel-current-5 (strict labels, counts only):
//   - a first-person habit or team fact with nothing of hers behind it;
//   - scarcity with no live urgency fact;
//   - timing ("this week", "today only") with no dated item;
//   - an outside product or brand described as hers ("my <outside thing>");
//   - test-data / example scaffolding spoken aloud ("made-up", "fictional
//     customer", "testimonial:", "[insert …]").
//
// ⚖️ TRIAL ONLY. Real creators never reach this module.

import { contentWords, isScaffoldText, type LedgerItem } from './inventionGate.ts'

export const WRITER_GUARDS_VERSION = 'writer-guards-v1'

// ── SCAFFOLDING ─────────────────────────────────────────────────────────────

/** Test-data labels and example scaffolding: the rule lives in the gate (one regex). */
export { isScaffoldText }

// ── DATES ───────────────────────────────────────────────────────────────────

const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`
const DAY = String.raw`(?:[12]\d|3[01]|0?[1-9])(?:st|nd|rd|th)?`
const EVENT_DATE_RE = new RegExp([
  String.raw`\b${DAY}\s+(?:of\s+)?${MONTH}\b`,
  String.raw`\b${MONTH}\.?\s+${DAY}\b`,
  String.raw`\b\d{4}-\d{2}-\d{2}\b`,
  String.raw`\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b`,
].join('|'), 'i')

/** A day-level date ("12 March", "March 12", "2026-03-12", "12/03/2026").
 *  A bare year ("Summit 2026") or a bare month word ("you may") is NOT a date. */
export const hasEventDate = (text: unknown): boolean => EVENT_DATE_RE.test(String(text ?? ''))

// ── THE GUARDS ──────────────────────────────────────────────────────────────

export type GuardRule = 'scaffold' | 'first_person_unbacked' | 'scarcity_not_live' | 'timing_undated' | 'outside_as_hers'

const FIRST_PARTY = new Set(['her_story', 'her_fact', 'her_answer', 'product_fact', 'offer'])
const OUTSIDE = new Set(['outside_research', 'outside_moment', 'niche_note', 'audience_question'])

const FIRST_PERSON_FACT_RE = /\b(?:i|we)\s+(?:(?:always|usually|constantly|personally|still|now|also)\s+)?(?:use|rely on|run|test|tested|review|ship|make|built|build|send|track|check|keep|swear by)\b|\b(?:my|our)\s+team\b|\bmy team and i\b|\bi\s+use\s+this\b/i
const SCARCITY_RE = /\b(?:sells? out|sold out|selling (?:out|fast)|before (?:they|it)(?:'re| are| is)? (?:gone|sell out|sold out)|only \S+ left|limited (?:batch|stock|run|edition|time|supply)|almost gone|last chance|won'?t last|while (?:supplies|stocks?) last|running out|few left|once (?:they'?re|it'?s) gone)\b/i
const TIMING_RE = /\b(?:this (?:week|weekend|month)|today only|tonight only|ends (?:today|tonight|tomorrow|soon)|this (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|right now only|just (?:announced|launched|dropped)|next (?:week|month)'?s)\b/i
const POSSESSIVE_RE = /\b(?:my|our)\s+((?:[a-z'-]+\s+){0,2}[a-z'-]+)/gi

const share = (a: Set<string>, b: Set<string>) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n }

export interface GuardContext {
  ledger: readonly LedgerItem[]
  targetProductId?: string | null
}

function backedByHer(sentence: string, ctx: GuardContext): boolean {
  const ws = contentWords(sentence)
  return ctx.ledger.some((it) => FIRST_PARTY.has(it.origin) && it.first_party && it.text.trim() && share(ws, contentWords(it.text)) >= 2)
}

/** Content words of outside items' NAMES (their first six words) that none of her own items use. */
function outsideOnlyWords(ctx: GuardContext): Set<string> {
  const hers = new Set<string>()
  for (const it of ctx.ledger) if (FIRST_PARTY.has(it.origin) || it.origin === 'urgency') for (const w of contentWords(it.text)) hers.add(w)
  const out = new Set<string>()
  for (const it of ctx.ledger) {
    if (!OUTSIDE.has(it.origin)) continue
    const name = it.text.trim().split(/\s+/).slice(0, 6).join(' ')
    for (const w of contentWords(name)) if (!hers.has(w)) out.add(w)
  }
  return out
}

const PRODUCT_PRONOUN_LEAD_RE = /^(?:it|this(?: one)?|that(?: one)?|this (?:tool|thing|product|kit|set))\b/i

/** A sentence that describes an outside item's thing as the one she is showing:
 *  it opens on "it/this", shares 3+ content words with one outside item, and
 *  nothing of hers backs it. */
function describesOutsideThing(t: string, ctx: GuardContext): boolean {
  if (!PRODUCT_PRONOUN_LEAD_RE.test(t.trim())) return false
  const ws = contentWords(t)
  return ctx.ledger.some((it) => OUTSIDE.has(it.origin) && share(ws, contentWords(it.text)) >= 3) && !backedByHer(t, ctx)
}

/** The first rule a sentence breaks, or null. */
export function sentenceRule(sentence: string, ctx: GuardContext, outsideOnly: Set<string> = outsideOnlyWords(ctx)): GuardRule | null {
  const t = sentence.trim()
  if (!t) return null
  if (isScaffoldText(t)) return 'scaffold'
  if (SCARCITY_RE.test(t) && !ctx.ledger.some((it) => it.origin === 'urgency' && it.live)) return 'scarcity_not_live'
  if (TIMING_RE.test(t) && !ctx.ledger.some((it) => (it.origin === 'urgency' && it.live) || ((it.first_party || it.live) && hasEventDate(it.text)))) return 'timing_undated'
  if (FIRST_PERSON_FACT_RE.test(t) && !backedByHer(t, ctx)) return 'first_person_unbacked'
  for (const m of t.matchAll(POSSESSIVE_RE)) {
    const owned = contentWords(m[1] ?? '')
    if ([...owned].some((w) => outsideOnly.has(w))) return 'outside_as_hers'
  }
  if (describesOutsideThing(t, ctx)) return 'outside_as_hers'
  return null
}

const sentencesOf = (s: string) => (s.match(/[^.!?]+[.!?]*["”')]*/g) ?? []).map((x) => x.trim()).filter(Boolean)

export interface GuardRecord {
  version: string
  dropped_sentences: number
  dropped_lines: number
  dropped_hooks: number
  rules: Partial<Record<GuardRule, number>>
}

export interface GuardBeat { line?: unknown; [k: string]: unknown }

/** Drop every sentence (and every hook option) that breaks a guard. Empty beats are removed. */
export function guardScript(input: { script: readonly GuardBeat[]; hook_options?: readonly unknown[] } & GuardContext): { script: GuardBeat[]; hook_options: string[]; record: GuardRecord } {
  const outsideOnly = outsideOnlyWords(input)
  const rules: Partial<Record<GuardRule, number>> = {}
  const hit = (r: GuardRule) => { rules[r] = (rules[r] ?? 0) + 1 }
  let droppedSentences = 0
  let droppedLines = 0
  const script: GuardBeat[] = []
  for (const b of input.script) {
    const line = String(b?.line ?? '')
    if (!line.trim()) { script.push({ ...b }); continue }
    const kept = sentencesOf(line).filter((s) => {
      const r = sentenceRule(s, input, outsideOnly)
      if (r) { hit(r); droppedSentences++ }
      return !r
    })
    if (!kept.length) { droppedLines++; continue }
    script.push({ ...b, line: kept.join(' ') })
  }
  let droppedHooks = 0
  const hooks: string[] = []
  for (const h of input.hook_options ?? []) {
    if (typeof h !== 'string') continue
    const r = sentencesOf(h).map((s) => sentenceRule(s, input, outsideOnly)).find(Boolean) ?? null
    if (r) { hit(r); droppedHooks++; continue }
    hooks.push(h)
  }
  return { script, hook_options: hooks, record: { version: WRITER_GUARDS_VERSION, dropped_sentences: droppedSentences, dropped_lines: droppedLines, dropped_hooks: droppedHooks, rules } }
}

// ── PICKED HOOKS SHIP ───────────────────────────────────────────────────────

/** The engine's picked hooks lead hook_options, and the first one becomes the
 *  first sentence of script line 1 (the rest of line 1 is kept). Nothing new is
 *  written: the picks are the writer's own candidates that passed the engine.
 *  `hook_moves` (parallel to hook_options) is kept aligned: a pick takes its
 *  given move id, a kept option keeps its own. */
export function applyHookPick(input: {
  script: readonly GuardBeat[]
  hook_options: readonly unknown[]
  picked: readonly string[]
  hook_moves?: readonly unknown[] | null
  picked_moves?: readonly (string | null)[]
}): { script: GuardBeat[]; hook_options: string[]; hook_moves: (string | null)[] | null; applied: boolean } {
  const picked = input.picked.map((h) => String(h ?? '').trim())
  const keepPick = picked.map((h, i) => ({ h, m: input.picked_moves?.[i] ?? null })).filter((x) => x.h)
  const prior = input.hook_options.map((h, i) => ({ h: typeof h === 'string' ? h : '', m: (input.hook_moves?.[i] as string | null | undefined) ?? null })).filter((x) => x.h)
  const hasMoves = Array.isArray(input.hook_moves)
  if (!keepPick.length) return { script: input.script.map((b) => ({ ...b })), hook_options: prior.map((x) => x.h), hook_moves: hasMoves ? prior.map((x) => x.m) : null, applied: false }
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  // ⚠️ PANEL-6 (#14): the same line arrived twice (a story-open candidate and
  // the writer's own), and both shipped. Picks first, then options, each text once.
  const seen = new Set<string>()
  const merged = [...keepPick, ...prior].filter((x) => { const k = norm(x.h); if (!k || seen.has(k)) return false; seen.add(k); return true })
  const script = input.script.map((b) => ({ ...b }))
  const lead = keepPick[0]!.h
  const first = script.findIndex((b) => String(b?.line ?? '').trim())
  if (first >= 0) {
    const ss = sentencesOf(String(script[first]!.line))
    const rest = ss.slice(1).filter((s) => norm(s) !== norm(lead))
    script[first] = { ...script[first], line: [lead, ...rest].join(' ') }
  } else {
    script.unshift({ line: lead, section: 'Hook' })
  }
  // ⚠️ PANEL-6: line 2 restated the picked hook that now opens line 1. A later
  // sentence that repeats the hook (same words, or 80%+ of its words) is
  // dropped; a beat left empty goes with it.
  const lw = new Set(norm(lead).split(' ').filter((w) => w.length > 2))
  const repeats = (x: string) => {
    const n = norm(x)
    if (!n) return false
    if (n === norm(lead)) return true
    const xw = n.split(' ').filter((w) => w.length > 2)
    if (!xw.length || !lw.size) return false
    const hit = xw.filter((w) => lw.has(w)).length
    return hit / Math.max(lw.size, xw.length) >= 0.8
  }
  const at = script.findIndex((b) => String(b?.line ?? '').trim())
  for (let i = at + 1; i < script.length; i++) {
    const ss = sentencesOf(String(script[i]!.line ?? ''))
    const kept = ss.filter((x) => !repeats(x))
    if (kept.length !== ss.length) script[i] = { ...script[i], line: kept.join(' ') }
  }
  for (let i = script.length - 1; i > at; i--) if (typeof script[i]!.line === 'string' && !String(script[i]!.line).trim()) script.splice(i, 1)
  return { script, hook_options: merged.map((x) => x.h), hook_moves: hasMoves ? merged.map((x) => x.m) : null, applied: true }
}

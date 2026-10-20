// CHECK THIS LINE (backlog item d; trial only, behind a kill switch).
//
// A gate REVIEW line ships as written: only one judge flagged an invention, or
// a rule (RULE_REVIEW_REASONS) sent it to review. The creator is asked to check
// it: CONFIRM (it is true for her, so it is saved as her fact and the line
// stays), EDIT (her text replaces the line, then the deterministic guards run
// on it) or REMOVE (the line is dropped).
//
// Pure: no I/O, no model call. The worker builds `blueprint.check_lines` after
// the gate (`buildCheckLines`); the edge applies a decision
// (`applyCheckLineDecision`) and does the writes. Records and logs hold the
// line index, the reason id and offsets, never text.
import { extractSentences, parseNumbers, type GateBlueprint, type GateReason, type LedgerItem, type Surface } from './inventionGate.js'

export const CHECK_LINES_VERSION = 'check-lines-v1'
export type CheckLineDecision = 'confirm' | 'edit' | 'remove'
export const CHECK_LINE_DECISIONS: readonly CheckLineDecision[] = ['confirm', 'edit', 'remove']
/** Her edited line, at most (a spoken line, not an essay). */
export const CHECK_LINE_TEXT_MAX = 400

export interface CheckLine {
  /** Index into blueprint.script. */
  line_index: number
  /** The gate reason id (targeted flags: the deterministic risk id). */
  reason: GateReason | TargetedReason | 'unknown'
  /** The offending sentence's offsets inside the line text. */
  span: { start: number; end: number }
  /** Set once she decides. */
  decision?: CheckLineDecision
}

export interface CheckLineRecord {
  line_index: number
  decision: CheckLineDecision
  reason: GateReason | TargetedReason | 'unknown'
  at: string
  /** edit only: guard rule ids that trimmed her text (ids, never text). */
  guard_rules?: string[]
}

type ReviewLine = { i: number; surface: Surface; reason?: GateReason }
type Beat = { line?: unknown; [k: string]: unknown }

const scriptOf = (bp: Record<string, unknown>): Beat[] => (Array.isArray(bp.script) ? bp.script as Beat[] : [])

/** The script REVIEW lines of a gated blueprint, one per sentence, in order.
 *  Non-script surfaces are not offered (they paraphrase a script line). */
export function buildCheckLines(bp: GateBlueprint, review: readonly ReviewLine[] | null | undefined): CheckLine[] {
  if (!review?.length) return []
  const sentences = extractSentences(bp)
  const script = scriptOf(bp as Record<string, unknown>)
  const out: CheckLine[] = []
  for (const r of review) {
    if (r.surface !== 'script') continue
    const s = sentences[r.i]
    if (!s || s.surface !== 'script') continue
    const line = String(script[s.at]?.line ?? '')
    const start = line.indexOf(s.text)
    if (start < 0) continue
    out.push({ line_index: s.at, reason: r.reason ?? 'unknown', span: { start, end: start + s.text.length } })
  }
  return out
}

/** Log shape for check_lines: indices, reasons and offsets only. */
export function checkLinesLog(lines: readonly CheckLine[]): Array<{ line_index: number; reason: string; start: number; end: number }> {
  return lines.map((l) => ({ line_index: l.line_index, reason: l.reason, start: l.span.start, end: l.span.end }))
}

export interface DecisionInput {
  blueprint: Record<string, unknown>
  line_index: unknown
  decision: unknown
  text?: unknown
  /** The deterministic guards on one line: returns the kept text ('' = all dropped) and the rule ids hit. */
  guard: (line: string) => { line: string; rules: string[] }
  now?: string
}

export type DecisionResult =
  | { ok: true; blueprint: Record<string, unknown>; decision: CheckLineDecision; line_index: number; reason: string; fact: string | null; line: string | null }
  | { ok: false; code: 'bad_decision' | 'bad_index' | 'not_a_check_line' | 'already_decided' | 'text_required' | 'text_too_long' | 'guard_dropped'; rules?: string[] }

/** Apply one decision to a blueprint. Returns a NEW blueprint; the input is not mutated.
 *  confirm → the line stays, `fact` is the sentence she confirmed (to save as hers);
 *  edit    → her text (after the guards) replaces the line;
 *  remove  → the beat is dropped and later check lines shift down. */
export function applyCheckLineDecision(input: DecisionInput): DecisionResult {
  const decision = input.decision as CheckLineDecision
  if (!CHECK_LINE_DECISIONS.includes(decision)) return { ok: false, code: 'bad_decision' }
  const idx = input.line_index
  if (!Number.isInteger(idx) || (idx as number) < 0) return { ok: false, code: 'bad_index' }
  const bp = input.blueprint
  const script = scriptOf(bp)
  const lines = Array.isArray(bp.check_lines) ? bp.check_lines as CheckLine[] : []
  const pending = lines.filter((l) => l?.line_index === idx)
  if (!pending.length || !script[idx as number]) return { ok: false, code: 'not_a_check_line' }
  if (pending.every((l) => l.decision)) return { ok: false, code: 'already_decided' }
  const reason = pending[0]!.reason
  const at = input.now ?? new Date().toISOString()
  const i = idx as number
  const lineText = String(script[i]!.line ?? '')
  let nextScript = script
  let nextLines: CheckLine[] = lines.map((l) => (l?.line_index === i ? { ...l, decision } : l))
  let fact: string | null = null
  let line: string | null = lineText
  let guardRules: string[] | undefined
  if (decision === 'confirm') {
    fact = pending.map((l) => lineText.slice(l.span.start, l.span.end)).join(' ').trim() || lineText.trim()
  } else if (decision === 'edit') {
    if (typeof input.text !== 'string' || !input.text.trim()) return { ok: false, code: 'text_required' }
    const typed = input.text.trim().replace(/\s+/g, ' ')
    if (typed.length > CHECK_LINE_TEXT_MAX) return { ok: false, code: 'text_too_long' }
    const g = input.guard(typed)
    if (!g.line.trim()) return { ok: false, code: 'guard_dropped', rules: g.rules }
    if (g.rules.length) guardRules = g.rules
    line = g.line.trim()
    nextScript = script.map((b, k) => (k === i ? { ...b, line } : b))
  } else {
    line = null
    nextScript = script.filter((_, k) => k !== i)
    nextLines = nextLines.map((l) => (l && l.line_index > i ? { ...l, line_index: l.line_index - 1 } : l))
  }
  // Earlier decisions on later lines shift with a removal, like the lines do.
  const prior = (Array.isArray(bp.check_line_decisions) ? bp.check_line_decisions as CheckLineRecord[] : [])
    .map((d) => (decision === 'remove' && d && d.line_index > i ? { ...d, line_index: d.line_index - 1 } : d))
  const rec: CheckLineRecord = { line_index: i, decision, reason, at, ...(guardRules ? { guard_rules: guardRules } : {}) }
  return {
    ok: true,
    blueprint: { ...bp, script: nextScript, check_lines: nextLines, check_line_decisions: [...prior, rec] },
    decision, line_index: i, reason, fact, line,
  }
}

/** The knowledge source a confirmed check line is saved under. */
export const CHECK_LINE_SOURCE = 'check_line'

/** The kill switch: on unless the edge env CHECK_LINE_KILL is exactly '1'. */
export function checkLineOn(kill: unknown): boolean {
  return String(kill ?? '').trim() !== '1'
}

// ── TARGETED CHECK-THIS-LINE (plan v5.4 §20; trial only, kill TARGETED_FLAGS=false) ──
//
// Panel 8: of 67 flagged lines 2 were invented (3%), 33 embellished, 22 true and
// 10 made no claim, and one of the two invented lines was MISSED (an absolute
// efficacy claim). A line is now flagged ONLY for a deterministic risk:
//   absolute_efficacy  "stops … completely", "changes everything", "eliminates", "guaranteed"
//   invented_team      "our team" with no team item of hers
//   invented_origin    "why I run/created X" with no origin item of hers
//   invented_habit     "every weekday morning" / "always" (first person) with no item saying so
//   scarcity_unbacked  "sells out", "limited", "almost gone" with no live fact
//   unbacked_number    a number no item holds
//   unbacked_name      a proper name no item holds
// and NEVER when the line is verbatim hers (>= VERBATIM_MIN to one first-party
// item; her onboarding answers and pillars are first-party items). Every
// script sentence is read, not only gate review lines. Generic advice is no
// longer flagged. Pure; no model call.

export type TargetedReason =
  | 'absolute_efficacy' | 'invented_team' | 'invented_origin' | 'invented_habit'
  | 'unbacked_number' | 'unbacked_name' | 'scarcity_unbacked'
export const TARGETED_FLAGS_VERSION = 'targeted-flags-v1'
/** A line this close to one first-party item is hers and is never flagged. */
export const VERBATIM_MIN = 0.9

export type TargetedItem = Pick<LedgerItem, 'text' | 'first_party' | 'live'> & { numbers?: LedgerItem['numbers'] }

const wordsOf = (t: string): string[] => t.toLowerCase().replace(/’/g, "'").match(/[a-z0-9$][a-z0-9'$%.]*[a-z0-9%]|[a-z0-9]/g) ?? []

/** A line may wrap her whole item in at most this many extra words ("Here is the thing, …"). */
export const VERBATIM_WRAP_MAX = 4

function pairShare(a: readonly string[], b: readonly string[]): number {
  if (!a.length || !b.length) return 0
  if (a.length < 3) { const set = new Set(b); return a.filter((w) => set.has(w)).length / a.length }
  const grams = new Set<string>()
  for (let k = 0; k + 1 < b.length; k++) grams.add(`${b[k]} ${b[k + 1]}`)
  let hit = 0
  for (let k = 0; k + 1 < a.length; k++) if (grams.has(`${a[k]} ${a[k + 1]}`)) hit++
  return hit / (a.length - 1)
}

/** How verbatim the line is to one item: the share of the line's adjacent word
 *  pairs the item holds; or, when the line says her WHOLE item with at most
 *  VERBATIM_WRAP_MAX extra words, the share of the item's pairs the line holds. */
export function verbatimScore(line: string, item: string): number {
  const a = wordsOf(line), b = wordsOf(item)
  const inItem = pairShare(a, b)
  return a.length - b.length <= VERBATIM_WRAP_MAX && b.length >= 3 ? Math.max(inItem, pairShare(b, a)) : inItem
}

/** Is this line verbatim hers (>= VERBATIM_MIN to one first-party item)? */
export function isVerbatimHers(line: string, items: readonly TargetedItem[]): boolean {
  return items.some((it) => it.first_party && verbatimScore(line, it.text) >= VERBATIM_MIN)
}

export const ABSOLUTE_EFFICACY_RE = /\b(?:stops|stopped|ends|fixes|kills|solves|prevents|removes|cures)\b[^.!?]{0,60}?\b(?:completely|entirely|for good|forever|permanently|every single time|once and for all)\b|\bchanges? everything\b|\bevery single time\b|\beliminat(?:e|es|ed|ing)\b|\bnever again\b|\bguarantee(?:s|d)?\b|\bworks every time\b|\bwithout fail\b|\b100 ?(?:%|percent)\b/i
const TEAM_RE = /\b(?:our|my) (?:team|staff|crew|employees|editors|writers|researchers|testers)\b|\bwe(?:'ve| have) (?:a team|hired)\b/i
const TEAM_ITEM_RE = /\b(?:our|my) (?:team|staff|crew|employees|editors|writers|researchers|testers)\b|\bteam of\b|\bwe hired\b/i
const ORIGIN_CLAIM_RE = /\bwhy (?:i|we) (?:run|started|start|created|create|built|build|founded|launched|made|make|began)\b|\b(?:that|this)(?:'s| is) (?:why|how) (?:i|we) (?:started|created|built|founded|launched|began)\b|\bwhy [A-Z][\w'’]*(?: [A-Z][\w'’]*)* exists\b/i
const ORIGIN_ITEM_RE = /\b(?:started|built|founded|launched|created|began|opened)\b|\b(?:made|wrote|threw|roasted|sold|sent) (?:the|my|our) first\b|\b(?:that|this)(?:'s| is) why (?:i|we)\b|\bfirst version\b/i
const FREQ_RE = /\bevery (?:single )?(weekday|weekend|morning|evening|night|day|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b|\b(always)\b|\b(daily)\b/i
const FIRST_PERSON_RE = /\b(?:i|we|our|my|me|us)\b|\b(?:people|customers|buyers|everyone|they|clients) always\b/i
const SCARCITY_RE = /\bsells? out\b|\bselling out\b|\bselling fast\b|\blimited (?:stock|time|edition|run|spots?|batch(?:es)?)\b|\bonly \d+ left\b|\bwhile (?:stocks?|supplies) last\b|\b(?:almost|nearly) gone\b|\bbefore (?:it'?s|they'?re) gone\b|\blast chance\b/i
const NAME_SKIP = new Set(['i', "i'm", "i've", "i'll", "i'd", 'ok', 'okay', 'ai', 'tv', 'diy', 'faq', 'ceo', 'pm', 'am'])
/** A spelled-out count up to this, with no unit, is phrasing ("two people"), not a claim. */
const SMALL_COUNT_MAX = 10

function herItemHas(items: readonly TargetedItem[], re: RegExp): boolean { return items.some((it) => it.first_party && re.test(it.text)) }

/** Capitalised words mid-sentence (proper-name candidates), lower-cased. */
export function properNames(text: string): string[] {
  const toks = text.split(/\s+/)
  const out: string[] = []
  // Title Case or ALL CAPS text (an overlay, a title) says nothing about names.
  const capped = toks.filter((w) => /^[^a-z]*[A-Z]/.test(w)).length
  if (toks.length >= 2 && capped / toks.length >= 0.6) return out
  toks.forEach((raw, k) => {
    const w = raw.replace(/^[("'“‘]+|[)"'”’.,;:!?—–-]+$/g, '')
    if (k === 0 || !/^[A-Z][A-Za-z'’]*[A-Za-z]$|^[A-Z]{2,}$/.test(w)) return
    if (/[.!?:]["”’)]*$/.test(toks[k - 1] ?? '')) return
    const lw = w.toLowerCase().replace(/’/g, "'")
    if (NAME_SKIP.has(lw)) return
    out.push(lw.replace(/'s$/, ''))
  })
  return out
}

/** The deterministic risk of one script sentence, or null (not flagged). */
export function targetedRisk(text: string, items: readonly TargetedItem[]): TargetedReason | null {
  const t = String(text ?? '').trim()
  if (!t || isVerbatimHers(t, items)) return null
  if (ABSOLUTE_EFFICACY_RE.test(t)) return 'absolute_efficacy'
  if (TEAM_RE.test(t) && !herItemHas(items, TEAM_ITEM_RE)) return 'invented_team'
  if (ORIGIN_CLAIM_RE.test(t) && !herItemHas(items, ORIGIN_ITEM_RE)) return 'invented_origin'
  const f = t.match(FREQ_RE)
  if (f && FIRST_PERSON_RE.test(t)) {
    const key = (f[1] ?? f[2] ?? f[3] ?? '').toLowerCase()
    if (key && !herItemHas(items, new RegExp(`\\b${key}`, 'i'))) return 'invented_habit'
  }
  // Present-tense scarcity needs a live fact; her past story ("I sold out at my first stall") is not one.
  if (SCARCITY_RE.test(t) && !items.some((it) => it.live)) return 'scarcity_unbacked'
  const spelledSmall = (v: number, u: string) => u === 'count' && v <= SMALL_COUNT_MAX && !new RegExp(`\\b${v}\\b`).test(t)
  const nums = parseNumbers(t).filter((n) => !spelledSmall(n.value, n.unit))
  if (nums.length) {
    const have = new Set<number>()
    for (const it of items) for (const n of it.numbers ?? parseNumbers(it.text)) have.add(n.value)
    if (nums.some((n) => !have.has(n.value))) return 'unbacked_number'
  }
  const names = properNames(t)
  if (names.length) {
    const all = new Set(items.flatMap((it) => wordsOf(it.text)).map((w) => w.replace(/'s$/, '')))
    const known = (n: string) => all.has(n) || all.has(`${n}s`) || all.has(n.replace(/s$/, ''))
    if (names.some((n) => !known(n))) return 'unbacked_name'
  }
  return null
}

/** Targeted check lines: every script sentence with a deterministic risk. */
export function buildTargetedCheckLines(bp: GateBlueprint, items: readonly TargetedItem[]): CheckLine[] {
  const script = scriptOf(bp as Record<string, unknown>)
  const out: CheckLine[] = []
  for (const s of extractSentences(bp)) {
    if (s.surface !== 'script') continue
    const reason = targetedRisk(s.text, items)
    if (!reason) continue
    const line = String(script[s.at]?.line ?? '')
    const start = line.indexOf(s.text)
    if (start < 0) continue
    out.push({ line_index: s.at, reason, span: { start, end: start + s.text.length } })
  }
  return out
}

/** Kill switch (worker env TARGETED_FLAGS): on unless exactly 'false'. */
export function targetedFlagsOn(flag: unknown): boolean {
  return String(flag ?? '').trim().toLowerCase() !== 'false'
}

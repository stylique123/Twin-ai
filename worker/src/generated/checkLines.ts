// GENERATED FROM packages/shared/src/script/checkLines.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
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
import { extractSentences, parseNumbers, contentWords, type GateBlueprint, type GateReason, type LedgerItem, type Surface } from './inventionGate.js'

export const CHECK_LINES_VERSION = 'check-lines-v1'
export type CheckLineDecision = 'confirm' | 'edit' | 'remove'
export const CHECK_LINE_DECISIONS: readonly CheckLineDecision[] = ['confirm', 'edit', 'remove']
/** Her edited line, at most (a spoken line, not an essay). */
export const CHECK_LINE_TEXT_MAX = 400

export interface CheckLine {
  /** Index into blueprint.script. */
  line_index: number
  /** The gate reason id (targeted flags: the deterministic risk id). */
  reason: GateReason | TargetedReasonV2 | 'unknown'
  /** The offending sentence's offsets inside the line text. */
  span: { start: number; end: number }
  /** Set once she decides. */
  decision?: CheckLineDecision
}

export interface CheckLineRecord {
  line_index: number
  decision: CheckLineDecision
  reason: GateReason | TargetedReasonV2 | 'unknown'
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

// ── TARGETED FLAGS v2 (plan v5.4 §20 follow-up; trial only, kill TARGETED_FLAGS_V2=false) ──
//
// Panel 10: v1 UNDER-flagged. 1 flag in 24 scripts, and it was false ("one
// week" read as a number her "a week" did not hold); all 3 invented lines were
// missed (a fact of one product said about another, an invented inner
// thought, "you never double reply again"). v2 keeps every v1 rule and adds:
//   absolute_efficacy        + "never … again", "every single <noun>", "always" (claim), "completely" (outcome)
//   invented_inner_state     "my first instinct was", "I thought/realized/learned/felt/knew" with no item saying so
//   wrong_product            a line naming product A that uses a fact only product B holds (BLOCKED, not asked)
//   unbacked_timeframe       a timeframe or frequency no item holds ("week two", "every week", "in five seconds"),
//                            with tolerant normalisation ("one week" = "a week" ≈ "seven days")
//   unsourced_generalisation "a lot of advice says", "most people", "everyone" with no item saying it
// A line verbatim hers (>= VERBATIM_MIN, onboarding answers included) is
// still never flagged. The same patterns gate HOOK candidates before the pick
// (hookClaimRisk; kill HOOK_CLAIM_GATE=false). Pure; no model call.

export type TargetedReasonV2 = TargetedReason | 'invented_inner_state' | 'wrong_product' | 'unbacked_timeframe' | 'unsourced_generalisation'
export const TARGETED_FLAGS_V2_VERSION = 'targeted-flags-v2'
/** A ledger item; `product_id` ties a product fact to its product (product_entities.id). */
export type TargetedItemV2 = TargetedItem & { product_id?: string | null; origin?: string }
export type TargetedProduct = { id: string; name: string }

const lc = (t: string) => t.toLowerCase().replace(/[’‘]/g, "'")
const herItems = (items: readonly TargetedItemV2[]) => items.filter((it) => it.first_party)
const anyItemHas = (items: readonly TargetedItemV2[], re: RegExp) => items.some((it) => re.test(lc(it.text)))

// Absolute efficacy, v2 additions. Each is cleared when an item of hers says the same absolute.
const ABSOLUTE_V2: Array<[RegExp, RegExp]> = [
  [/\bnever\b[^.!?]{0,50}?\bagain\b/i, /\bnever\b[^.!?]{0,50}?\bagain\b/],
  [/\bevery single (?!time\b)[a-z]+/i, /\bevery (?:single )?/],
  [/\b(?:works?|fix(?:es)?|solves?|stops?|ends?|keeps?|helps?|removes?|prevents?)\b[^.!?]{0,40}?\bcompletely\b|\bcompletely (?:fix|solve|stop|end|remove|prevent|eliminate|cure|transform)/i, /\bcompletely\b/],
  [/\b(?:it|this|that|they|these|you(?:'ll)?|which) always (?:work|works|fix|fixes|stop|stops|help|helps|solve|solves|get|gets)\b/i, /\balways\b/],
]
const INNER_RE = /\bmy (?:first )?(?:instinct|thought|reaction|gut|worry|fear) was\b|\bi (?:thought|realized|realised|learned|learnt|felt|knew|assumed|panicked|wondered)\b|\bi was (?:sure|convinced|terrified|shocked|thrilled)\b/i
function innerKey(m: string): RegExp {
  const w = lc(m).replace(/\s+/g, ' ')
  const own = w.match(/^my (?:first )?([a-z]+) was$/)
  return new RegExp(`\\b${own ? own[1] : w}\\b`)
}
/** The thought itself is hers ("I learned that X" where X is her item): only the framing is new. */
function innerIsHers(rest: string, mine: readonly TargetedItemV2[]): boolean {
  const r = contentWords(rest)
  if (r.size < 3) return false
  return mine.some((it) => { const w = contentWords(it.text); let hit = 0; for (const x of r) if (w.has(x)) hit++; return hit / r.size >= 0.6 })
}
/** Unsourced generalisations on a script line: an appeal to what "advice" or "everyone" says. */
const GENERAL_RE = /\ba lot of (?:advice|experts|coaches|guides) (?:says?|tells?|claims?|insists?|blames?)\b|\beveryone (?:says|tells you|knows|agrees)\b|\b(?:experts|studies|research) (?:say|says|show|shows|agree|prove|proves)\b/i
/** A hook stands alone, so it is also read for "a lot of advice/routines …" and "most people …". */
const HOOK_GENERAL_RE = /\b(?:so many|dozens of|hundreds of|thousands of)\b|\ba lot of (?:advice|people|experts|coaches|creators|guides)\b|\bmost (?:people|beginners|creators|founders|teams|experts)\b|\beveryone\b/i

// ── tolerant timeframes ──
const UNIT_DAYS: Record<string, number> = { second: 1 / 86400, sec: 1 / 86400, minute: 1 / 1440, min: 1 / 1440, hour: 1 / 24, hr: 1 / 24, day: 1, night: 1, week: 7, fortnight: 14, month: 30, year: 365 }
const UNIT_ALT = 'seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|nights?|weeks?|fortnights?|months?|years?'
const unitDays = (u: string): number | null => UNIT_DAYS[u.toLowerCase().replace(/s$/, '')] ?? null
const TIME_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90, a: 1, an: 1, single: 1 }
const NUM_ALT = `\\d+(?:\\.\\d+)?|${Object.keys(TIME_WORDS).join('|')}|half an?|half a|couple of|few`
const qty = (q: string): number => {
  const w = q.toLowerCase()
  return /^\d/.test(w) ? Number(w) : w.startsWith('half') ? 0.5 : w === 'couple of' ? 2 : w === 'few' ? 3 : TIME_WORDS[w] ?? 1
}
// "a week", "one week", "seven days", "14-day"; "week two" (an ordinal: which week, not how long); "overnight".
const TIME_RE = () => new RegExp(`\\b(${NUM_ALT})[\\s-]+(?:more\\s+|full\\s+|whole\\s+)?(${UNIT_ALT})\\b|\\b(day|week|month|year)\\s+(${NUM_ALT})\\b|\\bovernight\\b`, 'gi')
export interface Timeframe { days: number; ordinal: boolean }
/** Every timeframe a text states, in days: "a week" = "one week" = 7 ≈ "seven days";
 *  "week two" is ordinal 14 (only an ordinal backs it); "overnight" = 1. */
export function timeframesOf(text: string): Timeframe[] {
  const out: Timeframe[] = []
  for (const m of String(text ?? '').matchAll(TIME_RE())) {
    if (/^overnight$/i.test(m[0])) { out.push({ days: 1, ordinal: false }); continue }
    if (m[3]) { const d = unitDays(m[3]); if (d != null && !/^(?:a|an|single)$/i.test(m[4]!)) out.push({ days: qty(m[4]!) * d, ordinal: true }); continue }
    const d = unitDays(m[2]!)
    if (d != null) out.push({ days: qty(m[1]!) * d, ordinal: false })
  }
  return out
}
/** Within 15% is the same timeframe ("seven days" ≈ "a week"). */
const sameTime = (a: Timeframe, b: Timeframe) => a.ordinal === b.ordinal && Math.abs(a.days - b.days) <= 0.15 * Math.max(a.days, b.days)
const FREQ_V2_RE = new RegExp(`\\bevery (?:single |other )?(${UNIT_ALT}|weekday|weekend|morning|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b`, 'i')
function freqBacked(key: string, items: readonly TargetedItemV2[]): boolean {
  const adj = ({ day: 'daily', week: 'weekly', month: 'monthly', night: 'nightly', year: 'yearly', hour: 'hourly' } as Record<string, string>)[key]
  return items.some((it) => {
    const t = lc(it.text)
    // "on Mondays" backs "every Monday"; "two weeks" does not back "every week".
    const plural = /day$/.test(key) && key !== 'day' ? `|\\b(?:on )?${key}s\\b` : ''
    return new RegExp(`\\bevery (?:single |other )?${key}s?\\b${plural}`).test(t) || (!!adj && new RegExp(`\\b${adj}\\b`).test(t))
  })
}
/** Timeframe phrases out, so v1 does not re-read "one week" as a bare number. */
const stripTimeframes = (t: string) => t.replace(TIME_RE(), 'a while')

/** The product a line names (by its product name), or null. Longest name wins. */
export function namedProduct(text: string, products: readonly TargetedProduct[]): TargetedProduct | null {
  const t = lc(text)
  let best: TargetedProduct | null = null
  for (const p of products) {
    const n = lc(String(p?.name ?? '').trim())
    if (n.length < 3 || !new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t)) continue
    if (!best || n.length > best.name.length) best = p
  }
  return best
}
function factShare(line: Set<string>, fact: string): { share: number; size: number } {
  const f = contentWords(fact)
  if (!f.size) return { share: 0, size: 0 }
  let hit = 0
  for (const w of f) if (line.has(w)) hit++
  return { share: hit / f.size, size: f.size }
}
/** A product fact is "used" by a line holding this share of its content words. */
export const WRONG_PRODUCT_SHARE = 0.6
/** WRONG-PRODUCT ATTRIBUTION: the line names product A and uses a fact only
 *  product B holds (no item outside B says the same). Returns B's id, or null.
 *  Needs product ids on the ledger's product facts (LedgerItem.product_id). */
export function wrongProductOf(text: string, items: readonly TargetedItemV2[], products: readonly TargetedProduct[]): string | null {
  const a = namedProduct(text, products)
  if (!a) return null
  const line = contentWords(text)
  for (const it of items) {
    const pid = it.product_id
    if (!pid || pid === a.id || (it.origin && it.origin !== 'product_fact')) continue
    const { share, size } = factShare(line, it.text)
    if (size < 3 || share < WRONG_PRODUCT_SHARE) continue
    const backed = items.some((o) => o !== it && o.product_id !== pid && factShare(contentWords(o.text), it.text).share >= WRONG_PRODUCT_SHARE)
    if (!backed) return pid
  }
  return null
}

/** v2: the deterministic risk of one sentence, or null. `products` maps ids to names. */
export function targetedRiskV2(text: string, items: readonly TargetedItemV2[], products: readonly TargetedProduct[] = [], opts: { hook?: boolean } = {}): TargetedReasonV2 | null {
  const t = String(text ?? '').trim()
  if (!t) return null
  // A product fact said under another product's name is never hers, even word for word.
  if (products.length && wrongProductOf(t, items, products)) return 'wrong_product'
  if (isVerbatimHers(t, items)) return null
  const mine = herItems(items)
  for (const [re, clear] of ABSOLUTE_V2) if (re.test(t) && !anyItemHas(mine, clear)) return 'absolute_efficacy'
  const inner = t.match(INNER_RE)
  if (inner && !anyItemHas(mine, innerKey(inner[0])) && !innerIsHers(t.replace(inner[0], ' '), mine)) return 'invented_inner_state'
  const gen = t.match(GENERAL_RE) ?? (opts.hook ? t.match(HOOK_GENERAL_RE) : null)
  if (gen && !anyItemHas(items, new RegExp(`\\b${lc(gen[0]).split(' ').slice(0, 3).join(' ')}\\b`))) return 'unsourced_generalisation'
  const f = t.match(FREQ_V2_RE)
  if (f && !freqBacked(f[1]!.toLowerCase().replace(/s$/, ''), items)) return 'unbacked_timeframe'
  const times = timeframesOf(t)
  if (times.length) {
    const have = items.flatMap((it) => timeframesOf(it.text))
    if (times.some((d) => !have.some((h) => sameTime(d, h)))) return 'unbacked_timeframe'
  }
  // Product names on file are known names (not first-party text, so never "verbatim hers").
  const names = products.map((p) => ({ text: String(p?.name ?? ''), first_party: false, live: false }))
  return targetedRisk(stripTimeframes(t), [...items, ...names])
}

/** HOOK CLAIM GATE (kill HOOK_CLAIM_GATE=false): the same patterns on a hook
 *  candidate; a matching candidate is dropped before the pick. */
export function hookClaimRisk(text: string, items: readonly TargetedItemV2[], products: readonly TargetedProduct[] = []): TargetedReasonV2 | null {
  return targetedRiskV2(text, items, products, { hook: true })
}

export interface WrongProductBlock { line_index: number; product_id: string }
/** BLOCK (kill WRONG_PRODUCT_BLOCK=false): each script sentence naming product A
 *  with a fact only product B holds is DROPPED (an emptied beat is removed).
 *  Returns a new blueprint and what was dropped (indices and ids, never text). */
export function blockWrongProductLines(bp: GateBlueprint, items: readonly TargetedItemV2[], products: readonly TargetedProduct[]): { blueprint: GateBlueprint; blocked: WrongProductBlock[] } {
  const script = scriptOf(bp as Record<string, unknown>)
  if (!script.length || !products.length) return { blueprint: bp, blocked: [] }
  const blocked: WrongProductBlock[] = []
  const drop = new Map<number, string[]>()
  for (const s of extractSentences(bp)) {
    if (s.surface !== 'script') continue
    const pid = wrongProductOf(s.text, items, products)
    if (!pid) continue
    blocked.push({ line_index: s.at, product_id: pid })
    drop.set(s.at, [...(drop.get(s.at) ?? []), s.text])
  }
  if (!blocked.length) return { blueprint: bp, blocked }
  const next: Beat[] = []
  script.forEach((b, k) => {
    const texts = drop.get(k)
    if (!texts) { next.push(b); return }
    let line = String(b.line ?? '')
    for (const x of texts) line = line.replace(x, '')
    line = line.replace(/\s{2,}/g, ' ').trim()
    if (line) next.push({ ...b, line })
  })
  return { blueprint: { ...bp, script: next }, blocked }
}

/** v2 targeted check lines: every script sentence with a v2 risk. */
export function buildTargetedCheckLinesV2(bp: GateBlueprint, items: readonly TargetedItemV2[], products: readonly TargetedProduct[] = []): CheckLine[] {
  const script = scriptOf(bp as Record<string, unknown>)
  const out: CheckLine[] = []
  for (const s of extractSentences(bp)) {
    if (s.surface !== 'script') continue
    const reason = targetedRiskV2(s.text, items, products)
    if (!reason) continue
    const line = String(script[s.at]?.line ?? '')
    const start = line.indexOf(s.text)
    if (start < 0) continue
    out.push({ line_index: s.at, reason, span: { start, end: start + s.text.length } })
  }
  return out
}

/** Kill switches (worker env TARGETED_FLAGS_V2, WRONG_PRODUCT_BLOCK; edge HOOK_CLAIM_GATE): on unless exactly 'false'. */
export function targetedFlagsV2On(flag: unknown): boolean { return String(flag ?? '').trim().toLowerCase() !== 'false' }
export function wrongProductBlockOn(flag: unknown): boolean { return String(flag ?? '').trim().toLowerCase() !== 'false' }
export function hookClaimGateOn(flag: unknown): boolean { return String(flag ?? '').trim().toLowerCase() !== 'false' }

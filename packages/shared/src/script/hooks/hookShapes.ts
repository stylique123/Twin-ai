// THE HOOK SHAPE LIBRARY AS DATA (hook-and-spine plan, step 1 of the hook engine).
//
// Each shape names the EVIDENCE it needs from the invention-gate ledger, the
// phrases it may never use without backing, and the PROMISE it opens (for the
// promise-ledger check). No evidence, no shape.
//
// ⚖️ DATA + PURE HELPERS ONLY. Nothing here is wired into generation yet.
//
// Extends, never duplicates, the existing hook vocabulary: every shape maps to
// the `HOOK_MOVES` ids (scriptFamily.ts) it refines, and the templates'
// `hook_shapes` (templateData.ts) keep naming HOOK_MOVES ids, so
// `shapesForMove(id)` is the bridge from either list to this one.
//
// Every example below is made up; none is creator or third-party text.

import type { LedgerItem } from '../inventionGate.js'

/** The evidence classes a hook can be backed by, read off ledger items. */
export type EvidenceClass =
  | 'audience_question' // a real question her audience asked
  | 'audience_pain' // a Tier-1 pain-map item (audience item whose field names a pain)
  | 'outside_sourced' // a sourced outside item (research or trend)
  | 'outside_timely' // a dated, live outside moment
  | 'her_number' // her own data: a first-party item carrying a number
  | 'her_stance' // her stance or opinion
  | 'her_story' // her real moment
  | 'product_fact' // a real product fact (price, material, proof)

export type PromiseKind = 'count' | 'reveal' | 'answer' | 'none'

export type ForbiddenRule =
  | 'universal_quantifier' // everyone / nobody / most / all of you without a counted source
  | 'unbacked_percent' // a % or "N in M" with no ledger number behind it
  | 'unbacked_number' // any digit in the hook with no ledger number behind it
  | 'invented_experience' // first-person past experience with no her_story item
  | 'nobody_talks' // "nobody is talking about" — never allowed

export interface HookShape {
  id: string
  name: string
  pattern: string
  /** Made-up example showing the SHAPE only. */
  example: string
  /** Any-of groups: each inner array is satisfied by ONE of its classes; all groups must be met. */
  requires: readonly (readonly EvidenceClass[])[]
  forbidden: readonly ForbiddenRule[]
  promise: PromiseKind
  /** HOOK_MOVES ids (scriptFamily.ts) this shape refines. */
  moves: readonly string[]
}

const BASE_FORBIDDEN: readonly ForbiddenRule[] = ['universal_quantifier', 'unbacked_percent', 'nobody_talks', 'invented_experience']

export const HOOK_SHAPES: readonly HookShape[] = [
  {
    id: 'if_then_check',
    name: 'If-then check',
    pattern: 'If [a real audience situation], check [one thing].',
    example: 'Bread coming out dense? Check how long your starter sat after feeding.',
    requires: [['audience_question', 'audience_pain', 'her_stance', 'outside_sourced']],
    forbidden: [...BASE_FORBIDDEN, 'unbacked_number'],
    promise: 'answer',
    moves: ['buyer_callout', 'question_answered'],
  },
  {
    id: 'stop_doing',
    name: 'Stop-doing',
    pattern: 'Stop [common action] if [situation].',
    example: 'Stop watering succulents on a schedule.',
    requires: [['her_stance', 'outside_sourced']],
    forbidden: [...BASE_FORBIDDEN, 'unbacked_number'],
    promise: 'reveal',
    moves: ['contrarian_order'],
  },
  {
    id: 'contrarian_gap',
    name: 'Contrarian gap',
    pattern: 'A lot of advice says X. Here is the part that gets skipped.',
    example: 'A lot of advice says buy a better camera. Here is what gets skipped.',
    requires: [['outside_sourced'], ['her_stance']],
    forbidden: [...BASE_FORBIDDEN, 'unbacked_number'],
    promise: 'reveal',
    moves: ['contrarian_order', 'insider_credential'],
  },
  {
    id: 'number_promise',
    name: 'Number promise',
    pattern: '[N] things / numbers ... (N deliverable from her data or a sourced report).',
    example: 'Three numbers from my pottery stall this spring, and what each one told me.',
    requires: [['her_number', 'outside_sourced']],
    forbidden: [...BASE_FORBIDDEN],
    promise: 'count',
    moves: ['counted_list', 'shared_list', 'stakes_number'],
  },
  {
    id: 'audience_question',
    name: 'Audience question',
    pattern: '[A real question her audience asked].',
    example: 'Why does my sourdough go flat on day two?',
    requires: [['audience_question']],
    forbidden: [...BASE_FORBIDDEN, 'unbacked_number'],
    promise: 'answer',
    moves: ['question_answered', 'shared_list'],
  },
  {
    id: 'timely',
    name: 'Timely',
    pattern: 'This week, [a verified, dated event]: here is what it means for [her niche].',
    example: 'This week the town market moved to Sundays: here is what that means for stall bakers.',
    requires: [['outside_timely']],
    forbidden: [...BASE_FORBIDDEN, 'unbacked_number'],
    promise: 'reveal',
    moves: ['insider_credential'],
  },
  {
    id: 'price_or_proof',
    name: 'Price or proof',
    pattern: '[Real price] for [real product]. Here is what you get.',
    example: '$24 for a hand-bound notebook. Here is why the spine is stitched.',
    requires: [['product_fact']],
    forbidden: [...BASE_FORBIDDEN],
    promise: 'reveal',
    moves: ['reveal_verdict', 'someone_result'],
  },
  {
    id: 'story_open',
    name: 'Story open',
    pattern: 'The first line of her real moment.',
    example: 'The first time I opened the kiln, half the mugs had cracked.',
    requires: [['her_story']],
    forbidden: ['universal_quantifier', 'unbacked_percent', 'nobody_talks'],
    promise: 'reveal',
    moves: ['confession', 'cold_open', 'mid_step'],
  },
]

export const HOOK_SHAPE_IDS: readonly string[] = HOOK_SHAPES.map((s) => s.id)

export function hookShape(id: string): HookShape | undefined {
  return HOOK_SHAPES.find((s) => s.id === id)
}

/** Shapes refining a HOOK_MOVES id (also the ids templates list as hook_shapes). */
export function shapesForMove(moveId: string): HookShape[] {
  return HOOK_SHAPES.filter((s) => s.moves.includes(moveId))
}

const PAIN_FIELD = /pain|struggle|frustrat|problem/i
const STANCE_FIELD = /stance|opinion|belief|view|take/i

/** Which evidence classes one ledger item supplies. */
export function evidenceClassesOf(it: LedgerItem): EvidenceClass[] {
  const out = new Set<EvidenceClass>()
  const field = it.field ?? ''
  switch (it.origin) {
    case 'audience_question':
      out.add(PAIN_FIELD.test(field) ? 'audience_pain' : 'audience_question')
      break
    case 'niche_note':
      if (PAIN_FIELD.test(field)) out.add('audience_pain')
      break
    case 'outside_research':
      out.add('outside_sourced')
      break
    case 'outside_moment':
      out.add('outside_sourced')
      if (it.live) out.add('outside_timely')
      break
    case 'her_story':
      out.add('her_story')
      break
    case 'product_fact':
    case 'offer':
      out.add('product_fact')
      break
    case 'her_fact':
    case 'her_answer':
      if (STANCE_FIELD.test(field)) out.add('her_stance')
      break
    default:
      break
  }
  if (it.first_party && it.numbers.length > 0 && it.origin !== 'audience_question') out.add('her_number')
  return [...out]
}

export function availableEvidence(ledger: readonly LedgerItem[]): Set<EvidenceClass> {
  const s = new Set<EvidenceClass>()
  for (const it of ledger) for (const c of evidenceClassesOf(it)) s.add(c)
  return s
}

function meets(shape: HookShape, have: Set<EvidenceClass>): EvidenceClass[][] {
  return shape.requires.filter((g) => !g.some((c) => have.has(c))).map((g) => [...g])
}

/** A shape whose line IS a number (a count, a price) needs a number on file to
 *  say. panel-current-5: an undated, number-free outside item made
 *  number_promise eligible, every candidate invented its count, and the script
 *  shipped with 0 passing hooks. */
const NUMBER_SHAPES: Record<string, (it: LedgerItem) => boolean> = {
  number_promise: (it) => it.numbers.length > 0 && it.origin !== 'audience_question' && (it.first_party || it.origin === 'outside_research' || it.origin === 'outside_moment'),
  price_or_proof: (it) => it.numbers.length > 0 && (it.origin === 'product_fact' || it.origin === 'offer'),
}

/** Shapes whose required evidence the ledger holds. No evidence, no shape. */
export function eligibleShapes(ledger: readonly LedgerItem[]): HookShape[] {
  const have = availableEvidence(ledger)
  return HOOK_SHAPES.filter((s) => meets(s, have).length === 0 && (!NUMBER_SHAPES[s.id] || ledger.some(NUMBER_SHAPES[s.id]!)))
}

// ── the cheap rule check ──────────────────────────────────────────────────────

const UNIVERSAL = /\b(everyone|everybody|nobody|no one|most (people|of you|creators|buyers)|all of you|always|never fails)\b/i
const NOBODY_TALKS = /\b(nobody|no one)('s| is)? (talking|talks) about\b/i
const PERCENT = /\b\d+(\.\d+)?\s?%|\b\d+\s+(in|out of)\s+\d+\b/i
const FIRST_PERSON_PAST = /\b(I|we)\s+(was|were|had|did|made|sold|tried|tested|found|built|lost|started|opened|went|learned)\b/i
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 }

/** Numbers spoken in a hook (digits or a small number word). */
export function hookNumbers(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) out.push(Number(m[0]))
  for (const m of text.toLowerCase().matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve)\b/g)) out.push(NUMBER_WORDS[m[1]!]!)
  return out
}

export interface HookCheckIssue { rule: ForbiddenRule | 'missing_evidence' | 'count_unbacked'; detail: string }
export interface HookCheck { ok: boolean; issues: HookCheckIssue[] }

/**
 * Cheap rule check of one hook against one shape: the evidence is present,
 * forbidden phrasings are absent, and a count promise names a number that the
 * ledger backs (or that `delivered` — the count of items the body pays — matches).
 */
export function checkHookAgainstShape(
  hookText: string,
  shape: HookShape,
  ledger: readonly LedgerItem[],
  opts: { delivered?: number } = {},
): HookCheck {
  const issues: HookCheckIssue[] = []
  const have = availableEvidence(ledger)
  for (const g of meets(shape, have)) issues.push({ rule: 'missing_evidence', detail: `needs one of: ${g.join(', ')}` })

  const ledgerNums = new Set(ledger.flatMap((it) => it.numbers.map((n) => n.value)))
  const counted = ledger.some((it) => it.numbers.some((n) => n.unit === 'count' || n.unit === 'percent'))
  const nums = hookNumbers(hookText)
  const backed = (n: number) => ledgerNums.has(n) || opts.delivered === n

  for (const rule of shape.forbidden) {
    switch (rule) {
      case 'nobody_talks':
        if (NOBODY_TALKS.test(hookText)) issues.push({ rule, detail: '"nobody is talking about" is never allowed' })
        break
      case 'universal_quantifier':
        if (UNIVERSAL.test(hookText) && !counted) issues.push({ rule, detail: 'a universal claim with no counted source' })
        break
      case 'unbacked_percent': {
        const m = hookText.match(PERCENT)
        if (m && !hookNumbers(m[0]).every((n) => ledgerNums.has(n))) issues.push({ rule, detail: `"${m[0]}" has no ledger number` })
        break
      }
      case 'unbacked_number':
        for (const n of nums) if (!backed(n)) issues.push({ rule, detail: `${n} has no ledger number` })
        break
      case 'invented_experience':
        if (FIRST_PERSON_PAST.test(hookText) && !have.has('her_story')) issues.push({ rule, detail: 'first-person experience with no story item' })
        break
    }
  }

  if (shape.promise === 'count') {
    if (nums.length === 0) issues.push({ rule: 'count_unbacked', detail: 'a count shape names no number' })
    else if (!nums.some(backed)) issues.push({ rule: 'count_unbacked', detail: `count ${nums[0]} is neither in the ledger nor delivered` })
  }
  return { ok: issues.length === 0, issues }
}

// ── the promise ledger (record type for later wiring) ─────────────────────────

/** What a hook opens and where the script pays it. One per script. */
export interface PromiseLedgerEntry {
  shape_id: string
  kind: PromiseKind
  /** The hook option that opened it (index into hook_options). */
  hook_index: number
  /** For 'count': the promised number. */
  count: number | null
  /** Ledger item ids backing the promise. */
  evidence_ids: string[]
  /** Beat index where it is declared paid; null while unpaid. */
  paid_at_beat: number | null
}

export type PromiseLedger = PromiseLedgerEntry[]

export function promiseEntry(hookText: string, shape: HookShape, hookIndex: number, ledger: readonly LedgerItem[]): PromiseLedgerEntry {
  const need = new Set(shape.requires.flat())
  return {
    shape_id: shape.id,
    kind: shape.promise,
    hook_index: hookIndex,
    count: shape.promise === 'count' ? (hookNumbers(hookText)[0] ?? null) : null,
    evidence_ids: ledger.filter((it) => evidenceClassesOf(it).some((c) => need.has(c))).map((it) => it.id),
    paid_at_beat: null,
  }
}

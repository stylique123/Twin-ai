/**
 * ONE ITEM FORMAT AND ONE SLOT MAP (consolidated build plan, Phase 0.1/0.2).
 *
 * Every fact Twin holds — a creator knowledge row or a product fact — is read
 * through the same attributes, so the writer, the scenes and the questions can
 * ask one question of any of them: what is it, where in the script does it go,
 * who said it, is it confirmed. Adapters only: no new store, rows unchanged.
 *
 * Pure: no model call, no I/O. Rule-based mapping from the existing `kind` /
 * `field` vocabularies (counts from the live tables, 2026-10-08).
 */

/** Where in a script an item can go. `context` items inform; they are never spoken as fact. */
export const SLOTS = ['hook', 'story', 'what_it_is', 'show_it', 'process', 'proof', 'stance', 'objection', 'close', 'context'] as const
export type Slot = (typeof SLOTS)[number]

export type ItemSubject = 'creator' | 'product'
export type SaysWho = 'creator' | 'product_page' | 'twin' | 'external'
export type ItemStatus = 'confirmed' | 'usable' | 'unconfirmed'

export interface Item {
  id: string | null
  subject: ItemSubject
  /** The row's own kind (creator) or field (product), unchanged. */
  kind: string
  text: string
  slot_hint: Slot
  source: string | null
  says_who: SaysWho
  status: ItemStatus
  confidence: number | null
  scope: string | null
}

/** creator_knowledge.kind → slot. Unknown kinds are context. */
const CREATOR_SLOT: Record<string, Slot> = {
  experience: 'story', example: 'story', opinion: 'stance', framework: 'process',
  claim: 'proof', fact: 'context', product: 'what_it_is', covered: 'context', topic: 'context',
}

/** product fact field → slot. Unknown fields are context. */
const PRODUCT_SLOT: Record<string, Slot> = {
  name: 'what_it_is', category: 'what_it_is', description: 'what_it_is', feature: 'what_it_is',
  benefit: 'what_it_is', use_case: 'what_it_is', integration: 'what_it_is', problem: 'hook',
  audience: 'hook', claim: 'proof', proof_number: 'proof', testimonial: 'proof', comparison: 'proof',
  price: 'close', plan: 'close', guarantee: 'close', cta: 'close', terms: 'close', urgency: 'close', faq: 'objection',
  object_shape: 'show_it', show_action: 'show_it', screen: 'show_it', page_section: 'show_it',
  process_step: 'process', includes: 'what_it_is',
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function slotForCreatorKind(kind: unknown): Slot {
  return CREATOR_SLOT[str(kind).toLowerCase()] ?? 'context'
}
export function slotForProductField(field: unknown): Slot {
  return PRODUCT_SLOT[str(field).toLowerCase()] ?? 'context'
}

/** Adapter: a creator_knowledge row as an Item. Her words; a claim stays unconfirmed. */
export function itemFromCreatorKnowledge(row: Record<string, unknown> | null | undefined): Item | null {
  if (!row || !str(row.text)) return null
  const kind = str(row.kind).toLowerCase()
  const source = str(row.source) || null
  const fromAnswer = /answer|question|creator|typed|note/i.test(source ?? '')
  return {
    id: str(row.id) || null, subject: 'creator', kind, text: str(row.text),
    slot_hint: slotForCreatorKind(kind), source, says_who: 'creator',
    status: kind === 'claim' ? 'unconfirmed' : fromAnswer ? 'confirmed' : 'usable',
    confidence: num(row.confidence), scope: str(row.voice_id) || null,
  }
}

/** Adapter: a product fact ({field, value, source, trust}) as an Item. */
export function itemFromProductFact(fact: Record<string, unknown> | null | undefined, productId: string | null = null): Item | null {
  if (!fact || !str(fact.value)) return null
  const field = str(fact.field).toLowerCase()
  const trust = str(fact.trust).toLowerCase()
  const source = str(fact.source) || null
  return {
    id: null, subject: 'product', kind: field, text: str(fact.value),
    slot_hint: slotForProductField(field), source,
    says_who: source === 'creator' ? 'creator' : 'product_page',
    status: trust === 'user_confirmed' ? 'confirmed' : trust === 'usable' ? 'usable' : 'unconfirmed',
    confidence: null, scope: productId,
  }
}

export interface SlotCoverage {
  items: number
  bySlot: Record<Slot, number>
  /** Slots with at least one confirmed or usable item. */
  filled: Slot[]
  /** Spoken slots with nothing usable — the gaps a question could fill. */
  empty: Slot[]
}

/** Count items per slot; `context` never counts as filling a spoken slot. */
export function slotCoverage(items: readonly (Item | null)[]): SlotCoverage {
  const bySlot = Object.fromEntries(SLOTS.map((s) => [s, 0])) as Record<Slot, number>
  const usable = new Set<Slot>()
  let n = 0
  for (const it of items) {
    if (!it) continue
    n += 1
    bySlot[it.slot_hint] += 1
    if (it.status !== 'unconfirmed') usable.add(it.slot_hint)
  }
  const spoken = SLOTS.filter((s) => s !== 'context')
  return { items: n, bySlot, filled: spoken.filter((s) => usable.has(s)), empty: spoken.filter((s) => !usable.has(s)) }
}

/** Plan 1.6: the writer's product block, grouped by the job each fact does. */
const GROUP_ORDER: ReadonlyArray<[Slot, string]> = [
  ['hook', 'HOOK MATERIAL (the problem, who it is for)'],
  ['what_it_is', 'WHAT IT IS'],
  ['show_it', 'WHAT SHE CAN SHOW (only these; never a screen or prop not listed)'],
  ['process', 'HOW IT WORKS, IN ORDER'],
  ['proof', 'PROOF (confirmed only)'],
  ['objection', 'QUESTIONS PEOPLE ASK'],
  ['close', 'THE OFFER AND TERMS'],
  ['context', 'OTHER'],
]

export interface GroupedFacts { lines: string[]; groups: Partial<Record<Slot, number>> }

/** Facts already admitted for the writer, as headed groups (same cap, same order of facts within a group). */
export function groupProductFactLines(facts: ReadonlyArray<{ field?: unknown; value?: unknown }>, max = 24): GroupedFacts {
  const bySlot = new Map<Slot, string[]>()
  let n = 0
  for (const f of facts) {
    const value = str(f?.value)
    if (!value || n >= max) continue
    const slot = slotForProductField(f?.field)
    if (!bySlot.has(slot)) bySlot.set(slot, [])
    bySlot.get(slot)!.push(`    * ${str(f?.field) || 'fact'}: ${value}`)
    n += 1
  }
  const lines: string[] = []
  const groups: Partial<Record<Slot, number>> = {}
  for (const [slot, head] of GROUP_ORDER) {
    const rows = bySlot.get(slot)
    if (!rows?.length) continue
    groups[slot] = rows.length
    lines.push(`  ${head}:`, ...rows)
  }
  return { lines, groups }
}

/**
 * Plan 1.5: what each kind of product needs before a script can do its job.
 * Slots, not fields, so any field that fills the slot counts. Measured first;
 * plan 4.3 turns a missing slot into one question.
 */
const KIND_NEEDS: Record<string, readonly Slot[]> = {
  SAAS: ['hook', 'show_it', 'close'],
  APP: ['hook', 'show_it', 'close'],
  DIGITAL_PRODUCT: ['what_it_is', 'show_it', 'close'],
  COURSE: ['hook', 'what_it_is', 'close'],
  COMMUNITY: ['hook', 'what_it_is', 'close'],
  PHYSICAL_PRODUCT: ['what_it_is', 'show_it'],
  SERVICE: ['hook', 'what_it_is', 'close'],
}

export interface KindReadiness { kind: string; needs: Slot[]; missing: Slot[]; ready: boolean }

/** Which of this kind's needed slots have no usable item. Unknown kinds need nothing. */
export function kindReadiness(kind: unknown, items: readonly (Item | null)[]): KindReadiness {
  const k = str(kind).toUpperCase()
  const needs = [...(KIND_NEEDS[k] ?? [])]
  const have = new Set(items.filter((i): i is Item => !!i && i.status !== 'unconfirmed').map((i) => i.slot_hint))
  const missing = needs.filter((s) => !have.has(s))
  return { kind: k, needs, missing, ready: missing.length === 0 }
}

/**
 * Plan 1.5 / 4.3: THE NEED CHECK. One record per request saying, layer by
 * layer, whether the writer has what it needs — persona, catalyst (her story),
 * product slots, niche findings, pillar fit, urgency — and what to do about
 * it. Measured and logged first; the question engine reads this record later.
 * Counts and statuses only: no creator text goes into it.
 */
export interface NeedCheckInput {
  voiceCard: boolean
  exemplars: number
  storyIds: readonly string[]
  partialStory?: boolean
  kind: unknown
  productItems: readonly (Item | null)[]
  nicheFindings: number
  pillars: readonly string[]
  pillarMatched: boolean
  urgencyFact: boolean
}

export interface NeedCheck {
  layers: {
    persona: { status: 'ready' | 'thin' }
    catalyst: { status: 'stored_fit' | 'partial' | 'none'; candidate_story_ids: string[] }
    product: { status: 'complete' | 'missing'; missing: Slot[] }
    niche: { status: 'fresh' | 'none'; findings: number }
    pillar: { status: 'fits' | 'outside' | 'unknown' }
    urgency: { status: 'live_fact' | 'none' }
  }
  decision: 'write' | 'pick' | 'ask'
  ask: Array<'catalyst' | 'product_slot' | 'profile'>
}

export function needCheck(i: NeedCheckInput): NeedCheck {
  const persona = i.voiceCard && i.exemplars >= 2 ? 'ready' : 'thin'
  const ids = i.storyIds.slice(0, 3)
  const catalyst = ids.length ? 'stored_fit' : i.partialStory ? 'partial' : 'none'
  const kr = kindReadiness(i.kind, i.productItems)
  const pillar = i.pillars.length === 0 ? 'unknown' : i.pillarMatched ? 'fits' : 'outside'
  // Ranked by expected value (brief Part 2): story first, then a product slot
  // the script can't do without, then one profile question. Max three.
  const ask: NeedCheck['ask'] = []
  if (catalyst !== 'stored_fit') ask.push('catalyst')
  if (kr.missing.length) ask.push('product_slot')
  if (persona === 'thin' || pillar === 'unknown') ask.push('profile')
  const decision = ask.length ? 'ask' : catalyst === 'stored_fit' ? 'pick' : 'write'
  return {
    layers: {
      persona: { status: persona },
      catalyst: { status: catalyst, candidate_story_ids: ids },
      product: { status: kr.missing.length ? 'missing' : 'complete', missing: kr.missing },
      niche: { status: i.nicheFindings > 0 ? 'fresh' : 'none', findings: i.nicheFindings },
      pillar: { status: pillar },
      urgency: { status: i.urgencyFact ? 'live_fact' : 'none' },
    },
    decision,
    ask: ask.slice(0, 3),
  }
}

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
  price: 'close', plan: 'close', guarantee: 'close', cta: 'close', terms: 'close', faq: 'objection',
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

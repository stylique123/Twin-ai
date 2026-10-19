// GENERATED FROM packages/shared/src/script/angleFit.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// ANGLE-FIT (Master Prompt v3, 15 Oct). Builds on the existing angle kinds of
// the story question engine (questionLadder.ts AngleKind) and the item format's
// slot map (itemFormat.ts): from the eight candidate angles, pick the best three
// that serve the goal and the product — never one opposite to them — scored by
// how many of the angle's slots her material can fill. The three cards carry
// three different hook shapes (hooks/hookShapes.ts ids). Each card's opening
// line is taken verbatim from her material, or is a slot marker. Never invented.
// Pure. The log record carries ids, shapes, gap counts and scores only.

import type { Slot } from './itemFormat.ts'

export type AngleId = 'moment' | 'myth' | 'show' | 'answer' | 'offer' | 'stand' | 'behind' | 'beforeafter'
export const ANGLE_IDS: readonly AngleId[] = ['moment', 'myth', 'show', 'answer', 'offer', 'stand', 'behind', 'beforeafter']

export type AngleGoal = 'sell' | 'leads' | 'educate' | 'entertain' | 'personal_brand'

/** Goal → angles that serve it, best first. An angle not listed is off-goal and never offered. */
export const GOAL_ANGLES: Record<AngleGoal, readonly AngleId[]> = {
  sell: ['offer', 'show', 'beforeafter', 'answer', 'moment', 'behind'],
  leads: ['answer', 'myth', 'behind', 'stand', 'offer', 'moment'],
  educate: ['myth', 'answer', 'behind', 'show', 'stand', 'beforeafter'],
  entertain: ['moment', 'stand', 'beforeafter', 'behind', 'myth'],
  personal_brand: ['moment', 'stand', 'behind', 'beforeafter', 'myth', 'answer'],
}

export interface AngleSpec {
  id: AngleId
  /** Slots the angle cannot be written without (the needs map). */
  needs: readonly Slot[]
  /** Slots the opening line may be lifted from, in order. */
  opening: readonly Slot[]
  /** Hook shapes (hookShapes ids) that fit, best first. No date/scarcity shape. */
  shapes: readonly string[]
  /** The angle is about the product: dropped when there is no product. */
  product: boolean
}

export const ANGLE_SPECS: Record<AngleId, AngleSpec> = {
  moment: { id: 'moment', needs: ['story'], opening: ['story'], shapes: ['story_open'], product: false },
  myth: { id: 'myth', needs: ['stance', 'context'], opening: ['stance', 'context'], shapes: ['contrarian_gap', 'stop_doing'], product: false },
  show: { id: 'show', needs: ['what_it_is', 'show_it'], opening: ['show_it', 'what_it_is'], shapes: ['if_then_check', 'price_or_proof'], product: true },
  answer: { id: 'answer', needs: ['objection', 'context'], opening: ['objection', 'hook'], shapes: ['audience_question', 'if_then_check'], product: false },
  offer: { id: 'offer', needs: ['what_it_is', 'close'], opening: ['what_it_is', 'proof'], shapes: ['price_or_proof', 'if_then_check'], product: true },
  stand: { id: 'stand', needs: ['stance'], opening: ['stance'], shapes: ['stop_doing', 'contrarian_gap'], product: false },
  behind: { id: 'behind', needs: ['process'], opening: ['process'], shapes: ['number_promise', 'if_then_check', 'story_open'], product: false },
  beforeafter: { id: 'beforeafter', needs: ['story', 'proof'], opening: ['proof', 'story'], shapes: ['story_open', 'price_or_proof'], product: false },
}

export interface MaterialItem { id: string | null; slot: Slot; text: string }

export interface AngleCard {
  angle: AngleId
  shape: string
  gaps: Slot[]
  score: number
  opening: { source: 'material'; item_id: string | null; text: string } | { source: 'slot'; marker: string }
}

export interface AngleFitInput { goal: unknown; hasProduct: boolean; material: readonly MaterialItem[] }

const normGoal = (g: unknown): AngleGoal | null => {
  const s = String(g ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (s === 'sales' || s === 'sell') return 'sell'
  if (s === 'lead' || s === 'leads') return 'leads'
  if (s === 'educate' || s === 'education' || s === 'teach') return 'educate'
  if (s === 'entertain' || s === 'entertainment') return 'entertain'
  if (s === 'personal_brand' || s === 'brand' || s === 'conversations') return 'personal_brand'
  return null
}

export function angleCandidates(goal: unknown, hasProduct: boolean): AngleId[] {
  const g = normGoal(goal)
  const list = g ? GOAL_ANGLES[g] : ANGLE_IDS
  return list.filter((a) => hasProduct || !ANGLE_SPECS[a].product)
}

/** Picks up to three cards: fewest gaps first, then goal rank; three distinct shapes. */
export function pickAngleCards(i: AngleFitInput): AngleCard[] {
  const have = new Set(i.material.filter((m) => m.text.trim()).map((m) => m.slot))
  const cands = angleCandidates(i.goal, i.hasProduct)
  const scored = cands.map((a, rank) => {
    const spec = ANGLE_SPECS[a]
    const gaps = spec.needs.filter((s) => !have.has(s))
    const fit = (spec.needs.length - gaps.length) / spec.needs.length
    const score = Math.round((fit * 70 + (1 - rank / Math.max(1, cands.length)) * 30) * 10) / 10
    return { a, spec, gaps, score }
  }).sort((x, y) => x.gaps.length - y.gaps.length || y.score - x.score)
  const used = new Set<string>()
  const out: AngleCard[] = []
  for (const c of scored) {
    if (out.length === 3) break
    const shape = c.spec.shapes.find((s) => !used.has(s))
    if (!shape) continue
    used.add(shape)
    let opening: AngleCard['opening'] = { source: 'slot', marker: `[${c.spec.opening[0]!.toUpperCase()}]` }
    for (const slot of c.spec.opening) {
      const m = i.material.find((x) => x.slot === slot && x.text.trim())
      if (m) { opening = { source: 'material', item_id: m.id, text: m.text.trim() }; break }
    }
    out.push({ angle: c.a, shape, gaps: c.gaps, score: c.score, opening })
  }
  return out
}

/** Log/blueprint record: ids, shapes, gap counts and scores. No text. */
export function angleCardsRecord(cards: readonly AngleCard[]) {
  return cards.map((c) => ({
    angle: c.angle, shape: c.shape, gaps: c.gaps.length, gap_slots: [...c.gaps], score: c.score,
    opening: c.opening.source, opening_item_id: c.opening.source === 'material' ? c.opening.item_id : null,
  }))
}

// ── PLAN v5.1 ITEM N: ANGLES ─────────────────────────────────────────────
// Pick the best three of the eight angle types, by these criteria in order:
//   1. Goal fit: OBJECTIVE_ANGLES (data, one row per objective the app
//      offers). An angle not in her objective's row is never offered.
//   2. Material fit: share of the angle's needs map her material fills.
//   3. Three different shapes.
//   4. Fewest gaps (then the objective row's own order).
// Goal fit is a gate (the row of allowed angles), so material fit ranks among
// the allowed ones. An angle the product cannot support (no product, nothing
// showable, no offer) is dropped, never offered. Each card carries its opening
// line and a source tag; the top card is Twin's pick. No placeholder: with
// nothing to open on, the opening is null (a question fills it before
// writing), never a "[SLOT]" marker.

export const ANGLE_LABELS: Record<AngleId, string> = {
  moment: 'Tell the moment', myth: 'Bust a myth', show: 'Show it working', answer: 'Answer the question',
  offer: 'Make the offer', stand: 'Take a stand', behind: 'Behind the scenes', beforeafter: 'Before and after',
}

/** Objective (questionSpecs id) → angles that serve it, best first. Every objective in the app has a row. */
export const OBJECTIVE_ANGLES: Readonly<Record<string, readonly AngleId[]>> = {
  'product:launch': ['offer', 'show', 'behind', 'moment'],
  'product:restock': ['offer', 'show', 'beforeafter', 'moment'],
  'product:explain': ['show', 'answer', 'myth', 'behind'],
  'product:wrong': ['myth', 'answer', 'stand', 'moment'],
  'product:try': ['show', 'beforeafter', 'answer', 'offer'],
  'product:later': ['answer', 'behind', 'moment', 'beforeafter'],
  'product:asked': ['answer', 'myth', 'show', 'moment'],
  'product:dm': ['answer', 'moment', 'show', 'myth'],
  'product:why_made': ['moment', 'behind', 'stand', 'beforeafter'],
  'product:story': ['moment', 'behind', 'beforeafter', 'stand'],
  'business:why_started': ['moment', 'behind', 'stand', 'beforeafter'],
  'business:wrong': ['myth', 'answer', 'stand', 'moment'],
  'business:announce': ['offer', 'behind', 'show', 'moment'],
  'idea:story': ['moment', 'beforeafter', 'stand', 'behind'],
  'idea:teach': ['myth', 'answer', 'show', 'behind'],
  'idea:answer': ['answer', 'myth', 'moment', 'stand'],
  'idea:process': ['behind', 'show', 'beforeafter', 'myth'],
  'idea:fun': ['moment', 'stand', 'beforeafter', 'behind'],
  'idea:sell': ['offer', 'show', 'beforeafter', 'answer'],
  'reference:opening': ['moment', 'myth', 'answer', 'stand', 'behind', 'show'],
  'reference:pacing': ['moment', 'myth', 'answer', 'stand', 'behind', 'show'],
  'reference:close': ['moment', 'myth', 'answer', 'stand', 'behind', 'show'],
}

/** Goal enum fallback when no objective id is sent (every VideoGoal value). */
export const GOAL_FALLBACK_ANGLES: Readonly<Record<string, readonly AngleId[]>> = {
  sell: GOAL_ANGLES.sell, leads: GOAL_ANGLES.leads, educate: GOAL_ANGLES.educate,
  entertain: GOAL_ANGLES.entertain, personal_brand: GOAL_ANGLES.personal_brand,
  conversations: ['answer', 'myth', 'moment', 'stand'],
  authority: ['behind', 'myth', 'stand', 'answer', 'show'],
  followers: ['moment', 'stand', 'myth', 'beforeafter', 'behind'],
}

export type OpeningSource = 'her_material' | 'product' | 'niche' | 'audience' | 'none'

export interface AngleMaterial extends MaterialItem {
  /** Where the item came from; her own words are preferred for the opening line. */
  source?: Exclude<OpeningSource, 'none'>
}

export interface AnglePickInput {
  objective?: unknown
  goal?: unknown
  hasProduct: boolean
  /** false = nothing about the product can be shown on camera. Unknown keeps the angle. */
  canShow?: boolean
  /** false = there is no offer to make. Unknown keeps the angle. */
  hasOffer?: boolean
  material: readonly AngleMaterial[]
}

export interface AnglePickCard {
  angle: AngleId
  label: string
  shape: string
  material_fit: number
  gaps: Slot[]
  opening: { text: string; source: Exclude<OpeningSource, 'none'>; item_id: string | null } | { text: null; source: 'none' }
  twins_pick: boolean
}

/** The objective's allowed angles, minus any the product cannot support. */
export function allowedAngles(i: Pick<AnglePickInput, 'objective' | 'goal' | 'hasProduct' | 'canShow' | 'hasOffer'>): AngleId[] {
  const obj = String(i.objective ?? '').trim()
  const g = String(i.goal ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const row = OBJECTIVE_ANGLES[obj] ?? GOAL_FALLBACK_ANGLES[g] ?? GOAL_FALLBACK_ANGLES[normGoal(g) ?? ''] ?? ANGLE_IDS
  return row.filter((a) => {
    if (ANGLE_SPECS[a].product && !i.hasProduct) return false
    if (a === 'show' && i.canShow === false) return false
    if (a === 'offer' && i.hasOffer === false) return false
    return true
  })
}

const SOURCE_RANK: Record<Exclude<OpeningSource, 'none'>, number> = { her_material: 0, product: 1, audience: 2, niche: 3 }

export function pickAngles(i: AnglePickInput): AnglePickCard[] {
  const filled = i.material.filter((m) => m.text.trim())
  const have = new Set(filled.map((m) => m.slot))
  const scored = allowedAngles(i).map((a, rank) => {
    const spec = ANGLE_SPECS[a]
    const gaps = spec.needs.filter((s) => !have.has(s))
    return { a, spec, rank, gaps, fit: Math.round(((spec.needs.length - gaps.length) / spec.needs.length) * 100) / 100 }
  }).sort((x, y) => y.fit - x.fit || x.gaps.length - y.gaps.length || x.rank - y.rank)
  const used = new Set<string>()
  const out: AnglePickCard[] = []
  for (const c of scored) {
    if (out.length === 3) break
    const shape = c.spec.shapes.find((s) => !used.has(s))
    if (!shape) continue
    used.add(shape)
    let opening: AnglePickCard['opening'] = { text: null, source: 'none' }
    for (const slot of c.spec.opening) {
      const m = filled.filter((x) => x.slot === slot)
        .sort((p, q) => SOURCE_RANK[p.source ?? 'her_material'] - SOURCE_RANK[q.source ?? 'her_material'])[0]
      if (m) { opening = { text: m.text.trim(), source: m.source ?? 'her_material', item_id: m.id }; break }
    }
    out.push({ angle: c.a, label: ANGLE_LABELS[c.a], shape, material_fit: c.fit, gaps: c.gaps, opening, twins_pick: out.length === 0 })
  }
  return out
}

/** Log record for v5.1 cards: ids, shapes, fits and tags. No text. */
export function anglePickRecord(cards: readonly AnglePickCard[]) {
  return cards.map((c) => ({ angle: c.angle, shape: c.shape, fit: c.material_fit, gaps: c.gaps.length, opening: c.opening.source, pick: c.twins_pick }))
}

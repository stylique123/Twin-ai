// ANGLE-FIT (Master Prompt v3, 15 Oct). Builds on the existing angle kinds of
// the story question engine (questionLadder.ts AngleKind) and the item format's
// slot map (itemFormat.ts): from the eight candidate angles, pick the best three
// that serve the goal and the product — never one opposite to them — scored by
// how many of the angle's slots her material can fill. The three cards carry
// three different hook shapes (hooks/hookShapes.ts ids). Each card's opening
// line is taken verbatim from her material, or is a slot marker. Never invented.
// Pure. The log record carries ids, shapes, gap counts and scores only.

import type { Slot } from './itemFormat.js'

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

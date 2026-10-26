// GENERATED FROM packages/shared/src/script/beatWriterMap.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// THE ITEMS-TO-BEATS MAP (plan §33 item 6). Deterministic, no AI.
//
// Before the beat writer writes anything, each of her items (story, proof,
// product fact, opinion, CTA) is scored for relevance to the angle and topic
// and assigned to AT MOST ONE beat. Two rules are absolute:
//   - an unrelated story is never placed (panel 10's unfiltered refill dumped
//     unrelated stories to buy length; this map refuses to);
//   - no item is used twice.
// Beats left empty are reported, so the QC's thin-material path can ask ONE
// question for the missing piece instead of padding.
//
// Behind BEAT_WRITER, which defaults OFF (see `beatWriterOn`).

import { BEAT_IDS, type BeatId } from './beatBudgets.ts'

export type ItemKind = 'story' | 'proof' | 'product_fact' | 'opinion' | 'cta'

export interface MaterialItem {
  id: string
  kind: ItemKind
  text: string
  /** Optional topic words she or the extractor attached to the item. */
  tags?: readonly string[]
}

export interface BeatMapRequest {
  angle: string
  topic: string
  /** A sell video: the method beat must be product facts. */
  productLed?: boolean
  /** Minimum relevance (0..1) for an item to be placed. Default 0.2. */
  minRelevance?: number
}

export interface BeatSlot {
  beat: BeatId
  items: { id: string; kind: ItemKind; text: string; relevance: number }[]
}

export type RefusalReason = 'unrelated' | 'no_beat_left'

export interface BeatMap {
  beats: BeatSlot[]
  unfilled: BeatId[]
  /** Unfilled beats that need HER material (hook and CTA are writable from the angle and goal). */
  needsMaterial: BeatId[]
  /** The single beat the thin-material path should ask about, or null. */
  askFor: BeatId | null
  refused: { id: string; reason: RefusalReason; relevance: number }[]
}

/** Which beats each kind may fill, in preference order. */
export const KIND_BEATS: Readonly<Record<ItemKind, readonly BeatId[]>> = Object.freeze({
  story: ['proof', 'hook'],
  proof: ['proof', 'hook'],
  product_fact: ['method'],
  opinion: ['problem', 'method', 'hook'],
  cta: ['cta'],
})

/** How many items a beat may hold. One story per script, so proof holds one. */
export const BEAT_CAPACITY: Readonly<Record<BeatId, number>> = Object.freeze({ hook: 1, problem: 1, proof: 1, method: 2, cta: 1 })

/** Fill order: the material-hungry beats first, so a story is not spent on the hook while proof sits empty. */
const FILL_ORDER: readonly BeatId[] = ['proof', 'method', 'problem', 'cta', 'hook']

const STOP = new Set(('a an and are as at be but by for from has have i in is it its my of on or so that the this to was were with you your me we our they them what how why when just do does did not no can will about into than then there their our out up very really').split(' '))

function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

export function topicTokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP.has(raw)) continue
    out.add(stem(raw))
  }
  return out
}

/** Share of the item's content words that touch the angle/topic (0..1), with a floor of any shared word. */
export function relevance(item: MaterialItem, angle: string, topic: string): number {
  const target = topicTokens(`${angle} ${topic}`)
  const own = topicTokens(`${item.text} ${(item.tags ?? []).join(' ')}`)
  if (target.size === 0 || own.size === 0) return 0
  let shared = 0
  for (const t of own) if (target.has(t)) shared++
  if (shared === 0) return 0
  // Measured against the smaller side so a long story is not punished for
  // detail, nor a short topic for brevity.
  return Math.round((shared / Math.min(target.size, own.size)) * 1000) / 1000
}

export function mapItemsToBeats(items: readonly MaterialItem[], req: BeatMapRequest): BeatMap {
  const min = req.minRelevance ?? 0.2
  const refused: BeatMap['refused'] = []
  const scored: { item: MaterialItem; rel: number }[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.id)) continue // a duplicate id is the same item; never reuse
    seen.add(item.id)
    const rel = relevance(item, req.angle, req.topic)
    // A CTA is about her offer, not the topic; it is never refused as unrelated.
    if (item.kind !== 'cta' && rel < min) { refused.push({ id: item.id, reason: 'unrelated', relevance: rel }); continue }
    scored.push({ item, rel })
  }
  // Deterministic order: relevance desc, then id.
  scored.sort((a, b) => b.rel - a.rel || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0))

  const slots = new Map<BeatId, BeatSlot['items']>(BEAT_IDS.map((b) => [b, []]))
  const used = new Set<string>()
  let storyPlaced = false
  // Pass 0 fills every beat from items whose FIRST choice it is; only then may
  // pass 1 let a leftover item borrow a later-preference beat.
  for (const pass of [0, 1]) {
    for (const beat of FILL_ORDER) {
      const cap = BEAT_CAPACITY[beat]
      for (const { item, rel } of scored) {
        if (slots.get(beat)!.length >= cap) break
        if (used.has(item.id)) continue
        const allowed = KIND_BEATS[item.kind]
        if (!allowed.includes(beat)) continue
        if ((pass === 0) !== (allowed[0] === beat)) continue
        if (req.productLed && beat === 'method' && item.kind !== 'product_fact') continue
        if (item.kind === 'story' && storyPlaced) continue // one story per script
        slots.get(beat)!.push({ id: item.id, kind: item.kind, text: item.text, relevance: rel })
        used.add(item.id)
        if (item.kind === 'story') storyPlaced = true
      }
    }
  }
  for (const { item, rel } of scored) if (!used.has(item.id)) refused.push({ id: item.id, reason: 'no_beat_left', relevance: rel })

  const beats = BEAT_IDS.map((beat) => ({ beat, items: slots.get(beat)! }))
  const unfilled = beats.filter((b) => b.items.length === 0).map((b) => b.beat)
  // Hook and CTA are writable from the angle and goal. A non-product video may
  // drop the method beat; a product-led one may not.
  const needsMaterial = unfilled.filter((b) => b === 'proof' || b === 'problem' || (b === 'method' && req.productLed === true))
  // One question only. Product-led: the product slot matters most; otherwise her story.
  const priority: BeatId[] = req.productLed ? ['method', 'proof', 'problem'] : ['proof', 'method', 'problem']
  const askFor = priority.find((b) => needsMaterial.includes(b)) ?? null
  return { beats, unfilled, needsMaterial, askFor, refused }
}

/** BEAT_WRITER flag reader. OFF unless explicitly '1', 'true' or 'on'. */
export function beatWriterOn(value: string | undefined | null): boolean {
  return ['1', 'true', 'on'].includes(String(value ?? '').trim().toLowerCase())
}

// THE GALLERY'S DECISIONS, OUT OF THE COMPONENT.
//
// ⚠️ `Gallery.tsx` IS 900 LINES AND THE ONE PLACE A CREATOR MEETS ALL OF THIS.
// Eligibility, ranking and the readiness line are decisions, not rendering, and
// a decision written inside a `useMemo` is a decision no test can reach — which
// is how the ranker ended up with six of seven signals nobody could exercise.
//
// ⚖️ SO THIS FILE IS PURE, AND THE COMPONENT KEEPS THE PIXELS. Everything here
// takes plain data and returns plain data.

import {
  eligibility, compareForCreator, slotFill, slotFillSummary,
  type GalleryCreatorView, type RankableReference, type ReferenceProfile,
  type GalleryFacts, type IneligibleReason, type FillableEntity, type SlotFill,
} from './api'

export interface DecidableCard {
  id: string
  url: string
}

export interface CardDecision {
  /** Absent when the card is fine to show. */
  refusedReason?: IneligibleReason
  /** The refusal in words a creator can read, straight from the policy. */
  refusedExplain?: string
  /** "Your products cover all 3" — or null when nothing is known to say. */
  readiness: string | null
  fill: SlotFill | null
}

export interface DecisionInput {
  cards: readonly DecidableCard[]
  profiles: ReadonlyMap<string, ReferenceProfile>
  facts: ReadonlyMap<string, GalleryFacts>
  me: GalleryCreatorView
  entities: readonly FillableEntity[]
  /** The empty profile for a card nobody has assessed. Supplied rather than
   *  built here so the caller can carry the card's niche into it. */
  blank: (card: DecidableCard) => ReferenceProfile
}

export interface GalleryDecisions {
  /** Cards the creator may see, already ordered. */
  order: readonly DecidableCard[]
  /** Per card, including the refused ones — a refusal is worth SHOWING. */
  byId: ReadonlyMap<string, CardDecision>
  /** Cards refused, in the order they were refused. */
  refused: readonly DecidableCard[]
}

/**
 * Decide, for one creator, what this page shows and in what order.
 *
 * ⚠️ A REFUSED CARD IS RETURNED, NOT DELETED. A creator who has seen a gallery
 * before and finds it shorter has been told nothing; a card that says "this one
 * only works if the product is yours" has been told something true, and the
 * refusal is the most informative thing the assessment produces. The caller
 * decides whether to render them in a section or hide them — but it can only
 * decide that if they survive this function.
 *
 * ⚖️ AND AN UNASSESSED LIBRARY COMES BACK IN TODAY'S ORDER. `compareForCreator`
 * skips every unknown, so a page of unassessed cards sorts by niche then reach
 * exactly as it does now. That is the property that makes this safe to ship
 * before the batch finishes.
 */
export function decideGallery(input: DecisionInput): GalleryDecisions {
  const { cards, profiles, facts, me, entities, blank } = input
  const byId = new Map<string, CardDecision>()
  const eligible: DecidableCard[] = []
  const refused: DecidableCard[] = []
  const rankable = new Map<string, RankableReference>()

  for (const card of cards) {
    const profile = profiles.get(card.url) ?? blank(card)
    const verdict = eligibility(profile, me)
    const fill = slotFill(profile.content, entities)
    byId.set(card.id, {
      refusedReason: verdict.eligible ? undefined : verdict.reason,
      refusedExplain: verdict.eligible ? undefined : verdict.explain,
      readiness: slotFillSummary(fill),
      fill,
    })
    if (!verdict.eligible) { refused.push(card); continue }
    eligible.push(card)
    rankable.set(card.id, {
      profile,
      facts: facts.get(card.id) ?? { nicheRelation: 'unknown', reach: null, likes: null },
      // ⚠️ NULL, NOT ZERO, WHEN NOTHING IS KNOWN. `slotFill` returns null for an
      // unassessed reference, and a 0 here would rank a card nobody has read
      // below one measured as genuinely unfillable.
      slotsFillable: fill ? fill.fillable : null,
      slotsRequired: fill ? fill.required : null,
    })
  }

  const order = [...eligible].sort((a, b) =>
    compareForCreator(rankable.get(a.id)!, rankable.get(b.id)!, me))

  return { order, byId, refused }
}

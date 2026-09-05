// TWO STORES HOLD ONE FACT, AND IN PRODUCTION THEY DISAGREE.
//
// ⚠️ MEASURED 2026-09-05 ACROSS EVERY VOICE THAT HAS ANSWERED. What a creator
// sells is written twice, by two different surfaces, and nothing has ever
// compared them:
//
//   `brand_voices.pre_script_brief.commercialTies`   the onboarding answer
//   `product_entities.relationship`                  the confirm-step entity
//
//   ties                      entity relationship   verdict
//   ["none"]                  (no row)              unrecorded
//   ["none"]                  OWN_SERVICE           CONTRADICTS
//   ["own_service"]           OWN_PRODUCT           CONTRADICTS
//   ["own_service"]           OWN_PRODUCT           CONTRADICTS
//   ["unspecified"]           OWN_PRODUCT           agrees (unspecified asserts nothing)
//   ["unspecified"]           OWN_PRODUCT           agrees
//   ["unspecified","own_product"]  OWN_PRODUCT      agrees
//
// THREE OF SEVEN CONTRADICT. One creator answered "I sell nothing" and carries
// an entity saying they own a service; two answered "a service" and carry an
// entity saying "a product". Service and product are not a wording difference —
// they carry different claim rules and different showability, so the script a
// creator gets is written against a fact they did not state.
//
// ⚠️ AND `recordedNoProduct` HAS NEVER ONCE BEEN TRUE. generate-blueprint gates
// its strongest refusal — "this creator has no product, do NOT write a scene
// that shows one" — on `ownedEntity.relationship === 'NONE'`. ZERO of the seven
// stored entities carries NONE, because the onboarding "I sell nothing" answer
// writes `commercialTies`, never an entity. `commercialTies` appears NOWHERE in
// generate-blueprint. So the creator who most clearly said no is the one whose
// answer never arrives, and they get the weaker unrecorded-case wording instead.
//
// ── WHAT THIS DOES, AND THE ONE THING IT REFUSES TO DO ────────────────────
//
// ⚖️ IT NEVER PICKS A WINNER AND REWRITES THE LOSER. Both values are somebody's
// answer, and nothing here can tell which one they meant. Silently rewriting
// either is the backfill this codebase has a standing rule against.
//
// ⚖️ SO A CONTRADICTION RESOLVES TO THE *LESS PERMISSIVE* CLAIM, ALWAYS. That
// is `profileAssembler`'s own principle, pointed the other way: TIE_PRECEDENCE
// runs most-to-least authority so a creator is not stripped of a claim they
// really hold, and it says plainly that "reading an affiliate as an owner is the
// one that puts a false claim in somebody's mouth". When two SOURCES conflict,
// that risk dominates — a creator briefly under-credited can correct it; a
// script that has already claimed they own something cannot be un-said.

import type { CommercialTie } from './creatorProfileQuestions'
import { RELATIONSHIP_OF, TIE_PRECEDENCE, type CanonicalRelationship } from './profileAssembler'

/** Least to most permissive. A relationship earlier in this list licenses
 *  strictly fewer claims than one after it, which is what makes "take the
 *  smaller" a well-defined operation rather than a preference. */
const PERMISSIVENESS: readonly CanonicalRelationship[] = Object.freeze([
  'NONE', 'REVIEW_ONLY', 'AFFILIATE', 'SPONSOR', 'OWN_SERVICE', 'OWN_PRODUCT',
])

export type ConsistencyVerdict = 'agrees' | 'contradicts' | 'unrecorded'

export interface CommercialConsistency {
  /** What onboarding's answer implies, or null when it asserts nothing. */
  fromTies: CanonicalRelationship | null
  /** What the stored entity says, or null when no entity exists. */
  fromEntity: CanonicalRelationship | null
  verdict: ConsistencyVerdict
  /**
   * The relationship a script may be written against.
   *
   * ⚠️ null MEANS "NOTHING IS RECORDED", NOT "NONE". The two are different
   * facts and the writer already distinguishes them — collapsing them here
   * would re-introduce the exact bug generate-blueprint's `unrecordedProduct`
   * branch exists to avoid.
   */
  safe: CanonicalRelationship | null
}

/** `unspecified` asserts nothing, so it never contradicts anything. */
function relationshipFromTies(
  ties: readonly CommercialTie[] | null | undefined,
): CanonicalRelationship | null {
  if (!Array.isArray(ties) || ties.length === 0) return null
  const tie = TIE_PRECEDENCE.find((t) => ties.includes(t))
  return tie ? RELATIONSHIP_OF[tie] ?? null : null
}

function isRelationship(v: unknown): v is CanonicalRelationship {
  return typeof v === 'string' && (PERMISSIVENESS as readonly string[]).includes(v)
}

/**
 * Compare the two stores and say what a script may safely assume.
 *
 * ⚖️ THIS REPORTS; IT DOES NOT REPAIR. `contradicts` is a finding for a human
 * — the creator is the only one who can say which answer they meant — and
 * `safe` is only what the writer may lean on while that stays unresolved.
 */
export function commercialConsistency(
  ties: readonly CommercialTie[] | null | undefined,
  entityRelationship: unknown,
): CommercialConsistency {
  const fromTies = relationshipFromTies(ties)
  const fromEntity = isRelationship(entityRelationship) ? entityRelationship : null

  if (fromTies === null && fromEntity === null) {
    return { fromTies, fromEntity, verdict: 'unrecorded', safe: null }
  }
  if (fromTies === null || fromEntity === null) {
    // One side is silent. Silence never contradicts, and the side that spoke
    // is the only evidence there is.
    return { fromTies, fromEntity, verdict: 'agrees', safe: fromTies ?? fromEntity }
  }
  if (fromTies === fromEntity) {
    return { fromTies, fromEntity, verdict: 'agrees', safe: fromTies }
  }
  const safe = PERMISSIVENESS.indexOf(fromTies) <= PERMISSIVENESS.indexOf(fromEntity)
    ? fromTies : fromEntity
  return { fromTies, fromEntity, verdict: 'contradicts', safe }
}

/**
 * Did the creator explicitly say they sell nothing, by EITHER route?
 *
 * ⚠️ THIS IS THE ANSWER generate-blueprint CANNOT CURRENTLY SEE. Its
 * `recordedNoProduct` reads only `ownedEntity.relationship === 'NONE'`, and no
 * stored entity in production carries NONE — the "I sell nothing" answer writes
 * `commercialTies` instead, which that function never reads. So the creator who
 * answered most clearly is the one whose answer never arrives.
 *
 * ⚖️ AN UNCONTRADICTED "NONE" FROM EITHER SOURCE COUNTS; a contradicted one
 * does not, because then something else on the account says otherwise and the
 * refusal would rest on a fact in dispute.
 */
export function saysSellsNothing(
  ties: readonly CommercialTie[] | null | undefined,
  entityRelationship: unknown,
): boolean {
  const c = commercialConsistency(ties, entityRelationship)
  return c.verdict !== 'contradicts' && c.safe === 'NONE'
}

// THE PROJECTION THE GALLERY IS ALLOWED TO SEE.
//
// ⚠️ `galleryPolicy` DECLARED `GalleryCreatorView` AND NOTHING EVER BUILT ONE.
// The eligibility rules, the ownership refusal and the seven priority groups all
// take this type as their second argument, and every caller outside a test was
// hypothetical — which is the same shape of defect as `slotsFillable`: a
// consumer with no producer, looking like a capability while doing nothing.
//
// ⚖️ AND IT IS ASSEMBLED FROM THE CANONICAL PROFILE, NEVER FROM RAW ANSWERS.
// `profileAssembler` exists because five readers each interpreting onboarding
// fields produced five different creators; a gallery that read those fields
// directly would make a sixth.
//
// ── WHAT THIS FILE REFUSES TO GUESS ───────────────────────────────────────
//
// ⚠️ `preferredFormats` COMES BACK EMPTY, ON PURPOSE, AND THAT IS NOT AN
// OVERSIGHT. It means "what they WANT Twin to help them make", and the only
// format data Twin holds is `brandTruth.formats` — what they ALREADY make,
// observed from a scan. `creatorProfileQuestions` names the trap in words:
// "a leap between desired and observed formats would be a guess dressed as a
// preference." Someone who has posted forty talking-heads may be here precisely
// because they want to stop. So the format group stays dark until a question
// asks, and `compareForCreator` SKIPS an empty list rather than ranking on it.

import type { CreatorProfile } from './profileAssembler'
import type { GalleryCreatorView } from './galleryPolicy'
import type { ResolvedCapabilities } from './editor/capabilities'
import type { FillableEntity } from './slotFill'

/** What the creator's library can currently supply.
 *
 *  ⚠️ COUNTED THE SAME WAY `slotFill` COUNTS IT, and not by asking the database
 *  for `count(*)`. An archived product and a `NONE` relationship both fill
 *  nothing, so a raw row count would tell the gallery a creator has three things
 *  to talk about when they have none — and the commercial refusal reads this
 *  number to decide whether to hide a whole format. */
export function usableProductCount(entities: readonly FillableEntity[]): number {
  return entities.filter((e) => e.archivedAt === null && e.relationship !== 'NONE').length
}

export interface GalleryViewInput {
  /** The assembled profile, or null when no voice has been read yet. */
  profile: CreatorProfile | null
  /** Account-level capability flags, already resolved. */
  capabilities: ResolvedCapabilities | null
  /** The creator's live library — the same records `slotFill` matches against. */
  entities: readonly FillableEntity[]
}

/**
 * Build the gallery's view of one creator.
 *
 * ⚠️ EVERY UNKNOWN STAYS UNKNOWN. `null` relationship, `null` capability, empty
 * goals — each of those makes its rule SKIP rather than fail, which is what
 * keeps an un-onboarded creator seeing the whole gallery instead of a filtered
 * one. The refusals in `eligibility` are all two-sided for the same reason.
 *
 * ⚖️ AND `productCount` IS 0 FOR A CREATOR WITH NO LIBRARY, WHICH IS A REAL
 * ANSWER — but on its own it refuses nothing. The commercial refusal needs
 * `relationship === 'NONE'` as well: an empty library plus an unanswered
 * relationship is somebody who has not filled anything in yet, not somebody who
 * has told us they sell nothing.
 */
export function galleryCreatorView(input: GalleryViewInput): GalleryCreatorView {
  const { profile, capabilities, entities } = input
  return {
    goals: profile?.goals?.value ?? [],
    // See the header. Not derived, not inferred, not "close enough".
    preferredFormats: [],
    relationship: profile?.relationship?.value ?? null,
    productCount: usableProductCount(entities),
    canFilmObjects: capabilities?.can_film_objects.value ?? null,
    canRecordScreen: capabilities?.can_record_screen.value ?? null,
  }
}

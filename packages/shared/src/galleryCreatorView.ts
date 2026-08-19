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
// ── WHAT THIS FILE STILL REFUSES TO GUESS ─────────────────────────────────
//
// ⚠️ `preferredFormats` MEANS "WHAT THEY WANT TWIN TO HELP THEM MAKE", AND IT IS
// NOW READ FROM THE QUESTION THAT ASKS EXACTLY THAT. It used to come back empty
// with a comment explaining that the only format data Twin held was
// `brandTruth.formats` — what they ALREADY make, observed from a scan. That was
// true when it was written; `desiredFormats` has since been asked, answered and
// stored, and the empty list had quietly become a stale decision rather than a
// principled one. The format group was dark for no remaining reason.
//
// ⚖️ WHAT HAS NOT CHANGED IS THE REFUSAL UNDERNEATH IT. Observed formats are
// STILL never promoted to preferences: someone who has posted forty
// talking-heads may be here precisely because they want to stop, and this
// projection reads the answer or nothing at all. `compareForCreator` skips an
// empty list rather than ranking on it, so an unasked creator and one who chose
// "Let Twin suggest" both see the whole gallery.

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
    // See the header: the creator's own answer, or nothing. Never the scan.
    preferredFormats: profile?.preferredFormats?.value ?? [],
    relationship: profile?.relationship?.value ?? null,
    productCount: usableProductCount(entities),
    canFilmObjects: capabilities?.can_film_objects.value ?? null,
    canRecordScreen: capabilities?.can_record_screen.value ?? null,
  }
}

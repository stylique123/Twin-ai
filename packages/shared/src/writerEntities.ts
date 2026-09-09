// WHICH PRODUCTS THE WRITER IS ALLOWED TO NAME.
//
// ⚠️ MEASURED IN A REAL SESSION, 2026-09-08. A creator asked for a video about
// her own opinion, explicitly non-commercial. Three of four idea-mode runs
// named a sponsor she had not mentioned. One of them opened with "Stop buying
// the viral Medicube pads before you hear this", asserted "aggressive physical
// pads will make redness worse" about a product her library records she has
// NEVER USED, invented a price, and carried no disclosure — on a paid
// relationship.
//
// ⚠️ THE PATH WAS ONE UNFILTERED QUERY. `generate-blueprint` reads every
// product entity the owner has and hands the writer each one's NAME and FACTS.
// The owned-entity query filters `relationship in (OWN_PRODUCT, OWN_SERVICE)`;
// this second one filters nothing. `claimRulesFor` already says a product with
// `personalUse !== 'CONFIRMED'` supports no experience claim — and nothing
// applied it here.
//
// ⚖️ SO THE RULE IS ABOUT BEING GIVEN, NOT ABOUT BEING OWNED. A writer that
// reaches into the library and picks is inferring commercial intent from
// nothing the creator said — the entitlement `entryDoor.ts` keeps a
// mutation-tested clamp against, defeated from the inside. The creator names
// one product, or the writer names none.

import type { EntityRelationship, PersonalUse } from './productEntity'

export interface LibraryEntityRef {
  id: string
  /**
   * ⚠️ THE REAL UNION, NOT `string`, AND THE FIRST DRAFT HAD `string`. I wrote
   * a test against `'SPONSORED'` — a value that does not exist; the enum says
   * `SPONSOR` — and the compiler could not tell me, because `string` accepts
   * anything. That is the third time an invented enum value has cost this
   * project a debugging round. A union makes it a build error instead.
   */
  relationship: EntityRelationship
  /** Whether the CREATOR has used it. `NOT_CONFIRMED` is the default and is
   *  not a gap to be filled by inference. */
  personalUse?: PersonalUse | null
}

export interface WriterEntityInput {
  /** Everything in the creator's library, live rows only. */
  all: readonly LibraryEntityRef[]
  /**
   * The one entity this video was given — the creator's pick, or the single
   * owned product when there was nothing to pick between.
   *
   * ⚠️ NULL IS THE COMMON CASE AND MEANS "NAME NOTHING". Most videos sell
   * nothing. Treating null as "use whatever is in the library" is exactly the
   * defect this file exists for.
   */
  givenId: string | null
}

/** The ids whose name and facts may reach the writer. */
export function entitiesTheWriterMayName(input: WriterEntityInput): string[] {
  // THE NULL CHECK PRECEDES EVERYTHING. No given product means no product.
  const given = typeof input.givenId === 'string' ? input.givenId.trim() : ''
  if (given === '') return []
  // ⚖️ AND IT MUST STILL BE IN THE LIBRARY. An id that does not resolve is not
  // a licence to fall back to another row — that substitution is how a script
  // comes back about something the creator never mentioned.
  return input.all.some((e) => e.id === given) ? [given] : []
}

/**
 * May the writer make an EXPERIENCE claim about this entity — "I used it",
 * "it made my skin worse", "it works"?
 *
 * ⚖️ ONE AXIS, AND IT IS NOT THE COMMERCIAL TIE. `claimRulesFor` already draws
 * this line: personal experience is established by the creator alone, so a
 * sponsorship neither grants it nor removes it. Restated here because the edge
 * cannot import that module and this is the copy production runs.
 */
export function mayClaimExperience(entity: LibraryEntityRef): boolean {
  return entity.personalUse === 'CONFIRMED'
}

/** Plain English, for a surface that has to say why a product is absent. */
export const WRITER_ENTITY_ABSENT =
  'No product was chosen for this video, so the script does not name one.'

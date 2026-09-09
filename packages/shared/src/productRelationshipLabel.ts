// WHAT THE CREATOR'S RELATIONSHIP TO A PRODUCT IS CALLED, IN ONE PLACE.
//
// ⚠️ THIS LIVED INSIDE ProductLibrary.tsx UNTIL A SECOND SCREEN NEEDED IT. The
// studio's "Something I sell" door now lists the creator's products and shows
// what each one is to them — and a product described as "A sponsor pays you to
// feature it" on one screen and "Sponsored" on another is two accounts of one
// legal fact, on the field that decides what a script may claim.
//
// ⚖️ THE ENUM IS THE CONTRACT AND THIS IS ONLY ITS WORDING, but unlike a chip
// label this wording is a statement ABOUT the creator, so it is worth exactly
// one copy.

import { ENTITY_RELATIONSHIPS, type EntityRelationship } from './productEntity'

export const RELATIONSHIP_LABEL: Record<EntityRelationship, string> = {
  OWN_PRODUCT: 'You own this product',
  OWN_SERVICE: 'You own this service',
  AFFILIATE: 'You earn a commission on it',
  SPONSOR: 'A sponsor pays you to feature it',
  REVIEW_ONLY: 'You review it, with no commercial tie',
  NONE: 'No commercial relationship',
}

/** ⚠️ A STORED VALUE IS UNTRUSTED. A row written by an older build can hold a
 *  relationship this build has never heard of, and printing the raw enum at a
 *  creator ("OWN_PRODUCT") is worse than saying nothing useful. */
export function relationshipLabel(rel: string | null | undefined): string {
  return (ENTITY_RELATIONSHIPS as readonly string[]).includes(String(rel))
    ? RELATIONSHIP_LABEL[rel as EntityRelationship]
    : 'Relationship not recorded'
}

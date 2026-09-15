// NOBODY KNEW TO GO TO PRODUCTS, BECAUSE THE NAV NEVER SAID ANYTHING WAS THERE.
//
// ⚠️ THE OWNER'S ITEM, VERBATIM: "No badge on Products — nobody knows to go
// there. `productLifecycle` already derives the state." That last clause is the
// whole defect. The state has been derived correctly all along and read in
// exactly one place: the Product Library itself, at `ProductLibrary.tsx:1071`
// and `:1128`. A creator only learns a product needs her if she has already
// decided to visit the page that tells her — which is the same
// something-built-that-nothing-reads shape this project keeps finding, wearing
// a nav entry.
//
// ⚠️⚠️ MEASURED ON PRODUCTION 2026-09-15, all 22 `product_entities` rows:
//
//   archived .....................................  0
//   IMPORT_FAILED (a recorded failure, nothing learned) .  1
//   no link and no knowledge (NEEDS_SOURCE) ......  12
//   a link, extraction not finished (READING) ....   5
//   NOTHING_FOUND ................................   0
//   holding facts (READY or REVIEW_REQUIRED) .....   5
//
// ⚠️ THAT SQL IGNORED PHOTOGRAPHS AND SO OVERSTATES `NEEDS_SOURCE`. A row with
// no `product_url` but with image evidence is READING, not NEEDS_SOURCE, and
// the column shape makes that expensive to count in SQL. The 12 is therefore an
// UPPER BOUND on the no-source group, and `productsNeedingAttention` takes a
// photo count precisely so the UI does not repeat that overstatement. Said
// plainly because a measurement with a known bias is only useful if the bias
// travels with it.
//
// ⚖️ AND A HIGH RATE IS NOT A REASON TO SOFTEN THIS, WHICH IS A DEPARTURE FROM
// THE COUNT-FIRST RULE THAT NEEDS SAYING. Roughly 13 of 22 rows would badge.
// Elsewhere this repo refuses to enforce at that incidence — a nominalisation
// ban that fired on 60% of scripts, a stemmer that flagged 65% — because those
// REFUSE a creator's output. A badge refuses nothing. It is a count of products
// whose facts a script may not quote, and if that count is 13, the honest thing
// is to show 13 rather than to invent a threshold that hides a real backlog.
//
// ⚠️ `READING` IS DELIBERATELY NOT BADGED, and its own message is the argument:
// "Twin is reading the page. This keeps going if you leave." There is no action
// for her to take, so a badge would be a summons to watch a progress bar.
// `ARCHIVED` is not badged either — putting a product away is a decision that
// was already made, and re-raising it would be arguing with her.

import type { ProductEntityRecord } from './productEntity'
import { productLifecycle, type ProductLifecycle } from './productLifecycle'

/**
 * The lifecycle states where a creator doing something changes what her scripts
 * are allowed to say.
 *
 * ⚖️ DERIVED FROM THE SAME RULE AS `factsAreQuotable`, NOT A SECOND OPINION ON
 * IT. Only `READY` is quotable, so every state here is one where a script
 * cannot use the product's facts — minus the two where she has nothing to do
 * (`READING` finishes on its own, `ARCHIVED` was her choice). Writing this as a
 * list of "bad states" instead would be a second authority on quotability that
 * could drift away from the first.
 */
export const NEEDS_CREATOR_ACTION: ReadonlySet<ProductLifecycle> = new Set<ProductLifecycle>([
  'NEEDS_SOURCE',
  'IMPORT_FAILED',
  'NOTHING_FOUND',
  'REVIEW_REQUIRED',
])

/** Does this one product want something from its owner? */
export function productNeedsAttention(e: ProductEntityRecord, photoCount = 0): boolean {
  return NEEDS_CREATOR_ACTION.has(productLifecycle(e, photoCount))
}

/**
 * How many products want something from their owner.
 *
 * `photoCountOf` is injected rather than read here because image evidence lives
 * in a shape the web app already knows how to walk (`photoPathsOf`), and
 * duplicating that walk is how the two would come to disagree about whether a
 * product has a source.
 *
 * ⚠️ RETURNS A COUNT, NOT A BOOLEAN. "Something needs you" and "four things
 * need you" are different sentences, and the second is the one that gets
 * someone to open the page.
 */
export function productsNeedingAttention(
  entities: readonly ProductEntityRecord[],
  photoCountOf: (e: ProductEntityRecord) => number = () => 0,
): number {
  return entities.reduce((n, e) => (productNeedsAttention(e, photoCountOf(e)) ? n + 1 : n), 0)
}

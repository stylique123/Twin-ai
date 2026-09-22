// A ROW NOBODY PUT ANYTHING IN STILL ANSWERED "DO YOU HAVE A PRODUCT?"
//
// ⚠️ PART 7 DEFECT 6, AND THE OWNER'S WORDING POINTS AT THE WRONG CULPRIT.
// "An empty product is auto-created. Nameless, relationship locked, nobody made
// it." The nameless part is DELIBERATE and documented: `mintFromWorkKind`
// writes `name: null` on purpose — "a Q3 mint has no name to give, the creator
// was never asked one, and null is the state the Product Library knows how to
// ask about". Removing that mint would throw away the type and showability the
// creator DID imply. The row is not the defect.
//
// ⚠️⚠️ THE DEFECT IS WHAT THE ROW SILENCES. `generate-blueprint` computes
// `product_capture_prompt = unrecordedProduct && !hasAnyProductRow`, and
// `hasAnyProductRow` is a bare COUNT of unarchived rows. So a mint carrying
// nothing but a guessed type makes the count non-zero, the card never renders,
// and the creator is NEVER ASKED about their product again. The comment beside
// that count already states the intended direction and this inverts it:
//
//   "asking a creator who has a product is a small annoyance, while silently
//    never asking one who does not is the defect this card exists for."
//
// ⚠️⚠️ MEASURED ON PRODUCTION 2026-09-15, all 22 `product_entities` rows, and
// THE NUMBER IS ONE. Three rows are nameless; of those, TWO carry a real
// `creator_summary` — a confirmed offer description the creator edited, which
// `generate-blueprint` already reads — so they genuinely answer the question and
// only their NAME is missing. Exactly ONE row carries no name, no summary and no
// knowledge: nothing but a guessed `SERVICE` type. That one account is the whole
// population of this bug.
//
// ⚖️ SAID PLAINLY BECAUSE I FIRST CLAIMED TWELVE. The 12 rows with no source are
// NAMED — a creator added a product and has not given it a link yet, which is
// `NEEDS_SOURCE` and is what the Products badge exists to surface. Conflating
// "no link" with "no answer" would have made this rule fire on eleven rows that
// answered the question perfectly well.
//
// ⚖️ AND THE FIX IS NOT "REQUIRE A NAME", WHICH WOULD BREAK THE OPPOSITE CASE.
// A creator who answers "No, nothing to sell" gets a row minted with
// `name: null` by design (`ProductCaptureCard`: `relationship === 'NONE' ?
// null : payload.name`). Requiring a name would stop that row answering and
// re-ask someone who had already told us — the exact defect the card's own
// header warns about, since "both answers close the gap, not just yes".

import type { EntityRelationship } from './productEntity'

/** The fields that can carry an answer. Deliberately structural rather than a
 *  `ProductEntityRecord`, so the edge-function mirror can be fed a raw row. */
export interface ProductAnswerFields {
  name?: string | null
  creatorSummary?: string | null
  relationship?: EntityRelationship | string | null
}

const filled = (v: string | null | undefined): boolean => typeof v === 'string' && v.trim() !== ''

/**
 * Does this row represent the creator having ANSWERED "do you have a product
 * or service?"
 *
 * Three ways it can, and each is something a person supplied:
 *
 *  1. `relationship === 'NONE'` — an explicit "nothing to sell". Nameless by
 *     design, and the most definite answer there is.
 *  2. a non-empty `name` — they told us what it is called.
 *  3. a non-empty `creatorSummary` — they told us what it IS. An onboarding
 *     mint only carries this when the creator EDITED the guessed offer
 *     (`offerConfirmed === true && offered !== ''`), so its presence is
 *     confirmation, not the scan's guess.
 *
 * Everything else is a mint carrying only a derived type, which is our
 * inference about them rather than their answer.
 */
export function rowAnswersProductQuestion(row: ProductAnswerFields | null | undefined): boolean {
  if (!row) return false
  if (String(row.relationship ?? '') === 'NONE') return true
  return filled(row.name) || filled(row.creatorSummary)
}

// ⚠️ THERE WAS AN `anyRowAnswersProductQuestion(rows)` HERE AND IT IS DELETED
// RATHER THAN REGISTERED. It had no production reader: the edge function uses
// the inlined mirror, and nothing in apps/web asks the question across a whole
// library. `check_symbol_readers` counted it and put unregistered at 145 of
// ceiling 145 — the ceiling #890 had just ratcheted down to. A convenience
// wrapper that only its own tests call is the exact defect this project keeps
// finding: something built correctly that nothing reads. Callers map over their
// own rows with `rowAnswersProductQuestion`, which is one line.

// ── AND A ROW THAT ANSWERED IS NOT THE SAME AS A PRODUCT SHE HAS ──────────
//
// ⚠️⚠️ REPORTED FROM THE SCREEN, 2026-09-22: "when I come into the screen
// there's already a product added, not named, nothing — and it's so hard to
// delete." The card reads:
//
//   Not named yet
//   Add a link or a photo and Twin can learn what this is.
//   You own this product
//
// She did not add it. `mintFromWorkKind` did, from her work-kind answer.
//
// ⚖️ THE EARLIER PASS WAS RIGHT THAT THE ROW IS NOT THE DEFECT, AND IT STOPPED
// ONE STEP SHORT. Deleting the mint would throw away the type and showability
// she implied, and would re-ask the creator who answered "nothing to sell" —
// `rowAnswersProductQuestion` exists precisely so that row keeps answering.
// Both of those remain true. What was never examined is whether a row carrying
// ONLY our inference should be RENDERED to her as one of her products.
//
// ⚠️ IT SHOULD NOT, AND THE COST IS NOT COSMETIC. A phantom entry is the first
// thing she sees in a library she is being asked to fill, it competes with the
// products she then adds, and "You own this product" is an assertion about her
// business that nobody made. The previous fix traded a WRONG NAME for NO NAME
// and left the row on screen; the honest end of that same reasoning is that an
// unconfirmed inference is not a product until she puts something in it.
//
// ⚖️ SO THE ROW STAYS AND THE CARD GOES. Nothing downstream changes: the
// capture prompt still sees a row, the derived type and showability survive,
// and `relationship === 'NONE'` still answers. She simply stops being shown a
// product she never created.
//
// ⚠️ AND `NONE` IS DELIBERATELY NOT SHOWN EITHER, which is why this is not just
// `rowAnswersProductQuestion`. "I sell nothing" is a real answer and a real row
// — it is not a product, and rendering it as a card would be the same defect
// wearing the opposite answer.

/** The fields that can show a creator put something into this row. */
export interface ProductShownFields extends ProductAnswerFields {
  productUrl?: string | null
  userConfirmed?: boolean | null
}

/**
 * Is this row a product the CREATOR supplied, rather than one we inferred?
 *
 * ⚠️ ANY ONE OF THESE IS HER, AND A URL COUNTS BEFORE A NAME DOES. A creator
 * who pastes a link and lets Twin read the page has created a product and has
 * not named it yet — hiding that row would delete her work from the screen
 * while the read is still running, which is the opposite of this rule's point.
 *
 * ⚖️ AN UNCONFIRMED MINT CARRIES NONE OF THEM. That is the whole population
 * this excludes: no name, no description she edited, no link, never confirmed.
 */
export function rowIsCreatorSupplied(row: ProductShownFields | null | undefined): boolean {
  if (!row) return false
  if (row.userConfirmed === true) return true
  return filled(row.name) || filled(row.creatorSummary) || filled(row.productUrl)
}

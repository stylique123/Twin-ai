// WHERE A PRODUCT IS IN ITS LIFE, DERIVED FROM WHAT THE ROW ACTUALLY CARRIES.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// The Product Library infers a product's state at render time, in three places,
// from `knowledge === null` and a fact count. So "Twin is reading this page",
// "Twin read it and found nothing", and "Twin never tried" all look similar on
// screen, and the creator is left with a card that says nothing definite. The
// half-created product the owner reported -- "Added, but we could not start
// reading that page" -- is that ambiguity wearing a message.
//
// ⚖️ DERIVED, NOT STORED, AND DELIBERATELY SO. A status column would be a second
// source of truth that can disagree with the facts it summarises, and the repo
// already has that bug elsewhere. Everything below is computed from columns that
// already exist, so it cannot drift from them.
//
// ⚠️ AND ONE STATE IS HONESTLY MISSING. See IMPORT_FAILED at the bottom: it is
// NOT derivable today, and this file says so rather than guessing.

import type { ProductEntityRecord } from './productEntity'
import type { ExtractedFact } from './productExtraction'

export type ProductLifecycle =
  /** Withdrawn from future videos. Checked first: an archived product's
   *  knowledge state is irrelevant to what a creator should see. */
  | 'ARCHIVED'
  /** Nothing to read from — no link, no photographs. Twin cannot start. */
  | 'NEEDS_SOURCE'
  /** A source exists and no extraction has completed yet.
   *  ⚠️ THIS STATE IS AMBIGUOUS AND THE AMBIGUITY IS REAL — see below. */
  | 'READING'
  /** Twin read the source and found nothing it could use. A finding, not a
   *  failure: some pages genuinely say nothing about the product. */
  | 'NOTHING_FOUND'
  /** Facts exist, but some are unconfirmed guesses the creator should check. */
  | 'REVIEW_REQUIRED'
  /** Confirmed, usable facts. A script may quote this product. */
  | 'READY'

const usable = (f: ExtractedFact) => f.trust === 'usable'

/** ⚖️ ORDER IS THE DEFINITION. Archived outranks everything; a source check
 *  precedes a knowledge check, because "we never had anywhere to look" is a
 *  different sentence from "we looked and found nothing". */
export function productLifecycle(e: ProductEntityRecord, photoCount = 0): ProductLifecycle {
  if (e.archivedAt) return 'ARCHIVED'

  const hasSource = !!(e.productUrl ?? '').trim() || photoCount > 0
  const k = e.knowledge

  // ⚠️ null AND [] ARE DIFFERENT ANSWERS, and collapsing them is the mistake the
  // record's own comment warns about. null = never extracted; [] = extracted and
  // nothing usable found.
  if (k === null) return hasSource ? 'READING' : 'NEEDS_SOURCE'
  if (k.length === 0) return 'NOTHING_FOUND'

  return k.some(usable) ? (k.every(usable) ? 'READY' : 'REVIEW_REQUIRED') : 'REVIEW_REQUIRED'
}

/** What the creator reads. One sentence, plain, and never blaming them. */
export const LIFECYCLE_MESSAGE: Record<ProductLifecycle, string> = {
  ARCHIVED: 'Put away. Scripts will not use this one.',
  NEEDS_SOURCE: 'Add a link or a photo and Twin can learn what this is.',
  READING: 'Twin is reading the page. This keeps going if you leave.',
  NOTHING_FOUND: 'Twin read the page and could not find anything usable. You can add details yourself.',
  REVIEW_REQUIRED: 'Twin found some things. Check the ones it is unsure about.',
  READY: 'Ready. Scripts can talk about this one.',
}

/** ⚠️ MAY A SCRIPT QUOTE FACTS ABOUT THIS PRODUCT? Only where facts exist and a
 *  human has not been left with unchecked guesses standing in for them. */
export const factsAreQuotable = (s: ProductLifecycle): boolean => s === 'READY'

/**
 * ⚠️ IMPORT_FAILED IS NOT IN THE UNION, AND ITS ABSENCE IS THE FINDING.
 *
 * A failed extraction writes NOTHING back to `product_entities`. `knowledge`
 * stays null and `knowledge_extracted_at` stays null -- byte-identical to a
 * product whose extraction was never attempted. So `READING` currently means
 * "queued, in flight, OR failed some time ago", and a creator whose page could
 * not be read sees "Twin is reading the page" forever.
 *
 * ⚖️ THE FIX IS A COLUMN, NOT A CLEVERER DERIVATION. Guessing from elapsed time
 * -- "null for more than ten minutes means failed" -- would report a slow queue
 * as a failure and a fast failure as progress, and it would do so silently.
 * Making this honest needs the worker to record the attempt and its outcome,
 * which is a migration and an edge change: DB_EDGE_AUTH, and it belongs in its
 * own matrix trip rather than smuggled into a derivation.
 */
export const IMPORT_FAILED_IS_NOT_DERIVABLE =
  'A failed extraction writes nothing back, so READING cannot be distinguished '
  + 'from a failure that already happened. Fixing it requires recording the '
  + 'attempt outcome on the row.'

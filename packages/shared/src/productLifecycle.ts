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
  /** Twin tried and could not read the source. ⚠️ THIS USED TO BE UNDERIVABLE
   *  and is the reason `knowledge_failed_at` exists — see the note at the
   *  bottom of this file for what changed. */
  | 'IMPORT_FAILED'
  /** A source exists and no extraction has completed yet.
   *  ⚠️ THIS STATE IS AMBIGUOUS AND THE AMBIGUITY IS REAL — see below. */
  | 'READING'
  /** Twin said it was reading, and has been saying so for longer than any read
   *  has ever taken. ⚠️ SEE `READING_HAS_AN_OUTSIDE_EDGE` for the measurement
   *  this bound comes from and for what this state can and cannot know. */
  | 'READING_STALLED'
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
export function productLifecycle(
  e: ProductEntityRecord,
  photoCount = 0,
  /** ⚖️ INJECTED, NOT READ FROM THE CLOCK, so the rule below is testable and so
   *  this function stays pure. Defaulted because every existing caller passes
   *  two arguments and none of them should have to learn about time. */
  now: number = Date.now(),
): ProductLifecycle {
  if (e.archivedAt) return 'ARCHIVED'

  const hasSource = !!(e.productUrl ?? '').trim() || photoCount > 0
  const k = e.knowledge

  // ⚠️ A RECORDED FAILURE OUTRANKS "still reading", and only a failure with
  // NOTHING LEARNED counts here. A product that failed a re-read but already
  // holds usable facts is not broken — it is a product with facts and a stale
  // attempt, and telling its owner it failed would be a worse lie than silence.
  if (e.knowledgeFailedAt && (k === null || k.length === 0)) return 'IMPORT_FAILED'

  // ⚠️ null AND [] ARE DIFFERENT ANSWERS, and collapsing them is the mistake the
  // record's own comment warns about. null = never extracted; [] = extracted and
  // nothing usable found.
  if (k === null) {
    if (!hasSource) return 'NEEDS_SOURCE'
    // ⚠️ A READ THAT NEVER ENDS IS NOT A READ. See `READING_HAS_AN_OUTSIDE_EDGE`.
    return startedReadingBefore(e, now - READ_STALLS_AFTER_MS) ? 'READING_STALLED' : 'READING'
  }
  if (k.length === 0) return 'NOTHING_FOUND'

  return k.some(usable) ? (k.every(usable) ? 'READY' : 'REVIEW_REQUIRED') : 'REVIEW_REQUIRED'
}

/** What the creator reads. One sentence, plain, and never blaming them. */
export const LIFECYCLE_MESSAGE: Record<ProductLifecycle, string> = {
  ARCHIVED: 'Put away. Scripts will not use this one.',
  IMPORT_FAILED: 'Twin could not read that page. Try again, or add the details yourself.',
  NEEDS_SOURCE: 'No link or photo yet. Add one and Twin can learn what this is.',
  // ⚠️ REPORTED 2026-09-23: "keeps going if you leave" promised no end. A read
  // has three: it lands, it records a failure, or at 30 minutes it is called
  // timed out (READING_STALLED) and Retry appears.
  READING: 'Twin is reading it now — usually a few minutes. If it has not finished in 30 minutes it stops and you can retry.',
  READING_STALLED: 'Reading timed out — it did not finish in 30 minutes. Press Retry, or add the details yourself.',
  NOTHING_FOUND: 'Twin read the page and could not find anything usable. You can add details yourself.',
  REVIEW_REQUIRED: 'Twin found some things. Check the ones it is unsure about.',
  READY: 'Ready. Scripts can talk about this one.',
}

/** ⚠️ MAY A SCRIPT QUOTE FACTS ABOUT THIS PRODUCT? Only where facts exist and a
 *  human has not been left with unchecked guesses standing in for them. */
// ── A READ THAT NEVER ENDS IS NOT A READ ─────────────────────────────────
//
// ⚠️ REPORTED 2026-09-22: "'Twin is reading the page' appears stuck." It was not
// slow. `READING` is the state this file returns whenever a row has a source,
// has never been extracted, and has recorded no failure — and NOTHING in that
// description ever expires. A job that was enqueued and died without writing
// `knowledge_failed_at` leaves a row matching it forever, so the card says Twin
// is reading, `NEEDS_CREATOR_ACTION` deliberately omits `READING` because it
// "finishes on its own", and the product waits for an event that will never
// arrive. There was no end state, which is why it read as stuck: it WAS stuck.
//
// ⚠️⚠️ MEASURED ON PRODUCTION 2026-09-22, every row that has ever been
// extracted (n=12). Eight are first reads and they took 5, 9, 13, 105, 125,
// 164, 215 and 1053 seconds — the slowest under eighteen minutes. The other
// four are 20-to-34-DAY gaps, which are re-reads of rows created long before,
// not slow reads. So thirty minutes is above every first read ever observed
// here by a factor of nearly two, and is not a guess about what is reasonable.
//
// ⚖️ AND IT IS A LOWER BOUND ON STALENESS, WHICH IS THE HONEST DIRECTION. There
// is no `knowledge_requested_at` column; `updated` is the closest thing the row
// carries, and any edit bumps it. So renaming a stuck product restarts this
// clock and the state falls back to `READING` — it can only ever under-report a
// stall, never invent one. Under-reporting is exactly what shipped, so this is
// strictly better than today and does not pretend to be complete. A real
// `requested_at` column would make it exact and is not worth a migration until
// a row is measured surviving this bound.
//
// ⚖️ AND IT IS NOT `IMPORT_FAILED`, WHICH WOULD BE A CLAIM WE CANNOT MAKE. That
// state means Twin tried and the attempt reported back. This one means nothing
// reported at all, and the difference is the sentence the creator reads.
export const READ_STALLS_AFTER_MS = 30 * 60 * 1000

/** Did this row's source arrive before `cutoff`? `updated` is the only clock
 *  the record carries — see above for what that costs. */
function startedReadingBefore(e: ProductEntityRecord, cutoff: number): boolean {
  const t = Date.parse(e.updated ?? '')
  // ⚠️ AN UNPARSEABLE OR ABSENT TIMESTAMP IS NOT A STALL. Saying a read failed
  // because we cannot read our own column would blame the creator for our gap.
  return Number.isFinite(t) && t < cutoff
}

/** A link is on file and nothing came back — whether the attempt reported its
 *  own failure or simply never reported. ⚖️ THE TWO STATES ARE DIFFERENT FACTS
 *  AND ONE SITUATION: to the creator, both mean "press Retry". Named here so
 *  the screen reads the pair once instead of re-deriving it per control, which
 *  is how the stall came to be handled in one place and not the other. */
export const READ_DID_NOT_COME_BACK: ReadonlySet<ProductLifecycle> =
  new Set<ProductLifecycle>(['IMPORT_FAILED', 'READING_STALLED'])

export const factsAreQuotable = (s: ProductLifecycle): boolean => s === 'READY'

/**
 * ⚠️ IMPORT_FAILED WAS NOT DERIVABLE, AND THIS RECORDS WHAT CHANGED.
 *
 * It used to be absent from the union on purpose: a failed extraction wrote
 * NOTHING back, so `knowledge` stayed null and `knowledge_extracted_at` stayed
 * null -- byte-identical to a product whose extraction was never attempted.
 * `READING` therefore meant "queued, in flight, OR failed some time ago", and a
 * creator whose page could not be read saw "Twin is reading the page" forever.
 *
 * ⚖️ THE FIX WAS A COLUMN, NOT A CLEVERER DERIVATION, and it stayed that way.
 * Guessing from elapsed time -- "null for more than ten minutes means failed" --
 * reports a slow queue as a failure and a fast failure as progress, silently.
 * Migration 0169 adds `knowledge_failed_at` and `knowledge_error`; the worker
 * records them when the handler throws and CLEARS them on every success, so a
 * product that failed once and later read fine does not keep reporting a
 * failure it has recovered from.
 *
 * ⚠️ AND THE STATE IS STILL DERIVED. The columns say what happened to the
 * ATTEMPT; they are not a status field that could disagree with the knowledge
 * itself. A failure only becomes IMPORT_FAILED where nothing was learned.
 */
export const IMPORT_FAILED_IS_DERIVABLE_SINCE_0169 =
  'A failed extraction now records knowledge_failed_at and knowledge_error, so '
  + 'READING can be distinguished from a failure that already happened.'

// ── "NO LINK" AND "THE LINK FAILED" ARE DIFFERENT SENTENCES ───────────────
//
// ⚠️ REPORTED 2026-09-23: nothing on screen told "this product has no link"
// apart from "Twin could not read its link". The lifecycle folds photos and a
// link into one "source"; this names the LINK's own state, so the row and the
// Link field can say exactly which one it is.
export type LinkStatus = 'NO_LINK' | 'READING' | 'TIMED_OUT' | 'FAILED' | 'READ_NOTHING' | 'READ'

export function linkStatus(e: ProductEntityRecord, now: number = Date.now()): LinkStatus {
  if (!(e.productUrl ?? '').trim()) return 'NO_LINK'
  const k = e.knowledge
  if (e.knowledgeFailedAt && (k === null || k.length === 0)) return 'FAILED'
  if (k === null) return startedReadingBefore(e, now - READ_STALLS_AFTER_MS) ? 'TIMED_OUT' : 'READING'
  return k.length === 0 ? 'READ_NOTHING' : 'READ'
}

export function linkStatusMessage(e: ProductEntityRecord, now: number = Date.now()): string {
  switch (linkStatus(e, now)) {
    case 'NO_LINK': return 'No link added yet.'
    case 'READING': return 'Reading this link now.'
    case 'TIMED_OUT': return 'Reading this link timed out after 30 minutes. Press Retry.'
    case 'FAILED': {
      const why = (e.knowledgeError ?? '').trim().replace(/[.\s]+$/, '')
      return `This link could not be read${why ? ` (${why})` : ''}. Press Retry.`
    }
    case 'READ_NOTHING': return 'This link was read, but it said nothing usable about the product.'
    case 'READ': return 'This link was read.'
  }
}

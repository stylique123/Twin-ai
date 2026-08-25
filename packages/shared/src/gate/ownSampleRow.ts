// THE ACCOUNT HALF WAS WRITTEN, STORED, AND READ BY NOTHING.
//
// ⚠️ MEASURED ON MAIN, NOT SUSPECTED. `messageForOwnAccount` exists, is tested
// four files deep, and the worker's `publishCounts` writes all four columns onto
// `brand_voices` on every sample. And `apps/web` does not import
// `messageForOwnAccount` anywhere — the PICKED-VIDEO half of the same gate is
// wired to the creator at V2Building.tsx, so one half of one gate speaks and the
// other half has never said a word to anybody.
//
// That is the same class as `visual_hook` and `beat_plan[].proof`: a field the
// system fills in carefully and nobody reads. This module is the missing reader.
//
// ⚖️ IT CONVERTS A ROW, IT DOES NOT DECIDE ANYTHING. Every judgement about what
// to say stays in `messageForOwnAccount`, which is already tested against the
// worker's own producer in `theTwoHalvesAgree.test.ts`. A second opinion about
// what "enough" means, written here, is exactly the drift this repo keeps
// catching.
import type { AccountCounts } from './talkingHeadFit'

/** The four columns `publishCounts` writes. Unknown-shaped on purpose: this
 *  reads a database row, and a row is whatever the database handed back. */
export interface OwnSampleRow {
  own_sample_usable?: unknown
  own_sample_checked?: unknown
  own_sample_complete?: unknown
  own_sample_no_answer?: unknown
}

/**
 * ⚠️ THE NULL CHECK PRECEDES THE COERCION, AND THIS IS THE WHOLE REASON THIS
 * FUNCTION EXISTS RATHER THAN AN INLINE `Number(row.own_sample_checked)`.
 * `Number(null)` is `0` and `Number.isFinite(0)` is `true`, so a voice that was
 * NEVER SAMPLED would arrive at `messageForOwnAccount` as a finished
 * measurement of zero out of zero. That is silent today only because
 * `checked < 1` catches it — but `usable: null, checked: 6` would render "None
 * of the 6 videos we looked at are you talking to the camera" to a creator whose
 * sample simply has not written its usable count yet.
 *
 * So a column that is not a real number makes the whole row unreadable, and an
 * unreadable row returns null rather than a zero.
 */
function countOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'number') return null
  if (!Number.isFinite(v)) return null
  if (v < 0) return null
  return v
}

/**
 * Turn a stored voice row into the counts the message reads, or null when the
 * row cannot support a sentence.
 *
 * ⚖️ `complete` IS CARRIED THROUGH AS THE THREE-STATE IT IS. The column is
 * written explicitly while still false — 0171's check constraint refuses a
 * half-written sample — so `false` genuinely means "still collecting" and
 * `messageForOwnAccount` renders that as silence. A row whose `complete` is
 * absent or non-boolean is NOT assumed finished here: it is unreadable, because
 * the one caller that can be partial is the only one that would omit it, and
 * guessing "finished" for it re-creates the exact bug #537 landed to prevent.
 *
 * ⚠️ `own_sample_no_answer` IS DELIBERATELY NOT READ. It records how many videos
 * the check could not answer for, which belongs in an audit, not in a sentence
 * to a creator — and folding it into `checked` would inflate a denominator the
 * message states out loud.
 */
export function ownSampleCounts(row: OwnSampleRow | null | undefined): AccountCounts | null {
  if (!row || typeof row !== 'object') return null
  const usable = countOrNull(row.own_sample_usable)
  const checked = countOrNull(row.own_sample_checked)
  if (usable === null || checked === null) return null
  if (typeof row.own_sample_complete !== 'boolean') return null
  // ⚖️ MORE USABLE THAN CHECKED IS NOT A SMALL ERROR, it is a row that cannot be
  // described truthfully — "7 of the 6 videos we looked at" — so it is refused
  // rather than clamped. Clamping would print a confident sentence from data
  // that is known to be wrong.
  if (usable > checked) return null
  return { usable, checked, complete: row.own_sample_complete }
}

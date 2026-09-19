// WHICH EXTRACTOR SAID IT, SO AN IMPROVEMENT CAN REACH THE CREATORS ALREADY HERE.
//
// ⚠️ THE PROBLEM THIS SOLVES IS NOT A BUG, IT IS A CEILING. Every improvement to
// the extraction prompt so far has only ever helped the NEXT creator scanned.
// The 42 voices already in the store keep whatever the prompt said on the day
// they signed up, because nothing records what that was — so "re-mine everything
// the old prompt produced" has never been a sentence anyone could act on.
//
// ⚖️ ONE INTEGER, BUMPED BY HAND, AND DELIBERATELY NOT A HASH OF THE PROMPT. A
// content hash would change on a typo fix and put 1,339 rows back in the re-mine
// cohort for nothing; it would also make the cohort query unorderable, and
// "older than N" is the only question anyone asks. A human bumping a number is
// the human saying "this change is worth paying to re-run".

/** The version of the extraction prompts in `voice.ts` that is live now.
 *
 *  ⚠️ BUMP THIS WHEN THE PROMPT CHANGES IN A WAY WORTH RE-RUNNING — a new field,
 *  a new question, a different taxonomy. Do NOT bump it for wording that cannot
 *  change what comes back: the cost of a bump is a model call per stored voice.
 *
 *  ⚖️ VERSION 1 IS "BEFORE ANY OF THIS", and it is never written. Rows made
 *  before the stamp existed carry NULL, which `isStale` reads as unknown and
 *  therefore stale — true, and the reading every caller wants. Starting the
 *  counter at 2 means no stamped row can ever be confused with an unstamped one.
 *
 *  HISTORY, so a bump is auditable rather than folklore:
 *    1  (implicit, NULL) every row written before 2026-09-17.
 *    2  the stamp itself. Prompt unchanged — this version exists so that the
 *       NEXT prompt change has something to be newer than.
 *    3  the targeted pass: seven questions asked of every creator (ten when a
 *       product is on record), each answer carrying the EVIDENCE sentence behind
 *       it. The general pass is unchanged and still runs — this version marks a
 *       store that has been asked the questions as well as read. Every voice
 *       stamped 2 or NULL is therefore worth re-mining, which is the whole
 *       mechanism doing its job for the first time. */
export const EXTRACTOR_VERSION = 3

/** Would the current extractor produce something this row's did not?
 *
 *  ⚖️ NULL IS STALE. "Nobody recorded which prompt made this" and "an old prompt
 *  made this" are the same decision, and treating unknown as current would
 *  permanently exclude exactly the rows that most need re-mining — the oldest
 *  ones in the store. Three-valued in, two-valued out, and the unknown falls on
 *  the side that costs a model call rather than the side that loses material. */
export function isStale(version: number | null | undefined, current = EXTRACTOR_VERSION): boolean {
  if (version === null || version === undefined) return true
  if (!Number.isFinite(version)) return true
  return version < current
}

/** The re-mine decision for one voice, from the versions its rows carry.
 *
 *  ⚠️ IT TAKES THE MAXIMUM, NOT THE MINIMUM, AND NOT "ANY STALE ROW". A voice
 *  whose store contains one row from the current prompt has been read by the
 *  current prompt — the older rows beside it are what that prompt chose to leave
 *  alone, plus history the merge could not raise because the fact was not
 *  re-derived. Re-mining on "any stale row" would re-run every voice forever,
 *  which is the all-or-nothing behaviour this whole mechanism replaces.
 *
 *  ⚖️ AN EMPTY STORE IS STALE. A voice with no knowledge at all is the strongest
 *  possible case for reading its transcripts. */
export function voiceNeedsRemine(
  versions: ReadonlyArray<number | null | undefined>,
  current = EXTRACTOR_VERSION,
): boolean {
  if (versions.length === 0) return true
  let best: number | null = null
  for (const v of versions) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue
    if (best === null || v > best) best = v
  }
  return isStale(best, current)
}

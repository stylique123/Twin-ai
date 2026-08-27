/**
 * EVERY SENTENCE THE SAME LENGTH IS ITS OWN TELL.
 *
 * ⚠️ VOICE CAUSE 2 (PART 2) — A SECOND STRUCTURAL AI TELL, NOT A WORD LIST.
 * Real speech runs long and short back to back — a clause, then a fragment,
 * then a run-on. A model settling into one sentence length and holding it
 * for an entire script is a templated cadence, the same defect class as
 * `parallelTriads.ts`'s repeated "X, Y, and Z", just measured differently:
 * that one catches a repeated SHAPE, this one catches a missing spread.
 *
 * ⚖️ ADVISORY, NEVER A VERDICT. This only speaks up when the WHOLE script's
 * sentence lengths cluster tighter than ordinary speech does, never about
 * any one sentence — matching `parallelTriads.ts`'s discipline: never say
 * the length is wrong, only that the script never varies it.
 *
 * ⚖️ AGAINST THE CREATOR'S OWN VARIANCE WHEN IT'S MEASURED, A DEFAULT
 * OTHERWISE. A creator who genuinely writes in short, even beats is not
 * uniform-by-AI — they're uniform by voice. `styleCompiler.ts` doesn't (yet)
 * measure spread, so a creator-specific threshold isn't available; until it
 * is, this uses one honest default-register threshold, calibrated to
 * ordinary spoken cadence, and says so in the note rather than pretending to
 * know this creator's normal range.
 */

/** Sentences shorter than this many words are ignored when they cannot
 *  themselves carry the "how many words" signal at all. */
const MIN_WORDS = 1

/** Below this many measured sentences, a low spread is coincidence, not a
 *  cadence — matches the sample-size discipline `styleCompiler.ts` already
 *  uses (`PARTIAL_MIN_SENTENCES`) for the same reason: too few points to
 *  call a pattern. */
export const MIN_SENTENCES_FOR_UNIFORMITY = 6

/** A coefficient of variation (stddev / mean) below this is tighter than
 *  ordinary spoken cadence — real speech typically runs 0.35+. Below this
 *  the script reads as machine-metered rather than spoken. */
export const UNIFORMITY_CV_THRESHOLD = 0.22

const wordsIn = (s: string) => s.trim().split(/\s+/).filter((w) => /\w/.test(w)).length

function stddev(ns: readonly number[]): number {
  if (ns.length < 2) return 0
  const mean = ns.reduce((a, b) => a + b, 0) / ns.length
  const variance = ns.reduce((a, b) => a + (b - mean) ** 2, 0) / ns.length
  return Math.sqrt(variance)
}

/** Word counts for every spoken line, in order, filtering out blanks the
 *  same way a silent beat would be filtered before this is called. */
export function sentenceWordCounts(lines: readonly string[]): number[] {
  return lines
    .map((l) => (typeof l === 'string' ? wordsIn(l) : 0))
    .filter((n) => n >= MIN_WORDS)
}

/**
 * Advisory note when a script's spoken-line lengths cluster tighter than
 * ordinary speech, or `null` when there's too little to judge or the spread
 * is normal.
 *
 * ⚠️ THE COUNT AND THE THRESHOLD BOTH GATE THIS. Too few lines and any
 * spread is noise; the coefficient of variation, not the raw stddev, is
 * what's compared, since a script's mean sentence length shouldn't change
 * whether uniformity gets flagged.
 */
export function sentenceUniformityNote(lines: readonly string[]): string | null {
  const counts = sentenceWordCounts(lines)
  if (counts.length < MIN_SENTENCES_FOR_UNIFORMITY) return null
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length
  if (mean === 0) return null
  const cv = stddev(counts) / mean
  if (cv >= UNIFORMITY_CV_THRESHOLD) return null
  return `Every line in this script runs close to the same length (${Math.round(mean)} words, on average). Real speech varies more — mix in some short, clipped lines and some longer ones.`
}

/**
 * HOW MUCH OF THE REFERENCE'S ACTUAL LANGUAGE SURVIVED INTO THE SCRIPT.
 *
 * ⚠️ THE CONTROL SHIPPED ONCE LOOKING CORRECT AND DOING NOTHING. `REFERENCE_USE`
 * was renamed into legibility (`structure` | `idea_structure` | `stay_close`)
 * and given a decidable directive, and four audited live runs still carried the
 * reference creator's own sentences into the creator's script — at the LOOSEST
 * setting. A borrowing fix nobody can measure is indistinguishable from that
 * rename, which is why this module exists BEFORE the mechanism that uses it.
 *
 * ⚖️ A MEASURE, NOT A GATE. `phraseOverlap.ts` decides, per beat, whether a
 * single line must be repaired — it is the enforcement path and it answers
 * yes/no at a threshold. This module answers "how much", over a whole script,
 * so two runs of the same reference at two fidelity settings can be COMPARED.
 * A pass/fail check cannot show a reduction; a number can.
 *
 * ⚖️ BUILT ON `longestContentRun`, NOT ON A SECOND DEFINITION OF "COPIED".
 * The stopword list, the content-word floor and the order-preserving run are
 * imported from the enforcement module. A measure that scored copying
 * differently from the check that repairs it would let a fix look good here
 * while the writer path disagreed — which is the exact failure mode (two homes
 * for one rule) this whole change is correcting.
 *
 * ⚖️ DETERMINISTIC, NO MODEL. This runs in tests, in CI and over frozen
 * fixtures. Anything that needed a model call could not produce a baseline
 * anyone could re-derive.
 */
import { longestContentRun } from './phraseOverlap.js'

/** ⚠️ SIX, PINNED, AND DELIBERATELY NO LONGER `MIN_OVERLAP_CONTENT_WORDS`.
 *
 *  This tracked the writer path's repair threshold, on the reasoning that
 *  "high overlap" here should mean what "must repair" means there. That
 *  coupling is what makes this number useless the first time the repair
 *  threshold moves — and it has now moved, from six to four.
 *
 *  ⚖️ A MEASURING STICK THAT MOVES WHEN THE POLICY MOVES CANNOT SHOW WHETHER
 *  THE POLICY WORKED. `referenceBorrowingBaseline` exists to hold a measured
 *  "before" against which a change to the writer is compared. Had this stayed
 *  coupled, lowering the repair floor would have silently rewritten the
 *  baseline's own `high` and `share` figures for runs it never regenerated —
 *  the frozen evidence would have reported an improvement, or a regression,
 *  that nothing in the product actually did.
 *
 *  So this is a literal six now, and it stays six: the number the four audited
 *  runs were measured at. Changing it means re-freezing the baseline, out
 *  loud, in a change that says so. */
export const HIGH_OVERLAP_RUN_WORDS = 6

export interface SentenceOverlap {
  /** Index of the spoken line this sentence came from. */
  lineIndex: number
  /** Index of the sentence within the whole script, in reading order. */
  sentenceIndex: number
  /** Longest contiguous content-word run this sentence shares with the reference. */
  run: number
}

export interface VerbatimOverlapReport {
  /** Longest contiguous shared content-word run anywhere in the script. THE
   *  headline number: it is the length of the longest thing the creator would
   *  have said in the reference creator's own words and order. */
  longestRun: number
  /** Total sentences measured across all spoken lines. */
  sentences: number
  /** Sentences whose longest shared run reaches `HIGH_OVERLAP_RUN_WORDS`. */
  highOverlapSentences: number
  /** `highOverlapSentences / sentences`, or 0 when there is nothing to measure.
   *  Rounded to four places so a frozen baseline is stable across platforms. */
  highOverlapShare: number
  /** Every sentence's run, in reading order — the evidence behind the summary. */
  perSentence: readonly SentenceOverlap[]
}

const EMPTY: VerbatimOverlapReport = Object.freeze({
  longestRun: 0, sentences: 0, highOverlapSentences: 0, highOverlapShare: 0,
  perSentence: Object.freeze([]) as readonly SentenceOverlap[],
})

/**
 * Split a spoken line into sentences.
 *
 * ⚖️ SENTENCES, NOT LINES, ARE THE UNIT OF BORROWING. Run A's leak was ONE
 * sentence inside a longer beat; scoring the whole beat would have diluted a
 * total lift into a partial-looking score. Splitting on terminal punctuation
 * keeps the unit the size of the thing that gets copied.
 */
function sentencesOf(line: unknown): string[] {
  return String(line ?? '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/** Accepts the shapes a script is actually held in: plain strings, or beats
 *  with a `line`. Anything else contributes no sentences rather than throwing —
 *  a measurement must never be the thing that fails a generation. */
export type ScriptInput = readonly (string | { line?: unknown } | null | undefined)[]

function lineOf(entry: string | { line?: unknown } | null | undefined): string {
  if (typeof entry === 'string') return entry
  if (entry && typeof entry === 'object' && typeof (entry as { line?: unknown }).line === 'string') {
    return (entry as { line: string }).line
  }
  return ''
}

/**
 * Measure how much of the reference's actual language reached the script.
 *
 * Reports the longest shared n-gram run and the share of script sentences with
 * a high-overlap match in the reference. Both fall when the mechanism works;
 * neither can be argued with.
 */
export function measureVerbatimOverlap(
  script: ScriptInput | null | undefined,
  referenceText: unknown,
): VerbatimOverlapReport {
  const ref = String(referenceText ?? '').trim()
  if (ref === '' || !Array.isArray(script) || script.length === 0) return EMPTY

  const perSentence: SentenceOverlap[] = []
  let longestRun = 0
  let sentenceIndex = 0

  script.forEach((entry, lineIndex) => {
    for (const sentence of sentencesOf(lineOf(entry))) {
      const run = longestContentRun(sentence, ref)
      perSentence.push({ lineIndex, sentenceIndex, run })
      if (run > longestRun) longestRun = run
      sentenceIndex++
    }
  })

  const sentences = perSentence.length
  if (sentences === 0) return EMPTY
  const highOverlapSentences = perSentence.filter((s) => s.run >= HIGH_OVERLAP_RUN_WORDS).length
  return Object.freeze({
    longestRun,
    sentences,
    highOverlapSentences,
    // ⚖️ ROUNDED, BECAUSE THIS NUMBER GETS FROZEN. A baseline recorded to
    // seventeen places is a baseline that fails on a different float path and
    // teaches the next reader to loosen the assertion.
    highOverlapShare: Math.round((highOverlapSentences / sentences) * 10000) / 10000,
    perSentence: Object.freeze(perSentence) as readonly SentenceOverlap[],
  })
}

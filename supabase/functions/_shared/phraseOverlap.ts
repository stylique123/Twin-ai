// GENERATED FROM packages/shared/src/script/phraseOverlap.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
/**
 * REFERENCE MATERIAL MAY SHAPE A SCRIPT. IT MAY NEVER BECOME ITS SENTENCES.
 *
 * ⚠️ MEASURED ACROSS FOUR AUDITED DOGFOOD RUNS (2026-08). Run A's script
 * carried the reference's own line verbatim — "You hire soft pansies who
 * complain about the market instead of doing the work." — as this creator's
 * spoken dialogue. Run D's script, even at fidelity="loose", still reproduced
 * "measuring the risk of taking action while ignoring the risk of doing
 * nothing is exactly what keeps people poorer than they ought to be" and
 * "start taking more shots on goal" near-verbatim from the reference
 * transcript. Structure, premise and pacing may be learned from a reference;
 * its actual sentences may not become the creator's asserted speech.
 *
 * ⚖️ CONTIGUOUS, NOT BAG-OF-WORDS. Two lines that use the same six words in
 * different clauses are not the same sentence; two lines that use them in the
 * same order are. This module finds the second case only — a RUN of shared
 * content words in matching order — because that is the shape an actual
 * copy-paste or a too-faithful paraphrase leaves, and a topical-overlap
 * measure would flag every script that discusses the same subject as its
 * reference, which is not the defect.
 *
 * ⚖️ STOPWORDS ARE REUSED FROM `hookContract.ts`, NOT REINVENTED. A second,
 * slightly different stopword list is exactly the kind of drift that makes
 * two "content word" checks in the same codebase disagree about the same
 * sentence.
 */
import { STOPWORDS } from './hookContract.ts'

/** ⚠️ FOUR, AND SIX WAS CALIBRATED AGAINST A WORRY THE SKELETONISER HAD
 *  ALREADY HANDLED.
 *
 *  This read SIX, justified like so: "'measuring the risk of taking action' is
 *  six content words in the reference's own order; below that, ordinary shared
 *  phrasing ('the risk of doing', 'more shots on') reads as coincidence rather
 *  than copying."
 *
 *  Both of those innocent examples are TWO content words, not five.
 *  `contentSkeleton` drops stopwords and anything under four letters before
 *  anything is counted, so "the risk of doing" is `risk doing` and "more shots
 *  on" is `shots goal`. The floor was set six words above the phrases it was
 *  set to protect.
 *
 *  ⚠️ MEASURED ACROSS ALL FOUR FROZEN LIVE RUNS, not argued. Every maximal
 *  shared run of two or more content words, by run:
 *
 *    A  never tracked what customer (4) · those three things order (4)
 *       market moved without (3) · hire soft pansies complain about market
 *       instead doing work (9)
 *    B  NOTHING, at any length down to two
 *    C  partner founders scale their businesses acquisition education free
 *       just have apply (11)
 *    D  measuring risk taking action while ignoring risk doing nothing exactly
 *       what keeps people poorer than they ought (17) · have start taking more
 *       shots goal (6) · exactly what (2)
 *
 *  ⚖️ RUN B IS THE REASON THIS IS SAFE TO LOWER. It is the one clean run — the
 *  negative control — and it stays at ZERO all the way down to a two-word
 *  floor. Lowering the threshold does not flood the innocent case; it catches
 *  two more borrowed runs in run A and changes nothing anywhere else.
 *
 *  ⚖️ FOUR, NOT THREE, AND NOT TWO. Three would add "market moved without",
 *  which is real but thin, and two would start admitting "exactly what" and
 *  "number three" — pairs common enough that a creator discussing the same
 *  subject would trip them. Four is the shortest run in this evidence that is
 *  unambiguously the reference's phrasing rather than its topic. */
export const MIN_OVERLAP_CONTENT_WORDS = 4

function normalize(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** The line reduced to its content-word skeleton, in original order. Short
 *  words and stopwords carry no evidence of copying on their own. */
function contentSkeleton(line: unknown): string[] {
  return normalize(line).split(' ').filter((w) => w.length >= 4 && !STOPWORDS.has(w))
}

export interface PhraseOverlap {
  beatIndex: number
  /** The shared run, as it appears in the SCRIPT line (content words only,
   *  lowercased) — enough to prove the match without printing the whole line. */
  run: string
  words: number
}

/**
 * The longest contiguous run of content words a spoken line shares, IN ORDER,
 * with the reference transcript.
 *
 * ⚠️ ORDER-PRESERVING, O(n·m) ON CONTENT WORDS ONLY. A script beat is a
 * sentence, not a corpus — this is a handful of words compared against a
 * transcript of a few hundred, run once per beat, not a search problem.
 */
export function longestContentRun(line: unknown, referenceText: unknown): number {
  const a = contentSkeleton(line)
  const b = contentSkeleton(referenceText)
  if (a.length === 0 || b.length === 0) return 0
  let best = 0
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (a[i] !== b[j]) continue
      let k = 0
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++
      if (k > best) best = k
      // ⚠️ NO EARLY EXIT ON A SHORT MATCH. Two runs can start with the same
      // word and diverge; only the longest contiguous run counts as copying.
    }
  }
  return best
}

export interface ScriptBeatLike {
  line?: unknown
}

/**
 * Which spoken lines share a ≥6-content-word contiguous run with the
 * reference transcript. Reports, does not rewrite — the caller decides
 * whether to repair the beat or turn it into an `ask` (see `beatAsk.ts`).
 */
export function findPhraseOverlaps(
  beats: readonly ScriptBeatLike[] | null | undefined,
  referenceText: unknown,
): readonly PhraseOverlap[] {
  const ref = normalize(referenceText)
  if (ref === '' || !Array.isArray(beats)) return Object.freeze([])
  const out: PhraseOverlap[] = []
  beats.forEach((b, i) => {
    const line = typeof b?.line === 'string' ? b.line : ''
    if (line.trim() === '') return
    const run = longestContentRun(line, referenceText)
    if (run < MIN_OVERLAP_CONTENT_WORDS) return
    const skeleton = contentSkeleton(line)
    // Re-find the matching window in the SCRIPT line (not the reference) so
    // the reported evidence is what the creator was about to say.
    let bestStart = 0, bestLen = 0
    const refSkeleton = contentSkeleton(referenceText)
    for (let x = 0; x < skeleton.length; x++) {
      for (let y = 0; y < refSkeleton.length; y++) {
        if (skeleton[x] !== refSkeleton[y]) continue
        let k = 0
        while (x + k < skeleton.length && y + k < refSkeleton.length && skeleton[x + k] === refSkeleton[y + k]) k++
        if (k > bestLen) { bestLen = k; bestStart = x }
      }
    }
    out.push({ beatIndex: i, run: skeleton.slice(bestStart, bestStart + bestLen).join(' '), words: run })
  })
  return Object.freeze(out)
}

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
import { STOPWORDS } from './hookContract.js'

/** ⚠️ SIX IS THE FLOOR MEASURED AGAINST THE RUN D EVIDENCE. "measuring the
 *  risk of taking action" is six content words in the reference's own order;
 *  below that, ordinary shared phrasing ("the risk of doing", "more shots
 *  on") reads as coincidence rather than copying. */
export const MIN_OVERLAP_CONTENT_WORDS = 6

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

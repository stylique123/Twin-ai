// "RECURRING" WAS ASSERTED BY A MODEL AND NEVER ONCE COUNTED.
//
// ⚠️ MEASURED IN PRODUCTION, 2026-09-06. Of the 32 `recurring_ctas` entries
// belonging to a voice whose creator has their own transcripts on file:
//
//     said in ZERO of their own videos ....... 16  (50%)
//     said in exactly ONE .................... 13  (41%)
//     said in THREE or more ................... 0  ( 0%)
//
// Not one "recurring" CTA in production recurs. The sibling extractor
// `extractSignaturePhrases` refuses to call a phrase a signature below
// SIG_MIN_VIDEOS = 3 DIFFERENT videos, for exactly this reason. This field had
// no such floor and no evidence link: `worker/src/voice.ts` parses it straight
// out of a model response as `arr(str)`.
//
// ⚠️ AND IT REACHES THE WRITER AS A THING SCRIPTS MAY END ON
// (`generate-blueprint` renders "Recurring CTAs: ..."). That is how a TikTok
// baker's script closed on "subscribe to our channel": her own list really did
// contain it, because she said it once, in one of four videos.
//
// ── WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT ─────────────────────
//
// ⚖️ IT COUNTS. IT DOES NOT DROP. With a median of four transcripts per creator
// a hard >=3 floor would delete nearly every CTA in the system, and that
// threshold would be one nobody measured — the exact shape of "a constraint
// that has only ever seen the population it was written for". The count is what
// makes the enforcement decision evidential later.
//
// ⚠️ THREE STATES, NOT TWO, AND THE NULL IS LOAD-BEARING. `null` means COULD NOT
// CHECK — no transcripts on file, or a CTA too short to verify. `0` means
// checked and not found. Collapsing those to zero would report "she never says
// this" about a creator whose speech was never read, which is the reverse of
// the truth and worse than saying nothing.
//
// ⚖️ AND IT MATCHES VERBATIM, ON PURPOSE, WHICH UNDER-COUNTS. A CTA the creator
// paraphrases ("make sure you subscribe" for "don't forget to subscribe") does
// not match. That is why the field is named `observed_verbatim_in` rather than
// `times_said`: it reports what was literally found, and a reader must not
// upgrade that into a claim about what the creator never says. PRESENCE is
// evidence here; absence is not.

/** ⚠️ NORMALISED ON BOTH SIDES OR IT MEASURES PUNCTUATION. Apostrophes are
 *  removed rather than spaced so "don't" and "dont" are one token; everything
 *  else non-alphanumeric becomes a space and runs collapse. */
export function normaliseSpeech(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Below this a CTA cannot be verified: "subscribe" alone would match almost
 *  any transcript that mentions subscribing at all, in any context. */
export const MIN_VERIFIABLE_WORDS = 3

export interface CtaEvidence {
  cta: string
  /** Videos whose transcript contains this CTA verbatim after normalisation.
   *  `null` means COULD NOT CHECK — never 0 by default. */
  observed_verbatim_in: number | null
  /** How many of the creator's own videos were available to check against. */
  of_videos: number
}

/**
 * Count each CTA against the creator's own spoken transcripts.
 *
 * @param ctas      the model's proposed recurring CTAs
 * @param transcripts the creator's OWN speech — never a reference's
 */
export function ctaEvidenceFor(
  ctas: readonly unknown[] | null | undefined,
  transcripts: readonly unknown[] | null | undefined,
): CtaEvidence[] {
  const list = Array.isArray(ctas) ? ctas : []
  const corpus = (Array.isArray(transcripts) ? transcripts : [])
    .map(normaliseSpeech)
    .filter((t) => t !== '')

  return list
    .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    .map((cta) => {
      const needle = normaliseSpeech(cta)
      // ⚠️ THE NULL CHECKS PRECEDE THE COUNT. Either of these returning 0 would
      // assert a fact about the creator that nothing established.
      const unverifiable = corpus.length === 0
        || needle.split(' ').filter(Boolean).length < MIN_VERIFIABLE_WORDS
      return {
        cta: cta.trim(),
        observed_verbatim_in: unverifiable
          ? null
          : corpus.filter((t) => t.includes(needle)).length,
        of_videos: corpus.length,
      }
    })
}

// ⚖️ THERE IS NO RENDERER HERE, DELIBERATELY. The only place these counts are
// spoken to anyone is the prompt line in `generate-blueprint`, which cannot
// import from the worker and carries its own `renderRecurringCtasInline`. A
// formatter whose sole caller was its own test is the defect this repo keeps
// finding, so this module counts and stops.

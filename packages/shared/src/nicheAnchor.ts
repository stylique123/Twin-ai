// HALF THE SCRIPTS SURVIVE A NICHE SWAP, WHICH MEANS HALF OF THEM ARE ABOUT
// NOBODY.
//
// ⚠️ THE OWNER'S TEST, STATED AS A RULE: "Swap the niche. If the sentence
// survives, delete it. 'Consistency is the foundation of success' works for a
// dentist. 'A glued binding is disposable' works for one man." A sentence that
// would read identically on someone else's account is not writing about this
// creator — it is filler that happens to be grammatical.
//
// ⚠️⚠️ MEASURED ON PRODUCTION 2026-09-15, 109 scripts and 531 beats from the
// last 30 days, against each creator's OWN extracted vocabulary:
//
//   beats carrying a word from their vocabulary ....  120 of 531  (22.6%)
//   scripts with AT LEAST ONE such beat ............   59 of 109
//   scripts with NONE — fully transplantable .......   50 of 109  (46%)
//
// ⚠️ THOSE ARE THE CORRECTED FIGURES, AND THE FIRST PASS WAS LOW. My first
// measurement matched slash-joined vocabulary entries whole, so
// "perfect bind / glued binding" never fired — see `usableNicheTerms`. Re-run
// after the split: 117 -> 120 beats, 58 -> 59 scripts. The correction is small
// and the headline is unchanged, which is worth saying plainly rather than
// implying the fix moved the result.
//
// ⚖️ SO THIS IS A COUNT AND NOT A FLOOR, AND THE NUMBER IS THE REASON. A floor
// would refuse 46% of everything the writer produces. This repo's own record on
// that is unambiguous: `generate-blueprint`'s progress-check rule only HALVED
// its target across 16 regenerated scripts, and every enforcement shipped
// without measurement had to be walked back. The rate decides whether a floor
// is ever earned; nothing here rejects a script.
//
// ⚖️ AND IT IS BUILT ON PRESENCE, WHICH IS THE ONLY DIRECTION THAT WORKS HERE.
// The standing note is exact: creator vocabulary is 137 distinct content words
// at the median, so "this word appears nowhere in the creator's store" is true
// of almost everything they actually say — a rule built on ABSENCE from a store
// flags nearly everything. This counts a beat UP when a niche word is present.
// The 22% it measures is a real signal precisely because it is not ~0%.
//
// ⚠️⚠️ AND IT ADDS NO PROMPT LINE, WHICH IS THE WHOLE POINT OF MEASURING FIRST.
// `generate-blueprint:5167` ALREADY tells the writer "every example, number,
// prop, and detail must come from THIS creator's ACTUAL world, their real
// niche, topics, offers and signature vocabulary, not generic filler" — and the
// 46% above is what that instruction achieves today. A second sentence saying
// the same thing would be two authorities on one rule, and the progress-check
// rule at :9272 already recorded what that buys: naming the forbidden phrases
// only HALVED them, survivors verbatim. So this module DETECTS and does not
// instruct. The number decides whether anything stronger is ever earned.
//
// ⚠️ `visual_profile.vocabulary`, NOT `creator_knowledge`. The knowledge store
// holds extracted lessons, not a corpus; the DNA's signature vocabulary is the
// creator's own recurring terms, which is what a niche swap would break. Using
// the wrong one is how this measurement would have come back near zero and been
// read as "the rule does not fire".

/** A term short enough to collide with ordinary English is not a niche marker.
 *  "yap" and "tab" appear in real vocabularies; so does "the" in a bad scrape.
 *  Four characters is where a term stops being a coincidence. */
export const MIN_NICHE_TERM_CHARS = 4

export interface NicheAnchorHit {
  /** 0-based index of the beat. */
  readonly beat: number
  /** The vocabulary term that anchored it, lowercased as matched. */
  readonly term: string
}

export interface NicheAnchorResult {
  /** Beats carrying at least one vocabulary term. */
  readonly anchored: number
  /** Beats with a line at all — the denominator, so a rate is never invented
   *  from a script whose beats are all silent. */
  readonly withLines: number
  /** Which beat matched which term, for a panel that has to say why. */
  readonly hits: readonly NicheAnchorHit[]
}

/**
 * Vocabulary terms worth matching on, lowercased, split and de-duplicated.
 *
 * ⚠️⚠️ A SLASH-JOINED ENTRY IS TWO TERMS, AND MISSING THAT MADE ONE DEAD. The
 * DNA extractor stores alternatives in a single entry — @woodsyleather's real
 * vocabulary contains the literal string "perfect bind / glued binding". Matched
 * whole, that can never fire: nobody says "perfect bind / glued binding" out
 * loud. My own first measurement had this flaw; re-running after the split
 * moved it 117 -> 120 beats, so the header's figures are the corrected ones.
 * Found by a test that
 * expected "glued binding" and got nothing — the test was right and the code
 * was wrong, which is the order this has to be asked in.
 */
export function usableNicheTerms(vocabulary: unknown): string[] {
  if (!Array.isArray(vocabulary)) return []
  const out = new Set<string>()
  for (const raw of vocabulary) {
    if (typeof raw !== 'string') continue
    // ⚠️ THE NULL CHECK PRECEDES THE COERCION. Split before trimming, because
    // the alternatives carry their own surrounding spaces.
    for (const part of raw.split('/')) {
      const t = part.trim().toLowerCase()
      // The length test runs on the TRIMMED value — "  ab  " is a
      // two-character term wearing six characters.
      if (t.length < MIN_NICHE_TERM_CHARS) continue
      out.add(t)
    }
  }
  return [...out]
}

/**
 * How many beats are anchored to this creator's own niche.
 *
 * ⚠️ SUBSTRING, NOT WORD BOUNDARY, AND DELIBERATELY. Real vocabularies carry
 * multi-word terms ("Oxford hollow", "text block", "perfect bind / glued
 * binding") and inflections the creator uses freely — "rebind" has to match
 * "rebinding" and "rebinds", which a `\b…\b` match on the stored term would
 * miss. The 4-character floor is what keeps substring matching honest.
 */
export function nicheAnchoredBeats(
  lines: readonly unknown[],
  vocabulary: unknown,
): NicheAnchorResult {
  const terms = usableNicheTerms(vocabulary)
  const hits: NicheAnchorHit[] = []
  let withLines = 0

  lines.forEach((raw, beat) => {
    const line = typeof raw === 'string' ? raw.trim() : ''
    if (line === '') return
    withLines++
    if (terms.length === 0) return
    const hay = line.toLowerCase()
    // First match only. A beat is anchored or it is not; counting three terms in
    // one sentence would make a rate that rises with verbosity.
    const term = terms.find((t) => hay.includes(t))
    if (term !== undefined) hits.push({ beat, term })
  })

  return { anchored: hits.length, withLines, hits }
}

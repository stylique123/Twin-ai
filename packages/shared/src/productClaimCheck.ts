// A PRICE THE PRODUCT PAGE NEVER STATED, SPOKEN AS THOUGH IT HAD.
//
// ⚠️ THE PRODUCT LIBRARY EXISTS SO SCRIPTS STOP GUESSING, and nothing yet
// checked that they had. `productEntity` stores extracted facts with provenance
// and trust; the writer is told to use them; no counter ever asked whether a
// number spoken about the product appears among them. A script can say "it is
// twenty-nine dollars a month" about a product whose stored price is thirty-nine
// and every existing guard reads clean — the beat cites the product, the product
// exists, the relationship permits commercial language.
//
// ── WHY THIS IS RESTRICTED TO MEASURED VALUES ─────────────────────────────
//
// ⚖️ "IS THIS CLAIM SUPPORTED" IS A JUDGEMENT IN GENERAL, and a string test over
// prose blocks legitimate paraphrase — refusing good scripts, which is worse
// than the defect. A benefit can be phrased a hundred ways and still be the same
// benefit.
//
// ⚠️ NUMBERS DO NOT PARAPHRASE. "$29/mo" and "29 dollars a month" are one
// figure; neither can be rewritten as "$39". So for prices, counts, percentages
// and multiples the question stops being a judgement and becomes decidable —
// which is exactly the reasoning `claimEntailment` already made for creator
// knowledge, applied to the other authority.
//
// ⚖️ SO IT REUSES THAT MODULE RATHER THAN RESTATING IT. `canonicalValue` is the
// load-bearing part — it is what makes 50k and 50,000 the same number — and a
// second copy of that normalisation is a second thing to get subtly wrong. The
// bug it already caught once (a `K` suffix read as a bare number, reported as a
// finding before it was recognised as its own defect) is the reason not to write
// it twice.
//
// ── THE LIMIT, STATED RATHER THAN IMPLIED ─────────────────────────────────
//
// ⚠️ THE SHARED MATCHER RECOGNISES A BOUNDED LIST OF UNITS: currency, per cent,
// multiples, durations, and audience nouns (subscribers, followers, customers,
// users, views). "12,000 creators" carries a noun outside that list, so no
// figure is extracted and this check says nothing about it.
//
// ⚖️ AND THE REGEX IS NOT WIDENED HERE TO GAIN THAT. It is shared with the
// creator-knowledge guard, so adding a noun would silently change what THAT
// catches as a side effect of a product change. A limit that is known and
// written down is safer than a coupled edit made to close it.
//
// ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
//
// ⚠️ IT GRANTS NOTHING AND FORBIDS NOTHING BY ITSELF. It reports figures that do
// not trace to a stored fact. Whether that ends in a rewrite, a removal or the
// creator confirming the number is the caller's decision — and a creator
// confirming their own product's price is a legitimate resolution, which is why
// this returns gaps rather than refusing.

import { canonicalValue, claimedValues } from './claimEntailment'

/** The shape this reads off a stored product fact. Structural rather than
 *  importing `ExtractedFact`, so a caller holding user-confirmed values or a
 *  plain list of strings can ask too. */
export interface ProductFactLike {
  value?: unknown
  /** `usable` and `needs_confirmation` both COUNT here, deliberately — see
   *  `supportedValues`. */
  trust?: unknown
}

export interface ProductClaimGap {
  /** 1-based, matching how beats are numbered everywhere else. */
  beat: number
  /** The figure asserted that no stored fact carries. */
  value: string
  line: string
}

/**
 * Every measured value the product's stored facts carry.
 *
 * ⚠️ `needs_confirmation` FACTS COUNT AS SUPPORT HERE, AND THAT IS NOT A HOLE.
 * That flag governs whether a fact may be SPOKEN without a person approving it —
 * a separate gate that already exists. This check asks a different question:
 * did the figure come from the product at all, or from nowhere. A number that
 * matches an unconfirmed stored fact came from the product; it is the
 * confirmation gate's business whether it may be said, and double-counting it
 * here would report the same problem twice under the wrong name.
 */
export function supportedValues(facts: readonly ProductFactLike[]): Set<string> {
  const out = new Set<string>()
  for (const f of facts) {
    const raw = typeof f?.value === 'string' ? f.value : ''
    for (const v of claimedValues(raw)) out.add(v)
  }
  return out
}

/**
 * Figures a script states about the product that no stored fact carries.
 *
 * ⚠️ ONLY BEATS THAT SOURCE THE PRODUCT ARE CHECKED. A beat drawing on creator
 * knowledge is `claimEntailment`'s business, and a beat citing nothing is the
 * leak check's — three counters that each own one question, rather than one that
 * owns three and reports all of them as the same failure.
 *
 * ⚖️ AN EMPTY FACT SET SUPPRESSES THE CHECK ENTIRELY. A product Twin has never
 * read has no figures to contradict, and reporting every number as unsupported
 * would make the counter fire loudest exactly where it knows least — training
 * the reader to ignore it.
 */
export function findProductClaimGaps(
  script: readonly { line?: unknown; substance?: unknown }[],
  facts: readonly ProductFactLike[],
): ProductClaimGap[] {
  const supported = supportedValues(facts)
  if (supported.size === 0) return []
  const out: ProductClaimGap[] = []
  script.forEach((b, i) => {
    if (b?.substance !== 'product') return
    const line = typeof b?.line === 'string' ? b.line : ''
    for (const v of claimedValues(line)) {
      if (!supported.has(v)) out.push({ beat: i + 1, value: v, line })
    }
  })
  return out
}

/** What to tell the writer: the figure, and the only three honest ways out. */
export function describeProductClaimGap(g: ProductClaimGap): string {
  return `Beat ${g.beat} states ${g.value} about the product, and no stored product fact carries that figure.`
    + ` Use a figure the product record holds, drop the number, or have the creator confirm it.`
}

/** ⚖️ EXPORTED SO A CALLER CAN NORMALISE BEFORE COMPARING — the same function
 *  both sides of this check use, so nobody re-implements "50k is 50,000". */
export { canonicalValue }

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

/** The substance value a beat carries when the product record is its source.
 *  Named rather than inlined so the edge copy and this one cannot disagree
 *  about the one string that decides whether the check runs at all. */
export const PRODUCT_SUBSTANCE = 'product_dna'

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

// ── THE LENS WAS BROKEN, AND THAT IS WHY EVERY READING WAS ZERO ───────────
//
// ⚠️ MEASURED 2026-09-08 ACROSS THE 7 SKINCARE GENERATIONS: seven of seven name
// the product, four of seven state a price nothing on record carries, and NOT
// ONE BEAT in any of the seven is labelled `substance: 'product_dna'`. So
// `product_claim_gaps: 0` on all 44 generations to date is not a low number.
// It is an unmeasured field, and every prior reading of it is void rather than
// evidence of safety.
//
// ⚖️ TWO INDEPENDENT BLINDNESSES, EITHER OF THEM SUFFICIENT ON ITS OWN:
//   1. the beat filter demanded a label the writer does not reliably emit;
//   2. an empty fact set suppressed the check entirely — and a product with no
//      stored facts is exactly the case where an invented price is likeliest.
//
// ⚠️ SO THE FILTER NOW ASKS WHAT THE BEAT IS ABOUT, NOT HOW IT WAS LABELLED.
// A beat naming the product is a beat speaking about the product, whatever
// `substance` says. The label still counts — it is kept as a second door, not
// replaced — because a beat may source the record without repeating its name.

/** Whether a beat speaks about the product: it is LABELLED as sourcing the
 *  product record, OR it names the product. Either door, never both required.
 *
 *  ⚠️ NAMES UNDER THREE CHARACTERS ARE IGNORED. A two-letter brand matches
 *  inside ordinary words, and a filter that fires on every beat is the same
 *  kind of useless as one that fires on none. */
export function beatSourcesProduct(
  beat: { line?: unknown; substance?: unknown },
  productNames: readonly string[] = [],
): boolean {
  if (beat?.substance === PRODUCT_SUBSTANCE) return true
  const line = (typeof beat?.line === 'string' ? beat.line : '').toLowerCase()
  if (line === '') return false
  return productNames.some((n) => {
    const name = String(n ?? '').trim().toLowerCase()
    return name.length >= 3 && line.includes(name)
  })
}

/** The unit half of a canonical figure — `29$` → `$`, `3x` → `x`, `12000` → ''.
 *  It is what makes "a different price" distinguishable from "a figure the
 *  record says nothing about at all". */
function unitOf(canonical: string): string {
  return canonical.replace(/^[\d.]+/, '')
}

export interface ProductClaimFindings {
  /** The record carries a figure in this unit, and the script states a
   *  DIFFERENT one. A stored price of $39 and a spoken $29 is this. */
  contradicted: ProductClaimGap[]
  /** Nothing on record speaks to this figure at all — including the case where
   *  the record holds no facts whatsoever. */
  unsupported: ProductClaimGap[]
}

/**
 * Figures spoken about the product, split by WHY they are ungrounded.
 *
 * ⚠️ THESE ARE TWO DIFFERENT FINDINGS AND MUST NOT SHARE A COUNTER.
 * "The record says $39 and the script says $29" is a contradiction — someone
 * can point at the row that disagrees. "The record says nothing about price and
 * the script says $29" is invention. They have different rates, different
 * causes and different fixes, and one number hides both.
 *
 * ⚖️ A CONTRADICTION REQUIRES A SHARED, NAMED UNIT. Two bare numbers with no
 * unit between them are not evidence of disagreement — "3 steps" and "5 steps"
 * are not the same claim — so an unlabelled figure can only ever be reported as
 * unsupported. That is a deliberately narrow reading of "contradicts".
 *
 * ⚠️ AN EMPTY FACT SET NO LONGER SUPPRESSES ANYTHING. The old copy returned []
 * so the counter would not "fire loudest where it knows least"; what it
 * actually did was go silent on the riskiest population in the product. The
 * split is what makes that safe to fix: those rows land in `unsupported`, where
 * they can be read separately and never inflate the contradiction rate.
 */
export function productClaimFindings(
  script: readonly { line?: unknown; substance?: unknown }[],
  facts: readonly ProductFactLike[],
  productNames: readonly string[] = [],
): ProductClaimFindings {
  const supported = supportedValues(facts)
  const supportedUnits = new Set<string>()
  for (const v of supported) {
    const u = unitOf(v)
    if (u !== '') supportedUnits.add(u)
  }
  const contradicted: ProductClaimGap[] = []
  const unsupported: ProductClaimGap[] = []
  script.forEach((b, i) => {
    if (!beatSourcesProduct(b, productNames)) return
    const line = typeof b?.line === 'string' ? b.line : ''
    for (const v of claimedValues(line)) {
      if (supported.has(v)) continue
      const gap = { beat: i + 1, value: v, line }
      if (supportedUnits.has(unitOf(v))) contradicted.push(gap)
      else unsupported.push(gap)
    }
  })
  return { contradicted, unsupported }
}

/** What to tell the writer: the figure, and the only three honest ways out. */
export function describeProductClaimGap(g: ProductClaimGap): string {
  return `Beat ${g.beat} states ${g.value} about the product, and no stored product fact carries that figure.`
    + ` Use a figure the product record holds, drop the number, or have the creator confirm it.`
}

/** ⚠️ SAME THREE WAYS OUT, DIFFERENT FACT: here a row DOES disagree, so the
 *  first of the three is the one to take. */
export function describeProductClaimContradiction(g: ProductClaimGap): string {
  return `Beat ${g.beat} states ${g.value} about the product, and the stored product facts carry a`
    + ` different figure in that unit. Use the figure the product record holds, drop the number, or`
    + ` have the creator correct the record.`
}

/** ⚖️ EXPORTED SO A CALLER CAN NORMALISE BEFORE COMPARING — the same function
 *  both sides of this check use, so nobody re-implements "50k is 50,000". */
export { canonicalValue }

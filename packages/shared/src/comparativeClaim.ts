// THE WRITER INVENTED A PRODUCT CLAIM, AND EVERY GUARD READ CLEAN.
//
// ⚠️ MEASURED, NOT SUSPECTED. Candle run N1, scene 3, on a 453-follower account
// that SELLS handmade candles:
//
//   "A thirty-dollar hand-poured candle with a wooden wick lasts SIX TIMES
//    LONGER than standard box store alternatives. That makes it HALF THE PRICE
//    PER BURN HOUR."
//
// Nobody supplied either figure. Her onboarding said her first batch burned
// through in six hours — the OPPOSITE of a durability claim. Her captions say
// nothing about burn time. The offer field was empty by design for the test.
// If she films it she publishes a comparison she cannot substantiate.
//
// ── WHY `findProductClaimGaps` DID NOT CATCH IT, AND IT IS NOT ONE REASON ──
//
// ⚠️ FOUR HOLES, ALL OF WHICH HAD TO BE OPEN, AND ALL FOUR WERE. Running the
// real sentence through the shared matcher returns THE EMPTY SET:
//
//   claimedValues("...lasts six times longer... half the price per burn hour")
//     => []                       // nothing at all
//   claimedValues("A $30 candle lasts 6 times longer, half the price...")
//     => ["30$"]                  // the price only; the MULTIPLE is invisible
//
//   1. Number WORDS are not matched. "thirty-dollar", "six times" — nothing.
//   2. Multiples are not extracted even in digit form.
//   3. `findProductClaimGaps` returns [] when the fact set is empty.
//   4. Only beats tagged `product_dna` are examined, and an INVENTED claim has
//      no product record to cite, so it is tagged something else.
//
// ⚖️ SO FIXING THE EMPTY-FACT-SET RULE — THE OBVIOUS FIX — WOULD HAVE CAUGHT
// NOTHING. The claim was never extracted in the first place. That is worth
// stating plainly, because "we removed the suppression" would have read like a
// fix and shipped the same defect.
//
// ── WHY THIS IS A NEW MODULE AND NOT A WIDER REGEX ────────────────────────
//
// ⚠️ `productClaimCheck.ts` FORBIDS THE SHORTCUT, IN WRITING: "the regex is not
// widened here to gain that. It is shared with the creator-knowledge guard, so
// adding a noun would silently change what THAT catches as a side effect of a
// product change." Widening `claimedValues` to see "six times" would alter what
// `claimEntailment` refuses on every creator. So this detector is separate and
// carries its own vocabulary.
//
// ⚖️ AND IT ASKS A DIFFERENT QUESTION. `findProductClaimGaps` asks "does this
// FIGURE match a stored fact" — decidable, because numbers do not paraphrase.
// This asks "is this beat making a COMPARATIVE claim about the thing the
// creator sells" — and a comparative needs no figure at all to be a liability.
// "Lasts longer than store-bought" is unsupportable in exactly the same way as
// "lasts six times longer".
//
// ── THE ASYMMETRY THAT MAKES AN EMPTY FACT SET THE DANGEROUS CASE ─────────
//
// ⚠️ `findProductClaimGaps` SUPPRESSES ITSELF WHEN IT KNOWS NOTHING, and its
// reasoning is sound for the question IT asks: a product with no stored figures
// has no figures to contradict, and firing loudest where you know least trains
// the reader to ignore the counter.
//
// ⚖️ FOR A COMMERCIAL CREATOR THAT REASONING INVERTS. No stored facts plus a
// comparative claim about the product they SELL is not the low-risk case, it is
// the high-risk one: there is no record anywhere that could substantiate it,
// which is precisely why it must not be spoken. Same evidence, opposite verdict,
// because the two checks are asking different questions.

/** A comparative or magnitude claim a script makes about the creator's product. */
export interface ComparativeClaim {
  /** 1-based, matching how beats are numbered everywhere else. */
  beat: number
  /** The phrase that triggered it, verbatim, so a reader can see the claim. */
  phrase: string
  /** `magnitude` carries a quantity ("six times longer", "half the price");
   *  `comparative` asserts superiority with no figure ("lasts longer than"). */
  kind: 'magnitude' | 'comparative'
}

/** Number words the shared matcher does not see. Deliberately small and
 *  literal — this is a detector, not a parser, and a word list cannot drift
 *  the way a widened regex would. */
const NUMBER_WORD =
  '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|half|twice|double|triple|quadruple)'

/**
 * ⚠️ MAGNITUDE: a quantity attached to a comparison. Catches both the word and
 * the digit form, because N1 wrote it in words and a retry may not.
 */
const MAGNITUDE: readonly RegExp[] = Object.freeze([
  // "six times longer", "6x longer", "twice as long", "10 times cheaper"
  new RegExp(`\\b(?:${NUMBER_WORD}|\\d+(?:\\.\\d+)?)\\s*(?:x|times)\\s+(?:as\\s+\\w+|\\w+er|more|less|longer|cheaper|faster|stronger)\\b`, 'i'),
  new RegExp(`\\btwice\\s+as\\s+\\w+\\b`, 'i'),
  // "half the price", "double the life", "a third of the cost"
  new RegExp(`\\b(?:${NUMBER_WORD}|a\\s+(?:third|quarter))\\s+(?:the|of\\s+the)\\s+(?:price|cost|time|life|size|weight)\\b`, 'i'),
  // "lasts 40 hours" style durability figures stated about the product
  new RegExp(`\\blasts?\\s+(?:${NUMBER_WORD}|\\d+)\\s*(?:x|times|hours?|days?|weeks?|months?|years?)\\b`, 'i'),
])

/**
 * ⚠️ COMPARATIVE WITH NO FIGURE, WHICH IS STILL UNSUPPORTABLE. "Lasts longer
 * than store-bought" cannot be substantiated any more than "six times longer"
 * can, and it is the phrasing a writer reaches for once figures are refused.
 *
 * ⚖️ REQUIRES AN EXPLICIT COMPARISON TARGET (`than`, `compared to`) or a
 * superlative. A bare adjective — "a long-burning candle" — is marketing
 * language, not a comparative claim, and refusing it would block honest copy.
 */
const COMPARATIVE: readonly RegExp[] = Object.freeze([
  /\b\w+er\s+than\b/i,
  /\b(?:more|less|better|worse|longer|cheaper|faster|stronger|cleaner|safer)\s+than\b/i,
  /\bcompared\s+(?:to|with)\b/i,
  /\bunlike\s+(?:most|other|store|shop|big|cheap)\b/i,
  /\b(?:the\s+)?(?:best|cheapest|longest[- ]lasting|strongest|safest|purest)\b/i,
])

/**
 * Comparative and magnitude claims in a script.
 *
 * ⚠️ SUBSTANCE-BLIND, AND THAT IS THE POINT. `findProductClaimGaps` only reads
 * beats tagged `product_dna`, which an INVENTED claim never is — the writer had
 * no product record to cite, so it tagged the beat something else and walked
 * past the guard. A fabricated claim is exactly the one with no product source,
 * so gating on that tag exempts the dangerous case.
 */
export function findComparativeClaims(
  script: readonly { line?: unknown }[],
): ComparativeClaim[] {
  const out: ComparativeClaim[] = []
  script.forEach((b, i) => {
    const line = typeof b?.line === 'string' ? b.line : ''
    if (!line.trim()) return
    for (const re of MAGNITUDE) {
      const m = re.exec(line)
      if (m) { out.push({ beat: i + 1, phrase: m[0], kind: 'magnitude' }); return }
    }
    for (const re of COMPARATIVE) {
      const m = re.exec(line)
      if (m) { out.push({ beat: i + 1, phrase: m[0], kind: 'comparative' }); return }
    }
  })
  return out
}

/**
 * Whether a comparative claim may be spoken at all.
 *
 * ⚠️ THE RULE: on a creator who SELLS, a comparative or magnitude claim about
 * the product requires at least one stored product fact to rest on. With an
 * empty record there is nothing that could substantiate it, so it is refused —
 * not reported, not softened.
 *
 * ⚖️ AND IT IS NARROW ON PURPOSE. A non-commercial creator comparing two things
 * is not making a product claim, and this returns nothing for them: the
 * liability comes from selling the thing being compared.
 */
export function unsupportedComparatives(input: {
  script: readonly { line?: unknown }[]
  /** Does this creator sell or promote anything? */
  commercial: boolean
  /** How many stored product facts exist to rest a claim on. */
  productFactCount: number
}): ComparativeClaim[] {
  if (!input.commercial) return []
  if (input.productFactCount > 0) return []
  return findComparativeClaims(input.script)
}

/** What to tell the writer. Names the phrase, and the two honest ways out. */
export function describeComparativeClaim(c: ComparativeClaim): string {
  return `Beat ${c.beat} claims "${c.phrase}" about a product the creator sells, and no stored product fact supports it.`
    + ` Remove the comparison, or have the creator supply and confirm the figure first.`
}

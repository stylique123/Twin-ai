// A TRUE CITATION ATTACHED TO A NUMBER IT DOES NOT CONTAIN.
//
// ── THE DEFECT (ledger G8) ────────────────────────────────────────────────
//
//     LINE   : "This one simple filming technique has genuinely 3x'd my
//               productivity as a creator."
//     CITED  : (experience) Has been a professional content creator for 8 years
//
// The citation is REAL — that item was genuinely supplied. It simply does not
// contain the claim being made. `UNSUPPORTED` asks whether the cited TEXT traces
// to something supplied; it does. Nothing asked whether the citation SUPPORTS
// the assertion, so a beat could attach any real item to any invention and pass
// every counter clean.
//
// ── WHY THIS IS RESTRICTED TO NUMBERS, AND WHY THAT IS NOT A COP-OUT ──────
//
// ⚖️ "DOES THIS EVIDENCE SUPPORT THIS CLAIM" IS A JUDGEMENT IN GENERAL. An
// opinion can be restated a hundred ways and still be the same opinion, so a
// string test over prose produces false positives on legitimate paraphrase —
// blocking good scripts, which is worse than the defect.
//
// ⚠️ NUMBERS DO NOT PARAPHRASE. "$50,000 a month" can be written "$50K a month"
// and it is the same figure; it can never be rewritten as "$70,000". So for
// MEASURED VALUES the question stops being a judgement and becomes decidable:
// either the cited evidence contains that value or the writer produced it from
// somewhere else.
//
// That is a narrow check. It is also the whole of the reported defect: every G8
// instance found on real runs was a NUMBER attached to evidence that did not
// carry it.
//
// ── THE TRAP, WHICH THIS HIT ON THE FIRST ATTEMPT ─────────────────────────
//
// ⚠️ A FIRST MEASUREMENT REPORTED 3 VIOLATIONS IN 10 AND ONE WAS ITS OWN BUG.
// A beat said "$50K in four months" and cited "$50,000 a month within its first
// four months" — the same figure, and the matcher called it unsupported because
// it did not normalise `K`. Reported as a finding, that would have been a third
// false alarm in one investigation.
//
// ⚖️ SO NORMALISATION IS THE LOAD-BEARING PART, not the comparison. `50k`,
// `50,000` and `$50000` are one value. Getting that wrong turns a precision
// instrument into a generator of false accusations against working scripts.

/** A measured value: a number carrying a unit, a multiplier or a currency. */
const VALUE = new RegExp(
  '[$£€]\\s?\\d[\\d,.]*\\s*(?:k|m|bn)?'
  + '|\\d[\\d,.]*\\s*(?:k|m|bn)?\\s*(?:x\\b|×|%|hours?|hrs?|minutes?|mins?|days?|weeks?'
  + '|months?|years?|dollars?|pounds?|euros?|subscribers?|followers?|customers?|users?|views?)',
  'gi')

/**
 * One canonical form per value, so equivalent notations compare equal.
 *
 * ⚠️ THIS IS THE PART THAT MATTERS. `$50K`, `$50,000` and `50000 dollars` are one
 * figure. A comparison that misses that reports a supported claim as invented.
 */
export function canonicalValue(raw: string): string {
  const s = String(raw).toLowerCase().replace(/[\s,]/g, '')
  const num = s.match(/\d[\d.]*/)?.[0] ?? ''
  if (num === '') return s
  let n = Number.parseFloat(num)
  if (!Number.isFinite(n)) return s
  // Multipliers written as a suffix, so 50k and 50000 are the same number.
  // ⚠️ THE SUFFIX IS IDENTIFIED BY WHAT FOLLOWS IT, NOT BY A WORD BOUNDARY.
  // "1.5mviews" (spaces already stripped) has no boundary after the `m`, so a
  // `\b` test silently skipped the multiplier and read 1.5M views as 1.5. The
  // only `m` that is NOT a million is the one starting "min" or "month".
  if (/\d[\d.]*k/.test(s)) n *= 1_000
  else if (/\d[\d.]*bn/.test(s)) n *= 1_000_000_000
  else if (/\d[\d.]*m(?![io])/.test(s)) n *= 1_000_000
  // The UNIT is part of the identity: 3x and 3% are different claims.
  const unit = /x|×/.test(s.replace(/[\d.,$£€]/g, '')) ? 'x'
    : s.includes('%') ? '%'
    : /[$£€]|dollar|pound|euro/.test(s) ? '$'
    : (s.match(/hour|hr|minute|min|day|week|month|year|subscriber|follower|customer|user|view/)?.[0] ?? '')
  return `${n}${unit}`
}

/** Every measured value a text asserts, canonicalised. */
export function claimedValues(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of String(text ?? '').matchAll(VALUE)) {
    const c = canonicalValue(m[0])
    if (c && /\d/.test(c)) out.add(c)
  }
  return out
}

export interface EntailmentGap {
  beat: number
  /** The value asserted that the citation does not contain. */
  value: string
  line: string
  cited: string
}

/**
 * Values a beat asserts that its own citation does not carry.
 *
 * ⚖️ ONLY BEATS THAT CITE ARE CHECKED. A beat declaring `general` is making no
 * claim about provenance, so there is no citation to fail — that is the leak
 * check's business, not this one. This asks a narrower and sharper question:
 * when a beat POINTS at evidence, does the evidence contain the figure?
 *
 * ⚠️ AND AN ABSENT CITATION IS NOT A GAP. "Cited nothing" and "cited the wrong
 * thing" are different failures with different fixes, and `undeclaredEvidence`
 * already counts the first.
 */
export function findEntailmentGaps(
  script: readonly { line?: unknown; substance?: unknown; substance_evidence?: unknown }[],
): EntailmentGap[] {
  const out: EntailmentGap[] = []
  script.forEach((b, i) => {
    if (b?.substance !== 'creator_knowledge') return
    const line = typeof b?.line === 'string' ? b.line : ''
    const cited = typeof b?.substance_evidence === 'string' ? b.substance_evidence : ''
    if (cited.trim() === '') return
    const supported = claimedValues(cited)
    for (const v of claimedValues(line)) {
      if (!supported.has(v)) out.push({ beat: i + 1, value: v, line, cited })
    }
  })
  return out
}

/** What to tell the writer. Names the figure and where it failed to come from. */
export function describeGap(g: EntailmentGap): string {
  return `Beat ${g.beat} states a figure the evidence it cites does not contain.`
    + ` The line asserts ${g.value}; the cited knowledge is "${g.cited.slice(0, 120)}".`
    + ` Cite something that carries that figure, or remove the figure.`
}

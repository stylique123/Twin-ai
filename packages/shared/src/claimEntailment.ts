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

// ── A FIGURE SPELLED OUT IS STILL A FIGURE ────────────────────────────────
//
// ⚠️ MEASURED IN PRODUCTION, 2026-09-06, AND THIS IS THE WHOLE REASON THE
// COUNTERS READ ZERO. Across the 33 generations carrying a `beat_audit`, the
// 179 script lines contain SIX lines with a digit in them — and EIGHT lines
// asserting money. All eight of the money lines are spelled out in words, and
// not one of them contains a digit:
//
//   "Multiplying your two dollar base cost by three gives you an absolute
//    minimum of seven dollars ... at nine to ten dollars for local pickup"
//   "You do not need a five thousand dollar oven to launch a microbakery."
//   "...usually add another fifty to seventy five cents per loaf"
//
// `claimedValues` kept a match only `if (/\d/.test(c))`, so every one of those
// returned THE EMPTY SET. Six of the eight beats are tagged
// `substance: 'creator_knowledge'` — they point at a citation — and
// `entailment_gaps` read 0 on every row. The check was not passing. It was
// never able to see the sentence.
//
// ⚖️ THE UNIT VOCABULARY IS UNCHANGED. ONLY THE SPELLING OF THE NUMBER WIDENS.
// `comparativeClaim.ts` records, in writing, that widening this matcher to see
// MULTIPLES ("six times longer") would change what that detector owns. It still
// would, so multiples are still not matched here — that question stays where it
// was deliberately put. What changes is that "two dollars" and "$2" become one
// value, which is the same normalisation claim `$50K` == `$50,000` already
// makes, applied to the other way a number can be written.
//
// ⚖️ AND THE WORDS ARE CONVERTED TO DIGITS AND HANDED TO `canonicalValue`,
// rather than canonicalised separately. Two spellings of the same figure must
// not be able to produce two canonical forms; routing both through one function
// is what makes that impossible rather than merely unlikely.

const ONES: Readonly<Record<string, number>> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
}
const TENS: Readonly<Record<string, number>> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
}
const SCALES: Readonly<Record<string, number>> = {
  hundred: 100, thousand: 1_000, million: 1_000_000, billion: 1_000_000_000,
}

const NUMBER_WORD = Object.keys({ ...ONES, ...TENS, ...SCALES }).join('|')

// ⚠️ THE SAME UNITS `VALUE` ALREADY CARRIES, plus the two that exist only as
// words: `percent` is how `%` is spoken, and `cents` is a sub-unit of a currency
// already listed. Neither adds a NOUN the digit matcher would not have caught in
// its own notation — which is the line `productClaimCheck.ts` asks not to cross.
const WORD_UNIT = '%|percent|hours?|hrs?|minutes?|mins?|days?|weeks?|months?'
  + '|years?|dollars?|pounds?|euros?|cents?|subscribers?|followers?'
  + '|customers?|users?|views?'

const RUN = `(?:${NUMBER_WORD})(?:[\\s-]+(?:and[\\s-]+)?(?:${NUMBER_WORD}))*`

/** A spelled-out number immediately qualifying a unit: "five thousand dollar". */
const WORD_VALUE = new RegExp(`\\b(${RUN})[\\s-]+(${WORD_UNIT})\\b`, 'gi')

/** ⚠️ A COMPOUND PRICE IS ONE FIGURE, NOT TWO, AND SPLITTING IT WOULD MANUFACTURE
 *  A FALSE ACCUSATION. "two dollars and twenty five cents" read as $2 and $0.25
 *  matches a citation saying neither, so a beat correctly citing "$2.25" would
 *  be reported as inventing two figures. That is precisely the failure mode this
 *  module's own banner records hitting on its first attempt. Matched BEFORE the
 *  general pass, and its span is then withheld from it. */
const COMPOUND = new RegExp(
  `\\b(${RUN})[\\s-]+(?:dollars?|pounds?|euros?)[\\s-]+and[\\s-]+(${RUN})[\\s-]+cents?\\b`, 'gi')

/** ⚖️ A RANGE NAMES TWO FIGURES AND ONLY THE SECOND CARRIES THE UNIT. "fifty to
 *  seventy five cents" and "nine to ten dollars" are both real production lines,
 *  and reading only the tail would record 0.75 while the script also asserts
 *  0.50. The lower bound is recovered by looking back from the match. */
const RANGE_HEAD = new RegExp(`(${RUN})[\\s-]+(?:to|or)[\\s-]+$`, 'i')

/** ⚠️ RETURNS null FOR ANYTHING IT CANNOT FULLY ACCOUNT FOR, never a partial
 *  number. A run this cannot parse is not a figure with a missing piece — it is
 *  a phrase that merely contains a number word, and guessing at it is how a
 *  precision instrument starts producing false accusations. */
export function wordsToNumber(phrase: string): number | null {
  const tokens = String(phrase).toLowerCase().split(/[\s-]+/).filter((t) => t !== '')
  let total = 0
  let current = 0
  let seen = false
  for (const t of tokens) {
    if (t === 'and') continue
    if (t in ONES) { current += ONES[t]; seen = true }
    else if (t in TENS) { current += TENS[t]; seen = true }
    else if (t in SCALES) {
      const s = SCALES[t]
      if (s === 100) current = (current === 0 ? 1 : current) * 100
      else { total += (current === 0 ? 1 : current) * s; current = 0 }
      seen = true
    } else return null
  }
  return seen ? total + current : null
}

/** The spelled-out figures in a text, rewritten in digits so that ONE
 *  canonicaliser sees both notations. */
export function spelledOutValues(text: string): string[] {
  const src = String(text ?? '')
  const out: string[] = []
  // ⚠️ COMPOUNDS FIRST, AND THEIR SPANS ARE THEN WITHHELD from the general pass
  // so the same words cannot also be read as two separate figures.
  const consumed: Array<[number, number]> = []
  for (const m of src.matchAll(COMPOUND)) {
    const whole = wordsToNumber(m[1])
    const cents = wordsToNumber(m[2])
    const at = m.index ?? 0
    if (whole === null || cents === null) continue
    out.push(`${whole + cents / 100} dollars`)
    consumed.push([at, at + m[0].length])
  }
  for (const m of src.matchAll(WORD_VALUE)) {
    const at = m.index ?? 0
    if (consumed.some(([a, b]) => at >= a && at < b)) continue
    const unit = m[2].toLowerCase()
    const emit = (n: number | null): void => {
      if (n === null) return
      // ⚠️ CENTS BECOME DOLLARS BEFORE CANONICALISATION, so "fifty cents" and
      // "$0.50" are one value rather than two that never compare equal.
      if (/^cents?$/.test(unit)) out.push(`${n / 100} dollars`)
      else if (unit === 'percent' || unit === '%') out.push(`${n}%`)
      else out.push(`${n} ${unit}`)
    }
    emit(wordsToNumber(m[1]))
    const head = src.slice(0, m.index ?? 0).match(RANGE_HEAD)
    if (head) emit(wordsToNumber(head[1]))
  }
  return out
}

/** Every measured value a text asserts, canonicalised. */
export function claimedValues(text: string): Set<string> {
  const out = new Set<string>()
  const add = (raw: string): void => {
    const c = canonicalValue(raw)
    if (c && /\d/.test(c)) out.add(c)
  }
  for (const m of String(text ?? '').matchAll(VALUE)) add(m[0])
  // ⚠️ THE DIGIT TEST ABOVE IS WHY THIS SECOND PASS EXISTS RATHER THAN A WIDER
  // `VALUE`. A spelled-out figure has no digit to survive it, so it is converted
  // to digits FIRST and then put through the same canonicaliser — one canonical
  // form for both notations, by construction.
  for (const raw of spelledOutValues(text)) add(raw)
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

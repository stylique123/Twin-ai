// HOW MUCH GROUNDING A BEAT MUST HAVE, DECIDED BY WHAT IT RISKS.
//
// ── THE FAILURE THIS EXISTS TO PREVENT ────────────────────────────────────
//
// `substanceIssues` detects a first-person history with a stale narrow verb
// list; `entitlementFailures` uses the measured `claimStrength`. On the last
// matrix the stale one sees 2 history beats and the measured one sees 22.
// Unifying them is correct. Doing ONLY that would have been a policy change
// nobody decided:
//
//     refactor detector -> strict check fires 10x more -> the product starts
//     refusing scripts it accepted yesterday
//
// That is accidental policy through architecture. The grounding a beat needs
// is a PRODUCT decision about risk, and it must be stated somewhere a reader
// can argue with — not fall out of which regex happens to be wired in.
//
// ── THE RULE ──────────────────────────────────────────────────────────────
//
// Pressure scales with what the sentence would cost if it were false.
//
//   strict    A checkable assertion about the world: statistics, pricing,
//             results, comparisons, named products, and anything medical,
//             financial or legal. "Twin cuts editing time by 80%" is either
//             true or it is a false advertisement.
//   standard  Examples, recommendations, competitor mentions, historical
//             claims. Wrong here is embarrassing, not actionable.
//   light     Hooks, transitions, rhetorical framing, creator opinion, scene
//             purpose. "Most creators spend too much time editing" is a point
//             of view and forcing a citation through it makes every scene a
//             compliance hearing.
//
// ⚖️ DERIVED FROM THE BEAT'S SEMANTIC TYPE, NOT FROM A DETECTOR. Nothing here
// asks what `claimStrength` returned or which pattern matched. The two are
// orthogonal on purpose: this says HOW MUCH GROUNDING IS REQUIRED, the claim
// rule says WHAT THE SENTENCE COMMITS THE CREATOR TO. Collapsing them would
// reintroduce exactly the coupling this file exists to break.
//
// ⚖️ AND A SUBJECT LABEL IS NOT NOTHING. "AI tools" cannot justify a factual
// claim, but it is enough to justify a structure, an angle, or a question the
// creator answers. Low grounding may WEAKEN or RESHAPE a beat — soften it, ask
// the creator, send it to research — and must never by itself make the beat
// invalid. A creator whose expertise lives in their head rather than in Product
// DNA is a user, not an error.

export const TRACEABILITY_LEVELS = ['strict', 'standard', 'light'] as const
export type TraceabilityLevel = (typeof TRACEABILITY_LEVELS)[number]

/** A number that asserts a measurable outcome: percentages, multipliers,
 *  durations, counts of a result.
 *
 *  ⚠️ NOT EVERY DIGIT. "3 things I stopped buying" is a list length and the
 *  promise the format is built on; condemning it would put every listicle
 *  through strict grounding. The tell is a number attached to a MEASUREMENT —
 *  a unit, a percentage, or a comparison — not to an enumeration. */
const STATISTIC =
  /\b\d+(?:\.\d+)?\s*(?:%|percent|x\b|times (?:faster|slower|better|cheaper|longer))|\b\d+(?:\.\d+)?\s*(?:hours?|minutes?|seconds?|days?|weeks?|months?|years?|mm|cm|kg|lbs?|GB|TB|MB|W|fps|mAh|nits|Hz)\b|\b\d+\s*(?:out of|in)\s*\d+\b/i

/** Money, as an AMOUNT rather than as a topic.
 *
 *  ⚠️ MEASURED, AND TIGHTENED BECAUSE IT OVER-FIRED. A bare `price|pricing`
 *  matched "think beyond the initial price tag" and "often paying a premium" —
 *  beats that mention money and quote none. At `strict` a false positive turns
 *  an honest sentence into a question the creator must answer, so this asks for
 *  an actual figure or an actual billing term. */
const PRICING =
  /[$£€]\s?\d|\b\d+\s?(?:dollars|pounds|euros)\b|\b(?:costs?|priced at|starting at|only)\s+[$£€]?\s?\d|\b(?:per|a)\s+(?:month|year)\b|\b\d+\s?% off\b/i

/** A claim that one named thing beats another.
 *
 *  ⚠️ ALSO TIGHTENED. Bare `beats` matched the aphorism "Consistency beats
 *  intensity every single time", and a bare superlative matched "the fastest
 *  way to get better" — rhetoric, not a checkable comparison. A real comparison
 *  names a second thing ("X than Y") or attaches a superlative to a NOUN rather
 *  than to "way/thing/part/time". */
const COMPARISON =
  /\b(?:better|worse|faster|slower|cheaper|stronger|weaker|longer|shorter|more accurate|less accurate|more expensive|less expensive)\s+than\b|\boutperforms?\b|\bthe (?:best|worst|fastest|cheapest|strongest|most reliable)\s+(?!way\b|thing\b|part\b|time\b|option\b)[a-z]+\b/i

/** Regulated domains. Wrong here is not embarrassing, it is actionable.
 *
 *  ⚖️ DELIBERATELY BROAD, because the cost is asymmetric: a beat wrongly sent
 *  to strict asks for evidence that probably exists, and a medical claim
 *  wrongly sent to light is a creator repeating something we invented about
 *  someone's health. */
const REGULATED =
  /\b(?:cure|cures|treat|treats|treatment|diagnos\w+|symptom|prescription|dosage|FDA|clinically|side effects?|medical|medicine|supplement)\b|\b(?:ROI|stocks?|crypto|cryptocurrency|portfolio|passive income|guaranteed (?:income|returns?)|financial advice|tax (?:deduction|refund|write-?off)|investment returns?)\b|\b(?:lawsuit|liability|copyright|trademark|patent|compliance|GDPR)\b/i

/** A stated outcome the creator or product produced. */
const RESULT =
  /\b(?:grew|doubled|tripled|increased|decreased|reduced|boosted|saved|earned|generated)\b[^.!?]{0,40}\b(?:by|to|from)\b|\bresults? (?:in|were|was)\b|\bwent from\b[^.!?]{0,30}\bto\b/i

/** Sections whose whole job is framing rather than asserting. Matched on the
 *  section label the writer already emits, which is the only semantic type
 *  signal the beat carries about its ROLE. */
const LIGHT_SECTIONS =
  /^(?:hook|intro|introduction|transition|outro|close|closing|cta|call to action|sign ?off)\b/i

/** Framing that names a subject or addresses the viewer and asserts nothing
 *  checkable about the world. */
const RHETORICAL_FRAME =
  /^\s*(?:but )?what if\b|^\s*(?:so|now|okay|alright)?,?\s*let'?s\b|^\s*here'?s (?:the|what|why|how)\b|^\s*(?:think about|imagine|picture)\b|\blet me know in the comments\b|^[^.!?]{0,80}\?\s*$/i

export interface TraceabilityInput {
  /** The spoken line. */
  line?: unknown
  /** The section label the writer emitted, e.g. "Hook", "Specific Example 2". */
  section?: unknown
}

/**
 * How much grounding this beat must have before it may be written.
 *
 * ⚖️ STRICT WINS OVER LIGHT. A hook that quotes a statistic is a hook that
 * quotes a statistic — the section it sits in does not make the number safer,
 * and the most-shared line in the video is the worst place to be wrong. So the
 * risk signals are tested BEFORE the section is allowed to relax anything.
 */
export function traceabilityLevel(beat: TraceabilityInput): TraceabilityLevel {
  const line = typeof beat?.line === 'string' ? beat.line : ''
  const section = typeof beat?.section === 'string' ? beat.section : ''
  if (line.trim() === '') return 'light'

  if (STATISTIC.test(line) || PRICING.test(line) || COMPARISON.test(line)
    || REGULATED.test(line) || RESULT.test(line)) return 'strict'

  // Only now may the beat's ROLE lower the bar, and only when it asserts
  // nothing checkable — which the block above has just established.
  if (LIGHT_SECTIONS.test(section) || RHETORICAL_FRAME.test(line)) return 'light'

  // ⚖️ THE DEFAULT IS `standard`, NOT `light`. An unrecognised beat is an
  // ordinary claim-bearing sentence; defaulting to the weakest bar would make
  // every pattern gap a silent permission.
  return 'standard'
}

/**
 * What low grounding is permitted to do — and the one thing it may never do.
 *
 * ⚠️ FROZEN BY THE OWNER, AND WRITTEN DOWN BECAUSE A RULE THAT LIVES ONLY IN A
 * CONVERSATION IS A RULE THE NEXT REFACTOR BREAKS:
 *
 *   1. `creator_knowledge_depth` never enters `substanceIssues`.
 *   2. Low depth may soften wording, insert a creator-answer placeholder,
 *      trigger research, or warn.
 *   3. It does NOT automatically refuse the beat.
 *   4. Per-beat traceability is risk-weighted.
 *   5. Only high-risk factual beats require strict grounding before generation.
 *
 * This function is rule 2 and 3 made executable: it returns what MAY happen,
 * and `refuse` is not among the options at any level.
 */
export const LOW_DEPTH_RESPONSES = ['soften', 'ask_creator', 'research', 'warn'] as const
export type LowDepthResponse = (typeof LOW_DEPTH_RESPONSES)[number]

export function responseToLowDepth(level: TraceabilityLevel): LowDepthResponse {
  // ⚖️ ASK BEFORE INVENTING, AT THE ONLY LEVEL WHERE INVENTING IS EXPENSIVE.
  // A strict beat with nothing behind it is the "Twin cuts editing time by 80%"
  // case: the honest output is a question, not a softer number.
  if (level === 'strict') return 'ask_creator'
  if (level === 'standard') return 'research'
  // A hook grounded only in "AI tools" is still a usable hook.
  return 'soften'
}

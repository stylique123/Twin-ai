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
/** ⚠️ SPELLED-OUT NUMBERS COUNT, AND THE FIRST VERSION MISSED THEM. The owner's
 *  own example — "This app saves founders five hours per week" — classified as
 *  `standard`, because the pattern asked for digits and a SCRIPT IS SPOKEN.
 *  "five hours", "double your reach", "three times faster" are how a creator
 *  actually says a measurement, and a rule that only sees `5` grades the written
 *  form of a claim more strictly than the form that gets read on camera. */
const NUM = '(?:\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand)'
const UNIT = '(?:hours?|minutes?|seconds?|days?|weeks?|months?|years?|mm|cm|kg|lbs?|GB|TB|MB|W|fps|mAh|nits|Hz)'
const STATISTIC = new RegExp(
  `\\b${NUM}\\s*(?:%|percent)`
  + `|\\b${NUM}\\s*x\\b|\\b${NUM}\\s+times\\s+(?:faster|slower|better|cheaper|longer|more|less)`
  + `|\\b(?:double|triple|halve|halved|doubles|triples)\\b`
  + `|\\b${NUM}\\s*${UNIT}\\b`
  + `|\\b${NUM}\\s*(?:out of|in)\\s*${NUM}\\b`,
  'i',
)

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

// ── TWO MECHANISMS, TWO QUESTIONS ─────────────────────────────────────────
//
// ⚠️ AN EARLIER VERSION OF THIS FILE GOT THE SPLIT WRONG, AND THE CORRECTION IS
// THE DESIGN. It exported `responseToLowDepth(level)`, mapping a TRACEABILITY
// level to a soften/ask/research action — which quietly made one mechanism
// answer the other's question, the exact overlap this pair exists to remove.
// It also made `soften` the default response to thin knowledge, and softening
// globally produces scripts full of "might", "perhaps", "some people think":
// an AI lawyer trying not to get sued by oxygen. Deleted rather than deprecated,
// because a wrong abstraction left importable gets imported.
//
// The two questions are genuinely different:
//
//   traceability     Does this assertion require evidence?
//   knowledge depth  Is the CREATOR themselves a sufficient source for this?
//
// The first decides whether a claim may stand. The second decides WHERE the
// missing substance should come from. Neither answers the other.

/** What a strict beat's grounding actually amounts to, once looked for. */
export const STRICT_RESOLUTIONS = [
  /** Evidence exists and the beat traces to it. Ship it. */
  'GROUNDED',
  /** No creator evidence, but the claim is externally checkable — look it up. */
  'RESOLVABLE',
  /** Only the creator can answer: their history, their business, their numbers. */
  'USER_KNOWLEDGE_REQUIRED',
  /** Nothing can ground it. The ASSERTION goes, not the script. */
  'UNRESOLVED',
] as const
export type StrictResolution = (typeof STRICT_RESOLUTIONS)[number]

export interface StrictContext {
  /** Does the beat trace to supplied creator knowledge or product facts? */
  grounded: boolean
  /** Were product facts carried at all? `null` = caller does not know. */
  productFactsAvailable?: boolean | null
  /** Can research answer this — is it a fact about the world? */
  externallyAnswerable: boolean
  /** Is this a claim only the creator can make true (their life, their firm)? */
  personalToCreator: boolean
}

/**
 * Where a strict beat stands, and therefore what to do about it.
 *
 * ⚖️ THE ASSERTION IS WHAT FAILS, NEVER THE SCRIPT. "Twin increases retention by
 * 42%" with nothing behind it does not kill the video; it becomes "Twin is
 * designed to help creators make tighter, more structured videos" if Product DNA
 * supports that. Refusing the whole generation for one unsupported number is the
 * behaviour that makes a safety rule feel like an obstruction, and it is why
 * `UNRESOLVED` names a rewrite rather than a refusal.
 *
 * ⚖️ AND ONLY `strict` REACHES HERE. `light` and `standard` are advisory; a
 * caller that runs this over every beat has reintroduced the compliance hearing.
 */
export function resolveStrictBeat(ctx: StrictContext): StrictResolution {
  if (ctx.grounded) return 'GROUNDED'
  // ⚖️ PERSONAL BEFORE RESEARCHABLE. "The biggest mistake I made with my first
  // startup" is not fixable by a literature search, and offering research for it
  // is how a system ends up writing someone's autobiography for them.
  if (ctx.personalToCreator) return 'USER_KNOWLEDGE_REQUIRED'
  if (ctx.externallyAnswerable) return 'RESOLVABLE'
  // Product facts might carry it — but only if the caller KNOWS some were
  // supplied. `null` is "not known" and may not be read as "yes".
  if (ctx.productFactsAvailable === true) return 'RESOLVABLE'
  return 'UNRESOLVED'
}

/** What the pipeline does about each resolution. Separated from the verdict so
 *  the policy is readable without tracing call sites. */
export const STRICT_ACTIONS = {
  GROUNDED: 'allow',
  RESOLVABLE: 'research_or_product_dna',
  USER_KNOWLEDGE_REQUIRED: 'ask_creator',
  UNRESOLVED: 'rewrite_without_claim',
} as const satisfies Record<StrictResolution, string>

// ── KNOWLEDGE DEPTH: WHERE SUBSTANCE COMES FROM, NEVER WHETHER IT MAY EXIST ──

export const KNOWLEDGE_DEPTHS = ['high', 'medium', 'low'] as const
export type KnowledgeDepth = (typeof KNOWLEDGE_DEPTHS)[number]

/** Where a container's substance should be sourced from. */
export const SUBSTANCE_SOURCES_ROUTED = [
  'CREATOR_KNOWLEDGE', 'RESEARCH', 'PRODUCT_DNA', 'ASK_CREATOR', 'CHANGE_CONCEPT',
] as const
export type RoutedSource = (typeof SUBSTANCE_SOURCES_ROUTED)[number]

export interface RoutingContext {
  depth: KnowledgeDepth
  /** Is this container about the creator's own product or business? */
  aboutOwnProduct: boolean
  /** Could research answer it — a fact about the world? */
  externallyAnswerable: boolean
  /** Does it require the creator's own life or credentials? */
  personalToCreator: boolean
  /** Does the CONCEPT itself presume expertise there is no evidence for —
   *  "five things I've learned in ten years as a surgeon"? */
  conceptDemandsUnevidencedExpertise?: boolean
}

/**
 * Where the substance for this container should come from.
 *
 * ⚠️ THIS NEVER RETURNS A REFUSAL, AND THAT IS THE POINT. Low depth is not a
 * quality verdict — it answers "how much substantive material can Twin safely
 * derive from the creator themselves", which is a routing question. Letting
 * `depth === 'low'` become `script_invalid` is the wrong abstraction, and it is
 * the one this function exists to prevent anyone reaching for.
 *
 * ⚖️ HIGH DEPTH IS A LICENCE, NOT A SHORTCUT. It means the creator's own
 * positions, frameworks and examples can carry opinion and thought-leadership
 * beats without outside research — not that anything may be asserted.
 */
export function routeSubstance(ctx: RoutingContext): RoutedSource {
  // ⚖️ THE CONCEPT CHECK COMES FIRST. A reference demanding "ten years as a
  // surgeon" from a creator with no such evidence is not fixed by sourcing the
  // facts elsewhere — the ADAPTATION is wrong, and generating the wisdom anyway
  // is how a system invents a career for someone.
  if (ctx.conceptDemandsUnevidencedExpertise && ctx.depth !== 'high') return 'CHANGE_CONCEPT'
  // Their own product is answerable from Product DNA at any depth — it is not
  // creator knowledge and never was.
  if (ctx.aboutOwnProduct) return 'PRODUCT_DNA'
  if (ctx.personalToCreator) {
    // ⚖️ HIGH DEPTH MEANS WE MAY ALREADY HAVE IT; anything less must ask rather
    // than write an autobiography.
    return ctx.depth === 'high' ? 'CREATOR_KNOWLEDGE' : 'ASK_CREATOR'
  }
  if (ctx.depth === 'high') return 'CREATOR_KNOWLEDGE'
  // ⚖️ MEDIUM MAY REST ON KNOWN POSITIONS BUT NOT EXPAND THEM. A creator on
  // record that "most SaaS onboarding asks for too much" supports a beat around
  // that belief; it does not support "seven-field onboarding reduces conversion
  // by 31%", which is a statistic and belongs to research.
  if (ctx.depth === 'medium' && !ctx.externallyAnswerable) return 'CREATOR_KNOWLEDGE'
  return ctx.externallyAnswerable ? 'RESEARCH' : 'ASK_CREATOR'
}

// PERFORMANCE FEEDBACK — §7b's contract, which exists because "feed
// performance back into the DNA" is too vague to build and dangerous to guess
// at.
//
// ── WHY AN APPEND-ONLY LOG AND NOT THE COLUMNS THAT ALREADY EXIST ─────────
//
// `posts` already carries `views`, `likes` and `comments`. They are SCALARS,
// and updating one destroys the previous value. That is not a storage detail:
//
//   views at 24h and views at 30d are different facts about the same video, and
//   the difference between them is most of the signal.
//
// A single mutable number can answer "how many views does this have?" and can
// never answer "how fast did it get them?", "did it keep going?", or "was this
// measured before or after the creator posted it elsewhere?". §7b's whole point
// is that YOU CANNOT RECOVER HISTORY YOU DID NOT RECORD, so a measurement is
// appended with the time it was OBSERVED and never rewritten.
//
// ── FIVE CLAIM TYPES, NEVER CONFLATED ────────────────────────────────────
//
// §7b names them, and the reason to encode them rather than write prose is that
// they need DIFFERENT EVIDENCE, and a system that stores them in one shape will
// eventually render them in one sentence:
//
//   correlation          >= N videos, and N is STATED
//   hypothesis           flagged as untested
//   confirmed_preference repeated, explicit creator choice
//   business_outcome     attributed, never inferred
//   platform_outcome     measured
//
// ── THE ABSOLUTE RULE, MADE STRUCTURAL ───────────────────────────────────
//
// "Never conclude 'this hook caused performance' from one successful video."
// §7b calls a confident causal claim from n=1 the same failure as
// "Attention Score 9.6" wearing a different costume — and the way that failure
// gets shipped is never a decision, it is an absent check on a hurried Tuesday.
//
// So a correlation claim without a sample size is not merely discouraged: it
// cannot be constructed here and cannot be stored (a CHECK constraint refuses
// it). n=1 is refused outright, and the N travels WITH the claim so anything
// rendering it can say "across 6 videos" rather than "we noticed".

export const OUTCOME_CLAIM_TYPES = [
  'correlation',
  'hypothesis',
  'confirmed_preference',
  'business_outcome',
  'platform_outcome',
] as const
export type OutcomeClaimType = (typeof OUTCOME_CLAIM_TYPES)[number]

/** Metrics a PLATFORM reports. Deliberately a closed list: a free-text metric
 *  name is how "engagement" appears and stops being comparable to anything. */
export const PLATFORM_METRICS = [
  'views', 'likes', 'comments', 'shares', 'saves', 'watch_time_ms', 'retention_pct_milli',
] as const
export type PlatformMetric = (typeof PLATFORM_METRICS)[number]

/** Metrics a BUSINESS reports. Separated from the above because §7b separates
 *  them: a platform outcome is measured, a business outcome must be ATTRIBUTED,
 *  and merging the two lists is the first step to inferring one from the other. */
export const BUSINESS_METRICS = ['clicks', 'leads', 'sales', 'revenue_minor'] as const
export type BusinessMetric = (typeof BUSINESS_METRICS)[number]

/** Where a number came from. `manual` is the creator typing what they saw, and
 *  it is not the same evidence as an API read — so it is recorded rather than
 *  flattened, and a consumer can decline to build a correlation out of it. */
export const OUTCOME_SOURCES = ['platform_api', 'manual', 'import'] as const
export type OutcomeSource = (typeof OUTCOME_SOURCES)[number]

export interface OutcomeObservation {
  metric: PlatformMetric | BusinessMetric
  /** Integer. Fractions are expressed in milli- or minor units by the metric's
   *  own name (`retention_pct_milli`, `revenue_minor`), for the reason every
   *  other quantity in this codebase is an integer: no float formatting can
   *  differ between two processes. */
  value: number
  /** When the number was TRUE, not when the row was written. A backfilled
   *  measurement of last week is last week's fact. */
  observedAt: string
  source: OutcomeSource
}

const isMetric = (m: unknown): m is PlatformMetric | BusinessMetric =>
  (PLATFORM_METRICS as readonly unknown[]).includes(m)
  || (BUSINESS_METRICS as readonly unknown[]).includes(m)

export function isBusinessMetric(m: string): boolean {
  return (BUSINESS_METRICS as readonly string[]).includes(m)
}

export type ObservationRejection =
  | 'unknown_metric' | 'not_an_integer' | 'negative' | 'bad_timestamp' | 'unknown_source'

/**
 * Accept an observation, or say why not.
 *
 * REFUSES RATHER THAN COERCES, on every field. A metric name that is not in the
 * closed list is not "some other metric" — it is a number nothing can ever
 * compare, and admitting it is how a table full of `engagement` appears.
 */
export function validateObservation(raw: unknown): OutcomeObservation | { rejected: ObservationRejection } {
  const o = (raw ?? {}) as Record<string, unknown>
  if (!isMetric(o.metric)) return { rejected: 'unknown_metric' }
  if (typeof o.value !== 'number' || !Number.isInteger(o.value)) return { rejected: 'not_an_integer' }
  // A negative view count is a broken reader, not a fact about a video. Refused
  // so the reader gets fixed instead of the number being averaged in.
  if (o.value < 0) return { rejected: 'negative' }
  if (typeof o.observedAt !== 'string' || Number.isNaN(Date.parse(o.observedAt))) {
    return { rejected: 'bad_timestamp' }
  }
  if (!(OUTCOME_SOURCES as readonly unknown[]).includes(o.source)) return { rejected: 'unknown_source' }
  return {
    metric: o.metric, value: o.value, observedAt: o.observedAt, source: o.source as OutcomeSource,
  }
}

/**
 * THE SMALLEST SAMPLE A CORRELATION MAY BE DRAWN FROM.
 *
 * 2 is not a claim that two videos are enough — it is the floor below which the
 * word "correlation" is definitionally wrong, and it is the only number this
 * module is entitled to assert. §7b says "≥N videos, stated N" and does not fix
 * N, because the honest N depends on the effect being claimed and nobody here
 * has the data to choose it yet.
 *
 * So the contract enforces the part that is knowable — n=1 is never a
 * correlation, and whatever N was used is STATED — and leaves the rest to the
 * consumer that eventually has real distributions to reason about. A threshold
 * invented here would be exactly the confident-number-from-nothing this section
 * exists to prevent.
 */
export const MIN_CORRELATION_SAMPLE = 2

export interface OutcomeClaim {
  type: OutcomeClaimType
  /** One sentence, as it would be shown. */
  statement: string
  /** How many videos the claim was drawn from. REQUIRED for `correlation`;
   *  meaningless and refused for `hypothesis`, which is untested by definition. */
  sampleSize?: number
  /** What a business outcome is attributed BY — a UTM, a promo code, a CRM id.
   *  Required for `business_outcome`: §7b says attributed, never inferred, and
   *  an unattributed sale next to a video is a coincidence with a timestamp. */
  attribution?: string
}

export type ClaimRejection =
  | 'unknown_type' | 'empty_statement'
  | 'correlation_needs_sample' | 'correlation_sample_too_small'
  | 'hypothesis_cannot_have_sample' | 'business_needs_attribution'

/**
 * Accept a claim, or say why not.
 *
 * The per-type evidence rules are the whole point. Storing all five in one
 * shape with optional fields is how they get rendered in one sentence — and
 * "list-format videos average higher watch time (n=6)" and "the hook may be
 * contributing" are not the same kind of statement, however similar they look
 * in a UI.
 */
export function validateClaim(raw: unknown): OutcomeClaim | { rejected: ClaimRejection } {
  const c = (raw ?? {}) as Record<string, unknown>
  if (!(OUTCOME_CLAIM_TYPES as readonly unknown[]).includes(c.type)) return { rejected: 'unknown_type' }
  const type = c.type as OutcomeClaimType
  const statement = typeof c.statement === 'string' ? c.statement.trim() : ''
  if (statement === '') return { rejected: 'empty_statement' }

  const sampleSize = typeof c.sampleSize === 'number' && Number.isInteger(c.sampleSize)
    ? c.sampleSize : undefined
  const attribution = typeof c.attribution === 'string' && c.attribution.trim() !== ''
    ? c.attribution.trim() : undefined

  if (type === 'correlation') {
    if (sampleSize === undefined) return { rejected: 'correlation_needs_sample' }
    if (sampleSize < MIN_CORRELATION_SAMPLE) return { rejected: 'correlation_sample_too_small' }
  }
  // A hypothesis is UNTESTED by definition. Letting it carry a sample size
  // would let it be rendered beside a correlation with the same furniture, and
  // the reader would have no way to tell which one was evidence.
  if (type === 'hypothesis' && sampleSize !== undefined) {
    return { rejected: 'hypothesis_cannot_have_sample' }
  }
  if (type === 'business_outcome' && attribution === undefined) {
    return { rejected: 'business_needs_attribution' }
  }
  return {
    type, statement,
    ...(sampleSize !== undefined ? { sampleSize } : {}),
    ...(attribution !== undefined ? { attribution } : {}),
  }
}

/**
 * How a claim must be QUALIFIED wherever it is shown.
 *
 * Returned as data rather than baked into a component, because the rule is the
 * contract's and not the screen's: the same claim shown in the gallery, in an
 * email and in an export has to carry the same qualification, and three
 * components will not independently remember to add it.
 */
export function claimQualifier(claim: OutcomeClaim): string {
  switch (claim.type) {
    case 'correlation':
      return `across ${claim.sampleSize} videos — a pattern, not a cause`
    case 'hypothesis':
      return 'untested'
    case 'confirmed_preference':
      return 'your repeated choice'
    case 'business_outcome':
      return `attributed via ${claim.attribution}`
    case 'platform_outcome':
      return 'measured'
  }
}

// Brand DNA provenance — pure. No network, no database, no model call.
//
// WHAT THIS EXISTS TO STOP.
//
// Today the DNA synthesis prompt says, in capitals, that COMPLETENESS IS
// MANDATORY and that it must never return a blank — so when a creator's
// captions do not say what they sell, the model invents a plausible `offer`.
// That invented offer then writes the call to action on every video they make.
// Nothing downstream can tell it apart from an offer the creator typed in,
// because a synthesized profile is a flat bag of strings.
//
// So the rule the build plan states —
//
//     Inferred information may suggest, but it may not decide products,
//     prices, claims, audience truth, or offers.
//
// — is currently a sentence in a document with no mechanism behind it. This
// file is the mechanism.
//
// THREE DESIGN DECISIONS, each fixing a way the rule could be defeated.
//
// 1. NO FLOAT CONFIDENCE. A model reporting `0.91` about its own output is
//    uncalibrated: it measures the model's agreement with itself, and it will
//    be read as if it meant something. Evidence here is a COUNT — "seen in 9
//    of 12 posts" — which is a fact, can be re-derived, and can carry a
//    threshold that someone can actually tune.
//
// 2. A SOURCE IS NEVER MERGED. `source: 'user_answer_and_observed_posts'`
//    destroys the rule, because no code can then decide whether it applies.
//    One fact has exactly one source. When the creator says one thing and
//    their posts show another, that is a ConflictedField holding BOTH — not a
//    blended third value.
//
// 3. AUTHORITY IS RESOLVED, NOT AVERAGED. `resolve()` returns which fact won
//    and why, so a caller never has to invent a compromise value.
export type DnaSource = 'user_answer' | 'observed' | 'inferred'

/** How much of the creator's material supports an observed fact.
 *
 *  A count, deliberately, not a score. `{ seen: 9, of: 12 }` can be checked
 *  against the posts it came from; `0.75` cannot be checked against anything. */
export interface DnaEvidence {
  seen: number
  of: number
}

export interface DnaFact<T> {
  value: T
  source: DnaSource
  /** Required for `observed`, meaningless for `user_answer` (the creator is
   *  the evidence), and optional for `inferred` — an inference may cite what
   *  it leaned on without that making it an observation. */
  evidence?: DnaEvidence
  /** ISO date. DNA goes stale; a fact with no date cannot be aged out. */
  updated: string
}

/** The creator said one thing; their posts show another. BOTH are kept.
 *
 *  This is the shape the build plan's "history is not destiny" rule needs:
 *  Twin prioritises what they SAID while preserving what they DO, and can
 *  only do that while it still has both. Collapsing to one value here is the
 *  same mistake as merging a source. */
export interface ConflictedField<T> {
  stated: DnaFact<T>
  observed: DnaFact<T>
}

export type DnaField<T> = DnaFact<T> | ConflictedField<T>

export function isConflicted<T>(f: DnaField<T>): f is ConflictedField<T> {
  return (f as ConflictedField<T>).stated !== undefined
}

/**
 * The fields an inference may never DECIDE.
 *
 * Not "may never touch" — an inference about the audience is a perfectly good
 * suggestion to show someone. It may not silently become the value a script is
 * written from. Every name here is something that costs the creator money,
 * credibility, or a false claim if it is wrong.
 */
export const DECIDING_FIELDS = new Set<string>([
  'offer',
  'offer_name',
  'offer_url',
  'price',
  'pricing',
  'products',
  'product_claims',
  'claims',
  'audience',
  'cta',
  'compliance_limits',
])

export class DnaProvenanceError extends Error {
  readonly field: string
  readonly code: string
  constructor(message: string, field: string, code: string) {
    super(message)
    this.name = 'DnaProvenanceError'
    this.field = field
    this.code = code
  }
}

/** Which fact a caller is allowed to act on, and why that one. */
export interface Resolution<T> {
  value: T
  source: DnaSource
  /** True when a different, lower-authority fact exists and was set aside.
   *  The UI uses this to decide what is worth asking the creator about —
   *  showing every field would be the JSON-audit screen nobody wants. */
  hasDisagreement: boolean
  /** Present only on a conflict: what the creator's posts actually show, so
   *  the copy can say "your content READS as X" without discarding it. */
  setAside?: DnaFact<T>
}

/**
 * Resolve a field to the one value a caller may act on.
 *
 * Authority: what the creator told us, then what their material shows, then an
 * inference — and for a deciding field, the inference is refused outright
 * rather than quietly used.
 *
 * Throws rather than returning a fallback, deliberately. A caller that gets a
 * value back has no way to know it was a guess; a caller that gets an error
 * has to decide what to do, which is the point. This mirrors the renderer's
 * posture: an instruction it cannot honour is a hard failure, never a
 * substitution.
 */
export function resolve<T>(field: string, f: DnaField<T>): Resolution<T> {
  if (isConflicted(f)) {
    // A conflict always has a stated side, and stated always wins — that IS
    // the resolution. The observed side is handed back rather than dropped,
    // because "your content reads student-focused, you said founders" is only
    // sayable while both survive.
    assertDecidable(field, f.stated)
    return {
      value: f.stated.value,
      source: f.stated.source,
      hasDisagreement: true,
      setAside: f.observed,
    }
  }
  assertDecidable(field, f)
  return { value: f.value, source: f.source, hasDisagreement: false }
}

/**
 * Refuse an inference that would decide something it may not decide.
 *
 * Exported separately so a caller can check before building a plan, rather
 * than discovering it at the moment it needs the value.
 */
export function assertDecidable<T>(field: string, f: DnaFact<T>): void {
  if (f.source === 'inferred' && DECIDING_FIELDS.has(field)) {
    throw new DnaProvenanceError(
      `${field} is inferred, and an inference may not decide it — ask the creator or leave it empty`,
      field,
      'dna_inferred_may_not_decide',
    )
  }
}

/** True when this field may be acted on without asking anyone. Never throws —
 *  for the callers that want to branch rather than catch. */
export function canDecide<T>(field: string, f: DnaField<T>): boolean {
  try {
    resolve(field, f)
    return true
  } catch {
    return false
  }
}

/**
 * Build a conflict when the creator's answer and their material disagree.
 *
 * `same` is supplied by the caller because sameness is domain-specific: two
 * audience strings can mean the same thing while differing as text, and two
 * format lists overlap rather than match. Returning the stated fact alone when
 * they agree keeps the common case simple — a conflict that is not a conflict
 * would put a confirm prompt in front of someone for nothing.
 */
export function reconcile<T>(
  stated: DnaFact<T>,
  observed: DnaFact<T> | null,
  same: (a: T, b: T) => boolean,
): DnaField<T> {
  if (observed === null) return stated
  if (same(stated.value, observed.value)) return stated
  return { stated, observed }
}

/** Minimum support before an observation is worth showing as a disagreement.
 *  One post out of twelve saying something is noise, and surfacing it as a
 *  conflict trains people to dismiss the confirm screen. */
export const MIN_EVIDENCE_SEEN = 3

/** Whether an observed fact has enough behind it to be worth a creator's
 *  attention. Facts without evidence are not observations by this file's
 *  definition, so they never qualify. */
export function isWellEvidenced<T>(f: DnaFact<T>): boolean {
  if (f.source !== 'observed' || !f.evidence) return false
  const { seen, of } = f.evidence
  if (!Number.isInteger(seen) || !Number.isInteger(of) || of <= 0 || seen < 0 || seen > of) return false
  return seen >= MIN_EVIDENCE_SEEN
}

/**
 * The fields worth putting in front of the creator, and nothing else.
 *
 * The confirm screen exists to catch what Twin got wrong, not to display a
 * personality file. Two things earn a place: a real disagreement, and an
 * inference that is blocked from deciding something and therefore needs an
 * answer before a script can be written.
 */
export function needsConfirmation(fields: Record<string, DnaField<unknown>>): string[] {
  const out: string[] = []
  for (const [name, f] of Object.entries(fields)) {
    if (isConflicted(f)) {
      if (isWellEvidenced(f.observed)) out.push(name)
      continue
    }
    if (f.source === 'inferred' && DECIDING_FIELDS.has(name)) out.push(name)
  }
  return out.sort()
}

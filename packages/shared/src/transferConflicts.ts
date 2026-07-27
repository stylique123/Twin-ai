// Track C · Batch B.2 — §7 Step 6, DETERMINISTIC conflict resolution.
//
// AUTHORITY: docs/twinai-selective-transfer-reasoning-contract.md, sha256
// 3f8816055c4f867978841a53ef30eb146d2073c3e17ead1697ab9614573bfa07.
// §7 Step 6 verbatim: "If luxury visuals conflict with chaotic comedy pacing,
// the higher brand/goal fit wins. Do not blend both merely because both
// references were selected." §6 supplies the resolution vocabulary and the
// invariants; §7 Step 4 supplies the score names.
//
// WHAT THIS DELIBERATELY DOES NOT DO
// ----------------------------------
// It does not SCORE. §7 Step 4 says candidates are scored against brand fit,
// goal fit, audience fit, platform fit, evidence confidence, production
// feasibility and conflict, "using predefined weights and thresholds" — and the
// contract never states those weights. Inventing them here and presenting the
// result as contractual would be exactly the silent second authority this whole
// document exists to prevent. Scores arrive as INPUT, produced server-side; this
// module only applies the ordering Step 6 actually states.
//
// THE TIE THE CONTRACT DOES NOT ADDRESS
// -------------------------------------
// Step 6 orders by brand fit, then goal fit. It says nothing about what happens
// when both are exactly equal. Breaking that tie by array order would make the
// outcome depend on the order candidates happened to arrive in — which is not
// determinism, it is an arbitrary authority hidden in a sort. §6 already
// provides the honest answer: `brand_default`. An unresolvable conflict is not a
// licence to choose. So a true tie resolves to the brand's own default and says
// so, and `resolveConflicts` is a pure function of its inputs whose output does
// not change when the input array is shuffled — proven by a test that shuffles.
import { CONFIDENCE_THRESHOLD_MILLI, type CreativeTransferPlanV1 } from './creativeTransferPlan.js'
import { TRANSFER_DIMENSIONS, type TransferDimension } from './campaignIntent.js'

/** §7 Step 4's score names. Milli-units so a plan hashes byte-identically. */
export interface CandidateScoresV1 {
  referenceId: string
  /** 0..1000. §7 Step 6's primary ordering key. */
  brandFitMilli: number
  /** 0..1000. §7 Step 6's secondary ordering key. */
  goalFitMilli: number
  /** 0..1000. §6: below CONFIDENCE_THRESHOLD_MILLI cannot lead a dimension. */
  evidenceConfidenceMilli: number
}

export type ConflictResolution = 'selected_primary' | 'brand_default' | 'rejected_all'

export type ConflictReason =
  /** One candidate had strictly the highest brand fit. */
  | 'higher_brand_fit'
  /** Brand fit tied; one candidate had strictly the highest goal fit. */
  | 'higher_goal_fit'
  /** Brand AND goal fit tied exactly. The contract does not order this. */
  | 'unbroken_tie'
  /** Every candidate scored below the confidence threshold. */
  | 'below_confidence_threshold'
  /** No candidate was offered for this dimension at all. */
  | 'no_candidates'

export interface ResolvedDimension {
  dimension: TransferDimension
  primaryReferenceId: string | null
  resolution: ConflictResolution
  reasonCode: ConflictReason
  /** Every reference that was in contention, sorted — the conflict record. */
  referenceIds: string[]
  /** True when more than one candidate was eligible, i.e. a real conflict. */
  contested: boolean
}

export class ConflictError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'ConflictError'
    this.code = code
  }
}

const MILLI = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1000

function validateCandidate(c: CandidateScoresV1, dimension: string, seen: Set<string>): void {
  if (c === null || typeof c !== 'object') throw new ConflictError(`a candidate for ${dimension} is not an object`, 'conflict_candidate_shape')
  if (typeof c.referenceId !== 'string' || c.referenceId.length === 0) {
    throw new ConflictError(`a candidate for ${dimension} has no referenceId`, 'conflict_candidate_shape')
  }
  // The same reference twice in one dimension is not a conflict, it is a
  // malformed input — and it would let one reference outvote itself.
  if (seen.has(c.referenceId)) {
    throw new ConflictError(`${c.referenceId} appears twice among ${dimension} candidates`, 'conflict_duplicate_candidate')
  }
  seen.add(c.referenceId)
  for (const k of ['brandFitMilli', 'goalFitMilli', 'evidenceConfidenceMilli'] as const) {
    if (!MILLI(c[k])) {
      throw new ConflictError(
        `${dimension}/${c.referenceId}: ${k} must be an integer 0..1000 (got ${JSON.stringify(c[k])}); `
        + 'a score that is absent or fractional cannot order anything deterministically',
        'conflict_score_range',
      )
    }
  }
}

/**
 * Resolve ONE dimension. Exported so a test can address the rule directly rather
 * than only through the whole-plan wrapper.
 */
export function resolveDimension(
  dimension: TransferDimension,
  candidates: readonly CandidateScoresV1[],
): ResolvedDimension {
  if (!Array.isArray(candidates)) {
    throw new ConflictError(`candidates for ${dimension} must be an array`, 'conflict_candidate_shape')
  }
  const seen = new Set<string>()
  for (const c of candidates) validateCandidate(c, dimension, seen)

  const referenceIds = candidates.map((c) => c.referenceId).sort()
  if (candidates.length === 0) {
    return { dimension, primaryReferenceId: null, resolution: 'brand_default', reasonCode: 'no_candidates', referenceIds, contested: false }
  }

  // §6: "confidence below the predefined threshold becomes brand_default or
  // reject". A low-confidence candidate is not a contender at all, so it is
  // removed BEFORE ordering rather than allowed to win and be downgraded after.
  const eligible = candidates.filter((c) => c.evidenceConfidenceMilli >= CONFIDENCE_THRESHOLD_MILLI)
  if (eligible.length === 0) {
    return {
      dimension, primaryReferenceId: null, resolution: 'brand_default',
      reasonCode: 'below_confidence_threshold', referenceIds, contested: candidates.length > 1,
    }
  }

  const contested = eligible.length > 1
  const best = Math.max(...eligible.map((c) => c.brandFitMilli))
  const topBrand = eligible.filter((c) => c.brandFitMilli === best)
  if (topBrand.length === 1) {
    return { dimension, primaryReferenceId: topBrand[0].referenceId, resolution: 'selected_primary', reasonCode: 'higher_brand_fit', referenceIds, contested }
  }

  const bestGoal = Math.max(...topBrand.map((c) => c.goalFitMilli))
  const topGoal = topBrand.filter((c) => c.goalFitMilli === bestGoal)
  if (topGoal.length === 1) {
    return { dimension, primaryReferenceId: topGoal[0].referenceId, resolution: 'selected_primary', reasonCode: 'higher_goal_fit', referenceIds, contested }
  }

  // Exactly equal on both keys. The contract stops here, so this does too.
  return { dimension, primaryReferenceId: null, resolution: 'brand_default', reasonCode: 'unbroken_tie', referenceIds, contested }
}

/**
 * Resolve every supported dimension.
 *
 * §6 invariant: "Exactly one decision exists for every supported dimension." A
 * dimension nobody offered a candidate for is therefore still resolved — to the
 * brand default, recorded as such — rather than omitted. Silence is a result,
 * not an absence.
 */
export function resolveConflicts(
  candidatesByDimension: Readonly<Partial<Record<TransferDimension, readonly CandidateScoresV1[]>>>,
): ResolvedDimension[] {
  if (candidatesByDimension === null || typeof candidatesByDimension !== 'object' || Array.isArray(candidatesByDimension)) {
    throw new ConflictError('candidates must be an object keyed by dimension', 'conflict_input_shape')
  }
  for (const k of Object.keys(candidatesByDimension)) {
    if (!(TRANSFER_DIMENSIONS as readonly string[]).includes(k)) {
      throw new ConflictError(`unknown transfer dimension ${JSON.stringify(k)}`, 'conflict_unknown_dimension')
    }
  }
  return TRANSFER_DIMENSIONS.map((d) => resolveDimension(d, candidatesByDimension[d] ?? []))
}

/**
 * The `conflicts[]` entries a plan must carry, in the contract's exact shape.
 *
 * ONLY CONTESTED DIMENSIONS APPEAR. A dimension with one candidate and no rival
 * was never in conflict, and recording it as one would inflate the conflict log
 * into something nobody reads — the same failure as a diff that flags every
 * volatile byte.
 */
export function conflictRecords(resolved: readonly ResolvedDimension[]): CreativeTransferPlanV1['conflicts'] {
  return resolved
    .filter((r) => r.contested)
    .map((r) => ({ dimension: r.dimension, referenceIds: r.referenceIds, resolution: r.resolution, reasonCode: r.reasonCode }))
}

/**
 * §7 Step 6: "Do not blend both merely because both references were selected."
 *
 * Asserted as a property of the RESULT rather than trusted as a habit: at most
 * one primary per dimension, and a resolution that names no primary must not
 * have smuggled one in. This is the check a caller runs before persisting.
 */
export function assertNoBlending(resolved: readonly ResolvedDimension[]): void {
  const seen = new Set<TransferDimension>()
  for (const r of resolved) {
    if (seen.has(r.dimension)) throw new ConflictError(`dimension ${r.dimension} was resolved more than once`, 'conflict_duplicate_dimension')
    seen.add(r.dimension)
    if (r.resolution === 'selected_primary' && r.primaryReferenceId === null) {
      throw new ConflictError(`${r.dimension} claims a primary was selected but names none`, 'conflict_missing_primary')
    }
    if (r.resolution !== 'selected_primary' && r.primaryReferenceId !== null) {
      throw new ConflictError(
        `${r.dimension} resolved to ${r.resolution} but still names ${r.primaryReferenceId} — `
        + 'a dimension that fell back to the brand default has no reference leading it',
        'conflict_unselected_primary',
      )
    }
  }
  for (const d of TRANSFER_DIMENSIONS) {
    if (!seen.has(d)) throw new ConflictError(`dimension ${d} has no decision — the contract requires exactly one for every supported dimension`, 'conflict_missing_dimension')
  }
}

/**
 * A reference that won a dimension must have survived the candidate pool.
 *
 * THE SEAM BETWEEN THE TWO STEPS. Step 3 removes prohibited and unmeasured
 * material from the pool; Step 6 picks a winner from SCORES. Nothing in either
 * step, on its own, stops a score arriving for a reference whose every piece of
 * evidence was filtered out — and that reference would then lead a dimension on
 * the strength of material the pool exists to make unreachable. §6 requires
 * every transfer or adapt decision to cite server-issued evidence; this refuses
 * before the plan is built rather than leaving it to be caught after.
 *
 * DELIBERATELY WEAK, AND SAID SO. This checks that the winner has SOME citable
 * evidence, not that it has evidence relevant to that particular dimension.
 * Mapping evidence types onto dimensions is not something the contract defines,
 * and inventing that mapping here would be the same overreach as inventing
 * Step 4's weights. The narrower claim is the one the evidence supports.
 */
export function assertWinnersAreEvidenced(
  resolved: readonly ResolvedDimension[],
  poolByReference: Readonly<Record<string, readonly unknown[]>>,
): void {
  if (poolByReference === null || typeof poolByReference !== 'object' || Array.isArray(poolByReference)) {
    throw new ConflictError('the candidate pool must be an object keyed by referenceId', 'conflict_pool_shape')
  }
  for (const r of resolved) {
    if (r.primaryReferenceId === null) continue
    const items = poolByReference[r.primaryReferenceId]
    if (!Array.isArray(items) || items.length === 0) {
      throw new ConflictError(
        `${r.dimension} was won by ${r.primaryReferenceId}, which has no usable evidence in the candidate pool — `
        + 'it was scored on material Step 3 removed, or on nothing at all',
        'conflict_winner_unevidenced',
      )
    }
  }
}

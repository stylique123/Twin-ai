// Track C · Batch B.1 — the CANDIDATE POOL, and §7 Step 3's prohibited filter.
//
// AUTHORITY: docs/twinai-selective-transfer-reasoning-contract.md, sha256
// 3f8816055c4f867978841a53ef30eb146d2073c3e17ead1697ab9614573bfa07.
// §7 Step 2 (normalize evidence), §7 Step 3 (filter prohibited transfer),
// §6 required invariants, §5 authority hierarchy.
//
// WHY THIS EXISTS SEPARATELY FROM THE VALIDATOR
// --------------------------------------------
// Batch A validates the plan the model RETURNS. This filters what the model is
// ALLOWED TO SEE. §7 Step 3 is explicit that prohibited material is removed
// "from the candidate pool" — before scoring, before selection — not merely
// rejected afterwards.
//
// The difference is not decorative. A validator that only inspects the output
// depends on the model having declined to use material it was shown; every
// refusal is then a near miss that happened to be caught. Removing the material
// up front makes the wrong answer unreachable rather than detectable, and leaves
// the validator as the second line it was designed to be.
//
// NOTHING HERE DECIDES ANYTHING. It selects what may be considered. Selection,
// adaptation and rejection are §7 Steps 4-6 and belong to the planner, whose
// output remains subject to validateCreativeTransferPlan. This module must never
// grow a preference between candidates — that would be a second creative
// authority, and CreativeTransferPlanV1 is the only one.
import {
  type EvidenceItem,
  type EvidenceType,
  type NormalizedReferenceEvidenceV1,
  citableEvidence,
} from './referenceEvidence.js'
import { type ProhibitedTransfer, PROHIBITED_TRANSFERS } from './creativeTransferPlan.js'

/**
 * Evidence types that carry PROHIBITED content, and which prohibition each one
 * trips. §7 Step 3 names the categories; this maps the taxonomy onto them.
 *
 *   stated_cta         — a call to action is the creator's OFFER. Transferring
 *                        it moves someone else's commercial ask into this brand.
 *   why_it_works_claim — a FACTUAL CLAIM about performance, self-reported by
 *                        whoever supplied the reference and verified by nobody.
 *
 * These items remain in the normalized evidence set: they are real observations
 * and the set is hash-pinned, so removing them there would change a digest the
 * plan cites. They are excluded from the CANDIDATE POOL only, which is exactly
 * the distinction §7 Step 3 draws.
 */
export const PROHIBITED_EVIDENCE_TYPES: Readonly<Partial<Record<EvidenceType, ProhibitedTransfer>>> = {
  stated_cta: 'offer',
  why_it_works_claim: 'factual_claims',
}

export type ExclusionReason =
  | 'prohibited_category'
  | 'unknown_value'
  | 'not_citable'

export interface ExcludedCandidate {
  evidenceId: string
  type: EvidenceType
  referenceId: string
  reason: ExclusionReason
  /** Present only when reason is prohibited_category. */
  prohibition: ProhibitedTransfer | null
}

export interface CandidatePool {
  /** Eligible evidence, per referenceId, in the set's own order. */
  byReference: Record<string, EvidenceItem[]>
  /**
   * EVERY exclusion, with its reason.
   *
   * A filter that silently drops things is indistinguishable from a filter that
   * is broken, and from evidence that was never gathered. §7 Step 3 removes
   * material from the pool; it does not get to remove it from the record.
   */
  excluded: ExcludedCandidate[]
}

export class CandidatePoolError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'CandidatePoolError'
    this.code = code
  }
}

/**
 * Build the candidate pool from server-issued normalized evidence.
 *
 * `evidence` is keyed by referenceId and must come from persisted rows — the
 * same obligation ValidationContext carries. A pool built from model output
 * would let the model widen its own candidate set, which is the whole failure
 * this filter exists to prevent.
 */
export function buildCandidatePool(
  evidence: Record<string, NormalizedReferenceEvidenceV1>,
): CandidatePool {
  if (evidence === null || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new CandidatePoolError('evidence must be an object keyed by referenceId', 'pool_evidence_shape')
  }

  const byReference: Record<string, EvidenceItem[]> = {}
  const excluded: ExcludedCandidate[] = []

  for (const key of Object.keys(evidence).sort()) {
    const ev = evidence[key]
    if (ev === null || typeof ev !== 'object') {
      throw new CandidatePoolError(`evidence for ${key} is not an object`, 'pool_evidence_shape')
    }
    // The same binding the plan validator enforces: a record filed under a key
    // must agree with that key, or the pool attributes one reference's material
    // to another.
    if (ev.referenceId !== key) {
      throw new CandidatePoolError(
        `evidence filed under ${key} is labelled ${String(ev.referenceId)}`,
        'pool_reference_mismatch',
      )
    }

    const citable = new Set(citableEvidence(ev).map((i) => i.evidenceId))
    const kept: EvidenceItem[] = []

    for (const item of ev.items) {
      // `unknown` is §3's explicit gap list: the analysis never measured it. It
      // is not a candidate, and it is recorded as absent rather than as
      // rejected, because those are different facts about the world.
      if (!citable.has(item.evidenceId)) {
        excluded.push({
          evidenceId: item.evidenceId, type: item.type, referenceId: key,
          reason: item.kind === 'unknown' ? 'unknown_value' : 'not_citable',
          prohibition: null,
        })
        continue
      }
      const prohibition = PROHIBITED_EVIDENCE_TYPES[item.type]
      if (prohibition !== undefined) {
        excluded.push({
          evidenceId: item.evidenceId, type: item.type, referenceId: key,
          reason: 'prohibited_category', prohibition,
        })
        continue
      }
      kept.push(item)
    }

    byReference[key] = kept
  }

  return { byReference, excluded }
}

/**
 * Is this evidence id in the pool at all?
 *
 * The planner may only cite what the pool contains. This is the lookup the
 * request builder uses, and the one a test uses to prove a prohibited id is
 * unreachable rather than merely unselected.
 */
export function poolContains(pool: CandidatePool, evidenceId: string): boolean {
  for (const items of Object.values(pool.byReference)) {
    if (items.some((i) => i.evidenceId === evidenceId)) return true
  }
  return false
}

/**
 * Every prohibited category the frozen §6 list names, and whether this pool
 * builder can currently exclude evidence for it.
 *
 * REPORTED, NOT ASSERTED. Most prohibitions — creator_identity, voice_or_likeness,
 * copyrighted_expression — have no corresponding evidence TYPE, because the
 * normalizer never emits one. Claiming this filter enforces them would be a
 * false statement of coverage; the honest position is that they are enforced
 * downstream by the validator's content checks, and that this table says so out
 * loud rather than leaving a reader to assume the list is handled here.
 */
export function prohibitedCoverage(): Array<{ prohibition: ProhibitedTransfer; filteredHere: boolean }> {
  const covered = new Set(Object.values(PROHIBITED_EVIDENCE_TYPES))
  return PROHIBITED_TRANSFERS.map((p) => ({ prohibition: p, filteredHere: covered.has(p) }))
}

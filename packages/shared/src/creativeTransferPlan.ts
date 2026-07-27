// Track C · Batch A.6 — `CreativeTransferPlanV1` and its SEMANTIC validator.
//
// AUTHORITY: docs/twinai-selective-transfer-reasoning-contract.md, sha256
// 3f8816055c4f867978841a53ef30eb146d2073c3e17ead1697ab9614573bfa07, §6 verbatim
// for the shape and the required invariants, with §4 (layer policy), §5
// (authority hierarchy) and §7 (the decision algorithm) supplying the rules the
// validator enforces.
//
// THIS IS THE GATE, AND IT RUNS SERVER-SIDE BEFORE PERSISTENCE.
// §6: "The server semantically validates the returned plan before persistence."
// Everything here assumes the plan arrived from a model and is hostile until
// checked. The model may not invent a reference id, an evidence id, a dimension
// or an action — so each of those is checked against a set the SERVER produced,
// not against the plan's own contents. A plan that cites itself proves nothing.
import {
  TRANSFER_DIMENSIONS, DIMENSION_LAYER, type TransferDimension,
  type CampaignIntentV1, dimensionEligibility,
} from './campaignIntent.js'
import {
  type NormalizedReferenceEvidenceV1, assertEvidenceIdsAreIssued,
} from './referenceEvidence.js'
import type { BrandTruthSnapshotV1 } from './brandTruth.js'

export type TransferAction = 'transfer' | 'adapt' | 'reject' | 'brand_default'

export const RATIONALE_CODES = [
  'brand_fit', 'goal_fit', 'platform_fit', 'audience_fit', 'conflict',
  'insufficient_evidence', 'unsafe_or_unlicensed', 'user_override',
] as const
export type RationaleCode = (typeof RATIONALE_CODES)[number]

/** §6's prohibited-transfer list, frozen. */
export const PROHIBITED_TRANSFERS = [
  'product', 'offer', 'factual_claims', 'pricing', 'audience_identity',
  'creator_identity', 'voice_or_likeness', 'copyrighted_expression',
] as const
export type ProhibitedTransfer = (typeof PROHIBITED_TRANSFERS)[number]

/**
 * §6: "confidence below the predefined threshold becomes brand_default or
 * reject". PREDEFINED means fixed here, in the diff, before any output is seen —
 * §7 Step 4 forbids tuning weights or thresholds after seeing a desired result
 * without a version bump. Milli-units so a plan hashes byte-identically.
 */
export const CONFIDENCE_THRESHOLD_MILLI = 600

export interface CreativeTransferDecisionV1 {
  dimension: TransferDimension
  action: TransferAction
  primaryReferenceId: string | null
  secondaryReferenceId: string | null
  evidenceIds: string[]
  observedTraits: string[]
  adaptedInstruction: string
  /** 0..1000 milli-units (the contract's 0..1 as an integer). */
  confidenceMilli: number
  rationaleCode: RationaleCode
  constraints: string[]
}

export interface CreativeTransferPlanV1 {
  schemaVersion: 1
  generationId: string
  brandTruthSnapshotId: string
  brandTruthSha256: string
  campaignIntentId: string
  campaignIntentSha256: string
  referenceSet: Array<{
    referenceId: string
    analysisId: string
    analysisSha256: string
    requestedDimensions: TransferDimension[]
  }>
  decisions: CreativeTransferDecisionV1[]
  conflicts: Array<{
    dimension: TransferDimension
    referenceIds: string[]
    resolution: 'selected_primary' | 'brand_default' | 'rejected_all'
    reasonCode: string
  }>
  prohibitedTransfers: ProhibitedTransfer[]
  modelIdentity: string
  promptVersion: string
  createdAt: string
  planSha256: string
}

export class TransferPlanError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'TransferPlanError'
    this.code = code
  }
}

const HEX64 = /^[0-9a-f]{64}$/

/** The server-side facts a plan is validated AGAINST. None come from the plan. */
export interface ValidationContext {
  brandTruth: BrandTruthSnapshotV1
  intent: CampaignIntentV1
  /** Normalized evidence per reference, keyed by referenceId. */
  evidence: Record<string, NormalizedReferenceEvidenceV1>
}

/**
 * Business facts that may never appear in a bounded instruction (§5 level 1,
 * §6 "Factual/business fields cannot appear in adaptedInstruction").
 *
 * This is checked against the ACTUAL VALUES in the brand truth snapshot rather
 * than against a keyword list, because a keyword list only catches the words
 * someone thought of. If the snapshot says the product is "a 12-week home
 * programme", that exact claim must not be restated as a creative instruction —
 * the instruction layer directs HOW to say something, and the business layer
 * decides WHAT is true.
 */
function businessFactValues(bt: BrandTruthSnapshotV1): string[] {
  const out: string[] = []
  for (const f of Object.values(bt.businessTruth)) {
    if (typeof f.value === 'string' && f.value.trim().length >= 8) out.push(f.value.trim().toLowerCase())
  }
  return out
}

export function validateCreativeTransferPlan(
  plan: CreativeTransferPlanV1, ctx: ValidationContext,
): CreativeTransferPlanV1 {
  const fail = (m: string, code: string): never => { throw new TransferPlanError(m, code) }

  if (plan.schemaVersion !== 1) fail('schemaVersion must be 1', 'plan_schema_version')
  for (const [name, v] of [
    ['brandTruthSha256', plan.brandTruthSha256],
    ['campaignIntentSha256', plan.campaignIntentSha256],
    ['planSha256', plan.planSha256],
  ] as const) {
    if (!HEX64.test(v)) fail(`${name} must be a lowercase sha256 hex digest`, 'plan_digest_malformed')
  }
  if (plan.generationId !== ctx.intent.generationId) {
    fail(
      `plan is for generation ${plan.generationId} but the intent is for ${ctx.intent.generationId}`,
      'plan_generation_mismatch',
    )
  }

  // §6: the model cannot create REFERENCE IDS. Every reference in the plan must
  // appear in the intent the user actually assembled.
  const intentRefs = new Set(ctx.intent.references.map((r) => r.referenceId))
  const planRefs = new Set<string>()
  for (const r of plan.referenceSet) {
    if (!intentRefs.has(r.referenceId)) {
      fail(
        `reference ${r.referenceId} is in the plan but not in the campaign intent; `
        + 'a plan cannot introduce a reference the user did not supply',
        'plan_reference_not_in_intent',
      )
    }
    if (planRefs.has(r.referenceId)) fail(`reference ${r.referenceId} appears twice`, 'plan_reference_duplicate')
    planRefs.add(r.referenceId)
    if (!HEX64.test(r.analysisSha256)) fail(`reference ${r.referenceId} has a malformed analysis digest`, 'plan_digest_malformed')
    if (ctx.evidence[r.referenceId] === undefined) {
      fail(`no normalized evidence was supplied for reference ${r.referenceId}`, 'plan_evidence_missing')
    }
  }

  // §6: EXACTLY ONE DECISION FOR EVERY SUPPORTED DIMENSION. Not "at least one" —
  // a dimension with no decision is a dimension nobody decided, and a silent
  // omission is how an unreviewed default ships.
  const byDimension = new Map<TransferDimension, CreativeTransferDecisionV1>()
  for (const d of plan.decisions) {
    if (!TRANSFER_DIMENSIONS.includes(d.dimension)) {
      fail(`unknown dimension ${JSON.stringify(d.dimension)}`, 'plan_dimension_unknown')
    }
    if (byDimension.has(d.dimension)) {
      fail(`dimension ${d.dimension} has more than one decision`, 'plan_dimension_duplicate')
    }
    byDimension.set(d.dimension, d)
  }
  for (const dim of TRANSFER_DIMENSIONS) {
    if (!byDimension.has(dim)) fail(`dimension ${dim} has no decision`, 'plan_dimension_missing')
  }

  for (const d of plan.decisions) {
    const where = `decision[${d.dimension}]`
    if (!(['transfer', 'adapt', 'reject', 'brand_default'] as string[]).includes(d.action)) {
      fail(`${where}: unknown action ${JSON.stringify(d.action)}`, 'plan_action_unknown')
    }
    if (!RATIONALE_CODES.includes(d.rationaleCode)) {
      fail(`${where}: unknown rationaleCode ${JSON.stringify(d.rationaleCode)}`, 'plan_rationale_unknown')
    }
    if (!Number.isInteger(d.confidenceMilli) || d.confidenceMilli < 0 || d.confidenceMilli > 1000) {
      fail(`${where}: confidenceMilli must be an integer 0..1000`, 'plan_confidence_range')
    }

    const uses = d.action === 'transfer' || d.action === 'adapt'

    // §6: at most ONE primary per dimension, and a secondary needs a primary.
    if (d.primaryReferenceId !== null && !planRefs.has(d.primaryReferenceId)) {
      fail(`${where}: primary reference ${d.primaryReferenceId} is not in the reference set`, 'plan_reference_unknown')
    }
    if (d.secondaryReferenceId !== null) {
      if (!planRefs.has(d.secondaryReferenceId)) {
        fail(`${where}: secondary reference ${d.secondaryReferenceId} is not in the reference set`, 'plan_reference_unknown')
      }
      if (d.primaryReferenceId === null) {
        fail(`${where}: a secondary reference without a primary is a blend, not a supplement`, 'plan_secondary_without_primary')
      }
      if (d.secondaryReferenceId === d.primaryReferenceId) {
        fail(`${where}: primary and secondary are the same reference`, 'plan_secondary_equals_primary')
      }
      // §6: "References are never averaged or concatenated by default." A
      // secondary may only supplement a NON-CONFLICTING sub-trait, so it must say
      // which one — an unexplained secondary is a blend wearing a label.
      if (d.constraints.length === 0) {
        fail(
          `${where}: a secondary reference may only supplement a named, non-conflicting sub-trait; `
          + 'with no constraint naming it, this is an undeclared blend of two references',
          'plan_secondary_unconstrained',
        )
      }
    }
    if (!uses && d.primaryReferenceId !== null) {
      fail(`${where}: action ${d.action} must not name a reference`, 'plan_unused_reference')
    }

    // §6: every transfer/adapt CITES server-issued evidence.
    if (uses) {
      if (d.primaryReferenceId === null) {
        fail(`${where}: action ${d.action} requires a primary reference`, 'plan_missing_primary')
      }
      if (d.evidenceIds.length === 0) {
        fail(`${where}: action ${d.action} must cite evidence`, 'plan_evidence_uncited')
      }
      // The ids must have been ISSUED for the references this decision names —
      // not merely be well-formed, and not belong to some other reference.
      const allowed = [d.primaryReferenceId, d.secondaryReferenceId].filter((x): x is string => x !== null)
      for (const id of d.evidenceIds) {
        const owner = allowed.find((refId) => {
          try { assertEvidenceIdsAreIssued(ctx.evidence[refId], [id]); return true } catch { return false }
        })
        if (owner === undefined) {
          fail(
            `${where}: evidence ${JSON.stringify(id)} was not issued for any reference this decision names`,
            'plan_evidence_not_issued',
          )
        }
      }
      // §6: unknown evidence is not evidence. Citing an unextracted trait would
      // let "we never looked at transitions" support a transition decision.
      for (const refId of allowed) {
        for (const item of ctx.evidence[refId].items) {
          if (d.evidenceIds.includes(item.evidenceId) && item.kind === 'unknown') {
            fail(
              `${where}: cites ${item.evidenceId}, which is an UNKNOWN (${item.type}) — `
              + 'absent evidence cannot support a transfer',
              'plan_evidence_unknown_cited',
            )
          }
        }
      }
    } else if (d.evidenceIds.length > 0) {
      fail(`${where}: action ${d.action} must not cite evidence it did not use`, 'plan_evidence_on_unused')
    }

    // §6: below the PREDEFINED threshold, a decision becomes brand_default or
    // reject. A low-confidence transfer is the shape this rule exists to stop.
    if (uses && d.confidenceMilli < CONFIDENCE_THRESHOLD_MILLI) {
      fail(
        `${where}: confidence ${d.confidenceMilli} is below the predefined threshold `
        + `${CONFIDENCE_THRESHOLD_MILLI}; such a decision must be brand_default or reject`,
        'plan_confidence_below_threshold',
      )
    }

    // §4 via the intent: a content-strategy dimension needs an explicit request,
    // and a reference must be one the intent actually scoped for this dimension.
    if (uses) {
      const e = dimensionEligibility(ctx.intent, d.primaryReferenceId as string, d.dimension)
      if (!e.eligible) {
        fail(
          `${where}: ${d.dimension} (${DIMENSION_LAYER[d.dimension]}) is not eligible for reference `
          + `${String(d.primaryReferenceId)} — ${e.reasonCode}`,
          'plan_dimension_not_eligible',
        )
      }
    }

    // §6: factual/business fields cannot appear in adaptedInstruction.
    const instruction = d.adaptedInstruction.trim().toLowerCase()
    if (uses && instruction === '') {
      fail(`${where}: action ${d.action} needs a bounded instruction`, 'plan_instruction_empty')
    }
    for (const fact of businessFactValues(ctx.brandTruth)) {
      if (instruction.includes(fact)) {
        fail(
          `${where}: adaptedInstruction restates a business fact from the brand truth snapshot `
          + `(${JSON.stringify(fact)}). An instruction directs HOW to say something; WHAT is true `
          + 'belongs to the business-truth layer and must not be re-decided here.',
          'plan_instruction_carries_business_fact',
        )
      }
    }
  }

  // §6: the prohibited-transfer list is the frozen one, entire and unmodified.
  // A plan that dropped an entry would be declaring something transferable.
  const declared = [...plan.prohibitedTransfers].sort()
  const frozen = [...PROHIBITED_TRANSFERS].sort()
  if (declared.length !== frozen.length || declared.some((v, i) => v !== frozen[i])) {
    fail(
      'prohibitedTransfers must be exactly the frozen §6 list; a plan cannot narrow it',
      'plan_prohibited_list_altered',
    )
  }

  for (const c of plan.conflicts) {
    if (!TRANSFER_DIMENSIONS.includes(c.dimension)) {
      fail(`conflict names unknown dimension ${c.dimension}`, 'plan_dimension_unknown')
    }
    if (c.referenceIds.length < 2) {
      fail(`conflict on ${c.dimension} lists fewer than two references`, 'plan_conflict_vacuous')
    }
    for (const r of c.referenceIds) {
      if (!planRefs.has(r)) fail(`conflict on ${c.dimension} names unknown reference ${r}`, 'plan_reference_unknown')
    }
    // §7 Step 6: a conflict is RESOLVED, never blended. The resolution must match
    // what the decision actually did.
    const d = byDimension.get(c.dimension)
    if (d === undefined) fail(`conflict on ${c.dimension} has no decision`, 'plan_dimension_missing')
    const resolvedTo = d!.action === 'brand_default'
      ? 'brand_default'
      : d!.action === 'reject' ? 'rejected_all' : 'selected_primary'
    if (c.resolution !== resolvedTo) {
      fail(
        `conflict on ${c.dimension} records resolution ${c.resolution} but the decision is `
        + `${d!.action}, i.e. ${resolvedTo}`,
        'plan_conflict_resolution_mismatch',
      )
    }
  }

  return plan
}

export function canonicalTransferPlan(plan: CreativeTransferPlanV1): string {
  const canon = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canon)
    if (v !== null && typeof v === 'object') {
      const o = v as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(o).sort()) out[k] = canon(o[k])
      return out
    }
    return v
  }
  // planSha256 is excluded: it is a digest OF the plan and cannot be an input to
  // its own computation.
  const { planSha256: _ignored, ...rest } = plan
  return JSON.stringify(canon(rest))
}

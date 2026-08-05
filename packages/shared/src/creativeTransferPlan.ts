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
  validateNormalizedEvidence,
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

/**
 * THE SERVER-ISSUED FACTS. None of these come from the plan, and that is the
 * whole point: a validator that checks a digest's SHAPE accepts any 64-hex
 * string, so `brandTruthSha256`, `campaignIntentSha256` and the snapshot/intent
 * IDs were decorative — a plan could pin a lineage that never existed and pass.
 * They are now compared to exact values the server holds.
 *
 * EVERY FIELD HERE MUST BE READ FROM A PERSISTED ROW, NEVER FROM MODEL OUTPUT.
 * That is not a style note — it is the only thing that makes the comparisons
 * mean anything. Validating a plan against a context the same model turn
 * produced compares a claim to itself. Concretely, the caller populates:
 *
 *   brandTruthSnapshotId / brandTruthSha256
 *       brand_truth_snapshots.id / .snapshot_sha256
 *   campaignIntentId / campaignIntentSha256
 *       campaign_intents.id / .intent_sha256
 *   evidence[refId]        reference_evidence_sets.evidence  (the normalized set)
 *   analysisSha256[refId]  reference_evidence_sets.analysis_sha256
 *
 * Note the last one especially: it is `analysis_sha256`, the digest of the
 * UPSTREAM ANALYSIS BYTES — not `evidence_sha256`, which digests the normalized
 * evidence this row stores. Migration 0095 enforces the same distinction in the
 * database, and the two must not be conflated in either place.
 */
export interface ValidationContext {
  brandTruth: BrandTruthSnapshotV1
  intent: CampaignIntentV1
  /** The row id and digest the server actually persisted for that snapshot. */
  brandTruthSnapshotId: string
  brandTruthSha256: string
  campaignIntentId: string
  campaignIntentSha256: string
  /** Normalized evidence per reference, keyed by referenceId. */
  evidence: Record<string, NormalizedReferenceEvidenceV1>
  /**
   * The analysis digest the server pinned for each reference. A plan naming an
   * `analysisSha256` the server never issued would otherwise persist unchecked,
   * and a citation into replaced evidence would still "resolve".
   */
  analysisSha256: Record<string, string>
  /**
   * The digest function, supplied by the caller.
   *
   * This module is in @twinai/shared, which the web build also consumes, so it
   * cannot import `node:crypto`. Injecting the hasher keeps the contract
   * runtime-agnostic AND makes the dependency explicit — the same reason
   * brandTruth and campaignIntent expose `canonical*` and leave hashing to the
   * caller.
   */
  sha256: (s: string) => string
}

// ---- FIXED, PREDECLARED BOUNDS ---------------------------------------------
//
// Model output was structurally open: extra keys survived, strings and arrays
// were unbounded, and `createdAt`/`modelIdentity`/`promptVersion` were unchecked.
// A plan carrying a hidden `override` key, a megabyte of `observedTraits`, or a
// nonsense timestamp validated and was then HASH-PERSISTED — the digest making
// the junk permanent rather than catching it.
//
// These caps are fixed here, in the diff, before any output is seen (§7 Step 4:
// never tune after seeing a desired result without a version bump).
export const LIMITS = {
  instruction: 600,
  trait: 200,
  traitsPerDecision: 12,
  constraint: 300,
  constraintsPerDecision: 8,
  reasonCode: 64,
  identity: 128,
  references: 8,
  conflicts: 32,
  conflictReferences: 8,
  evidenceIdsPerDecision: 24,
  evidenceId: 160,
  uuidish: 128,
} as const

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
const PLAIN_ID = /^[A-Za-z0-9_.:-]{1,128}$/

/** Keys a DECISION may carry. Anything else is a channel nobody reviewed. */
const DECISION_KEYS = new Set([
  'dimension', 'action', 'primaryReferenceId', 'secondaryReferenceId',
  'evidenceIds', 'observedTraits', 'adaptedInstruction', 'confidenceMilli',
  'rationaleCode', 'constraints',
])
const PLAN_KEYS = new Set([
  'schemaVersion', 'generationId', 'brandTruthSnapshotId', 'brandTruthSha256',
  'campaignIntentId', 'campaignIntentSha256', 'referenceSet', 'decisions',
  'conflicts', 'prohibitedTransfers', 'modelIdentity', 'promptVersion',
  'createdAt', 'planSha256',
])
const REFERENCE_KEYS = new Set(['referenceId', 'analysisId', 'analysisSha256', 'requestedDimensions'])
const CONFLICT_KEYS = new Set(['dimension', 'referenceIds', 'resolution', 'reasonCode'])

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

/** sha256 of the canonical plan, with planSha256 itself excluded. */
export function computePlanSha256(plan: CreativeTransferPlanV1, sha256: (s: string) => string): string {
  return sha256(canonicalTransferPlan(plan))
}

/**
 * FINALIZE. The plan's own digest is DERIVED, never accepted from model output.
 *
 * A model-supplied `planSha256` is worse than useless: it looks like integrity
 * while certifying nothing, so mutated plan bytes carrying an unchanged hash
 * passed. Callers must finalize before persisting, and the validator refuses a
 * plan whose digest does not match its bytes.
 */
export function finalizeTransferPlan(
  plan: CreativeTransferPlanV1, sha256: (s: string) => string,
): CreativeTransferPlanV1 {
  return { ...plan, planSha256: computePlanSha256(plan, sha256) }
}

/** Recursive unknown-key rejection. An unreviewed key is an unreviewed channel. */
function assertKeys(o: unknown, allowed: Set<string>, where: string, fail: (m: string, c: string) => never): void {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) {
    fail(`${where} must be an object`, 'plan_shape_invalid')
  }
  for (const k of Object.keys(o as Record<string, unknown>)) {
    if (!allowed.has(k)) {
      fail(
        `${where} carries the unknown key ${JSON.stringify(k)}; a plan may not introduce fields `
        + 'nobody validates, and hashing one only makes it permanent',
        'plan_unknown_key',
      )
    }
  }
}

function assertString(v: unknown, max: number, where: string, fail: (m: string, c: string) => never): string {
  if (typeof v !== 'string') fail(`${where} must be a string`, 'plan_shape_invalid')
  const s = v as string
  // Bytes, not characters: a multi-byte payload must not slip a length cap.
  const bytes = new TextEncoder().encode(s).length
  if (bytes > max) fail(`${where} is ${bytes} bytes, over the ${max}-byte cap`, 'plan_field_too_large')
  return s
}

export function validateCreativeTransferPlan(
  plan: CreativeTransferPlanV1, ctx: ValidationContext,
): CreativeTransferPlanV1 {
  const fail = (m: string, code: string): never => { throw new TransferPlanError(m, code) }

  assertKeys(plan, PLAN_KEYS, 'plan', fail)
  if (plan.schemaVersion !== 1) fail('schemaVersion must be 1', 'plan_schema_version')
  for (const [name, v] of [
    ['brandTruthSha256', plan.brandTruthSha256],
    ['campaignIntentSha256', plan.campaignIntentSha256],
    ['planSha256', plan.planSha256],
  ] as const) {
    if (typeof v !== 'string' || !HEX64.test(v)) fail(`${name} must be a lowercase sha256 hex digest`, 'plan_digest_malformed')
  }

  // ---- BOUND TO SERVER-ISSUED LINEAGE, not merely well-shaped --------------
  if (plan.brandTruthSnapshotId !== ctx.brandTruthSnapshotId) {
    fail(
      `plan pins brand-truth snapshot ${plan.brandTruthSnapshotId} but the server issued `
      + `${ctx.brandTruthSnapshotId}`,
      'plan_brand_truth_id_mismatch',
    )
  }
  if (plan.brandTruthSha256 !== ctx.brandTruthSha256) {
    fail('plan pins a brand-truth digest the server did not issue', 'plan_brand_truth_digest_mismatch')
  }
  if (plan.campaignIntentId !== ctx.campaignIntentId) {
    fail(
      `plan pins campaign intent ${plan.campaignIntentId} but the server issued ${ctx.campaignIntentId}`,
      'plan_campaign_intent_id_mismatch',
    )
  }
  if (plan.campaignIntentSha256 !== ctx.campaignIntentSha256) {
    fail('plan pins a campaign-intent digest the server did not issue', 'plan_campaign_intent_digest_mismatch')
  }

  // ---- THE PLAN'S OWN DIGEST MUST DESCRIBE ITS OWN BYTES -------------------
  if (typeof ctx.sha256 !== 'function') {
    fail('the validation context must supply a sha256 function', 'plan_no_digest_function')
  }
  if (plan.planSha256 !== computePlanSha256(plan, ctx.sha256)) {
    fail(
      'planSha256 does not match the canonical plan bytes; the digest must be DERIVED by '
      + 'finalizeTransferPlan, never carried over from model output',
      'plan_digest_not_derived',
    )
  }

  // ---- envelope metadata ---------------------------------------------------
  assertString(plan.modelIdentity, LIMITS.identity, 'modelIdentity', fail)
  assertString(plan.promptVersion, LIMITS.identity, 'promptVersion', fail)
  if (!PLAIN_ID.test(plan.modelIdentity)) fail('modelIdentity must be a plain identifier', 'plan_identity_invalid')
  if (!PLAIN_ID.test(plan.promptVersion)) fail('promptVersion must be a plain identifier', 'plan_identity_invalid')
  if (typeof plan.createdAt !== 'string' || !ISO_UTC.test(plan.createdAt)
      || Number.isNaN(Date.parse(plan.createdAt))) {
    fail('createdAt must be an ISO-8601 UTC instant', 'plan_created_at_invalid')
  }
  assertString(plan.generationId, LIMITS.uuidish, 'generationId', fail)

  if (!Array.isArray(plan.referenceSet) || plan.referenceSet.length > LIMITS.references) {
    fail(`referenceSet must be an array of at most ${LIMITS.references}`, 'plan_field_too_large')
  }
  if (!Array.isArray(plan.conflicts) || plan.conflicts.length > LIMITS.conflicts) {
    fail(`conflicts must be an array of at most ${LIMITS.conflicts}`, 'plan_field_too_large')
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
    assertKeys(r, REFERENCE_KEYS, `referenceSet[${r.referenceId}]`, fail)
    if (!intentRefs.has(r.referenceId)) {
      fail(
        `reference ${r.referenceId} is in the plan but not in the campaign intent; `
        + 'a plan cannot introduce a reference the user did not supply',
        'plan_reference_not_in_intent',
      )
    }
    if (planRefs.has(r.referenceId)) fail(`reference ${r.referenceId} appears twice`, 'plan_reference_duplicate')
    planRefs.add(r.referenceId)
    if (typeof r.analysisSha256 !== 'string' || !HEX64.test(r.analysisSha256)) {
      fail(`reference ${r.referenceId} has a malformed analysis digest`, 'plan_digest_malformed')
    }
    const ev = ctx.evidence[r.referenceId]
    if (ev === undefined) {
      fail(`no normalized evidence was supplied for reference ${r.referenceId}`, 'plan_evidence_missing')
    }

    // ---- THE REFERENCE SET IS BOUND TO SERVER-ISSUED EVIDENCE AND INTENT ---
    //
    // Previously a plan could name any analysisId, any analysisSha256 and any
    // requestedDimensions and they would persist unchecked — so the pinned
    // lineage described nothing. Each field is now compared to what the server
    // holds, and the evidence set itself is re-validated so a fabricated set
    // cannot be smuggled in through the context either.
    validateNormalizedEvidence(ev)
    // THE MAP KEY IS NOT PROOF OF WHAT THE RECORD IS.
    //
    // `ctx.evidence` is keyed by referenceId, and every check below trusted that
    // key. Nothing compared it to the record's OWN `referenceId`, so evidence
    // gathered for reference B, filed under key A, satisfied all of them: the
    // analysis ids agree (the plan simply names B's analysis), the digest agrees
    // (the server pinned B's), and the plan then cites B's evidence as if it were
    // A's. The record must agree with the drawer it was filed in.
    if (ev.referenceId !== r.referenceId) {
      fail(
        `the evidence supplied for reference ${r.referenceId} is labelled ${ev.referenceId}; `
        + 'a reference cannot cite another reference\'s evidence',
        'plan_evidence_reference_mismatch',
      )
    }
    if (ev.analysisId !== r.analysisId) {
      fail(
        `reference ${r.referenceId} names analysis ${r.analysisId} but the server issued evidence `
        + `for ${ev.analysisId}`,
        'plan_analysis_id_mismatch',
      )
    }
    const pinned = ctx.analysisSha256[r.referenceId]
    if (typeof pinned !== 'string' || !HEX64.test(pinned)) {
      fail(`the server pinned no analysis digest for reference ${r.referenceId}`, 'plan_analysis_digest_unpinned')
    }
    if (r.analysisSha256 !== pinned) {
      fail(
        `reference ${r.referenceId} pins analysis digest ${r.analysisSha256}, which the server did not issue`,
        'plan_analysis_digest_mismatch',
      )
    }
    // The scope the USER requested, not a scope the plan asserts for itself.
    const intentRef = ctx.intent.references.find((x) => x.referenceId === r.referenceId)
    const requested = intentRef?.requestedDimensions.value ?? []
    const declared = [...(r.requestedDimensions ?? [])].sort()
    const expected = [...requested].sort()
    if (declared.length !== expected.length || declared.some((v, i) => v !== expected[i])) {
      fail(
        `reference ${r.referenceId} declares a requested scope the campaign intent does not contain`,
        'plan_requested_scope_mismatch',
      )
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
    assertKeys(d, DECISION_KEYS, where, fail)
    if (!Array.isArray(d.evidenceIds) || d.evidenceIds.length > LIMITS.evidenceIdsPerDecision) {
      fail(`${where}: evidenceIds must be an array of at most ${LIMITS.evidenceIdsPerDecision}`, 'plan_field_too_large')
    }
    for (const id of d.evidenceIds) assertString(id, LIMITS.evidenceId, `${where}.evidenceIds[]`, fail)
    if (!Array.isArray(d.observedTraits) || d.observedTraits.length > LIMITS.traitsPerDecision) {
      fail(`${where}: observedTraits must be an array of at most ${LIMITS.traitsPerDecision}`, 'plan_field_too_large')
    }
    for (const t of d.observedTraits) assertString(t, LIMITS.trait, `${where}.observedTraits[]`, fail)
    if (!Array.isArray(d.constraints) || d.constraints.length > LIMITS.constraintsPerDecision) {
      fail(`${where}: constraints must be an array of at most ${LIMITS.constraintsPerDecision}`, 'plan_field_too_large')
    }
    for (const c of d.constraints) assertString(c, LIMITS.constraint, `${where}.constraints[]`, fail)
    assertString(d.adaptedInstruction, LIMITS.instruction, `${where}.adaptedInstruction`, fail)
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

    // §1.1: EVERY ROW CARRIES ITS EVIDENCE — including a row that decided
    // against the reference.
    //
    // `evidenceIds` was constrained above and `observedTraits` was not, so a
    // `brand_default` or `reject` decision could carry any traits at all with
    // nothing behind them. That is not a theoretical hole: those traits are
    // exactly what a Creative Transfer screen renders, and a `reject` on
    // `zoom_style` reading "reference used heavy punch-ins" is §1.1's fabricated
    // row — arriving through the one action nobody thought to check, because
    // rejecting felt like the safe direction.
    //
    // A decision that used nothing observed nothing it can show.
    if (!uses && d.observedTraits.length > 0) {
      fail(
        `${where}: action ${d.action} cites no evidence, so it may not report observed traits — `
        + 'a trait with nothing behind it is a fabricated row',
        'plan_traits_on_unused',
      )
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
    assertKeys(c, CONFLICT_KEYS, `conflict[${String(c.dimension)}]`, fail)
    assertString(c.reasonCode, LIMITS.reasonCode, `conflict[${String(c.dimension)}].reasonCode`, fail)
    if (!Array.isArray(c.referenceIds) || c.referenceIds.length > LIMITS.conflictReferences) {
      fail(`conflict on ${c.dimension}: referenceIds must be an array of at most ${LIMITS.conflictReferences}`, 'plan_field_too_large')
    }
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

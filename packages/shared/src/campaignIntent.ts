// Track C · Batch A.4 — `CampaignIntentV1`.
//
// AUTHORITY: docs/twinai-selective-transfer-reasoning-contract.md, sha256
// 3f8816055c4f867978841a53ef30eb146d2073c3e17ead1697ab9614573bfa07.
// §4 (four transfer layers and their default policies; the "how close to the
// reference?" knob must be replaced by explicit scope), §5 level 2 (user intent:
// campaign goal, platform, desired outcome, content mode), §6 (per-reference
// requested dimensions), §7 Step 1 (reject missing truth instead of inventing it).
//
// WHAT THE PRODUCT ACTUALLY SENDS TODAY, AND WHY THAT MATTERS
// -----------------------------------------------------------
// `GenerateInput` (packages/shared/src/api.ts) carries reference_url,
// reference_note, `fidelity: close|balanced|loose`, `tone`, and an optional
// transcript_id. It carries NO campaign goal, NO platform, NO desired outcome and
// NO content mode — §10.3 of the contract says exactly this. So this file cannot
// project a campaign intent out of what exists; most of it is ABSENT, and the
// honest thing is to record that rather than to manufacture it.
//
// THE FIDELITY KNOB IS NOT AN EXPLICIT SCOPE, AND IS NOT TREATED AS ONE
// --------------------------------------------------------------------
// It is tempting to translate `close|balanced|loose` into a set of requested
// dimensions — it would make the legacy path "work". It would also be exactly the
// defect this contract exists to prevent: a MODEL-SIDE INFERENCE about what the
// user wanted, seated in a level-2 user-intent slot. (The Brand Truth projection
// hit the same shape when `offer` borrowed `product`'s authority.)
//
// So a legacy request produces an intent whose dimension scope is ABSENT with the
// reason `legacy_fidelity_is_not_an_explicit_scope`. Downstream, §6's rule then
// applies on its own terms: with no explicit request and no confidence, a
// dimension resolves to `brand_default` or `reject`. Nothing is silently
// transferred on the strength of a knob that never meant that.
import type { Platform } from './types.js'

/** §6's supported transfer dimensions. The model may not invent one. */
export const TRANSFER_DIMENSIONS = [
  'hook_mechanic', 'story_structure', 'pacing', 're_hook', 'payoff',
  'cta_mechanic', 'visual_language', 'shot_rhythm', 'b_roll_function',
  'caption_style', 'zoom_style', 'transition_style', 'music_energy',
  'topic_strategy', 'series_strategy',
] as const
export type TransferDimension = (typeof TRANSFER_DIMENSIONS)[number]

/** §4's four layers, with the default policy each one carries. */
export type TransferLayer =
  | 'presentation_mechanics'
  | 'storytelling_mechanics'
  | 'content_strategy'
  | 'business_truth'

export type LayerPolicy = 'may_transfer_or_adapt' | 'adapt_only_if_explicitly_requested' | 'never'

/**
 * §4's table, frozen. `business_truth` is `never` and there is no code path that
 * can change it — a campaign cannot opt into copying a reference's product,
 * claims, offer or pricing, however it is configured.
 */
export const LAYER_POLICY: Record<TransferLayer, LayerPolicy> = {
  presentation_mechanics: 'may_transfer_or_adapt',
  storytelling_mechanics: 'may_transfer_or_adapt',
  content_strategy: 'adapt_only_if_explicitly_requested',
  business_truth: 'never',
}

/** Which layer each dimension belongs to. Every dimension has exactly one. */
export const DIMENSION_LAYER: Record<TransferDimension, TransferLayer> = {
  hook_mechanic: 'storytelling_mechanics',
  story_structure: 'storytelling_mechanics',
  re_hook: 'storytelling_mechanics',
  payoff: 'storytelling_mechanics',
  cta_mechanic: 'storytelling_mechanics',
  pacing: 'presentation_mechanics',
  visual_language: 'presentation_mechanics',
  shot_rhythm: 'presentation_mechanics',
  b_roll_function: 'presentation_mechanics',
  caption_style: 'presentation_mechanics',
  zoom_style: 'presentation_mechanics',
  transition_style: 'presentation_mechanics',
  music_energy: 'presentation_mechanics',
  topic_strategy: 'content_strategy',
  series_strategy: 'content_strategy',
}

export type IntentAbsenceReason =
  | 'not_asserted_by_user'
  | 'legacy_fidelity_is_not_an_explicit_scope'
  | 'legacy_request_carries_no_platform'

export interface IntentField<T> {
  value: T | null
  absenceReason: IntentAbsenceReason | null
}

export interface ReferenceRequest {
  referenceId: string
  /**
   * The dimensions the USER asked Twin to learn from this reference (§4's
   * replacement for the fidelity slider). Null means they were never asked —
   * which is not the same as "none", and the difference decides whether a
   * downstream dimension may transfer at all.
   */
  requestedDimensions: IntentField<TransferDimension[]>
}

export interface CampaignIntentV1 {
  schemaVersion: 1
  ownerId: string
  generationId: string
  /** §5 level 2. Every one of these is USER-ASSERTED or absent. Never inferred. */
  goal: IntentField<string>
  platform: IntentField<Platform>
  desiredOutcome: IntentField<string>
  contentMode: IntentField<string>
  references: ReferenceRequest[]
  /** Frozen copy of §4's policy table, so a persisted intent records the rules it was decided under. */
  layerPolicy: Record<TransferLayer, LayerPolicy>
  /** Anything the legacy request carried that could NOT become intent, and why. */
  untranslatedLegacyInputs: Array<{ input: string; value: string; reason: string }>
}

export class CampaignIntentError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'CampaignIntentError'
    this.code = code
  }
}

/** What a caller may assert. Absent fields stay absent; nothing is defaulted. */
export interface CampaignIntentAssertions {
  ownerId: string
  generationId: string
  goal?: string
  platform?: Platform
  desiredOutcome?: string
  contentMode?: string
  references?: Array<{ referenceId: string; requestedDimensions?: TransferDimension[] }>
  /**
   * The legacy `GenerateInput` knobs, passed so their FAILURE TO TRANSLATE is
   * recorded rather than invisible. They never produce a value.
   */
  legacy?: { fidelity?: string; tone?: string }
}

const PLATFORMS: readonly Platform[] = ['tiktok', 'instagram', 'youtube', 'linkedin', 'other']

const text = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

export function buildCampaignIntent(a: CampaignIntentAssertions): CampaignIntentV1 {
  if (text(a.ownerId) === null) throw new CampaignIntentError('ownerId is required', 'campaign_intent_owner_missing')
  if (text(a.generationId) === null) {
    throw new CampaignIntentError('generationId is required', 'campaign_intent_generation_missing')
  }

  const untranslatedLegacyInputs: CampaignIntentV1['untranslatedLegacyInputs'] = []
  const f = text(a.legacy?.fidelity)
  if (f !== null) {
    untranslatedLegacyInputs.push({
      input: 'fidelity', value: f,
      reason: 'close/balanced/loose describes how closely to mirror a reference OVERALL. It names no '
        + 'dimension, so turning it into a requested-dimension set would be an inference about user '
        + 'intent occupying a level-2 slot. §4 replaces this knob with explicit scope.',
    })
  }
  const t = text(a.legacy?.tone)
  if (t !== null) {
    untranslatedLegacyInputs.push({
      input: 'tone', value: t,
      reason: 'tone is a DELIVERY instruction for the creator\'s own voice, not a request to transfer '
        + 'anything from a reference. It belongs to brand truth, not to campaign intent.',
    })
  }

  const field = <T>(v: T | null | undefined, reason: IntentAbsenceReason): IntentField<T> =>
    v === null || v === undefined
      ? { value: null, absenceReason: reason }
      : { value: v, absenceReason: null }

  const platform = a.platform
  if (platform !== undefined && !PLATFORMS.includes(platform)) {
    throw new CampaignIntentError(`unknown platform ${JSON.stringify(platform)}`, 'campaign_intent_platform_unknown')
  }

  const references: ReferenceRequest[] = (a.references ?? []).map((r) => {
    if (text(r.referenceId) === null) {
      throw new CampaignIntentError('every reference needs an id', 'campaign_intent_reference_id_missing')
    }
    if (r.requestedDimensions === undefined) {
      // The legacy path lands here: a reference was supplied, but the product
      // never asked WHAT to learn from it.
      return {
        referenceId: r.referenceId,
        requestedDimensions: {
          value: null,
          absenceReason: f !== null
            ? 'legacy_fidelity_is_not_an_explicit_scope'
            : 'not_asserted_by_user',
        },
      }
    }
    for (const d of r.requestedDimensions) {
      if (!TRANSFER_DIMENSIONS.includes(d)) {
        throw new CampaignIntentError(`unknown transfer dimension ${JSON.stringify(d)}`, 'campaign_intent_dimension_unknown')
      }
    }
    return {
      referenceId: r.referenceId,
      requestedDimensions: { value: [...r.requestedDimensions].sort(), absenceReason: null },
    }
  })

  return {
    schemaVersion: 1,
    ownerId: a.ownerId,
    generationId: a.generationId,
    goal: field(text(a.goal), 'not_asserted_by_user'),
    platform: field(platform ?? null, f !== null ? 'legacy_request_carries_no_platform' : 'not_asserted_by_user'),
    desiredOutcome: field(text(a.desiredOutcome), 'not_asserted_by_user'),
    contentMode: field(text(a.contentMode), 'not_asserted_by_user'),
    references,
    layerPolicy: { ...LAYER_POLICY },
    untranslatedLegacyInputs,
  }
}

export function validateCampaignIntent(i: CampaignIntentV1): CampaignIntentV1 {
  const fail = (m: string, code: string): never => { throw new CampaignIntentError(m, code) }
  if (i.schemaVersion !== 1) fail('schemaVersion must be 1', 'campaign_intent_schema_version')

  const fields: Array<[string, IntentField<unknown>]> = [
    ['goal', i.goal], ['platform', i.platform],
    ['desiredOutcome', i.desiredOutcome], ['contentMode', i.contentMode],
  ]
  for (const [name, fl] of fields) {
    if (fl.value === null && fl.absenceReason === null) {
      fail(`${name}: a missing value must record an absence reason`, 'campaign_intent_absence_unexplained')
    }
    if (fl.value !== null && fl.absenceReason !== null) {
      fail(`${name}: a present value must not carry an absence reason`, 'campaign_intent_absence_contradiction')
    }
  }

  const seen = new Set<string>()
  for (const r of i.references) {
    if (seen.has(r.referenceId)) {
      fail(`reference ${r.referenceId} appears twice`, 'campaign_intent_reference_duplicate')
    }
    seen.add(r.referenceId)
    const rd = r.requestedDimensions
    if (rd.value === null && rd.absenceReason === null) {
      fail(`reference ${r.referenceId}: an unrequested scope must record why`, 'campaign_intent_absence_unexplained')
    }
    if (rd.value !== null) {
      if (rd.absenceReason !== null) {
        fail(`reference ${r.referenceId}: a requested scope must not carry an absence reason`, 'campaign_intent_absence_contradiction')
      }
      if (new Set(rd.value).size !== rd.value.length) {
        fail(`reference ${r.referenceId}: duplicate requested dimension`, 'campaign_intent_dimension_duplicate')
      }
      for (const d of rd.value) {
        const layer = DIMENSION_LAYER[d]
        if (layer === undefined) fail(`unknown dimension ${d}`, 'campaign_intent_dimension_unknown')
        // §4: business truth is NEVER transferable. No dimension may belong to
        // that layer, and if one ever did, requesting it must fail rather than be
        // quietly dropped from the plan.
        if (i.layerPolicy[layer] === 'never') {
          fail(
            `reference ${r.referenceId} requests ${d}, which belongs to the ${layer} layer. `
            + 'That layer is never transferable from a reference, and no campaign configuration can change it.',
            'campaign_intent_prohibited_layer',
          )
        }
      }
    }
  }

  // The frozen policy table travels WITH the intent, so a persisted intent records
  // the rules it was decided under. A tampered copy is refused.
  for (const [layer, policy] of Object.entries(LAYER_POLICY)) {
    if (i.layerPolicy[layer as TransferLayer] !== policy) {
      fail(
        `layerPolicy.${layer} is ${String(i.layerPolicy[layer as TransferLayer])}, but §4 freezes it at ${policy}`,
        'campaign_intent_layer_policy_tampered',
      )
    }
  }
  return i
}

/**
 * May this dimension be transferred at all, given the intent? §4 + §6.
 *
 * This is the function that makes the fidelity decision above consequential: with
 * no explicit request, a content-strategy dimension is NOT eligible, and a
 * mechanics dimension is eligible only as a brand default rather than as
 * something the user asked for.
 */
export function dimensionEligibility(
  intent: CampaignIntentV1, referenceId: string, dimension: TransferDimension,
): { eligible: boolean; explicitlyRequested: boolean; reasonCode: string } {
  const layer = DIMENSION_LAYER[dimension]
  const policy = intent.layerPolicy[layer]
  if (policy === 'never') {
    return { eligible: false, explicitlyRequested: false, reasonCode: 'layer_never_transferable' }
  }
  const ref = intent.references.find((r) => r.referenceId === referenceId)
  if (ref === undefined) {
    return { eligible: false, explicitlyRequested: false, reasonCode: 'reference_not_in_intent' }
  }
  const requested = ref.requestedDimensions.value
  const explicitlyRequested = requested !== null && requested.includes(dimension)
  if (policy === 'adapt_only_if_explicitly_requested' && !explicitlyRequested) {
    // The legacy path can never reach content strategy, which is the point: a
    // fidelity slider must not be able to hand a reference's topic or series
    // format to a brand that never asked for it.
    return { eligible: false, explicitlyRequested: false, reasonCode: 'content_strategy_requires_explicit_request' }
  }
  if (requested === null) {
    return { eligible: true, explicitlyRequested: false, reasonCode: 'no_explicit_scope_brand_default_only' }
  }
  return explicitlyRequested
    ? { eligible: true, explicitlyRequested: true, reasonCode: 'explicitly_requested' }
    : { eligible: false, explicitlyRequested: false, reasonCode: 'not_in_requested_scope' }
}

export function canonicalCampaignIntent(i: CampaignIntentV1): string {
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
  return JSON.stringify(canon(i))
}

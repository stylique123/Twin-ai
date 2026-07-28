// Track C · Batch A.4 — `CampaignIntentV1` controls.
//
// The claim under test is narrow and load-bearing: THE LEGACY FIDELITY KNOB
// CANNOT BECOME AN EXPLICIT TRANSFER SCOPE. Everything else here exists to make
// that claim falsifiable, and to prove the §4 layer table is enforced rather than
// merely stored.
import { describe, it, expect } from 'vitest'
import {
  buildCampaignIntent, validateCampaignIntent, canonicalCampaignIntent,
  dimensionEligibility, CampaignIntentError,
  LAYER_POLICY, DIMENSION_LAYER, TRANSFER_DIMENSIONS,
  type CampaignIntentV1,
} from '../campaignIntent.js'

const OWNER = '11111111-1111-4111-8111-111111111111'
const GEN = '22222222-2222-4222-8222-222222222222'
const REF = '33333333-3333-4333-8333-333333333333'
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** Exactly what today's `GenerateInput` can supply: a reference and two knobs. */
const legacyRequest = (): CampaignIntentV1 => buildCampaignIntent({
  ownerId: OWNER, generationId: GEN,
  references: [{ referenceId: REF }],
  legacy: { fidelity: 'close', tone: 'punchy' },
})

/** What the contract's UI would supply once §4's explicit scope exists. */
const explicitRequest = (dims = ['hook_mechanic', 'shot_rhythm'] as const): CampaignIntentV1 =>
  buildCampaignIntent({
    ownerId: OWNER, generationId: GEN,
    goal: 'sell the 12-week programme',
    platform: 'instagram',
    desiredOutcome: 'purchase intent',
    contentMode: 'product discovery',
    references: [{ referenceId: REF, requestedDimensions: [...dims] }],
  })

describe('the §4 layer table is frozen and enforced', () => {
  it('every dimension belongs to exactly one layer', () => {
    for (const d of TRANSFER_DIMENSIONS) {
      expect(DIMENSION_LAYER[d], `${d} has no layer`).toBeDefined()
      expect(LAYER_POLICY[DIMENSION_LAYER[d]]).toBeDefined()
    }
  })

  it('business truth is never transferable, and no dimension sits in that layer', () => {
    expect(LAYER_POLICY.business_truth).toBe('never')
    for (const d of TRANSFER_DIMENSIONS) {
      expect(DIMENSION_LAYER[d], `${d} would be transferable business truth`).not.toBe('business_truth')
    }
  })

  it('MUTATION: an intent carrying a tampered policy table is refused', () => {
    // The table travels with the intent so a persisted plan records the rules it
    // was decided under. A copy that says content strategy is freely transferable
    // must not validate just because it says so.
    const broken = clone(explicitRequest())
    broken.layerPolicy.content_strategy = 'may_transfer_or_adapt'
    expect(() => validateCampaignIntent(broken)).toThrow(/freezes it at/)
  })

  it('MUTATION: requesting a dimension in a `never` layer is refused, not dropped', () => {
    // Today no dimension maps to business_truth, so this reaches the check by
    // moving one there — proving the guard would fire if the table ever changed.
    const broken = clone(explicitRequest(['topic_strategy'] as const))
    broken.layerPolicy.content_strategy = 'never'
    expect(() => validateCampaignIntent(broken)).toThrow(/never transferable/)
  })
})

// ------------------------------------------------- the load-bearing claim
describe('the legacy fidelity knob cannot become an explicit transfer scope', () => {
  it('a legacy request yields NO requested dimensions, with the reason recorded', () => {
    const i = legacyRequest()
    const rd = i.references[0].requestedDimensions
    expect(rd.value).toBeNull()
    expect(rd.absenceReason).toBe('legacy_fidelity_is_not_an_explicit_scope')
    expect(() => validateCampaignIntent(i)).not.toThrow()
  })

  it('the knobs are recorded as UNTRANSLATED rather than silently ignored', () => {
    // "It was dropped" and "it never meant that" are different statements, and a
    // reader of the persisted intent must be able to tell which happened.
    const i = legacyRequest()
    expect(i.untranslatedLegacyInputs.map((u) => u.input).sort()).toEqual(['fidelity', 'tone'])
    for (const u of i.untranslatedLegacyInputs) expect(u.reason.length).toBeGreaterThan(40)
  })

  it('fidelity=close cannot make content strategy eligible', () => {
    // THE control. `close` says "mirror the reference almost beat-for-beat" in the
    // live prompt. If that were translated into scope, it would hand the
    // reference's topic and series format to a brand that never asked — §4 puts
    // both behind an explicit request.
    const i = legacyRequest()
    for (const d of ['topic_strategy', 'series_strategy'] as const) {
      const e = dimensionEligibility(i, REF, d)
      expect(e.eligible, `${d} became eligible from a fidelity knob`).toBe(false)
      expect(e.reasonCode).toBe('content_strategy_requires_explicit_request')
    }
  })

  it('fidelity=close leaves mechanics eligible only as a BRAND DEFAULT', () => {
    // Not blocked — §4 lets mechanics transfer — but not "the user asked for
    // this" either. The distinction is what a downstream `rationaleCode` needs.
    const i = legacyRequest()
    const e = dimensionEligibility(i, REF, 'hook_mechanic')
    expect(e.eligible).toBe(true)
    expect(e.explicitlyRequested).toBe(false)
    expect(e.reasonCode).toBe('no_explicit_scope_brand_default_only')
  })

  it('CONTROL: an EXPLICIT request does make content strategy eligible', () => {
    // Without this the two cases above could be passing because nothing is ever
    // eligible.
    const i = explicitRequest(['topic_strategy'] as const)
    const e = dimensionEligibility(i, REF, 'topic_strategy')
    expect(e.eligible).toBe(true)
    expect(e.explicitlyRequested).toBe(true)
    expect(e.reasonCode).toBe('explicitly_requested')
  })

  it('an explicit scope EXCLUDES what it does not name', () => {
    const i = explicitRequest(['hook_mechanic'] as const)
    expect(dimensionEligibility(i, REF, 'hook_mechanic').eligible).toBe(true)
    const other = dimensionEligibility(i, REF, 'caption_style')
    expect(other.eligible).toBe(false)
    expect(other.reasonCode).toBe('not_in_requested_scope')
  })

  it('a reference absent from the intent is never eligible', () => {
    const e = dimensionEligibility(explicitRequest(), 'not-a-reference', 'hook_mechanic')
    expect(e.eligible).toBe(false)
    expect(e.reasonCode).toBe('reference_not_in_intent')
  })
})

describe('user intent is asserted or absent — never manufactured', () => {
  it('a legacy request has no goal, platform, outcome or content mode', () => {
    // §10.3: the current creation screen carries none of these. Inventing them is
    // exactly what §7 Step 1 forbids.
    const i = legacyRequest()
    expect(i.goal.value).toBeNull()
    expect(i.platform.value).toBeNull()
    expect(i.desiredOutcome.value).toBeNull()
    expect(i.contentMode.value).toBeNull()
    expect(i.platform.absenceReason).toBe('legacy_request_carries_no_platform')
  })

  it('an unknown platform is refused rather than coerced', () => {
    expect(() => buildCampaignIntent({
      ownerId: OWNER, generationId: GEN,
      platform: 'myspace' as never,
    })).toThrow(CampaignIntentError)
  })

  it('an unknown dimension is refused rather than dropped', () => {
    expect(() => buildCampaignIntent({
      ownerId: OWNER, generationId: GEN,
      references: [{ referenceId: REF, requestedDimensions: ['vibes' as never] }],
    })).toThrow(/unknown transfer dimension/)
  })

  it('MUTATION: an absence with no reason is refused', () => {
    const broken = clone(legacyRequest())
    broken.goal.absenceReason = null
    expect(() => validateCampaignIntent(broken)).toThrow(/absence reason/)
  })

  it('MUTATION: a value carrying an absence reason is refused', () => {
    const broken = clone(explicitRequest())
    broken.goal.absenceReason = 'not_asserted_by_user'
    expect(() => validateCampaignIntent(broken)).toThrow(/must not carry an absence reason/)
  })

  it('a duplicated reference is refused', () => {
    const broken = clone(explicitRequest())
    broken.references.push(clone(broken.references[0]))
    expect(() => validateCampaignIntent(broken)).toThrow(/appears twice/)
  })

  it('owner and generation are required', () => {
    expect(() => buildCampaignIntent({ ownerId: '  ', generationId: GEN })).toThrow(CampaignIntentError)
    expect(() => buildCampaignIntent({ ownerId: OWNER, generationId: '' })).toThrow(CampaignIntentError)
  })
})

describe('hashing', () => {
  it('is stable under key order and sensitive to a real change', () => {
    const a = explicitRequest(['hook_mechanic', 'shot_rhythm'] as const)
    const b = explicitRequest(['shot_rhythm', 'hook_mechanic'] as const)
    // Requested dimensions are a SET; the order the UI happened to send them in
    // must not change the hash.
    expect(canonicalCampaignIntent(b)).toEqual(canonicalCampaignIntent(a))
    const c = explicitRequest(['hook_mechanic'] as const)
    expect(canonicalCampaignIntent(c)).not.toEqual(canonicalCampaignIntent(a))
  })
})

// Track C · Batch A.6 — semantic validator controls for `CreativeTransferPlanV1`.
//
// §6 lists eleven required invariants. Each one below is exercised by taking a
// VALID plan and breaking exactly that invariant, so a validator that returned
// its input unchanged would fail every case. The valid plan is asserted to pass
// first, so the refusals cannot be passing because everything is refused.
//
// The validator is a SERVER-SIDE gate over model output. Nothing it checks comes
// from the plan itself: references are checked against the campaign intent,
// evidence against the server-issued set, dimensions and actions against closed
// enums, and business facts against the brand truth snapshot.
import { describe, it, expect } from 'vitest'
import {
  validateCreativeTransferPlan, canonicalTransferPlan, TransferPlanError,
  PROHIBITED_TRANSFERS, CONFIDENCE_THRESHOLD_MILLI,
  type CreativeTransferPlanV1, type ValidationContext,
} from '../creativeTransferPlan.js'
import { buildCampaignIntent, TRANSFER_DIMENSIONS, type TransferDimension } from '../campaignIntent.js'
import { normalizeReferenceEvidence, citableEvidence } from '../referenceEvidence.js'
import { projectBrandTruth } from '../brandTruth.js'

const GEN = '22222222-2222-4222-8222-222222222222'
const REF = 'ref-1'
const REF2 = 'ref-2'
const ANA = 'ana-1'
const ANA2 = 'ana-2'
const SHA = 'a'.repeat(64)
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

const structure = () => ({
  format_label: 'The Trust Builder',
  hook_window_sec: 2.5,
  why_it_works: ['opens an unresolved loop'],
  beats: [{ at_sec: 0, beat: 'cold open claim', goal: 'stop the scroll' }],
  cta: 'comment PLAN',
  words_per_min: 200,
})
const transcript = () => ({
  platform: 'instagram', language: 'en', durationSec: 61.2,
  words: Array.from({ length: 200 }, (_, i) => ({ start: i * 0.3, end: i * 0.3 + 0.2 })),
})

function context(): ValidationContext {
  const brandTruth = projectBrandTruth({
    ownerId: 'owner-1', brandVoiceId: 'bv-1',
    selfReported: { product: 'a 12-week home programme', audience: 'busy parents', goal: 'sell the programme' },
    synthesized: { tone: 'direct', offer: 'a paid 12-week plan' },
    brandKit: null,
  })
  // Every dimension is explicitly requested, so eligibility is never the reason a
  // case fails — each control isolates the invariant it names.
  const intent = buildCampaignIntent({
    ownerId: 'owner-1', generationId: GEN,
    goal: 'sell the programme', platform: 'instagram',
    references: [
      { referenceId: REF, requestedDimensions: [...TRANSFER_DIMENSIONS] },
      { referenceId: REF2, requestedDimensions: [...TRANSFER_DIMENSIONS] },
    ],
  })
  return {
    brandTruth, intent,
    evidence: {
      [REF]: normalizeReferenceEvidence({ referenceId: REF, analysisId: ANA, structure: structure(), transcript: transcript() }),
      [REF2]: normalizeReferenceEvidence({ referenceId: REF2, analysisId: ANA2, structure: structure(), transcript: transcript() }),
    },
  }
}

const CTX = context()
const EV1 = citableEvidence(CTX.evidence[REF]).map((i) => i.evidenceId)
const EV2 = citableEvidence(CTX.evidence[REF2]).map((i) => i.evidenceId)

/** A complete, valid plan: one decision per dimension, mechanics adapted. */
function plan(): CreativeTransferPlanV1 {
  const decisions = TRANSFER_DIMENSIONS.map((dimension: TransferDimension) => {
    if (dimension === 'hook_mechanic' || dimension === 'story_structure') {
      return {
        dimension, action: 'adapt' as const,
        primaryReferenceId: REF, secondaryReferenceId: null,
        evidenceIds: [EV1[0]], observedTraits: ['opens an unresolved loop'],
        adaptedInstruction: 'open on an unresolved question and resolve it after the proof beat',
        confidenceMilli: 750, rationaleCode: 'brand_fit' as const, constraints: [],
      }
    }
    return {
      dimension, action: 'brand_default' as const,
      primaryReferenceId: null, secondaryReferenceId: null,
      evidenceIds: [], observedTraits: [],
      adaptedInstruction: '', confidenceMilli: 400,
      rationaleCode: 'insufficient_evidence' as const, constraints: [],
    }
  })
  return {
    schemaVersion: 1, generationId: GEN,
    brandTruthSnapshotId: 'bts-1', brandTruthSha256: SHA,
    campaignIntentId: 'ci-1', campaignIntentSha256: 'b'.repeat(64),
    referenceSet: [
      { referenceId: REF, analysisId: ANA, analysisSha256: 'c'.repeat(64), requestedDimensions: [...TRANSFER_DIMENSIONS] },
      { referenceId: REF2, analysisId: ANA2, analysisSha256: 'd'.repeat(64), requestedDimensions: [...TRANSFER_DIMENSIONS] },
    ],
    decisions, conflicts: [],
    prohibitedTransfers: [...PROHIBITED_TRANSFERS],
    modelIdentity: 'gemini-x', promptVersion: 'ctp-1',
    createdAt: '2026-07-27T00:00:00.000Z', planSha256: 'e'.repeat(64),
  }
}

const dec = (p: CreativeTransferPlanV1, d: TransferDimension) =>
  p.decisions.find((x) => x.dimension === d)!

describe('the valid plan passes — otherwise every refusal below is meaningless', () => {
  it('validates', () => {
    expect(() => validateCreativeTransferPlan(plan(), CTX)).not.toThrow()
  })
  it('hashes without including its own digest', () => {
    const a = plan()
    const b = clone(a)
    b.planSha256 = 'f'.repeat(64)
    expect(canonicalTransferPlan(b)).toEqual(canonicalTransferPlan(a))
    b.modelIdentity = 'other'
    expect(canonicalTransferPlan(b)).not.toEqual(canonicalTransferPlan(a))
  })
})

describe('§6 — exactly one decision per supported dimension', () => {
  it('a missing dimension is refused', () => {
    const p = plan()
    p.decisions = p.decisions.filter((d) => d.dimension !== 'pacing')
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/pacing has no decision/)
  })
  it('a duplicated dimension is refused', () => {
    const p = plan()
    p.decisions.push(clone(dec(p, 'pacing')))
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/more than one decision/)
  })
  it('an invented dimension is refused', () => {
    const p = plan()
    ;(dec(p, 'pacing') as { dimension: string }).dimension = 'vibes'
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/unknown dimension/)
  })
  it('an invented action is refused', () => {
    const p = plan()
    ;(dec(p, 'pacing') as { action: string }).action = 'blend'
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/unknown action/)
  })
})

describe('§6 — the model cannot introduce references', () => {
  it('a reference absent from the campaign intent is refused', () => {
    const p = plan()
    p.referenceSet.push({ referenceId: 'ref-smuggled', analysisId: 'ana-x', analysisSha256: SHA, requestedDimensions: [] })
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/not in the campaign intent/)
  })
  it('a decision naming a reference outside the set is refused', () => {
    const p = plan()
    dec(p, 'hook_mechanic').primaryReferenceId = 'ref-other'
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/not in the reference set/)
  })
})

describe('§6 — one primary per dimension, and a secondary only supplements', () => {
  it('a secondary without a primary is refused as a blend', () => {
    const p = plan()
    const d = dec(p, 'pacing')
    d.secondaryReferenceId = REF2
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/blend, not a supplement/)
  })
  it('a secondary equal to the primary is refused', () => {
    const p = plan()
    dec(p, 'hook_mechanic').secondaryReferenceId = REF
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/same reference/)
  })
  it('an UNCONSTRAINED secondary is refused — that is averaging two references', () => {
    // §6: "References are never averaged or concatenated by default." A secondary
    // that names no sub-trait is a blend wearing a label.
    const p = plan()
    const d = dec(p, 'hook_mechanic')
    d.secondaryReferenceId = REF2
    d.evidenceIds = [EV1[0], EV2[0]]
    d.constraints = []
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/undeclared blend/)
  })
  it('CONTROL: a secondary that names its sub-trait is allowed', () => {
    const p = plan()
    const d = dec(p, 'hook_mechanic')
    d.secondaryReferenceId = REF2
    d.evidenceIds = [EV1[0], EV2[0]]
    d.constraints = ['secondary supplies product close-up rhythm only; it must not affect the hook line']
    expect(() => validateCreativeTransferPlan(p, CTX)).not.toThrow()
  })
})

describe('§6 — every transfer or adapt cites server-issued evidence', () => {
  it('an uncited adapt is refused', () => {
    const p = plan()
    dec(p, 'hook_mechanic').evidenceIds = []
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/must cite evidence/)
  })
  it('a FABRICATED evidence id is refused', () => {
    const p = plan()
    dec(p, 'hook_mechanic').evidenceIds = ['ev:ana-1:narrative_beat:99']
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/was not issued/)
  })
  it("evidence issued for ANOTHER reference is refused", () => {
    // Well-formed, genuinely issued — just not for a reference this decision names.
    const p = plan()
    dec(p, 'hook_mechanic').evidenceIds = [EV2[0]]
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/not issued for any reference this decision names/)
  })
  it('citing an UNKNOWN is refused — absent evidence cannot support a transfer', () => {
    const p = plan()
    const unknown = CTX.evidence[REF].items.find((i) => i.kind === 'unknown')!
    dec(p, 'hook_mechanic').evidenceIds = [unknown.evidenceId]
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/is an UNKNOWN/)
  })
  it('a brand_default that cites evidence it did not use is refused', () => {
    const p = plan()
    dec(p, 'pacing').evidenceIds = [EV1[0]]
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/must not cite evidence it did not use/)
  })
})

describe('§6 — confidence below the predefined threshold cannot transfer', () => {
  it('a low-confidence adapt is refused', () => {
    const p = plan()
    dec(p, 'hook_mechanic').confidenceMilli = CONFIDENCE_THRESHOLD_MILLI - 1
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/below the predefined threshold/)
  })
  it('CONTROL: the same low confidence is fine as brand_default', () => {
    // The rule is about what a weak signal may DO, not about the number itself.
    const p = plan()
    const d = dec(p, 'hook_mechanic')
    d.action = 'brand_default'
    d.primaryReferenceId = null
    d.evidenceIds = []
    d.adaptedInstruction = ''
    d.confidenceMilli = CONFIDENCE_THRESHOLD_MILLI - 1
    expect(() => validateCreativeTransferPlan(p, CTX)).not.toThrow()
  })
})

describe('§6 — a business fact cannot ride in an adaptedInstruction', () => {
  it('restating the product from the brand truth snapshot is refused', () => {
    // Checked against the SNAPSHOT'S ACTUAL VALUES, not a keyword list — a
    // keyword list only catches the words someone thought of in advance.
    const p = plan()
    dec(p, 'hook_mechanic').adaptedInstruction =
      'open by promising a 12-week home programme that fixes their schedule'
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/restates a business fact/)
  })
  it('an instruction about HOW to say it is allowed', () => {
    const p = plan()
    dec(p, 'hook_mechanic').adaptedInstruction =
      'state the sharpest claim first, then withhold the reason until after the proof beat'
    expect(() => validateCreativeTransferPlan(p, CTX)).not.toThrow()
  })
  it('an empty instruction on an adapt is refused', () => {
    const p = plan()
    dec(p, 'hook_mechanic').adaptedInstruction = '   '
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/needs a bounded instruction/)
  })
})

describe('§4/§6 — the prohibited list is frozen and the layer rules hold', () => {
  it('a plan that NARROWS the prohibited list is refused', () => {
    const p = plan()
    p.prohibitedTransfers = p.prohibitedTransfers.filter((x) => x !== 'pricing')
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/cannot narrow it/)
  })
  it('content strategy without an explicit request is refused', () => {
    // Same generation, but an intent built from the legacy fidelity knob.
    const legacyCtx: ValidationContext = {
      ...CTX,
      intent: buildCampaignIntent({
        ownerId: 'owner-1', generationId: GEN,
        references: [{ referenceId: REF }, { referenceId: REF2 }],
        legacy: { fidelity: 'close' },
      }),
    }
    const p = plan()
    const d = dec(p, 'topic_strategy')
    d.action = 'adapt'
    d.primaryReferenceId = REF
    d.evidenceIds = [EV1[0]]
    d.adaptedInstruction = 'follow the same topic family'
    d.confidenceMilli = 800
    expect(() => validateCreativeTransferPlan(p, legacyCtx))
      .toThrow(/content_strategy_requires_explicit_request/)
  })
})

describe('§7 Step 6 — a conflict is resolved, never blended', () => {
  it('a conflict whose recorded resolution contradicts the decision is refused', () => {
    const p = plan()
    p.conflicts = [{
      dimension: 'hook_mechanic', referenceIds: [REF, REF2],
      resolution: 'brand_default', reasonCode: 'brand_fit',
    }]
    // The decision on hook_mechanic is an `adapt`, i.e. selected_primary.
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/records resolution brand_default/)
  })
  it('CONTROL: a truthfully recorded conflict passes', () => {
    const p = plan()
    p.conflicts = [{
      dimension: 'hook_mechanic', referenceIds: [REF, REF2],
      resolution: 'selected_primary', reasonCode: 'brand_fit',
    }]
    expect(() => validateCreativeTransferPlan(p, CTX)).not.toThrow()
  })
  it('a one-sided conflict is refused', () => {
    const p = plan()
    p.conflicts = [{ dimension: 'hook_mechanic', referenceIds: [REF], resolution: 'selected_primary', reasonCode: 'x' }]
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/fewer than two references/)
  })
})

describe('lineage', () => {
  it('a plan for a different generation than the intent is refused', () => {
    const p = plan()
    p.generationId = 'other-generation'
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(/but the intent is for/)
  })
  it('a malformed digest is refused', () => {
    const p = plan()
    p.brandTruthSha256 = 'not-a-digest'
    expect(() => validateCreativeTransferPlan(p, CTX)).toThrow(TransferPlanError)
  })
  it('a reference with no normalized evidence is refused', () => {
    const p = plan()
    const ctx: ValidationContext = { ...CTX, evidence: { [REF]: CTX.evidence[REF] } }
    expect(() => validateCreativeTransferPlan(p, ctx)).toThrow(/no normalized evidence/)
  })
})

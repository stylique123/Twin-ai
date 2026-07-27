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
import { createHash } from 'node:crypto'
import {
  validateCreativeTransferPlan, canonicalTransferPlan, TransferPlanError,
  PROHIBITED_TRANSFERS, CONFIDENCE_THRESHOLD_MILLI,
  finalizeTransferPlan, LIMITS,
  type CreativeTransferPlanV1, type ValidationContext,
} from '../creativeTransferPlan.js'

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex')
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
    brandTruth, intent, sha256,
    brandTruthSnapshotId: 'bts-1', brandTruthSha256: SHA,
    campaignIntentId: 'ci-1', campaignIntentSha256: 'b'.repeat(64),
    analysisSha256: { [REF]: 'c'.repeat(64), [REF2]: 'd'.repeat(64) },
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
function draftPlan(): CreativeTransferPlanV1 {
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

/** A finalized plan: its digest is DERIVED from its own canonical bytes. */
function plan(): CreativeTransferPlanV1 {
  return finalizeTransferPlan(draftPlan(), sha256)
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

// ================== the digest must describe the plan's own bytes ==========
describe('planSha256 is DERIVED, never trusted from model output', () => {
  it('MUTATION: plan bytes changed with the hash left alone is REFUSED', () => {
    // THE defect. A model-supplied digest looked like integrity while certifying
    // nothing: mutate any field, keep the hash, and the plan validated.
    const fp = plan()
    fp.decisions.find((d) => d.dimension === 'hook_mechanic')!.adaptedInstruction = 'something else entirely'
    expect(() => validateCreativeTransferPlan(fp, CTX)).toThrow(/does not match the canonical plan bytes/)
  })

  it('MUTATION: a random but well-formed 64-hex digest is REFUSED', () => {
    const fp = plan()
    fp.planSha256 = 'f'.repeat(64)
    expect(() => validateCreativeTransferPlan(fp, CTX)).toThrow(/must be DERIVED/)
  })

  it('CONTROL: re-finalizing after an edit makes it valid again', () => {
    // Otherwise the two refusals could be passing because nothing ever matches.
    const fp = plan()
    fp.decisions.find((d) => d.dimension === 'hook_mechanic')!.adaptedInstruction = 'lead with the sharpest claim'
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(fp, sha256), CTX)).not.toThrow()
  })

  it('a context with no digest function is refused rather than skipping the check', () => {
    const noHash = { ...CTX, sha256: undefined } as unknown as ValidationContext
    expect(() => validateCreativeTransferPlan(plan(), noHash)).toThrow(/sha256 function/)
  })
})

// ================== lineage is bound to server-issued values ===============
describe('the pinned lineage must be the one the server issued', () => {
  const rehash = (p: CreativeTransferPlanV1) => finalizeTransferPlan(p, sha256)

  it('a wrong brand-truth snapshot ID is refused', () => {
    const p = clone(draftPlan()); p.brandTruthSnapshotId = 'bts-other'
    expect(() => validateCreativeTransferPlan(rehash(p), CTX)).toThrow(/but the server issued/)
  })
  it('a random but valid brand-truth digest is refused', () => {
    const p = clone(draftPlan()); p.brandTruthSha256 = '9'.repeat(64)
    expect(() => validateCreativeTransferPlan(rehash(p), CTX)).toThrow(/brand-truth digest the server did not issue/)
  })
  it('a wrong campaign-intent ID is refused', () => {
    const p = clone(draftPlan()); p.campaignIntentId = 'ci-other'
    expect(() => validateCreativeTransferPlan(rehash(p), CTX)).toThrow(/but the server issued/)
  })
  it('a random but valid campaign-intent digest is refused', () => {
    const p = clone(draftPlan()); p.campaignIntentSha256 = '8'.repeat(64)
    expect(() => validateCreativeTransferPlan(rehash(p), CTX)).toThrow(/campaign-intent digest the server did not issue/)
  })
})

// ================== the reference set is bound to evidence + intent ========
describe('referenceSet is bound to server-issued evidence and intent', () => {
  const rehash = (p: CreativeTransferPlanV1) => finalizeTransferPlan(p, sha256)

  it('a wrong analysisId is refused', () => {
    const p = clone(draftPlan()); p.referenceSet[0].analysisId = 'ana-forged'
    expect(() => validateCreativeTransferPlan(rehash(p), CTX)).toThrow(/but the server issued evidence for/)
  })
  it('a wrong analysisSha256 is refused', () => {
    const p = clone(draftPlan()); p.referenceSet[0].analysisSha256 = '7'.repeat(64)
    expect(() => validateCreativeTransferPlan(rehash(p), CTX)).toThrow(/which the server did not issue/)
  })
  it('an unpinned reference digest is refused', () => {
    const ctx = { ...CTX, analysisSha256: { [REF2]: 'd'.repeat(64) } }
    expect(() => validateCreativeTransferPlan(plan(), ctx)).toThrow(/pinned no analysis digest/)
  })
  it('a requested scope the intent does not contain is refused', () => {
    const p = clone(draftPlan()); p.referenceSet[0].requestedDimensions = ['topic_strategy']
    expect(() => validateCreativeTransferPlan(rehash(p), CTX)).toThrow(/campaign intent does not contain/)
  })
  it('CROSS-OWNER: a fabricated evidence set in the context is refused', () => {
    // The context is server-supplied, but a fabricated set must not pass through
    // it either — the evidence is re-validated, so forged ids fail derivation.
    const forged = clone(CTX.evidence[REF])
    for (const i of forged.items) i.evidenceId = `ev:${forged.analysisId}:${i.type}:99`
    const ctx = { ...CTX, evidence: { ...CTX.evidence, [REF]: forged } }
    expect(() => validateCreativeTransferPlan(plan(), ctx)).toThrow(/was not issued by the server/)
  })
})

// ================== the runtime shape is closed ============================
describe('model output cannot smuggle unreviewed fields or unbounded payloads', () => {
  const rehash = (p: CreativeTransferPlanV1) => finalizeTransferPlan(p, sha256)

  for (const key of ['override', 'rawReferences', 'topic', 'script']) {
    it(`a hidden \`${key}\` key on the plan is REFUSED`, () => {
      const p = clone(draftPlan()) as unknown as Record<string, unknown>
      p[key] = 'anything'
      expect(() => validateCreativeTransferPlan(rehash(p as unknown as CreativeTransferPlanV1), CTX))
        .toThrow(/unknown key/)
    })
  }
  it('a hidden key on a DECISION is refused', () => {
    const p = clone(draftPlan())
    ;(p.decisions[0] as unknown as Record<string, unknown>).override = true
    expect(() => validateCreativeTransferPlan(rehash(p), CTX)).toThrow(/unknown key/)
  })
  it('a hidden key on a referenceSet entry is refused', () => {
    const p = clone(draftPlan())
    ;(p.referenceSet[0] as unknown as Record<string, unknown>).rawAnalysis = {}
    expect(() => validateCreativeTransferPlan(rehash(p), CTX)).toThrow(/unknown key/)
  })

  it('an oversized adaptedInstruction is refused', () => {
    const p = clone(draftPlan())
    p.decisions.find((d) => d.dimension === 'hook_mechanic')!.adaptedInstruction = 'x'.repeat(LIMITS.instruction + 1)
    expect(() => validateCreativeTransferPlan(rehash(p), CTX)).toThrow(/over the .* cap/)
  })
  it('a multi-byte payload cannot slip the cap (bytes, not characters)', () => {
    const p = clone(draftPlan())
    p.decisions.find((d) => d.dimension === 'hook_mechanic')!.adaptedInstruction = '\u00e9'.repeat(LIMITS.instruction - 10)
    expect(() => validateCreativeTransferPlan(rehash(p), CTX)).toThrow(/bytes, over the/)
  })
  it('too many observedTraits are refused', () => {
    const p = clone(draftPlan())
    p.decisions[0].observedTraits = Array.from({ length: LIMITS.traitsPerDecision + 1 }, () => 't')
    expect(() => validateCreativeTransferPlan(rehash(p), CTX)).toThrow(/at most/)
  })
  it('too many constraints are refused', () => {
    const p = clone(draftPlan())
    p.decisions[0].constraints = Array.from({ length: LIMITS.constraintsPerDecision + 1 }, () => 'c')
    expect(() => validateCreativeTransferPlan(rehash(p), CTX)).toThrow(/at most/)
  })
  it('too many conflicts are refused', () => {
    const p = clone(draftPlan())
    p.conflicts = Array.from({ length: LIMITS.conflicts + 1 }, () => ({
      dimension: 'hook_mechanic' as const, referenceIds: [REF, REF2],
      resolution: 'selected_primary' as const, reasonCode: 'x',
    }))
    expect(() => validateCreativeTransferPlan(rehash(p), CTX)).toThrow(/at most/)
  })

  it('a non-ISO createdAt is refused', () => {
    for (const bad of ['yesterday', '2026-07-27', '2026-07-27T00:00:00', '']) {
      const p = clone(draftPlan()); p.createdAt = bad
      expect(() => validateCreativeTransferPlan(rehash(p), CTX), bad).toThrow(/ISO-8601/)
    }
  })
  it('a hostile modelIdentity or promptVersion is refused', () => {
    for (const field of ['modelIdentity', 'promptVersion'] as const) {
      const p = clone(draftPlan()); (p as Record<string, unknown>)[field] = 'a b; rm -rf /'
      expect(() => validateCreativeTransferPlan(rehash(p), CTX), field).toThrow(/plain identifier/)
      const q = clone(draftPlan()); (q as Record<string, unknown>)[field] = 'x'.repeat(LIMITS.identity + 1)
      expect(() => validateCreativeTransferPlan(rehash(q), CTX), field).toThrow(/over the/)
    }
  })
})

describe('§6 — exactly one decision per supported dimension', () => {
  it('a missing dimension is refused', () => {
    const p = draftPlan()
    p.decisions = p.decisions.filter((d) => d.dimension !== 'pacing')
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/pacing has no decision/)
  })
  it('a duplicated dimension is refused', () => {
    const p = draftPlan()
    p.decisions.push(clone(dec(p, 'pacing')))
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/more than one decision/)
  })
  it('an invented dimension is refused', () => {
    const p = draftPlan()
    ;(dec(p, 'pacing') as { dimension: string }).dimension = 'vibes'
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/unknown dimension/)
  })
  it('an invented action is refused', () => {
    const p = draftPlan()
    ;(dec(p, 'pacing') as { action: string }).action = 'blend'
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/unknown action/)
  })
})

describe('§6 — the model cannot introduce references', () => {
  it('a reference absent from the campaign intent is refused', () => {
    const p = draftPlan()
    p.referenceSet.push({ referenceId: 'ref-smuggled', analysisId: 'ana-x', analysisSha256: SHA, requestedDimensions: [] })
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/not in the campaign intent/)
  })
  it('a decision naming a reference outside the set is refused', () => {
    const p = draftPlan()
    dec(p, 'hook_mechanic').primaryReferenceId = 'ref-other'
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/not in the reference set/)
  })
})

describe('§6 — one primary per dimension, and a secondary only supplements', () => {
  it('a secondary without a primary is refused as a blend', () => {
    const p = draftPlan()
    const d = dec(p, 'pacing')
    d.secondaryReferenceId = REF2
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/blend, not a supplement/)
  })
  it('a secondary equal to the primary is refused', () => {
    const p = draftPlan()
    dec(p, 'hook_mechanic').secondaryReferenceId = REF
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/same reference/)
  })
  it('an UNCONSTRAINED secondary is refused — that is averaging two references', () => {
    // §6: "References are never averaged or concatenated by default." A secondary
    // that names no sub-trait is a blend wearing a label.
    const p = draftPlan()
    const d = dec(p, 'hook_mechanic')
    d.secondaryReferenceId = REF2
    d.evidenceIds = [EV1[0], EV2[0]]
    d.constraints = []
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/undeclared blend/)
  })
  it('CONTROL: a secondary that names its sub-trait is allowed', () => {
    const p = draftPlan()
    const d = dec(p, 'hook_mechanic')
    d.secondaryReferenceId = REF2
    d.evidenceIds = [EV1[0], EV2[0]]
    d.constraints = ['secondary supplies product close-up rhythm only; it must not affect the hook line']
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).not.toThrow()
  })
})

describe('§6 — every transfer or adapt cites server-issued evidence', () => {
  it('an uncited adapt is refused', () => {
    const p = draftPlan()
    dec(p, 'hook_mechanic').evidenceIds = []
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/must cite evidence/)
  })
  it('a FABRICATED evidence id is refused', () => {
    const p = draftPlan()
    dec(p, 'hook_mechanic').evidenceIds = ['ev:ana-1:narrative_beat:99']
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/was not issued/)
  })
  it("evidence issued for ANOTHER reference is refused", () => {
    // Well-formed, genuinely issued — just not for a reference this decision names.
    const p = draftPlan()
    dec(p, 'hook_mechanic').evidenceIds = [EV2[0]]
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/not issued for any reference this decision names/)
  })
  it('citing an UNKNOWN is refused — absent evidence cannot support a transfer', () => {
    const p = draftPlan()
    const unknown = CTX.evidence[REF].items.find((i) => i.kind === 'unknown')!
    dec(p, 'hook_mechanic').evidenceIds = [unknown.evidenceId]
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/is an UNKNOWN/)
  })
  it('a brand_default that cites evidence it did not use is refused', () => {
    const p = draftPlan()
    dec(p, 'pacing').evidenceIds = [EV1[0]]
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/must not cite evidence it did not use/)
  })
})

describe('§6 — confidence below the predefined threshold cannot transfer', () => {
  it('a low-confidence adapt is refused', () => {
    const p = draftPlan()
    dec(p, 'hook_mechanic').confidenceMilli = CONFIDENCE_THRESHOLD_MILLI - 1
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/below the predefined threshold/)
  })
  it('CONTROL: the same low confidence is fine as brand_default', () => {
    // The rule is about what a weak signal may DO, not about the number itself.
    const p = draftPlan()
    const d = dec(p, 'hook_mechanic')
    d.action = 'brand_default'
    d.primaryReferenceId = null
    d.evidenceIds = []
    d.adaptedInstruction = ''
    d.confidenceMilli = CONFIDENCE_THRESHOLD_MILLI - 1
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).not.toThrow()
  })
})

describe('§6 — a business fact cannot ride in an adaptedInstruction', () => {
  it('restating the product from the brand truth snapshot is refused', () => {
    // Checked against the SNAPSHOT'S ACTUAL VALUES, not a keyword list — a
    // keyword list only catches the words someone thought of in advance.
    const p = draftPlan()
    dec(p, 'hook_mechanic').adaptedInstruction =
      'open by promising a 12-week home programme that fixes their schedule'
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/restates a business fact/)
  })
  it('an instruction about HOW to say it is allowed', () => {
    const p = draftPlan()
    dec(p, 'hook_mechanic').adaptedInstruction =
      'state the sharpest claim first, then withhold the reason until after the proof beat'
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).not.toThrow()
  })
  it('an empty instruction on an adapt is refused', () => {
    const p = draftPlan()
    dec(p, 'hook_mechanic').adaptedInstruction = '   '
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/needs a bounded instruction/)
  })
})

describe('§4/§6 — the prohibited list is frozen and the layer rules hold', () => {
  it('a plan that NARROWS the prohibited list is refused', () => {
    const p = draftPlan()
    p.prohibitedTransfers = p.prohibitedTransfers.filter((x) => x !== 'pricing')
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/cannot narrow it/)
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
    const p = draftPlan()
    // The legacy intent requests NO dimensions, so the plan's reference set must
    // declare none either — otherwise the scope-binding check fires first and
    // this case stops isolating eligibility.
    for (const r of p.referenceSet) r.requestedDimensions = []
    const d = dec(p, 'topic_strategy')
    d.action = 'adapt'
    d.primaryReferenceId = REF
    d.evidenceIds = [EV1[0]]
    d.adaptedInstruction = 'follow the same topic family'
    d.confidenceMilli = 800
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), legacyCtx))
      .toThrow(/content_strategy_requires_explicit_request/)
  })
})

describe('§7 Step 6 — a conflict is resolved, never blended', () => {
  it('a conflict whose recorded resolution contradicts the decision is refused', () => {
    const p = draftPlan()
    p.conflicts = [{
      dimension: 'hook_mechanic', referenceIds: [REF, REF2],
      resolution: 'brand_default', reasonCode: 'brand_fit',
    }]
    // The decision on hook_mechanic is an `adapt`, i.e. selected_primary.
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/records resolution brand_default/)
  })
  it('CONTROL: a truthfully recorded conflict passes', () => {
    const p = draftPlan()
    p.conflicts = [{
      dimension: 'hook_mechanic', referenceIds: [REF, REF2],
      resolution: 'selected_primary', reasonCode: 'brand_fit',
    }]
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).not.toThrow()
  })
  it('a one-sided conflict is refused', () => {
    const p = draftPlan()
    p.conflicts = [{ dimension: 'hook_mechanic', referenceIds: [REF], resolution: 'selected_primary', reasonCode: 'x' }]
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/fewer than two references/)
  })
})

describe('lineage', () => {
  it('a plan for a different generation than the intent is refused', () => {
    const p = draftPlan()
    p.generationId = 'other-generation'
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(/but the intent is for/)
  })
  it('a malformed digest is refused', () => {
    const p = draftPlan()
    p.brandTruthSha256 = 'not-a-digest'
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), CTX)).toThrow(TransferPlanError)
  })
  it('a reference with no normalized evidence is refused', () => {
    const p = draftPlan()
    const ctx: ValidationContext = { ...CTX, evidence: { [REF]: CTX.evidence[REF] } }
    expect(() => validateCreativeTransferPlan(finalizeTransferPlan(p, sha256), ctx)).toThrow(/no normalized evidence/)
  })
})

// THREE OF THE EIGHT OBJECTIVE QUESTIONS ARE UNGRAMMATICAL FOR A SERVICE.
//
// ⚠️ "What is new about IT" · "how IT WORKS" · "made you BUILD IT". A coach has
// no it, nothing that works the way an object does, and nothing they built. A
// creator reading a question that does not fit her business answers the wrong
// thing or nothing at all.
//
// ⚖️ THE OWNER ASKED FOR THREE BUCKETS — service, physical, digital — AND THE
// WORDING ONLY CASHES TWO. Tested below: a physical product and a digital one
// take the SAME sentence in all three cases. The third bucket is deliberately
// not built, because a distinction the copy cannot express is how a bucket that
// does not fit gets force-fitted.
//
// ⚠️ KEYED ON THE ENTITY TYPE, WHICH IS 100% POPULATED. Measured 2026-09-14: all
// 22 live product_entities rows carry a type across 20 owners, while
// pre_script_brief.workKind is filled on 19 of 56 voices (34%) — a harder cap
// than the 30-of-47 hand-written table the owner's ruling rejects.
import { describe, expect, it } from 'vitest'
import { VIDEO_GOALS, type VideoGoal } from '../videoIntent'
import { ENTITY_TYPES } from '../productEntity'
import {
  OBJECTIVE_QUESTIONS, objectiveQuestion, offerFormOf,
} from '../productObjectiveQuestion'

const PERFORMED = ENTITY_TYPES.filter((t) => offerFormOf(t) === 'performed')
const ARTEFACT = ENTITY_TYPES.filter((t) => offerFormOf(t) === 'artefact')

describe('every objective still asks its own question', () => {
  it('all eight are wired — not ten, because only eight exist', () => {
    // ⚠️ THE OWNER'S OWN CORRECTION: "Compare it" and "Handle an objection" do
    // not exist. Ten of ten would be counting objectives the product does not
    // have; the real set is eight and all eight carry a question.
    expect(VIDEO_GOALS).toHaveLength(8)
    const missing = VIDEO_GOALS.filter((g) => !OBJECTIVE_QUESTIONS[g])
    expect(missing).toEqual([])
  })
})

describe('a service gets a sentence it can answer', () => {
  it('rewords exactly the three that break, and only those', () => {
    const varied = VIDEO_GOALS.filter((g) => OBJECTIVE_QUESTIONS[g]?.whenPerformed)
    expect([...varied].sort()).toEqual(['educate', 'personal_brand', 'sell'])
  })

  it('never hands a service an "it" that does not exist', () => {
    for (const g of VIDEO_GOALS) {
      const q = objectiveQuestion(g, 'performed')
      expect(q, g).toBeTruthy()
      // The three broken phrasings must not survive into the performed variant.
      expect(q, g).not.toMatch(/\bnew about it\b/)
      expect(q, g).not.toMatch(/\bhow it works\b/)
      expect(q, g).not.toMatch(/\bbuild it\b/)
    }
  })

  it('keeps the owner\'s verbatim wording for an artefact', () => {
    for (const g of VIDEO_GOALS) {
      expect(objectiveQuestion(g, 'artefact'), g).toBe(OBJECTIVE_QUESTIONS[g]!.question)
    }
  })

  it('a physical and a digital product take the SAME sentence, which is why there is no third bucket', () => {
    // ⚠️ THIS IS THE ASSERTION THAT JUSTIFIES COLLAPSING THE OWNER'S THREE INTO
    // TWO. If a phrasing is ever found that separates them, this fails and the
    // union is where the third form goes.
    for (const g of VIDEO_GOALS) {
      expect(objectiveQuestion(g, offerFormOf('PHYSICAL_PRODUCT')), g)
        .toBe(objectiveQuestion(g, offerFormOf('DIGITAL_PRODUCT')))
    }
  })
})

describe('the form is read off the entity, never guessed', () => {
  it('calls a service and a community performed work', () => {
    expect([...PERFORMED].sort()).toEqual(['COMMUNITY', 'SERVICE'])
  })

  it('calls every other nameable type an artefact', () => {
    expect([...ARTEFACT].sort()).toEqual(
      ['APP', 'COURSE', 'DIGITAL_PRODUCT', 'MARKETPLACE', 'PHYSICAL_PRODUCT', 'SAAS'],
    )
  })

  it('returns null for OTHER, which exists so the enum never forces a guess', () => {
    // ⚠️ `productEntity.ts` says OTHER exists "so the enum never forces a
    // misclassification" and that a WRONG kind is worse than an unspecific one.
    // Coercing it to a form here would undo that on the creator-facing surface.
    expect(offerFormOf('OTHER')).toBeNull()
    expect(offerFormOf(null)).toBeNull()
    expect(offerFormOf(undefined)).toBeNull()
    expect(offerFormOf('')).toBeNull()
    expect(offerFormOf('NOT_A_TYPE')).toBeNull()
  })

  // ⚠️ TWO NAMED EXEMPTIONS, AND BOTH ARE THE SAME DECISION. `OTHER` exists so
  // the enum never forces a misclassification. `BUSINESS`, added 2026-09-22, is
  // not an offer form at all — it is the thing that HAS one, and which one
  // depends on the business: a bakery's is an artefact, a consultancy's is
  // performed. Coercing either would word the question wrongly for half the
  // creators it reaches, which is what this file's subject already argues.
  //
  // ⚖️ EXEMPTED BY NAME RATHER THAN BY WEAKENING THE RULE, so a type added
  // tomorrow with no mapping and no argument still fails here.
  it('covers every value of ENTITY_TYPES, so a new type cannot be silently unmapped', () => {
    const noFormByDesign = ['OTHER', 'BUSINESS']
    const unmapped = ENTITY_TYPES
      .filter((t) => !noFormByDesign.includes(t) && offerFormOf(t) === null)
    expect(unmapped).toEqual([])
  })

  it('gives BUSINESS the default wording rather than guessing its offer form', () => {
    expect(offerFormOf('BUSINESS')).toBeNull()
  })

  it('reads the type case- and space-insensitively, since it comes from a row', () => {
    expect(offerFormOf(' service ')).toBe('performed')
    expect(offerFormOf('Physical_Product')).toBe('artefact')
  })

  it('falls back to the owner\'s wording when the form is unknown', () => {
    for (const g of VIDEO_GOALS) {
      expect(objectiveQuestion(g, null), g).toBe(OBJECTIVE_QUESTIONS[g]!.question)
      expect(objectiveQuestion(g), g).toBe(OBJECTIVE_QUESTIONS[g]!.question)
    }
  })

  it('still returns null for a goal that is not an objective', () => {
    expect(objectiveQuestion('', 'performed')).toBeNull()
    expect(objectiveQuestion(null, 'performed')).toBeNull()
    expect(objectiveQuestion('not_a_goal', 'performed')).toBeNull()
  })
})

describe('the question reaches a creator', () => {
  it('readiness passes the entity type into the objective question', async () => {
    // Reader-removal: drop `offerEntityType` from the readiness call and a
    // service goes back to being asked what is new about an it it does not have.
    const { readFileSync } = await import('node:fs')
    const { dirname, join } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
    const readiness = readFileSync(join(repo, 'packages/shared/src/generationReadiness.ts'), 'utf8')
    expect(readiness).toContain('objectiveQuestion(input.objective, offerFormOf(input.offerEntityType))')

    const building = readFileSync(join(repo, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')
    // Code line only — the file names this field in prose above the call.
    const codeLines = building.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    expect(codeLines.some((l) => /offerEntityType:\s*chosen\?\.type/.test(l))).toBe(true)
  })
})

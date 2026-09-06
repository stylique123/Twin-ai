// A CLOSED SET, PROVEN BY READING THE PAYLOAD BACK.
//
// ⚠️ WITHOUT A CONTRACT, EVERY FIELD SOMEBODY ADDS TO THE PROFILE becomes another
// paragraph in a prompt nobody is measuring — and a model given ninety-four
// fields does not weigh them, it picks. So the exclusion is structural, and this
// file is what makes it enforceable rather than aspirational.
import { describe, expect, it } from 'vitest'
import {
  buildWriterInput, audienceRules, mayStateAsFact, CONTENT_CLASSES,
} from '../writerInput'
import { blankPlan } from '../creativeDecisionPlan'
import { compileStyle } from '../styleCompiler'
import { templateFor } from '../containerTemplates'
import type { TemplateResolution } from '../knowledgeResolver'

const STYLE = compileStyle(['I stopped paying for three tools last month.', 'Here is what I use now.'])
const TEMPLATE = templateFor('recommendation')!

const resolution = (label: string, source: TemplateResolution['source']): TemplateResolution => {
  const entityId = source === 'product_dna' ? 'e1' : null
  return {
    container: { id: label, about: `what ${label} is for`, needs: 'coverage' },
    source, evidence: [], fallback: null, label, entityId,
    // ⚠️ OMITTED ENTIRELY UNTIL NOW, AND `provenance` IS REQUIRED. Every
    //  resolution production builds carries "how this slot came to be decided";
    //  this fixture carried `undefined`, so any reader of it was being handed a
    //  shape the resolver never produces. Derived from the two fields already
    //  set rather than invented: a slot filled from an entity was decided by
    //  entity_assignment and names that entity, an unresolved slot names
    //  nothing, and everything else came up the evidence ladder.
    provenance: source === 'unresolved'
      ? { by: 'unresolved', from: [] }
      : entityId !== null
        ? { by: 'entity_assignment', from: [entityId] }
        : { by: 'evidence_ladder', from: [] },
  }
}

const allFilled = (labels: string[]) =>
  new Map(labels.map((l) => [l, { text: `content for ${l}`, attribution: 'Product Library' }]))

const readyArgs = () => {
  const labels = TEMPLATE.beats.filter((b) => b.needs !== null).map((b) => b.label)
  return {
    style: STYLE,
    plan: blankPlan('educate'),
    segment: null,
    template: TEMPLATE,
    resolutions: labels.map((l) => resolution(l, 'product_dna')),
    filled: allFilled(labels),
  }
}

describe('the writer is never called on an unresolved container', () => {
  it('refuses when one slot is still owed something', () => {
    // ⚠️ A WRITER HANDED FOUR OF FIVE HOLES FILLS THE FIFTH. That is what a model
    // does, and the result is a confident sentence about something nobody
    // supplied — the founding defect, produced by an ordering mistake.
    const a = readyArgs()
    const short = new Map(a.filled)
    short.delete([...short.keys()][0])
    expect(buildWriterInput({ ...a, filled: short })).toBeNull()
  })

  it('and when a slot resolved to "ask the creator"', () => {
    const a = readyArgs()
    const rs = [...a.resolutions]
    rs[0] = resolution(rs[0].label, 'needs_user')
    expect(buildWriterInput({ ...a, resolutions: rs })).toBeNull()
  })

  it('but assembles once every hole is filled', () => {
    expect(buildWriterInput(readyArgs())).not.toBeNull()
  })
})

describe('five things, and the account is not one of them', () => {
  it('the payload has exactly the five top-level keys', () => {
    const w = buildWriterInput(readyArgs())!
    expect(Object.keys(w).sort()).toEqual(
      ['audience', 'content', 'creatorStyle', 'decisionPlan', 'referenceStructure'])
  })

  it('and carries no raw onboarding, DNA blob or library dump', () => {
    // ⚖️ READ BACK OFF THE SERIALISED PAYLOAD, because that is what actually
    // reaches the model — a type can be narrowed and still be handed extra keys
    // at runtime by a caller that spreads an object.
    const json = JSON.stringify(buildWriterInput(readyArgs()))
    for (const forbidden of [
      'pre_script_brief', 'onboarding', 'creatorDna', 'brandKit', 'palette',
      'commercialTies', 'rawValue', 'voiceSample',
    ]) {
      expect(json, forbidden).not.toContain(forbidden)
    }
  })
})

describe('an opinion may never be stated as a fact', () => {
  it('classifies every slot, and only three classes are stateable', () => {
    // ⚠️ THE WRITER CANNOT OBEY THE RULE WITHOUT BEING TOLD WHICH IS WHICH.
    // "Costs $29" and "is easier than editing manually" are both true things to
    // hand a model; only one of them may be said flatly.
    const stateable = CONTENT_CLASSES.filter(mayStateAsFact)
    expect([...stateable]).toEqual(['verified_fact', 'user_confirmed', 'researched_fact'])
    expect(mayStateAsFact('creator_opinion')).toBe(false)
    expect(mayStateAsFact('safe_inference')).toBe(false)
  })

  it('a product-library slot is user-confirmed, and creator knowledge is opinion', () => {
    const a = readyArgs()
    const rs = [...a.resolutions]
    rs[1] = resolution(rs[1].label, 'creator_knowledge')
    const w = buildWriterInput({ ...a, resolutions: rs })!
    expect(w.content[0].classification).toBe('user_confirmed')
    expect(w.content[1].classification).toBe('creator_opinion')
  })

  it('and every slot names where its content came from', () => {
    const w = buildWriterInput(readyArgs())!
    // ⚖️ SO A VALIDATOR CHECKS A CLAIM AGAINST THE SAME SOURCE THE WRITER SAW,
    // rather than against the model's memory.
    for (const s of w.content) expect(s.attribution).toBe('Product Library')
  })
})

describe('audience level changes wording, not a label in a prompt', () => {
  it('an expert is told to skip the introduction', () => {
    expect(audienceRules('expert').join(' ')).toMatch(/[Ss]kip introductory/)
    expect(audienceRules('expert').join(' ')).not.toMatch(/[Ee]xplain any term/)
  })

  it('a beginner is told to explain terms and give examples', () => {
    expect(audienceRules('beginner').join(' ')).toMatch(/Explain any term/)
  })

  it('and an unasked creator gets the mixed room, not a guess at one end', () => {
    // ⚠️ NULL IS NOT "BEGINNER". Defaulting an unasked question to the safest
    // extreme still answers it on the creator's behalf.
    const mixed = audienceRules(null)
    expect(mixed.join(' ')).toMatch(/without slowing down somebody who knows/)
    expect(mixed).not.toEqual(audienceRules('beginner'))
    expect(mixed).not.toEqual(audienceRules('expert'))
  })

  it('and the rules travel with the payload rather than being re-derived', () => {
    const a = readyArgs()
    const w = buildWriterInput({ ...a, plan: { ...a.plan, audienceLevel: 'expert' } })!
    expect(w.audience.level).toBe('expert')
    expect(w.audience.rules).toEqual(audienceRules('expert'))
  })
})

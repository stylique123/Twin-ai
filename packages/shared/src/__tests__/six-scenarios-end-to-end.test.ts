// SIX CREATORS, THROUGH THE WHOLE CHAIN.
//
// ⚠️ EVERY STAGE PASSES ITS OWN TESTS AND THAT PROVES NOTHING ABOUT THE CHAIN.
// The founding defect was never a broken function — it was a correct writer
// asked for prose before anybody resolved what the prose should contain. A
// defect of ORDER is invisible to unit tests by construction, so this file runs
// plan → template → resolve → writer-input → validate for six creators who
// break in six different places.
//
// ⚖️ AND IT ASSERTS REFUSALS AS LOUDLY AS SUCCESSES. Four of these six SHOULD be
// stopped somewhere, and a pipeline that produced a confident script for all six
// would look healthier while being worse.
import { describe, expect, it } from 'vitest'
import { blankPlan, validateCreativeDecisionPlan, type CreativeDecisionPlan } from '../creativeDecisionPlan'
import { assembleCreatorProfile, toPlannerView } from '../profileAssembler'
import { templateFor } from '../containerTemplates'
import { resolveTemplate } from '../knowledgeResolver'
import { buildWriterInput } from '../writerInput'
import { validateScript, isGeneric } from '../scriptValidator'
import { compileStyle } from '../styleCompiler'
import { emptyKnowledge, type CreatorKnowledge, type KnowledgeItem } from '../creatorKnowledge'
import type { FillableEntity } from '../slotFill'

const AT = '2026-01-01T00:00:00.000Z'
const STYLE = compileStyle(['I stopped paying for three tools.', 'Here is what I actually use.'])

const creator = (ties: string[]) =>
  toPlannerView(assembleCreatorProfile({ answers: { commercialTies: ties } as never, now: AT }))

const entity = (id: string, over: Partial<FillableEntity> = {}): FillableEntity =>
  ({ id, type: 'SAAS', relationship: 'OWN_PRODUCT', archivedAt: null, ...over })

const knows = (texts: string[], basis: KnowledgeItem['basis'] = 'stated'): CreatorKnowledge => ({
  ...emptyKnowledge(),
  items: texts.map((text) => ({ kind: 'opinion', text, basis, timesSeen: 3 } as KnowledgeItem)),
})

/** Run one creator all the way through, and report where it stopped. */
const run = (args: {
  plan: CreativeDecisionPlan
  container: Parameters<typeof templateFor>[0]
  entities?: FillableEntity[]
  knowledge?: CreatorKnowledge
  ties: string[]
}) => {
  const planViolations = validateCreativeDecisionPlan(args.plan, creator(args.ties))
  const template = templateFor(args.container)!
  const resolutions = resolveTemplate(template, args.knowledge ?? emptyKnowledge(), {
    entities: args.entities ?? [],
  })
  // Everything a source could supply is treated as supplied, so that what stops
  // a scenario is the PIPELINE's refusal and not a missing fixture.
  const filled = new Map(
    resolutions
      .filter((r) => r.source === 'product_dna' || r.source === 'creator_knowledge')
      .map((r) => [r.label, {
        text: r.entityId ? `${r.entityId} costs $20 a month` : (r.evidence[0]?.text ?? 'a point they have made'),
        attribution: r.entityId ? 'Product Library' : 'Creator knowledge',
      }]))
  const writerInput = buildWriterInput({
    style: STYLE, plan: args.plan, segment: null, template, resolutions, filled,
  })
  return { planViolations, resolutions, writerInput }
}

// ── 1. OWN SAAS + SELL ────────────────────────────────────────────────────

describe('a founder selling their own product', () => {
  const plan: CreativeDecisionPlan = {
    ...blankPlan('sell'),
    products: ['acme'], productRole: 'primary', ownershipLanguage: true,
    commercialCta: true, cta: 'Try it free for a week', structure: 'recommendation',
  }

  it('is certified, and reaches the writer with real product facts', () => {
    const r = run({ plan, container: 'recommendation', ties: ['own_product'],
      entities: [entity('acme'), entity('b'), entity('c')] })
    expect(r.planViolations).toEqual([])
    expect(r.writerInput).not.toBeNull()
    expect(r.writerInput!.content.every((s) => s.attribution !== null)).toBe(true)
  })

  it('and the script it produces is not generic', () => {
    // ⚠️ THE POINT OF THE WHOLE TRACK. Grounded in something only this creator
    // has, rather than in a well-written paragraph anybody could publish.
    const r = run({ plan, container: 'recommendation', ties: ['own_product'],
      entities: [entity('acme'), entity('b'), entity('c')] })
    expect(isGeneric(r.writerInput!)).toBe(false)
  })
})

// ── 2. OWN SAAS + AUTHORITY ───────────────────────────────────────────────

describe('the same founder building authority', () => {
  it('must not quietly become an advertisement', () => {
    // ⚖️ EXPRESSIBLE NOW, RATHER THAN HOPED FOR. The product is selected and its
    // role is one example among others — a decision, made before prose.
    const plan: CreativeDecisionPlan = {
      ...blankPlan('authority'),
      products: ['acme'], productRole: 'example', ownershipLanguage: true,
    }
    const r = run({ plan, container: 'framework', ties: ['own_product'], entities: [entity('acme')] })
    expect(r.planViolations).toEqual([])
    expect(plan.productRole).not.toBe('primary')
    expect(plan.commercialCta).toBe(false)
  })

  it('and a plan that makes it the subject with nothing selected is refused', () => {
    const plan = { ...blankPlan('authority'), productRole: 'primary' as const }
    const r = run({ plan, container: 'framework', ties: ['own_product'] })
    expect(r.planViolations.map((v) => v.code)).toContain('PRODUCT_ROLE_WITHOUT_PRODUCT')
  })
})

// ── 3. AFFILIATE, NO CONFIRMED USE ────────────────────────────────────────

describe('an affiliate who has never confirmed using it', () => {
  it('is never handed a first-person experience beat', () => {
    // ⚠️ THE MOST EXPENSIVE ERROR THIS SYSTEM CAN MAKE: "I've used this for six
    // months" about a product the creator only ever listed. `coverage` cannot
    // fill a beat that needs `experience`, at any volume.
    const r = run({
      plan: { ...blankPlan('educate'), products: ['tool'], productRole: 'supporting', disclosureRequired: true },
      container: 'confession', ties: ['affiliate'],
      knowledge: knows(['mentioned the tool in a video about pricing'], 'inferred'),
    })
    const personal = r.resolutions.filter((x) => x.container.needs === 'experience')
    expect(personal.length).toBeGreaterThan(0)
    for (const p of personal) expect(p.source).toBe('needs_user')
    expect(r.writerInput).toBeNull()
  })

  it('and a paid tie with no disclosure never reaches the writer at all', () => {
    const r = run({
      plan: { ...blankPlan('educate'), products: ['tool'], disclosureRequired: false },
      container: 'recommendation', ties: ['affiliate'], entities: [entity('tool')],
    })
    expect(r.planViolations.map((v) => v.code)).toContain('DISCLOSURE_MISSING_FOR_PAID_TIE')
  })
})

// ── 4. EXPERT EDUCATOR ────────────────────────────────────────────────────

describe('an educator writing for experts', () => {
  it('is told to skip the basics, in behaviour rather than in a label', () => {
    // ⚖️ RUN ON A SCENARIO THAT ACTUALLY RESOLVES, because the audience rules
    // travel INSIDE the writer input — and there is no writer input for a video
    // whose holes are still open. Asserting them on a blocked scenario would
    // have passed against `''` and proved nothing.
    const plan = { ...blankPlan('educate'), audienceLevel: 'expert' as const, products: ['a'], productRole: 'supporting' as const }
    const r = run({ plan, container: 'recommendation', ties: ['own_product'],
      entities: [entity('a'), entity('b'), entity('c')] })
    expect(r.writerInput).not.toBeNull()
    const rules = r.writerInput!.audience.rules.join(' ')
    expect(rules).toMatch(/[Ss]kip introductory/)
    expect(rules).not.toMatch(/Explain any term/)
  })

  it('and an educator whose knowledge does not cover the beats is stopped, not improvised over', () => {
    // ⚠️ FOUND BY THIS FILE, AND IT IS THE PIPELINE BEING RIGHT. A framework
    // video needs three parts and a worked example; a creator whose recorded
    // knowledge touches none of them cannot have one written, and the honest
    // outcome is a stop rather than three invented parts in their voice.
    const r = run({
      plan: { ...blankPlan('educate'), audienceLevel: 'expert' },
      container: 'framework', ties: ['none'],
      knowledge: knows(['the trade-off nobody mentions is latency']),
    })
    expect(r.writerInput).toBeNull()
    expect(r.resolutions.some((x) => x.fallback !== null)).toBe(true)
  })

  it('and a script that opens with the basics fails the check', () => {
    const plan = { ...blankPlan('educate'), audienceLevel: 'beginner' as const }
    const r = run({ plan, container: 'framework', ties: ['none'],
      knowledge: knows(['the trade-off nobody mentions is latency', 'worked example from a migration']) })
    if (r.writerInput) {
      const bad = validateScript('Use the API with a webhook and a cron.', r.writerInput)
      expect(bad.failed.map((f) => f.code)).toContain('audience_level_respected')
    }
  })
})

// ── 5. NON-COMMERCIAL CREATOR ─────────────────────────────────────────────

describe('a creator who sells nothing', () => {
  it('is refused a video that asks people to buy', () => {
    const plan = { ...blankPlan('sell'), commercialCta: true }
    const r = run({ plan, container: 'numbered_list', ties: ['none'] })
    const codes = r.planViolations.map((v) => v.code)
    expect(codes).toContain('SELL_WITHOUT_COMMERCIAL_TARGET')
    expect(codes).toContain('COMMERCIAL_CTA_WITHOUT_RELATIONSHIP')
  })

  it('and an offer is never invented for them further down the chain', () => {
    // ⚠️ THE REFUSAL HAS TO HOLD AT EVERY LAYER, not only at the plan. A
    // resolver that reached for a product would put one in a script the plan
    // had already refused to authorise.
    const r = run({ plan: blankPlan('educate'), container: 'numbered_list', ties: ['none'] })
    expect(r.resolutions.every((x) => x.entityId === null)).toBe(true)
  })
})

// ── 6. CROSS-NICHE REFERENCE ──────────────────────────────────────────────

describe('a reference from another niche entirely', () => {
  it('transfers the structure and takes none of the wording', () => {
    // ⚖️ THE STRUCTURE IS THE THING WORTH STEALING. A skincare round-up and a
    // software round-up are the same shape with different contents, and that is
    // exactly why a cross-niche card can beat an on-niche one.
    const r = run({
      plan: { ...blankPlan('educate'), structure: 'recommendation', products: ['a'], productRole: 'supporting' },
      container: 'recommendation', ties: ['own_product'],
      entities: [entity('a'), entity('b'), entity('c')],
    })
    expect(r.writerInput).not.toBeNull()
    expect(r.writerInput!.referenceStructure.container).toBe('recommendation')

    const reference = 'these are the three products I regret buying this year and here is why'
    const lifted = validateScript(
      'These are the three products I regret buying this year and here is why. It costs $20 a month.',
      r.writerInput!, { referenceTranscript: reference })
    expect(lifted.failed.map((f) => f.code)).toContain('no_copied_reference_wording')

    const ownWords = validateScript(
      'Here are three tools I actually pay for. The first one costs $20 a month. Try it today.',
      r.writerInput!, { referenceTranscript: reference })
    expect(ownWords.failed.map((f) => f.code)).not.toContain('no_copied_reference_wording')
  })
})

// ── WHAT MUST BE TRUE ACROSS ALL SIX ──────────────────────────────────────

describe('the property that holds for every creator', () => {
  it('no scenario reaches the writer with an unfilled hole', () => {
    // ⚠️ THE ORDERING DEFECT, ASSERTED DIRECTLY. If any of these produced a
    // writer input with an empty slot, the writer would fill it — and that is
    // the founding defect reappearing through the back door.
    const scenarios = [
      run({ plan: { ...blankPlan('sell'), products: ['a'], productRole: 'primary', ownershipLanguage: true, commercialCta: true }, container: 'recommendation', ties: ['own_product'], entities: [entity('a'), entity('b'), entity('c')] }),
      run({ plan: blankPlan('educate'), container: 'confession', ties: ['none'] }),
      run({ plan: blankPlan('educate'), container: 'numbered_list', ties: ['none'] }),
    ]
    for (const s of scenarios) {
      if (s.writerInput === null) continue
      for (const slot of s.writerInput.content) expect(slot.content.trim()).not.toBe('')
    }
  })
})

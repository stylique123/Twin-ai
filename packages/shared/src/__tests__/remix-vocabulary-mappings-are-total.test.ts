// EVERY OLD VALUE MAPS TO EXACTLY ONE NEW VALUE, OR THE BUILD STOPS.
//
// ⚠️ A VOCABULARY MERGE WITHOUT THIS FILE IS A SILENT DEFAULT. Three questions
// on the remix screen changed shape: the goal became a canonical set shared with
// onboarding, `reference_use` went from four paraphrases to an ordered
// three-point scale, and `content_focus` lost the two options nothing read. Each
// of those retires a value that is already sitting in production rows and in
// clients that have not reloaded. A value nobody mapped must fail HERE — loudly,
// at build time — rather than fall through a `?? null` three prompt stages later
// and quietly change what a paid script says.
//
// ⚖️ AND THE TABLES ARE LOAD-BEARING, NOT DOCUMENTATION. `compileVideoIntent`
// reads them through `normalizeContentFocus` / `normalizeReferenceUse`, so
// breaking a row here breaks real behaviour and this file notices.
import { describe, it, expect } from 'vitest'
import {
  CANONICAL_GOALS, CANONICAL_GOAL_LABELS, STANDING_GOAL_TO_CANONICAL,
  REMIX_ONLY_GOALS, defaultVideoGoalFromContentGoals,
  CONTENT_FOCUS, LEGACY_CONTENT_FOCUS, CONTENT_FOCUS_MIGRATION, normalizeContentFocus,
  REFERENCE_USE, LEGACY_REFERENCE_USE, REFERENCE_USE_MIGRATION, normalizeReferenceUse,
  REFERENCE_USE_DIRECTIVE, KEEPS_REFERENCE_TOPIC, FIDELITY_FROM_REFERENCE_USE,
  resolveFidelity, compileVideoIntent,
} from '../videoIntent'
import { BRIEF_GOALS } from '../preScriptBrief'

describe('the goal is one vocabulary, owned by videoIntent', () => {
  // ⚠️ THE GUARD THAT KEEPS THE TWO SURFACES FROM DRIFTING APART AGAIN. If the
  // onboarding agent adds, renames or reduces a standing goal chip, this fails
  // until somebody has decided what that value MEANS to the writer. A reduction
  // (seven chips down to five) passes untouched, because a subset is still a
  // subset — which is the point of making the canonical set the superset.
  it('every BRIEF_GOALS value is a canonical goal with a decided mapping', () => {
    for (const g of BRIEF_GOALS) {
      expect(STANDING_GOAL_TO_CANONICAL[g], `unmapped standing goal: ${g}`).toBeDefined()
      expect(CANONICAL_GOALS as readonly string[]).toContain(STANDING_GOAL_TO_CANONICAL[g])
    }
  })

  it('every mapping target is itself canonical, and every canonical goal has one label', () => {
    for (const v of Object.values(STANDING_GOAL_TO_CANONICAL)) {
      expect(CANONICAL_GOALS as readonly string[]).toContain(v)
    }
    for (const g of CANONICAL_GOALS) {
      expect(CANONICAL_GOAL_LABELS[g], `no label for ${g}`).toBeTruthy()
    }
  })

  // ⚠️ THE LIVE DOWNGRADE THIS CHANGE FIXES. `personal_brand` used to map to
  // `authority`, and because the prefilled chip is SENT, a creator's standing
  // personal-brand goal was rewritten to authority on its way to the writer.
  it('the standing goal reaches the writer as itself, never downgraded', () => {
    for (const g of BRIEF_GOALS) {
      expect(defaultVideoGoalFromContentGoals([g])).toBe(g)
    }
  })

  it('names the goal onboarding cannot express rather than hiding it', () => {
    for (const g of REMIX_ONLY_GOALS) {
      expect(CANONICAL_GOALS as readonly string[]).toContain(g)
      expect(BRIEF_GOALS as readonly string[]).not.toContain(g)
      expect(defaultVideoGoalFromContentGoals([g])).toBeNull()
    }
  })

  // ⚠️ DO NOT MERGE `sell` INTO `leads`. They differ in five readers, and this
  // test is the record of that: the goal directive, the implied payoff, the
  // substance floor and the sell permission all read them apart. A merge would
  // silently rewrite every commercial CTA in the product.
  it('sell and leads are distinct to the writer, in more than name', () => {
    const sell = compileVideoIntent({ goal: 'sell' })
    const leads = compileVideoIntent({ goal: 'leads' })
    expect(sell.goalDirective).not.toBe(leads.goalDirective)
    expect(sell.payoffDirective).not.toBe(leads.payoffDirective)
    expect(sell.substanceFloor).not.toBe(leads.substanceFloor)
    expect(leads.goalDirective).toMatch(/never a purchase on the spot/)
  })

  // ⚠️ AND `conversations` IS NOT `leads` EITHER. It was split out because
  // `leads` grants the creator's half of the sell permission, so a creator
  // asking for replies was granting themselves a pitch.
  it('conversations does not grant the sell permission that leads does', () => {
    expect(compileVideoIntent({ goal: 'conversations' }).wantsSale).toBe(false)
    expect(compileVideoIntent({ goal: 'leads' }).wantsSale).toBe(true)
  })
})

describe('reference_use: four paraphrases became an ordered three-point scale', () => {
  it('is exactly three, in order, most-mine to most-theirs', () => {
    expect([...REFERENCE_USE]).toEqual(['structure', 'idea_structure', 'stay_close'])
  })

  it('every legacy value maps to exactly one live value', () => {
    for (const v of LEGACY_REFERENCE_USE) {
      const to = REFERENCE_USE_MIGRATION[v]
      expect(to, `unmapped reference_use: ${v}`).toBeDefined()
      expect(REFERENCE_USE as readonly string[]).toContain(to)
      expect(normalizeReferenceUse(v)).toBe(to)
    }
  })

  it('every live value survives the migration unchanged', () => {
    for (const v of REFERENCE_USE) expect(normalizeReferenceUse(v)).toBe(v)
  })

  // The retired one, named. `inspiration` and `structure` agree on the axis this
  // control owns — the subject is replaced either way — which is what makes the
  // merge honest rather than convenient.
  it('inspiration collapses into structure, keeping the subject replaced', () => {
    expect(normalizeReferenceUse('inspiration')).toBe('structure')
    expect(compileVideoIntent({ referenceUse: 'inspiration' }).keepsReferenceTopic).toBe(false)
  })

  it('an unrecognised value stays unanswered rather than defaulting', () => {
    expect(normalizeReferenceUse('nonsense')).toBeNull()
    expect(normalizeReferenceUse(undefined)).toBeNull()
    expect(compileVideoIntent({ referenceUse: 'nonsense' }).referenceUseDirective).toBeNull()
  })

  // ⚖️ NO QUESTION SHIPS WITHOUT A NAMED READER. Each of the three must be a
  // decidable instruction — what to KEEP and what to REPLACE — not an adjective.
  it('each of the three reaches the writer as a keep/replace instruction', () => {
    for (const v of REFERENCE_USE) {
      const d = REFERENCE_USE_DIRECTIVE[v]
      expect(d, `no directive for ${v}`).toBeTruthy()
      expect(d, `${v} must say what to KEEP`).toMatch(/KEEP/)
      expect(d, `${v} must say what to REPLACE`).toMatch(/REPLACE/)
      expect(compileVideoIntent({ referenceUse: v }).referenceUseDirective).toBe(d)
    }
    expect(new Set(Object.values(REFERENCE_USE_DIRECTIVE)).size).toBe(REFERENCE_USE.length)
  })

  // `reference_use` is authoritative over the retired fidelity slider, and still
  // maps cleanly onto the internal rule after the merge.
  it('reference_use still decides fidelity and still outranks the legacy slider', () => {
    for (const v of REFERENCE_USE) {
      expect(FIDELITY_FROM_REFERENCE_USE[v]).toBeTruthy()
      expect(resolveFidelity(v, 'loose')).toBe(FIDELITY_FROM_REFERENCE_USE[v])
    }
    expect(resolveFidelity(null, 'loose')).toBe('loose')
    expect(resolveFidelity(null, null)).toBe('balanced')
  })

  it('every live value has a topic rule', () => {
    for (const v of REFERENCE_USE) expect(typeof KEEPS_REFERENCE_TOPIC[v]).toBe('boolean')
  })
})

describe('content_focus: the two options nothing read are gone', () => {
  it('drops reference_adapted and trending from what may be written', () => {
    expect(CONTENT_FOCUS as readonly string[]).not.toContain('reference_adapted')
    expect(CONTENT_FOCUS as readonly string[]).not.toContain('trending')
  })

  it('every legacy value maps to exactly one live value or to explicit silence', () => {
    for (const v of LEGACY_CONTENT_FOCUS) {
      expect(v in CONTENT_FOCUS_MIGRATION, `unmapped content_focus: ${v}`).toBe(true)
      const to = CONTENT_FOCUS_MIGRATION[v]
      if (to !== null) expect(CONTENT_FOCUS as readonly string[]).toContain(to)
      expect(normalizeContentFocus(v)).toBe(to)
    }
  })

  it('every live value survives the migration unchanged', () => {
    for (const v of CONTENT_FOCUS) expect(normalizeContentFocus(v)).toBe(v)
  })

  // ⚠️ THE PROOF THAT `null` IS BEHAVIOUR-PRESERVING RATHER THAN CONVENIENT.
  // Both retired values compiled to an empty kind preference, no product
  // substance and no own-experience requirement — which is exactly what an
  // unanswered focus compiles to. Mapping either onto a surviving option would
  // have ADDED a retrieval tilt the creator never asked for.
  it('the retired values compile identically to answering nothing', () => {
    const silent = compileVideoIntent({})
    for (const v of ['reference_adapted', 'trending']) {
      const got = compileVideoIntent({ focus: v })
      expect(got.focus).toBeNull()
      expect(got.prefersKinds).toEqual(silent.prefersKinds)
      expect(got.wantsProductSubstance).toBe(silent.wantsProductSubstance)
      expect(got.wantsOwnExperience).toBe(silent.wantsOwnExperience)
    }
  })
})

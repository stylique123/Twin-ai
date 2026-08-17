// ASSEMBLY MAY NORMALISE REPRESENTATION. IT MAY NEVER REINTERPRET MEANING.
//
// ⚠️ THIS IS THE SAME DEFECT FOUND IN FOUR OTHER PLACES, CAUGHT BEFORE IT LANDED
// IN A FIFTH: an auto palette becoming "your brand", a generated sentence
// becoming "your CTA", a figure read off a photograph becoming a price, an
// inferred relationship nearly authorising "our product". Each was a machine's
// reading wearing a person's authority.
//
// ⚖️ SO THE CONFIRMED-ANSWER PATH CONTAINS NO MODEL, AND `rawValue` IS KEPT SO
// THAT IS CHECKABLE RATHER THAN PROMISED. A test can assert the original
// survived; it cannot assert an intention.
import { describe, expect, it } from 'vitest'
import {
  assembleCreatorProfile, toWriterView, toPlannerView,
  CANONICAL_ROLES, CANONICAL_BUSINESS, CANONICAL_LEVELS,
} from '../profileAssembler'
import { BRIEF_WORK_KINDS } from '../preScriptBrief'
import { AUDIENCE_KNOWLEDGE, COMMERCIAL_TIES } from '../creatorProfileQuestions'

const now = '2026-08-17T00:00:00.000Z'
const of = (answers: object, defaultCta?: string) =>
  assembleCreatorProfile({ answers: answers as never, defaultCta, now })

describe('every onboarding value has a canonical meaning', () => {
  it('maps every work kind, because a missed one is a silent undefined', () => {
    // ⚠️ THE RULE `MECHANISM_FROM_GOAL` EARNED. Written against an assumed enum,
    // an index signature returns undefined for every real member and the failure
    // is invisible. A total Record makes a new option a compile error.
    for (const k of BRIEF_WORK_KINDS) {
      const p = of({ workKind: k })
      expect(CANONICAL_ROLES, k).toContain(p.role!.value)
      expect(CANONICAL_BUSINESS, k).toContain(p.businessType!.value)
    }
  })

  it('maps every audience knowledge level', () => {
    for (const k of AUDIENCE_KNOWLEDGE) {
      expect(CANONICAL_LEVELS, k).toContain(of({ audienceKnowledge: k }).audienceLevel!.value)
    }
  })

  it('maps every commercial tie', () => {
    for (const t of COMMERCIAL_TIES) {
      expect(of({ commercialTies: [t] }).relationship).not.toBeNull()
    }
  })
})

describe('the answer survives assembly unchanged', () => {
  it('keeps the original beside the canonical value', () => {
    const p = of({ workKind: 'saas' })
    expect(p.role!.value).toBe('founder')
    expect(p.role!.rawValue).toBe('saas')
    expect(p.role!.source).toBe('user_answer')
  })

  it('trims a CTA without rewriting it', () => {
    // ⚖️ WHITESPACE IS REPRESENTATION; WORDS ARE MEANING. Trimming is allowed and
    // paraphrasing is not — and the raw value proves which happened.
    const p = of({}, '  Try Twin free  ')
    expect(p.defaultCta!.value).toBe('Try Twin free')
    expect(p.defaultCta!.rawValue).toBe('  Try Twin free  ')
  })

  it('is a pure function of its input', () => {
    // ⚠️ NO CLOCK INSIDE. A timestamp taken internally would make every output
    // differ from every other and the whole thing untestable.
    expect(of({ workKind: 'coach' })).toEqual(of({ workKind: 'coach' }))
  })
})

describe('unanswered is not answered', () => {
  it('leaves every field null when nothing was said', () => {
    const p = of({})
    expect(p.role).toBeNull()
    expect(p.relationship).toBeNull()
    expect(p.goals).toBeNull()
    expect(p.defaultCta).toBeNull()
  })

  it('treats an empty list as unanswered, never as "none"', () => {
    // ⚠️ THE DISTINCTION THAT DECIDES WHETHER SUGGESTIONS ARE SUPPRESSED. A
    // creator who never reached the question has not said they sell nothing.
    expect(of({ commercialTies: [] }).relationship).toBeNull()
    expect(of({ contentGoals: [] }).goals).toBeNull()
  })

  it('and an explicit "none" IS an answer', () => {
    const p = of({ commercialTies: ['none'] })
    expect(p.relationship!.value).toBe('NONE')
    expect(p.relationship!.source).toBe('user_answer')
  })
})

describe('the most permissive tie wins, and tap order never decides', () => {
  it('reads an owner who also has affiliate links as an owner', () => {
    // ⚠️ REDUCING THEM TO AFFILIATE WOULD FORBID "we built this" ABOUT THEIR OWN
    // SOFTWARE. The reverse error is the dangerous one — reading an affiliate as
    // an owner puts a false claim in somebody's mouth — so precedence runs from
    // most to least authority, never the other way.
    expect(of({ commercialTies: ['affiliate', 'own_product'] }).relationship!.value)
      .toBe('OWN_PRODUCT')
    expect(of({ commercialTies: ['own_product', 'affiliate'] }).relationship!.value)
      .toBe('OWN_PRODUCT')
  })

  it('never promotes an affiliate to an owner', () => {
    expect(of({ commercialTies: ['affiliate', 'sponsor'] }).relationship!.value).toBe('AFFILIATE')
    expect(of({ commercialTies: ['review'] }).relationship!.value).toBe('REVIEW_ONLY')
  })
})

describe('each stage sees only what it may know', () => {
  const p = of({ workKind: 'saas', audience: 'founders', audienceKnowledge: 'experienced', commercialTies: ['own_product'] }, 'Try Twin free')

  it('the writer cannot see the commercial relationship at all', () => {
    // ⚠️ A WRITER THAT COULD SEE IT WOULD BE A WRITER THAT COULD REASON ABOUT IT,
    // which is the second interpretation of the creator this module abolishes.
    // Permission is decided once, by the planner, and arrives as a restriction.
    const w = toWriterView(p) as Record<string, unknown>
    expect(w).not.toHaveProperty('relationship')
    expect(w).not.toHaveProperty('mayUseOwnershipLanguage')
    expect(w).not.toHaveProperty('defaultCta')
  })

  it('the projections carry plain values, never wrappers', () => {
    // ⚖️ THE `[object Object]` HAZARD, CLOSED BY CONSTRUCTION. Every value here
    // is interpolable, so a prompt builder cannot silently emit a wrapper.
    for (const v of Object.values(toWriterView(p))) {
      expect(typeof v === 'string' || v === null).toBe(true)
    }
    expect(toPlannerView(p).audienceLevel).toBe('expert')
  })

  it('the planner is told the permission, not asked to derive it', () => {
    expect(toPlannerView(p).mayUseOwnershipLanguage).toBe(true)
  })

  it('and an affiliate is refused ownership language', () => {
    const aff = of({ commercialTies: ['affiliate'] })
    expect(toPlannerView(aff).mayUseOwnershipLanguage).toBe(false)
  })

  it('as is a creator who never answered', () => {
    // ⚖️ Silence is not permission — the rule stated once in `authority.ts` and
    // holding here too, because this is where the value is actually produced.
    expect(toPlannerView(of({})).mayUseOwnershipLanguage).toBe(false)
  })
})

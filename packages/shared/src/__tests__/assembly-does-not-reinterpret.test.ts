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
  it('keeps the creator\'s answer at full resolution, and derives the role on top', () => {
    // ⚠️ THE CORRECTION THAT MADE THIS MODULE HONEST. Ten work kinds were being
    // collapsed to four roles with the original discarded — but the writer's ten
    // instructions each change what gets written, so the collapse was deleting
    // user-confirmed meaning and expecting the writer to recover it. It cannot.
    const p = of({ workKind: 'saas' })
    expect(p.workKind!.value).toBe('saas')
    expect(p.workKind!.source).toBe('user_answer')
    // ⚖️ AND THE ABSTRACTION SAYS IT IS ONE. A derived role stamped `user_answer`
    // could authorise things nobody asserted.
    expect(p.role!.value).toBe('founder')
    expect(p.role!.source).toBe('inferred')
    expect(p.role!.source === 'inferred' && p.role!.derivedFrom).toBe('workKind')
  })

  it('two work kinds may share a role and still write differently', () => {
    // ⚠️ THE WHOLE REASON BOTH FIELDS EXIST. A SaaS founder talks about users,
    // workflows and adoption; an ecommerce founder about customers, orders and
    // margins. Same broad role, different nouns — and a writer handed only the
    // role writes generic founder copy for both.
    const saas = of({ workKind: 'saas' })
    const shop = of({ workKind: 'ecommerce' })
    expect(toWriterView(saas).role).toBe(toWriterView(shop).role)
    expect(toWriterView(saas).workKind).not.toBe(toWriterView(shop).workKind)
  })

  it('no distinction is lost on the way in', () => {
    // ⚖️ THE RULE, AS A CHECK: canonicalisation may ADD abstractions and may not
    // DISCARD distinctions. Every onboarding work kind must survive to the writer
    // as itself — if two ever need to collapse, it is because they behave
    // identically everywhere, and that is a deletion somebody makes on purpose.
    const seen = new Set(BRIEF_WORK_KINDS.map((k) => toWriterView(of({ workKind: k })).workKind))
    expect(seen.size).toBe(BRIEF_WORK_KINDS.length)
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

describe('a brand account is not a founder', () => {
  // ⚠️ IT WAS BRIEFLY MAPPED TO `founder`, guarded by a test asserting nothing
  // downstream exploited the difference. That protected a known-wrong
  // representation instead of fixing it — and a planner reading `founder` has
  // every reason to conclude a human founder is speaking.
  //
  // ⚖️ SO THE ROLE EXISTS. This is the cheapest moment it could have been added,
  // and the rule that forced it is the one this module already runs on: a total
  // map must make somebody DECIDE what a new option means, and brand means
  // something different from founder.
  it('gets its own canonical role', () => {
    expect(of({ workKind: 'brand' }).role!.value).toBe('brand')
    expect(of({ workKind: 'founder' }).role!.value).toBe('founder')
    expect(of({ workKind: 'saas' }).role!.value).toBe('founder')
  })

  it('and the planner can tell them apart', () => {
    // ⚖️ THE POINT OF THE FIFTH ROLE. A brand may say "we" and "our product"
    // where authorised; it may not say "I built this" or "when I started" —
    // personal-founder authority nobody at a company account can assert.
    expect(toPlannerView(of({ workKind: 'brand' })).role)
      .not.toBe(toPlannerView(of({ workKind: 'founder' })).role)
  })

  it('while the writer still gets the trade, not just the role', () => {
    expect(toWriterView(of({ workKind: 'brand' })).workKind).toBe('brand')
  })

  it('and ownership language still comes from the relationship, never the role', () => {
    // ⚠️ THE RULE THAT DOES NOT CHANGE. A new role must not become a new source
    // of permission — that is the confusion the whole authority model refuses.
    expect(toPlannerView(of({ workKind: 'brand' })).mayUseOwnershipLanguage).toBe(false)
    expect(toPlannerView(of({ workKind: 'brand', commercialTies: ['own_product'] }))
      .mayUseOwnershipLanguage).toBe(true)
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

// §8a.1's question set — what is asked, and when.
//
// Two things carry this file. The SPLIT (intent during the scan, observables
// pre-filled on confirm) is what keeps onboarding shorter than the scan it
// hides behind. And the CLAIMS question has three states, not two: "we never
// asked", "they left it blank" and "they said there are no restrictions" are
// different facts, and a system that reads an empty box as permission has
// quietly decided a doctor may say anything.
import { describe, expect, it } from 'vitest'
import {
  BRIEF_GOALS, BRIEF_QUESTIONS, BRIEF_WORK_KINDS, CLAIMS_QUESTION_KINDS,
  asksForbiddenClaims, forbiddenClaimsAnswered, otherWithoutText,
  questionsFor, unansweredDecidingQuestions, type BriefAnswers,
  PRODUCT_EVIDENCE_FORM, asksProductEvidence,
} from '../preScriptBrief'

const answers = (over: BriefAnswers = {}): BriefAnswers => ({
  goal: 'leads', audience: 'busy founders', workKind: 'saas',
  offer: 'Twin — it edits your videos', ...over,
})

describe('the split: intent during the scan, observables on confirm', () => {
  it('every question is on exactly one side, and says why', () => {
    // A question on the wrong side is not a style choice: an intent question on
    // the confirm screen has nothing to pre-fill from, and an observable one
    // during the scan asks for an answer we are about to read anyway.
    for (const q of BRIEF_QUESTIONS) {
      expect(['during_scan', 'on_confirm']).toContain(q.stage)
      expect(q.because.length).toBeGreaterThan(20)
    }
  })

  it('ONLY the confirm-screen questions are pre-filled', () => {
    // An intent question with a pre-fill would be the product answering on the
    // creator's behalf.
    for (const q of BRIEF_QUESTIONS) {
      expect(q.prefilled).toBe(q.stage === 'on_confirm')
    }
  })

  it('asks the intent questions during the scan', () => {
    const ids = questionsFor('during_scan', answers()).map((q) => q.id)
    expect(ids).toContain('goal')
    expect(ids).toContain('audience')
    expect(ids).toContain('workKind')
    expect(ids).toContain('offer')
  })

  it('asks the observable ones on confirm', () => {
    const ids = questionsFor('on_confirm', answers()).map((q) => q.id)
    expect(ids).toEqual(['promotes', 'alsoWantsToMake'])
  })

  it('the goal is a CHOOSER, not free text', () => {
    // It decides format, hook strategy and CTA strength, and a decision cannot
    // be made from a sentence nobody parses.
    const goal = BRIEF_QUESTIONS.find((q) => q.id === 'goal')!
    expect(goal.options).toEqual(BRIEF_GOALS)
    expect(BRIEF_GOALS).toContain('leads')
    expect(BRIEF_GOALS).toContain('personal_brand')
  })
})

describe('the claims question is conditional, and its absence is not consent', () => {
  it('is asked for the kinds §8a names', () => {
    expect([...CLAIMS_QUESTION_KINDS]).toEqual(['professional', 'ecommerce', 'brand'])
    for (const kind of CLAIMS_QUESTION_KINDS) expect(asksForbiddenClaims(kind)).toBe(true)
  })

  it('is NOT asked of a SaaS founder, deliberately', () => {
    // The kind where the temptation to add it is strongest and the
    // justification weakest: those constraints are competitive, not regulatory.
    // Asking a compliance question of someone with no compliance regime trains
    // them to skip it — which is how the doctor skips it too.
    expect(asksForbiddenClaims('saas')).toBe(false)
    expect(asksForbiddenClaims('creator')).toBe(false)
    expect(asksForbiddenClaims(null)).toBe(false)
  })

  it('appears in the scan questions only when it applies', () => {
    expect(questionsFor('during_scan', answers({ workKind: 'saas' })).map((q) => q.id))
      .not.toContain('forbiddenClaims')
    expect(questionsFor('during_scan', answers({ workKind: 'professional' })).map((q) => q.id))
      .toContain('forbiddenClaims')
  })

  it('THREE STATES, never two', () => {
    // The failure this guards: reading an empty box as permission.
    expect(forbiddenClaimsAnswered(answers({ workKind: 'saas' }))).toBe('not_applicable')
    expect(forbiddenClaimsAnswered(answers({ workKind: 'professional' })))
      .toBe('unanswered')
    expect(forbiddenClaimsAnswered(answers({ workKind: 'professional', forbiddenClaims: '  ' })))
      .toBe('unanswered')
    expect(forbiddenClaimsAnswered(answers({ workKind: 'professional', forbiddenClaims: 'none' })))
      .toBe('none_declared')
    expect(forbiddenClaimsAnswered(answers({
      workKind: 'professional', forbiddenClaims: 'no guaranteed outcomes, no "cure"',
    }))).toBe('declared')
  })

  it('an explicit "none" is a real answer, distinguishable from a skipped box', () => {
    // "We asked and they said there are no restrictions" is a fact the product
    // may act on. "We never asked" is not.
    for (const said of ['none', 'None', 'n/a', 'no', 'nothing', 'None.']) {
      expect(forbiddenClaimsAnswered(answers({ workKind: 'brand', forbiddenClaims: said })))
        .toBe('none_declared')
    }
  })
})

describe('what would otherwise be GUESSED', () => {
  it('a fully answered brief has nothing missing', () => {
    expect(unansweredDecidingQuestions(answers())).toEqual([])
  })

  it('the OFFER leads the list — it is the one currently papered over', () => {
    // `offer` is otherwise INFERRED, and voice.ts's prompt forbids a blank, so
    // the model MUST produce something. A guessed offer is a wrong call to
    // action on every video shipped.
    expect(unansweredDecidingQuestions(answers({ offer: null }))[0]).toBe('offer')
    expect(unansweredDecidingQuestions(answers({ offer: '   ' }))[0]).toBe('offer')
  })

  it('reports an unanswered claims question for the kinds that need one', () => {
    expect(unansweredDecidingQuestions(answers({ workKind: 'professional' })))
      .toContain('forbiddenClaims')
    // and does not invent one where it was never asked
    expect(unansweredDecidingQuestions(answers({ workKind: 'saas' })))
      .not.toContain('forbiddenClaims')
  })

  it('names every missing intent answer, not just the first', () => {
    const missing = unansweredDecidingQuestions({})
    expect(missing).toContain('offer')
    expect(missing).toContain('goal')
    expect(missing).toContain('workKind')
    expect(missing).toContain('audience')
  })
})

describe('every "Other" carries free text, or it trades a real answer for a null', () => {
  it('catches an Other with nothing behind it', () => {
    expect(otherWithoutText(answers({ workKind: 'other' }))).toBe(true)
    expect(otherWithoutText(answers({ workKind: 'other', workKindOther: '  ' }))).toBe(true)
    expect(otherWithoutText(answers({ workKind: 'other', workKindOther: 'union organiser' })))
      .toBe(false)
  })

  it('does not fire on a real choice', () => {
    for (const kind of BRIEF_WORK_KINDS) {
      if (kind === 'other') continue
      expect(otherWithoutText(answers({ workKind: kind }))).toBe(false)
    }
  })
})

describe('the product question is conditional, and asked once', () => {
  it('is not asked before the creator has said what they do', () => {
    // A wall of questions is answered badly or skipped. This one has no meaning
    // until `workKind` is known, so it does not appear beside it — it appears
    // BECAUSE of it.
    const ids = questionsFor('during_scan', {}).map((q) => q.id)
    expect(ids).not.toContain('productEvidence')
  })

  it('is asked once the kind implies a product', () => {
    for (const kind of ['saas', 'ecommerce', 'brand', 'professional', 'local_service'] as const) {
      expect(questionsFor('during_scan', { workKind: kind }).map((q) => q.id))
        .toContain('productEvidence')
    }
  })

  it('is NOT asked of a plain creator', () => {
    // The one kind where a product is the exception. Interrogating someone
    // about a thing they do not have is how they learn to click past the
    // questions that matter — the same reasoning that keeps `saas` out of the
    // claims question.
    expect(questionsFor('during_scan', { workKind: 'creator' }).map((q) => q.id))
      .not.toContain('productEvidence')
  })

  it('leads with a link for software and with images for a physical product', () => {
    // A product PAGE is marketing copy; a physical product is an object that
    // has to be filmed. Which is offered first follows from that.
    expect(PRODUCT_EVIDENCE_FORM.saas).toBe('link')
    expect(PRODUCT_EVIDENCE_FORM.ecommerce).toBe('images')
  })

  it('never restricts to one form — every kind can supply either', () => {
    // A SaaS founder with a screenshot and a jeweller with a shop page are both
    // ordinary. The map decides what leads, not what is allowed.
    for (const form of Object.values(PRODUCT_EVIDENCE_FORM)) {
      expect(['link', 'images', 'either']).toContain(form)
    }
  })

  it('an unanswered product question is not "they have no product"', () => {
    // The same three-state discipline the claims question has: absent means
    // unasked or skipped, and reading it as "nothing to show" would let the
    // container rule quietly conclude a demo needs nothing.
    expect(asksProductEvidence(null)).toBe(false)
    expect(asksProductEvidence(undefined)).toBe(false)
    expect(asksProductEvidence('saas')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  assessReadiness, discoveryQuestions, isBillableScript, READINESS_FIELDS,
} from '../generationReadiness'

const state = (v: ReturnType<typeof assessReadiness>, f: string) =>
  v.fields.find((x) => x.field === f)?.state

/** A creator with everything settled, promoting nothing. The common case. */
const EXPLAINER = {
  goal: 'educate', audience: 'early founders', angle: 'why RAG pipelines fail',
  hasCreatorKnowledge: true, referenceRead: true,
}

describe('assessReadiness — it must not become a questionnaire', () => {
  it('a fully-specified explainer is never asked anything', () => {
    const v = assessReadiness(EXPLAINER)
    expect(v.blocked).toBe(false)
    expect(v.questions).toEqual([])
  })

  it('an explainer is not asked for a product, a relationship or a CTA', () => {
    // ⚖️ THE WHOLE REASON THIS IS PER-VIDEO. ~85-95% of short-form sells
    // nothing; asking every one of those for an offer is the ritual this
    // replaces, and it would be a worse product than the bug.
    const v = assessReadiness(EXPLAINER)
    for (const f of ['offer', 'relationship', 'claims']) {
      expect(state(v, f), f).toBe('RESOLVED')
    }
    expect(state(v, 'cta')).toBe('INFERRED_BUT_SAFE')
  })

  it('audience is inferred, not asked, when there is a back catalogue', () => {
    // Being wrong costs register, not truth — so it degrades rather than blocks.
    const v = assessReadiness({ ...EXPLAINER, audience: null })
    expect(state(v, 'audience')).toBe('INFERRED_BUT_SAFE')
    expect(v.blocked).toBe(false)
  })

  it('…but is asked when we know nothing about the creator at all', () => {
    const v = assessReadiness({ ...EXPLAINER, audience: null, hasCreatorKnowledge: false })
    expect(state(v, 'audience')).toBe('MISSING_REQUIRED')
  })
})

describe('assessReadiness — "make a video selling this"', () => {
  // The owner's example, verbatim: a commercial goal and nothing else known.
  const BARE_SELL = { goal: 'sell', angle: 'my new thing', hasCreatorKnowledge: true }

  it('blocks, because a sale with no offer is a claim waiting to be invented', () => {
    const v = assessReadiness(BARE_SELL)
    expect(v.blocked).toBe(true)
  })

  it('asks for the offer, the relationship and the CTA — the three it named', () => {
    const v = assessReadiness(BARE_SELL)
    expect(state(v, 'offer')).toBe('MISSING_REQUIRED')
    expect(state(v, 'relationship')).toBe('MISSING_REQUIRED')
    expect(state(v, 'cta')).toBe('MISSING_REQUIRED')
  })

  it('asks AT MOST THREE, most decisive first', () => {
    // A creator asked eight questions abandons. `offer` leads because every
    // other answer changes meaning once it is known.
    const v = assessReadiness(BARE_SELL)
    expect(v.questions.length).toBeLessThanOrEqual(3)
    expect(v.questions[0]).toMatch(/product or offer/i)
  })

  it('a commercial goal makes it promoting even with no offer named', () => {
    // ⚠️ The half of `promoting` that matters: without it, "sell this" with an
    // empty offer field reads as a non-commercial video and sails through.
    expect(assessReadiness({ goal: 'sell', angle: 'x', hasCreatorKnowledge: true }).blocked).toBe(true)
    expect(assessReadiness({ goal: 'educate', angle: 'x', hasCreatorKnowledge: true }).blocked).toBe(false)
  })

  it('composite goals are read, not missed', () => {
    expect(assessReadiness({ goal: 'leads+authority', angle: 'x', hasCreatorKnowledge: true }).blocked).toBe(true)
  })
})

describe('assessReadiness — the relationship is never guessed', () => {
  const OFFERED = {
    goal: 'educate', audience: 'founders', angle: 'x', offer: 'my course',
    hasCreatorKnowledge: true, productFacts: ['12 lessons, self-paced'],
  }

  it('asks when a product is featured and the tie is unknown', () => {
    // ⚖️ BOTH DIRECTIONS ARE EXPENSIVE. Guessing "no tie" hides an affiliate
    // disclosure — a legal problem. Guessing "owns it" lets a reviewer speak as
    // a maker. So neither is guessed, at any confidence.
    expect(state(assessReadiness(OFFERED), 'relationship')).toBe('MISSING_REQUIRED')
  })

  it('accepts the enum and refuses prose that merely contains it', () => {
    expect(state(assessReadiness({ ...OFFERED, relationship: 'OWN_PRODUCT' }), 'relationship'))
      .toBe('RESOLVED')
    // The pack's research field reads "REVIEW_ONLY — nothing in the scan shows
    // an ownership or paid tie". That is a note, not a permission.
    expect(state(assessReadiness({ ...OFFERED, relationship: 'REVIEW_ONLY — nothing in the scan shows a tie' }), 'relationship'))
      .toBe('MISSING_REQUIRED')
  })
})

describe('assessReadiness — claims', () => {
  const BASE = {
    goal: 'educate', audience: 'founders', angle: 'x', offer: 'my app',
    relationship: 'OWN_PRODUCT', hasCreatorKnowledge: true,
  }

  it('an EMPTY fact list is a real answer, and it is not enough to promote', () => {
    // This is the exact state that produced 70 invented product facts across
    // 112 scripts. `[]` means we know none were supplied — so we ask.
    expect(state(assessReadiness({ ...BASE, productFacts: [] }), 'claims')).toBe('MISSING_REQUIRED')
    expect(state(assessReadiness({ ...BASE, productFacts: null }), 'claims')).toBe('MISSING_REQUIRED')
    expect(state(assessReadiness({ ...BASE, productFacts: ['offline-first sync'] }), 'claims')).toBe('RESOLVED')
  })
})

describe('assessReadiness — reference transfer degrades, never blocks', () => {
  it('an unread reference is safe to infer, because the caller already refused one', () => {
    // Writing in the creator's own shape is a legitimate product. The hard stop
    // for a reference we could not READ lives above the spend, in the caller.
    const v = assessReadiness({ ...EXPLAINER, referenceRead: false })
    expect(state(v, 'referenceTransfer')).toBe('INFERRED_BUT_SAFE')
    expect(v.blocked).toBe(false)
  })

  it('never produces a question, because the creator cannot answer it', () => {
    const v = assessReadiness({ goal: '', angle: '', referenceRead: false, hasCreatorKnowledge: false })
    expect(v.questions.join(' ')).not.toMatch(/reference/i)
  })

  it('covers every declared field', () => {
    const v = assessReadiness(EXPLAINER)
    expect(v.fields.map((f) => f.field).sort()).toEqual([...READINESS_FIELDS].sort())
  })
})

describe('discoveryQuestions — decided by authorship, not grammar', () => {
  it('flags the escalation text this system writes', () => {
    expect(discoveryQuestions([
      'Here is the part nobody tells you.',
      'This beat needs a real detail about your product, and nothing about it was supplied. What does it actually do here?',
    ])).toEqual([1])
  })

  it('does NOT flag a rhetorical hook', () => {
    expect(discoveryQuestions(['Why are founders still paying for this?'])).toEqual([])
  })

  it('does NOT flag the two real lines that killed the linguistic version', () => {
    // ⚠️ Both appeared verbatim in real generated scripts, and both were
    // flagged by a `(what|which|who) … your (product|business) … ?` pattern.
    // They are engagement CTAs: "your" means the VIEWER'S. A false positive
    // here refunds a good script, which is why this check keys on authorship.
    expect(discoveryQuestions([
      "What's the one AI tool you can't live without for your business? Let me know in the comments!",
      'So, how are you providing value in your business right now? Let me know in the comments!',
      'What’s one tech purchase you regret, and what did you learn from it?',
    ])).toEqual([])
  })
})

describe('isBillableScript — clarification is free, creation is paid', () => {
  const ok = ['Hook.', 'Point one.', 'Point two.', 'Close.']

  it('charges for a clean script', () => {
    expect(isBillableScript(ok, 0).billable).toBe(true)
  })

  it('does not charge when the script asks the creator for context', () => {
    const r = isBillableScript([...ok, 'Only you can supply this. What would you actually say here?'], 1)
    expect(r.billable).toBe(false)
    expect(r.reason).toBe('script_asks_creator_for_context')
  })

  it('does not charge for the 5-of-6-questions script that started this', () => {
    expect(isBillableScript(['a', 'b', 'c', 'd', 'e', 'f'], 5).billable).toBe(false)
    expect(isBillableScript(['a', 'b', 'c', 'd', 'e', 'f'], 5).reason).toBe('script_mostly_questions')
  })

  it('tolerates ONE gap — a reasonable script with a hole is still a script', () => {
    // ⚖️ Not a zero. A single beat the creator must personalise is normal; half
    // the beats is a form. The threshold mirrors what the edge already logs.
    expect(isBillableScript(['a', 'b', 'c', 'd', 'e'], 1).billable).toBe(true)
  })

  it('never divides by zero on an empty script', () => {
    expect(isBillableScript([], 0).billable).toBe(true)
  })
})

// HOW MUCH FRICTION DOES THIS ACTUALLY ADD? MEASURED, NOT ASSUMED.
//
// ⚠️ THE RISK OF SHIPPING THIS. A readiness gate that asks most creators
// something is a wall, not friction, and it would be invisible until support
// tickets arrived. Run over 112 real-shaped briefs — the 8 scanned creators
// x 7 goals x 2 reference families — it fires on 32, and all 32 are the
// commercial ones. Every non-commercial brief proceeds untouched.
//
// ⚖️ That is the design working, not a coincidence: a field is only required
// when guessing it would produce a CLAIM. These cases pin the shape, so a
// later change that starts asking explainers for an offer fails here rather
// than in production.
describe('the friction lands only where guessing would fabricate', () => {
  const founder = {
    goal: 'sell', audience: 'early-stage founders', angle: 'why onboarding leaks users',
    offer: 'Twin', relationship: 'OWN_PRODUCT', cta: 'start a free trial',
    productFacts: ['scans your account and builds a Creator DNA'],
    referenceRead: true, hasCreatorKnowledge: true,
  }

  it('a fully-onboarded founder is asked NOTHING, selling or explaining', () => {
    expect(assessReadiness(founder).questions).toEqual([])
    expect(assessReadiness({ ...founder, goal: 'educate' }).questions).toEqual([])
  })

  it('a reviewer with no product is asked nothing for a normal video', () => {
    // ~85-95% of short-form. If this ever asks, the gate has become a form.
    expect(assessReadiness({
      goal: 'followers', audience: 'tech buyers', angle: 'the new Pixel',
      referenceRead: true, hasCreatorKnowledge: true,
    }).questions).toEqual([])
  })

  it('…but IS asked when the goal is to sell something they never named', () => {
    // The 32 cases. A reviewer selling an unnamed thing is under-specified,
    // and the old behaviour invented what it was — "Link in bio to get your
    // Smart Cooker!" on a creator with no tie to any cooker.
    const v = assessReadiness({
      goal: 'sell', audience: 'tech buyers', angle: 'the new Pixel',
      referenceRead: true, hasCreatorKnowledge: true,
    })
    expect(v.blocked).toBe(true)
    expect(v.questions).toHaveLength(3)
  })

  it('a single missing field asks a single question, not the whole set', () => {
    // The difference between a targeted ask and re-running onboarding.
    expect(assessReadiness({ ...founder, productFacts: [] }).questions).toHaveLength(1)
    expect(assessReadiness({ ...founder, relationship: null }).questions).toHaveLength(1)
  })
})

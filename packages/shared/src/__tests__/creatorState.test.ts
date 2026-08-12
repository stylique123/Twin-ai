// TWIN MAY IMITATE A CREATOR'S VOICE. IT MAY NEVER INVENT THEIR LIFE.
//
// ⚠️ THE INVARIANT THIS FILE EXISTS TO HOLD. Twin writes in first person and the
// creator is expected to trust it, put it on a teleprompter, and say it as
// themselves. A chatbot inventing "WHOOP has feature X" is wrong; a creator tool
// writing "I've been using my WHOOP for six months" and handing it to someone
// who has never owned one is asking them to lie about themselves on their own
// channel. That is a different KIND of failure, not a worse degree of one.
import { describe, expect, it } from 'vitest'
import {
  creatorStateClaim, resolveCreatorState, stripPersonalClaim,
  creatorStateQuestion, CREATOR_STATE_KINDS,
} from '../creatorState'

describe('what the sentence asserts about their life', () => {
  it('names each subtype, because ownership is only one of them', () => {
    const cases: Array<[string, string]> = [
      ['The third item is my WHOOP.', 'ownership'],
      ['I use Notion every single day.', 'use'],
      ['I bought one last year and never looked back.', 'purchase'],
      ['when I tried the beta, the sync was instant', 'experience'],
      ['That workflow saved me four hours a week.', 'result'],
      ["I've relied on this for three years.", 'history'],
      ['My team runs everything through it.', 'relationship'],
    ]
    for (const [line, kind] of cases) {
      expect(creatorStateClaim(line)?.kind, line).toBe(kind)
    }
    expect(CREATOR_STATE_KINDS.length).toBe(7)
  })

  it('says nothing about ordinary first-person work talk', () => {
    // ⚖️ THE LIST THAT KEEPS THIS USABLE. "my approach", "my goals", "my
    // audience" are how anyone discusses their own work. Treating them as
    // ownership would fire on nearly every first-person sentence, and a guard
    // that asks about everything gets clicked through — after which it guards
    // nothing.
    for (const l of [
      'My approach is to post consistently.',
      'My goals for this quarter are simple.',
      'My audience keeps asking for this.',
      'Is this simplifying my life, or adding clutter?',
      'That changed my whole strategy.',
    ]) expect(creatorStateClaim(l), l).toBeNull()
  })

  it('says nothing about sentences with no personal claim at all', () => {
    expect(creatorStateClaim('Most people leave Smart HDR on auto.')).toBeNull()
    expect(creatorStateClaim("Let's talk about what actually changed.")).toBeNull()
  })
})

describe('rewrite before asking — the field that keeps this from being immigration', () => {
  it('rewrites a possessive whose real content is about the THING', () => {
    const c = creatorStateClaim('My WHOOP tracks recovery better than anything else.')!
    expect(c.rewritable).toBe(true)
    expect(resolveCreatorState(c, false)).toBe('rewrite')
    expect(stripPersonalClaim('My WHOOP tracks recovery better than anything else.'))
      .toBe('WHOOP tracks recovery better than anything else.')
  })

  it('produces GRAMMATICAL English, which the first version did not', () => {
    // ⚠️ MEASURED ON THE CORPUS AND CAUGHT BEFORE SHIPPING. Deleting "my" left a
    // bare common noun: "electric bike, for instance, isn't the newest model."
    // That is visibly broken ON A TELEPROMPTER — worse than the fabricated
    // possessive it fixes, because the audience sees it too.
    expect(stripPersonalClaim("My electric bike, for instance, isn't the newest model."))
      .toBe("The electric bike, for instance, isn't the newest model.")
    expect(stripPersonalClaim('based on my review of their claims'))
      .toBe('based on the review of their claims')
  })

  it('does not mistake "I\'ve got" for a purchase', () => {
    // "I've got proof" and "I've got four more" are not transactions, and
    // asking "did you buy proof yourself?" teaches people to ignore the guard.
    expect(creatorStateClaim("Well, I've got proof directly from iOS27 itself.")?.kind)
      .not.toBe('purchase')
    expect(creatorStateClaim("We've covered three, but I've got four more.")?.kind)
      .not.toBe('purchase')
  })

  it('REFUSES to rewrite a claim whose whole point is the relationship', () => {
    // ⚠️ Stripping the possessive here yields "I've been using WHOOP for six
    // months", which keeps the fabricated usage and merely hides the pronoun —
    // a rewrite that looks like a fix and is not one.
    const c = creatorStateClaim("I've been using my WHOOP for six months.")!
    expect(c.rewritable).toBe(false)
    expect(resolveCreatorState(c, false)).toBe('needs_user')
  })

  it('asks a question only the creator can answer', () => {
    const c = creatorStateClaim("I've been using my WHOOP for six months.")!
    expect(creatorStateQuestion(c)).toMatch(/how long have you really used/i)
    expect(creatorStateQuestion(creatorStateClaim('The third item is my WHOOP.')!))
      .toMatch(/do you personally own/i)
  })
})

describe('grounding is three-state, and unchecked is never permission', () => {
  const c = creatorStateClaim("I've been using my WHOOP for six months.")!

  it('allows it when something on record establishes the relationship', () => {
    expect(resolveCreatorState(c, true)).toBe('grounded')
  })

  it('treats NOT CHECKED exactly like NOT SUPPORTED', () => {
    // ⚖️ `null` is "we did not or could not check". Reading it as permission
    // would let a lookup failure silently license an autobiography — the
    // quietest possible route to the worst outcome.
    expect(resolveCreatorState(c, null)).toBe('needs_user')
    expect(resolveCreatorState(c, false)).toBe('needs_user')
  })
})

// ── DEPTH IS NOT GROUNDING, AND THEY MUST NEVER MERGE ────────────────────────
describe('knowledge depth cannot entitle a creator-state claim', () => {
  it('takes no depth argument at all, structurally', () => {
    // ⚠️ A creator with extremely rich DNA may still never have said whether
    // they own a WHOOP.
    //
    //   depth      how much Twin knows about this creator OVERALL
    //   grounding  whether Twin knows THIS PARTICULAR THING
    //
    // Collapsing them would let a well-scanned creator be handed any
    // autobiography at all — the failure most likely to look fine in aggregate
    // and be catastrophic for one person. `resolveCreatorState` takes evidence
    // for THIS ENTITY and nothing else, so the mistake is unavailable rather
    // than merely discouraged.
    expect(resolveCreatorState.length).toBe(2)
    const src = String(resolveCreatorState)
    expect(src).not.toMatch(/depth|Depth|hasCreatorKnowledge/)
  })
})

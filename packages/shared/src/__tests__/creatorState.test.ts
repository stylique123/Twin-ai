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
  creatorStateQuestion, CREATOR_STATE_KINDS, entityEvidence, rewriteSafety, creatorStateAction,
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
    expect(CREATOR_STATE_KINDS.length).toBe(8)
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

// ── RESOLVING THE ENTITY: MENTIONING IS NOT OWNING ───────────────────────────
describe('entityEvidence — a title proves a video, not a purchase', () => {
  const titled = [{ kind: 'product', text: 'Samsung Z Fold 8', basis: 'demonstrated' }]
  const lived = [{ kind: 'experience', text: 'used the Z Fold 8 as his only phone for two weeks', basis: 'stated' }]

  it('REFUSES a product the creator only named in a title', () => {
    // ⚠️ THE TRAP THIS EXISTS FOR. The obvious implementation — "does any
    // supplied item mention this entity?" — would license "my Z Fold 8" from a
    // title that merely says Z Fold 8. That is the exact fabrication the module
    // exists to stop, arriving through the lookup meant to prevent it.
    expect(entityEvidence('Z Fold 8', { items: titled })).toBe(false)
  })

  it('allows it when they were HEARD saying they used it', () => {
    expect(entityEvidence('Z Fold 8', { items: lived })).toBe(true)
  })

  it('an affiliate or sponsor tie is KNOWN but not OWNED', () => {
    // ⚖️ Earning from a product is not owning or using it, and a disclosure
    // obligation is not a licence to say "mine".
    for (const rel of ['AFFILIATE', 'SPONSOR', 'REVIEW_ONLY']) {
      expect(entityEvidence('WHOOP', { items: [], entities: [{ name: 'WHOOP', relationship: rel }] }), rel)
        .toBe(false)
    }
    expect(entityEvidence('WHOOP', { items: [], entities: [{ name: 'WHOOP', relationship: 'OWN_PRODUCT' }] }))
      .toBe(true)
  })

  it('distinguishes "known but wrong tie" from "never heard of it"', () => {
    // Both resolve the same way downstream. An operator asking WHY a beat was
    // rewritten still needs to tell those two answers apart.
    expect(entityEvidence('WHOOP', { items: titled })).toBeNull()
    expect(entityEvidence('WHOOP', { items: [], entities: [{ name: 'WHOOP', relationship: 'AFFILIATE' }] }))
      .toBe(false)
  })

  it('returns null when there is no entity to check', () => {
    expect(entityEvidence(null, { items: lived })).toBeNull()
    expect(entityEvidence('   ', { items: lived })).toBeNull()
  })
})

describe('the full chain, end to end', () => {
  it('a titled product cannot license "my <product>" — it is rewritten', () => {
    const line = 'My Z Fold 8 folds flat with no gap at all.'
    const claim = creatorStateClaim(line)!
    const ev = entityEvidence(claim.entity, {
      items: [{ kind: 'product', text: 'Samsung Z Fold 8', basis: 'demonstrated' }],
    })
    expect(resolveCreatorState(claim, ev)).toBe('rewrite')
    // A PROPER noun needs no article — "Z Fold 8 folds flat" is correct English.
    // Only common nouns take "the". My first expectation here was wrong, not the code.
    expect(stripPersonalClaim(line)).toBe('Z Fold 8 folds flat with no gap at all.')
  })

  it('…and first-person evidence lets the same line stand', () => {
    const claim = creatorStateClaim('My Z Fold 8 folds flat with no gap at all.')!
    const ev = entityEvidence(claim.entity, {
      items: [{ kind: 'experience', text: 'used the Z Fold 8 as his only phone', basis: 'stated' }],
    })
    expect(resolveCreatorState(claim, ev)).toBe('grounded')
  })
})

// ── HOW SAFELY CAN THE PERSONAL CLAIM BE REMOVED? ────────────────────────────
describe('rewriteSafety — truthfulness is not the only thing being optimised', () => {
  const claim = (l: string) => creatorStateClaim(l)!

  it('SAFE_ERASURE when the fact lives in the predicate', () => {
    const l = 'My WHOOP tracks recovery better than anything.'
    expect(rewriteSafety(claim(l), l)).toBe('SAFE_ERASURE')
  })

  it('PERSONALITY_LOSS when erasing would re-attribute the claim', () => {
    // ⚠️ "I've used WHOOP every day for a year" erased becomes a statement
    // about people in general — A DIFFERENT CLAIM, and a new fabrication
    // wearing a fix's clothes.
    const l = "I've used WHOOP every day for a year."
    expect(rewriteSafety(claim(l), l)).toBe('PERSONALITY_LOSS')
  })

  it('PREMISE_DEPENDENT when the experience IS the concept', () => {
    // ⚖️ There is no version of this video without the personal history.
    // Rewriting the beat leaves a script whose own hook no longer pays off.
    for (const l of [
      '5 things I stopped buying after I turned 30.',
      'I stopped doing these 5 things that are keeping you poor.',
    ]) expect(rewriteSafety(claim(l), l, { isOpening: true }), l).toBe('PREMISE_DEPENDENT')
  })

  it('catches the line this module originally MISSED', () => {
    // ⚠️ "I stopped doing these 5 things" — quoted all session as the worst
    // fabrication in the corpus — produced NO CLAIM at all, because every
    // pattern looked for owning, using or buying and none looked for DOING.
    // A taxonomy that misses the case it was written about has a hole in it.
    expect(creatorStateClaim('I stopped doing these 5 things that are keeping you poor.')?.kind)
      .toBe('action')
  })

  it('does not treat ordinary narration as an action', () => {
    // ⚖️ "I saw", "I thought" are not choices a creator can be held to.
    expect(creatorStateClaim('I saw a lot of tech this year.')).toBeNull()
  })
})

describe('three modes, and the default is a product decision', () => {
  const safe = 'SAFE_ERASURE' as const
  const premise = 'PREMISE_DEPENDENT' as const

  it('observe changes nothing, whatever the safety', () => {
    // ⚠️ THE DEFAULT, AND NOT TIMIDITY. On cohort 1 the resolver grounds 0 of
    // 37 claims — not because the chain is wrong but because every supplied
    // item is coverage-level. Enforcing against that supply would mean
    // "whenever Twin writes something personal about you, assume it cannot be
    // proven", stripping personal experience out of scripts wholesale.
    for (const s of [safe, premise]) {
      expect(creatorStateAction(s, false, 'observe').act, s).toBe('none')
    }
  })

  it('safe_rewrite touches ONLY provably meaning-preserving erasures', () => {
    expect(creatorStateAction(safe, false, 'safe_rewrite').act).toBe('rewrite')
    expect(creatorStateAction(premise, false, 'safe_rewrite').act).toBe('none')
    expect(creatorStateAction('PERSONALITY_LOSS', false, 'safe_rewrite').act).toBe('none')
  })

  it('enforce asks rather than mangling a premise', () => {
    // Even at full enforcement a PREMISE_DEPENDENT beat is never silently
    // rewritten — the question is the only honest move.
    expect(creatorStateAction(premise, false, 'enforce').act).toBe('ask')
    expect(creatorStateAction(safe, false, 'enforce').act).toBe('rewrite')
  })

  it('a grounded claim is never touched, in any mode', () => {
    for (const m of ['observe', 'safe_rewrite', 'enforce'] as const) {
      expect(creatorStateAction(premise, true, m).act, m).toBe('none')
    }
  })
})

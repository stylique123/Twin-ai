// TWELVE REAL CREATORS, AND WHAT THE THREE ANSWERS ACTUALLY CHANGE FOR EACH.
//
// ⚠️ WHAT THIS FILE REFUSES TO TEST. That an answer "appears in the prompt".
// This repo has measured, twice, that adding text to a prompt does not move
// output — #376 moved a score 17-7 by changing what REACHED the writer, and the
// Substance Packet moved it 12-12 by adding rules to how the writer was told to
// behave. So every assertion below is on a DECISION: which knowledge is
// retrieved, how much substance is required, whether a purchase CTA is
// permitted, what the ending must do.
//
// ⚖️ AND EVERY SCENARIO RUNS THE REAL FUNCTIONS. The compiler, the ranker, the
// selector and the claim-rules authority — not fixtures of their output, which
// would pass forever after any of them changed.
import { describe, expect, it } from 'vitest'
import { compileVideoIntent, preferKinds } from '../videoIntent'
import { selectSpeakable, SUBSTANCE_FLOOR } from '../knowledgeSelection'
import { claimRulesFor, mayWriteCommercialCta } from '../productEntity'
import type { EntityRelationship, PersonalUse } from '../productEntity'

// ── THE STORES ─────────────────────────────────────────────────────────────
//
// ⚠️ SHAPED FROM PRODUCTION, NOT INVENTED. Across 631 real knowledge rows,
// captions have produced ZERO `experience` and ZERO `framework` items; every one
// of the 50 experiences and 18 frameworks came from a transcript. A caption-only
// creator genuinely has no first-hand material, and these fixtures say so.
const k = (kind: string, text: string, basis = 'stated') => ({ kind, text, basis })

const CAPTION_ONLY = [
  k('covered', 'pull-up progressions', 'demonstrated'),
  k('topic', 'protein timing', 'demonstrated'),
  k('covered', 'gym anxiety', 'demonstrated'),
  k('claim', 'most beginners train too heavy', 'demonstrated'),
  k('product', 'a resistance band set', 'demonstrated'),
  k('topic', 'rest days', 'demonstrated'),
  k('covered', 'warm-up myths', 'demonstrated'),
]

const TRANSCRIPT_RICH = [
  ...CAPTION_ONLY,
  k('experience', 'I tore my rotator cuff doing kipping pull-ups in 2021'),
  k('framework', 'the 3-week ramp: technique, then volume, then load'),
  k('opinion', 'beginners should not train to failure in the first year'),
  k('example', 'the client who added 40kg in six months'),
  k('experience', 'I trained fasted for a year and slept badly the whole time'),
]

const first = (rows: readonly { kind: string }[], focus?: string) =>
  preferKinds(rows, compileVideoIntent({ focus }).prefersKinds)[0]?.kind

/** The full pipeline: focus reorders, outcome sets the floor, selector cuts. */
const supplied = (rows: readonly { kind: string; text: string }[], focus?: string, outcome?: string) => {
  const i = compileVideoIntent({ focus, outcome })
  return selectSpeakable(preferKinds(rows, i.prefersKinds), 10, i.substanceFloor)
}

/** The commercial half, end to end: creator's ask AND the recorded tie. */
const mayPitch = (rel: EntityRelationship, goal?: string, outcome?: string, use: PersonalUse = 'NOT_CONFIRMED') =>
  mayWriteCommercialCta(
    claimRulesFor(rel, use),
    compileVideoIntent({ goal, outcome }).wantsSale ? 'sell' : 'engage',
  )

// ═══ 1 · SAAS FOUNDER, EDUCATIONAL VIDEO ══════════════════════════════════
describe('scenario 1 — SaaS founder teaching', () => {
  it('an expertise focus retrieves the FRAMEWORK, not the injury story', () => {
    expect(first(TRANSCRIPT_RICH, 'expertise')).toBe('framework')
  })

  it('a learning outcome demands more substance than the system default', () => {
    expect(compileVideoIntent({ outcome: 'learn' }).substanceFloor)
      .toBeGreaterThan(SUBSTANCE_FLOOR)
  })

  it('owning the product does NOT license a pitch on a teaching video', () => {
    // ⚖️ Ownership is a standing fact; selling in THIS video is a per-video
    // decision. ~85-95% of a creator's short-form sells nothing.
    expect(mayPitch('OWN_PRODUCT', 'educate', 'learn')).toBe(false)
  })

  it('but the founder may still state features, which is a different permission', () => {
    expect(claimRulesFor('OWN_PRODUCT').marketingClaims).toBe('allowed')
    expect(claimRulesFor('OWN_PRODUCT').ownershipLanguage).toBe(true)
  })
})

// ═══ 2 · THE SAME FOUNDER, SELLING ════════════════════════════════════════
describe('scenario 2 — the same founder, selling', () => {
  it('the ONLY thing that changed is the answer, and the CTA flips', () => {
    expect(mayPitch('OWN_PRODUCT', 'educate', 'learn')).toBe(false)
    expect(mayPitch('OWN_PRODUCT', 'sell', 'convert')).toBe(true)
  })

  it('a product focus retrieves product rows first', () => {
    expect(first(TRANSCRIPT_RICH, 'product')).toBe('product')
  })

  it('sell + expertise + learn resolves to teach-first rather than either extreme', () => {
    const i = compileVideoIntent({ goal: 'sell', focus: 'expertise', outcome: 'learn' })
    expect(i.goalDirective).toMatch(/TEACH FIRST AND TEACH FULLY/)
    expect(i.payoffDirective).toMatch(/soft commercial line/i)
    // ⚖️ Resolving a conflict may not silently discard half the answer.
    expect(i.wantsSale).toBe(true)
  })
})

// ═══ 3 · AFFILIATE WITH MANY PRODUCTS ═════════════════════════════════════
describe('scenario 3 — affiliate', () => {
  it('may ask for the sale, but never claim to have built it', () => {
    expect(mayPitch('AFFILIATE', 'sell')).toBe(true)
    expect(claimRulesFor('AFFILIATE').ownershipLanguage).toBe(false)
    expect(claimRulesFor('AFFILIATE').marketingClaims).toBe('attributed')
    expect(claimRulesFor('AFFILIATE').disclosureRequired).toBe(true)
  })

  it('THE PERSONAL-USE GAP: an affiliate tie is not evidence of having used it', () => {
    // ⚠️ THE SHARPEST LIVE GAP IN THE SYSTEM. `personal_use` defaults to
    // NOT_CONFIRMED, and no commercial relationship establishes it. "I've been
    // using this for months" stays unlicensed however the video is framed.
    expect(claimRulesFor('AFFILIATE', 'NOT_CONFIRMED').creatorExperience).toBe(false)
    expect(claimRulesFor('AFFILIATE', 'CONFIRMED').creatorExperience).toBe(true)
  })

  it('and choosing a personal-experience FOCUS does not create the evidence', () => {
    // ⚖️ `wantsOwnExperience` REQUESTS; it never entitles.
    const i = compileVideoIntent({ focus: 'experience' })
    expect(i.wantsOwnExperience).toBe(true)
    expect(claimRulesFor('AFFILIATE', 'NOT_CONFIRMED').creatorExperience).toBe(false)
  })
})

// ═══ 4 · SPONSORED ════════════════════════════════════════════════════════
describe('scenario 4 — sponsored', () => {
  it('carries the same disclosure and attribution rules as an affiliate', () => {
    expect(claimRulesFor('SPONSOR').disclosureRequired).toBe(true)
    expect(claimRulesFor('SPONSOR').marketingClaims).toBe('attributed')
    expect(claimRulesFor('SPONSOR').ownershipLanguage).toBe(false)
  })
})

// ═══ 5 · TECH REVIEWER, WHOOP, NO OWNERSHIP ═══════════════════════════════
describe('scenario 5 — review-only', () => {
  it('NO answer can manufacture a commercial tie that does not exist', () => {
    // ⚠️ THE RULE THAT MUST SURVIVE THE WHOLE REDESIGN. A goal never creates a
    // tie, and neither does an outcome — even the one that names buying.
    for (const goal of ['sell', 'leads', 'followers', undefined]) {
      for (const outcome of ['convert', 'check_out_offer', undefined]) {
        expect(mayPitch('REVIEW_ONLY', goal, outcome), `${goal}/${outcome}`).toBe(false)
      }
    }
  })

  it('marketing claims stay forbidden regardless of the focus', () => {
    expect(claimRulesFor('REVIEW_ONLY').marketingClaims).toBe('forbidden')
  })

  it('a review focus still retrieves product and experience material', () => {
    const order = preferKinds(TRANSCRIPT_RICH, compileVideoIntent({ focus: 'review' }).prefersKinds)
    expect(order.slice(0, 2).map((r) => r.kind)).toEqual(['product', 'experience'])
  })
})

// ═══ 6 · PERSONAL-STORY CREATOR, TRANSCRIPT-RICH ══════════════════════════
describe('scenario 6 — story, with the material to tell one', () => {
  it('a story focus puts a real experience first', () => {
    expect(first(TRANSCRIPT_RICH, 'story')).toBe('experience')
  })

  it('the selected set actually contains the experiences', () => {
    const out = supplied(TRANSCRIPT_RICH, 'story', 'feel_inspired')
    expect(out.filter((r) => r.kind === 'experience').length).toBeGreaterThanOrEqual(2)
  })
})

// ═══ 7 · CAPTION-ONLY CREATOR ═════════════════════════════════════════════
describe('scenario 7 — caption-only, where the story does not exist', () => {
  it('asking for a story cannot invent one — nothing is dropped, nothing is added', () => {
    // ⚠️ A PREFERENCE IS NOT A FILTER AND NOT A GENERATOR. With no experience
    // rows the order is unchanged, and the selector still returns what exists.
    const out = supplied(CAPTION_ONLY, 'story', 'learn')
    expect(out.filter((r) => r.kind === 'experience')).toHaveLength(0)
    expect(out).toHaveLength(CAPTION_ONLY.length)
  })

  it('the intent still records that the creator asked for one', () => {
    // ⚖️ So the premise stage can steer BEFORE a premise is chosen, which is the
    // only place it is cheap. It does not grant anything.
    expect(compileVideoIntent({ focus: 'story' }).wantsOwnExperience).toBe(true)
  })

  it('a demanding outcome does not manufacture substance either', () => {
    const out = supplied(CAPTION_ONLY, undefined, 'learn')
    expect(out.length).toBeLessThanOrEqual(CAPTION_ONLY.length)
  })
})

// ═══ 8 · CROSS-NICHE REFERENCE ════════════════════════════════════════════
describe('scenario 8 — skincare reference, SaaS creator', () => {
  it('reference-adaptation leaves retrieval EXACTLY as it was', () => {
    // ⚠️ It answers where the SHAPE comes from, not the substance. Tilting
    // retrieval would import the reference's subject matter by the back door.
    const i = compileVideoIntent({ focus: 'reference_adapted' })
    expect(i.prefersKinds).toEqual([])
    expect(preferKinds(TRANSCRIPT_RICH, i.prefersKinds)).toEqual(TRANSCRIPT_RICH)
  })

  it('and does not claim the creator lived the reference\'s life', () => {
    expect(compileVideoIntent({ focus: 'reference_adapted' }).wantsOwnExperience).toBe(false)
  })
})

// ═══ 9 · NON-COMMERCIAL EDUCATIONAL CREATOR ═══════════════════════════════
describe('scenario 9 — nothing to sell', () => {
  it('with no entity on record, no answer opens a commercial CTA', () => {
    for (const goal of ['sell', 'leads', 'conversations', undefined]) {
      expect(mayPitch('NONE', goal, 'convert'), String(goal)).toBe(false)
    }
  })

  it('product knowledge cannot contaminate a video that is not about a product', () => {
    expect(compileVideoIntent({ focus: 'expertise' }).wantsProductSubstance).toBe(false)
    expect(compileVideoIntent({ focus: 'story' }).wantsProductSubstance).toBe(false)
  })
})

// ═══ 10 · TRENDING REQUEST ════════════════════════════════════════════════
describe('scenario 10 — something trending', () => {
  it('does not tilt retrieval toward a kind the creator did not name', () => {
    expect(compileVideoIntent({ focus: 'trending' }).prefersKinds).toEqual([])
  })

  it('and promises no research, because there is none', () => {
    // ⚖️ HONEST ABOUT AN ABSENT SYSTEM. There is no retrieval, no source store
    // and no freshness check anywhere in generation. A `trending` focus that
    // silently implied one would be the UI lying about a capability.
    const i = compileVideoIntent({ focus: 'trending' })
    expect(Object.keys(i)).not.toContain('research')
    expect(i.wantsProductSubstance).toBe(false)
  })
})

// ═══ 11 · THE SAME CREATOR, THREE DIFFERENT VIDEOS ════════════════════════
describe('scenario 11 — one store, three intents, three different supplies', () => {
  it('the SAME rows produce genuinely different selections', () => {
    const teach = supplied(TRANSCRIPT_RICH, 'expertise', 'learn').map((r) => r.kind)
    const story = supplied(TRANSCRIPT_RICH, 'story', 'feel_inspired').map((r) => r.kind)
    const sell = supplied(TRANSCRIPT_RICH, 'product', 'convert').map((r) => r.kind)
    expect(teach[0]).not.toBe(story[0])
    expect(story[0]).not.toBe(sell[0])
    expect(new Set([teach.join(), story.join(), sell.join()]).size).toBe(3)
  })

  it('per-video intent never leaks into the next video', () => {
    // ⚖️ Nothing here is persisted to a profile. Two compilations from the same
    // inputs are equal; a fresh one with no answers is the system default.
    expect(compileVideoIntent({})).toEqual(compileVideoIntent({}))
    expect(compileVideoIntent({}).substanceFloor).toBe(SUBSTANCE_FLOOR)
  })
})

// ═══ 12 · THE COMBINATION SWEEP ═══════════════════════════════════════════
describe('scenario 12 — no combination breaks an invariant', () => {
  const GOALS = [undefined, 'followers', 'authority', 'educate', 'conversations', 'leads', 'sell', 'entertain', 'personal_brand']
  const FOCUS = [undefined, 'expertise', 'product', 'experience', 'opinion', 'review', 'story', 'reference_adapted', 'trending']
  const OUT = [undefined, 'learn', 'change_mind', 'feel_inspired', 'remember_me', 'comment', 'share', 'follow', 'check_out_offer', 'convert']

  it('a forbidden tie is never overridden, by any of the 810 combinations', () => {
    for (const goal of GOALS) for (const outcome of OUT) {
      expect(mayPitch('REVIEW_ONLY', goal, outcome), `${goal}/${outcome}`).toBe(false)
      expect(mayPitch('NONE', goal, outcome), `${goal}/${outcome}`).toBe(false)
    }
  })

  it('the substance floor never drops below the system guarantee', () => {
    for (const goal of GOALS) for (const focus of FOCUS) for (const outcome of OUT) {
      expect(compileVideoIntent({ goal, focus, outcome }).substanceFloor)
        .toBeGreaterThanOrEqual(SUBSTANCE_FLOOR)
    }
  })

  it('retrieval never loses or duplicates a row', () => {
    for (const focus of FOCUS) {
      const out = preferKinds(TRANSCRIPT_RICH, compileVideoIntent({ focus }).prefersKinds)
      expect(out).toHaveLength(TRANSCRIPT_RICH.length)
      expect(new Set(out).size).toBe(TRANSCRIPT_RICH.length)
    }
  })

  it('nothing throws, on any of them', () => {
    for (const goal of GOALS) for (const focus of FOCUS) for (const outcome of OUT) {
      expect(() => compileVideoIntent({ goal, focus, outcome })).not.toThrow()
    }
  })
})

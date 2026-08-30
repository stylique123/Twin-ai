// SIX QUESTIONS, AND THE LAST TWO ONLY FOR THE PEOPLE THEY DESCRIBE.
//
// ⚠️ EVERY CREATOR WAS ASKED ABOUT SCREEN RECORDINGS AND PRODUCTS ON CAMERA. A
// fitness creator with nothing to sell got both, and neither could ever bear on
// their videos. That is worse than a missing question: it teaches somebody the
// questions are not serious, which is how the one that mattered gets skipped.
//
// ⚖️ AND THE COMMON ANSWER IS "SOMETIMES". A yes/no pair had no way to express
// it, so honest sometimes-answers were pushed into whichever lie was cheaper —
// and a script built on a shot somebody can SOMETIMES get is a script that
// sometimes cannot be filmed.
import { describe, expect, it } from 'vitest'
import {
  asksScreenCapability, asksProductCapability, asksOwnProductKind, asksOwnServiceKind,
  profileQuestionsFor, compileCreatorProfile, mayDependOn, maySuggest, onlyNone,
  MAX_CONTENT_GOALS, AUDIENCE_SEGMENTS, AUDIENCE_KNOWLEDGE, AUDIENCE_LINE, KNOWLEDGE_LINE,
  type CreatorProfileAnswers,
} from '../creatorProfileQuestions'

/** The five worked examples, written as the answers a person would give. */
const SAAS_FOUNDER: CreatorProfileAnswers = {
  workKind: 'founder', audience: 'founders', audienceKnowledge: 'beginners',
  contentGoals: ['authority', 'leads'],
  desiredFormats: ['founder', 'educational', 'product', 'opinion'],
  commercialTies: ['own_product'], ownProductKind: 'software',
}
const FITNESS_CREATOR: CreatorProfileAnswers = {
  workKind: 'creator', audience: 'consumers', audienceKnowledge: 'beginners',
  contentGoals: ['followers', 'educate'],
  desiredFormats: ['talking_head', 'educational', 'opinion', 'story'],
  commercialTies: ['none'],
}
const AFFILIATE_CREATOR: CreatorProfileAnswers = {
  workKind: 'creator', audience: 'professionals',
  contentGoals: ['followers', 'sell'],
  desiredFormats: ['review', 'talking_head', 'trend'],
  commercialTies: ['affiliate', 'review'],
}
const CONSULTANT: CreatorProfileAnswers = {
  workKind: 'coach', audience: 'founders',
  contentGoals: ['authority', 'leads'],
  desiredFormats: ['educational', 'talking_head', 'story', 'opinion'],
  commercialTies: ['own_service'], ownServiceKind: 'consulting',
}
const ECOMMERCE: CreatorProfileAnswers = {
  workKind: 'ecommerce', audience: 'consumers',
  contentGoals: ['followers', 'sell'],
  desiredFormats: ['product', 'educational', 'review', 'talking_head'],
  commercialTies: ['own_product'], ownProductKind: 'physical',
}

describe('the SaaS founder is asked about a screen, not about holding it up', () => {
  it('asks the screen question', () => {
    expect(asksScreenCapability(SAAS_FOUNDER)).toBe(true)
  })
  it('does NOT ask them to hold software up to the camera', () => {
    // ⚠️ Software is shown on a screen. Asking someone to point a phone at their
    // SaaS is the kind of question that discredits the whole set.
    expect(asksProductCapability(SAAS_FOUNDER)).toBe(false)
  })
  it('asks what kind of product it is, because that is what decided the above', () => {
    expect(asksOwnProductKind(SAAS_FOUNDER)).toBe(true)
    expect(asksOwnServiceKind(SAAS_FOUNDER)).toBe(false)
  })
})

describe('the fitness creator with nothing to sell is asked five questions and left alone', () => {
  it('is asked NEITHER capability question', () => {
    expect(asksScreenCapability(FITNESS_CREATOR)).toBe(false)
    expect(asksProductCapability(FITNESS_CREATOR)).toBe(false)
  })
  it('so the fifth question does not exist for them', () => {
    // ⚠️ TWO, NOT FIVE, AND THIS TEST'S POINT IS SHARPER FOR IT. `desiredFormats`
    // moved to a Gallery filter (D7); then `workKind`, `audience` and the
    // commercial question merged into the single `whoYouAre` screen. A fitness
    // creator with nothing to sell now answers TWO screens and is left alone —
    // which is exactly what "nobody is interrogated about what they do not
    // have" was always asking for.
    expect(profileQuestionsFor(FITNESS_CREATOR)).toHaveLength(2)
    expect(profileQuestionsFor(FITNESS_CREATOR)).not.toContain('capabilities')
    expect(profileQuestionsFor(FITNESS_CREATOR)).not.toContain('desiredFormats')
  })
  it('and no product or service follow-up appears', () => {
    expect(asksOwnProductKind(FITNESS_CREATOR)).toBe(false)
    expect(asksOwnServiceKind(FITNESS_CREATOR)).toBe(false)
  })
})

describe('the reviewer owns nothing and still needs both', () => {
  it('is asked to show products, because affiliate and review both put objects in hands', () => {
    expect(asksProductCapability(AFFILIATE_CREATOR)).toBe(true)
  })
  it('is asked about a screen, because reviewing is demonstrating', () => {
    // ⚖️ THE ROUTE THAT AN OWNERSHIP-ONLY RULE WOULD MISS. A reviewer of apps
    // owns no software and records more screens than most founders.
    expect(asksScreenCapability(AFFILIATE_CREATOR)).toBe(true)
  })
})

describe('the consultant sells expertise, so nothing is filmed', () => {
  it('is asked neither', () => {
    expect(asksScreenCapability(CONSULTANT)).toBe(false)
    expect(asksProductCapability(CONSULTANT)).toBe(false)
  })
  it('is asked which kind of service, and never which kind of product', () => {
    expect(asksOwnServiceKind(CONSULTANT)).toBe(true)
    expect(asksOwnProductKind(CONSULTANT)).toBe(false)
  })
})

describe('the ecommerce founder has an object', () => {
  it('is asked to show it', () => {
    expect(asksProductCapability(ECOMMERCE)).toBe(true)
  })
  it('is asked about a screen too, because they want product and review videos', () => {
    expect(asksScreenCapability(ECOMMERCE)).toBe(true)
  })
})

describe('silence is not an answer, in either direction', () => {
  it('an empty commercial list does not read as "nothing to sell"', () => {
    // ⚠️ Suppressing on silence would skip question six for everyone who simply
    // had not tapped yet.
    expect(onlyNone({ commercialTies: [] })).toBe(false)
    expect(onlyNone({})).toBe(false)
    expect(onlyNone({ commercialTies: ['none'] })).toBe(true)
  })

  it('"none" alongside a real tie is not "none"', () => {
    expect(onlyNone({ commercialTies: ['none', 'affiliate'] })).toBe(false)
  })

  it('an unanswered capability is never a refusal', () => {
    // ⚖️ THE ASYMMETRY THAT MATTERS. Unanswered withholds the guarantee without
    // asserting the refusal: nothing may DEPEND on it, but it may be offered.
    expect(mayDependOn(null)).toBe(false)
    expect(maySuggest(null)).toBe(true)
    expect(compileCreatorProfile({}).screen).toBeNull()
    expect(compileCreatorProfile({}).product).toBeNull()
  })

  it('"sometimes" may be suggested and never depended on', () => {
    expect(mayDependOn('sometimes')).toBe(false)
    expect(maySuggest('sometimes')).toBe(true)
    expect(mayDependOn('yes')).toBe(true)
    expect(maySuggest('no')).toBe(false)
  })
})

describe('the answers change what the writer is given', () => {
  it('turns an audience into an addressee and a depth rule', () => {
    const d = compileCreatorProfile(SAAS_FOUNDER)
    expect(d.audienceLine).toBe(AUDIENCE_LINE.founders)
    expect(d.knowledgeLine).toBe(KNOWLEDGE_LINE.beginners)
  })

  it('constrains SUBSTANCE rather than tone', () => {
    // ⚖️ The measured rule in this codebase: changing what reaches the writer
    // works, changing how it is instructed does not. So the depth lines say what
    // a beat may CONTAIN, not how it should sound.
    for (const line of Object.values(KNOWLEDGE_LINE)) {
      expect(line).not.toMatch(/\b(tone|friendly|casual|energetic|punchy)\b/i)
    }
  })

  it('keeps at most two goals, without discarding the answer', () => {
    const d = compileCreatorProfile({ contentGoals: ['authority', 'leads', 'sell'] })
    expect(d.goals).toEqual(['authority', 'leads'])
    expect(d.resolutions.join(' ')).toMatch(/first 2 kept/)
    expect(MAX_CONTENT_GOALS).toBe(2)
  })

  it('treats "let Twin recommend" as declining to constrain, not as a format', () => {
    // ⚠️ A pass-through would record a preference for a format called
    // "recommend", which no scene can be.
    const d = compileCreatorProfile({ desiredFormats: ['recommend'] })
    expect(d.prefersFormats).toEqual([])
    expect(d.resolutions.join(' ')).toMatch(/no format preference/)
  })

  it('lets exploration decide whether Twin may leave what it observed', () => {
    expect(compileCreatorProfile({ formatExploration: 'stay_close' }).exploresBeyondObserved).toBe(false)
    expect(compileCreatorProfile({ formatExploration: 'try_new' }).exploresBeyondObserved).toBe(true)
    expect(compileCreatorProfile({ formatExploration: 'fit_goals' }).exploresBeyondObserved).toBe(true)
  })

  it('gives every audience and every knowledge level a line', () => {
    // ⚖️ A missing entry would silently address somebody as nobody.
    for (const s of AUDIENCE_SEGMENTS) expect(AUDIENCE_LINE[s], s).toBeTruthy()
    for (const k of AUDIENCE_KNOWLEDGE) expect(KNOWLEDGE_LINE[k], k).toBeTruthy()
  })
})

// A PREFILL IS WORSE THAN A BLANK BOX WHEN IT IS WRONG.
//
// The three story questions are the only guarantee that a new creator's store
// is not empty, and an empty store is what produced a famous influencer's
// framework and CTA in a creator's mouth in four live runs. Confirming an
// extracted item instead of asking is a real saving — but only while the item
// genuinely fills the slot. A mis-slotted suggestion gets confirmed WITHOUT
// BEING READ, and the writer then treats somebody else's claim as this
// creator's own lived experience. That is a worse outcome than the blank box.
//
// So these tests pin the honest ceiling of the current store, measured on
// production: `expensive_lesson` and `contrarian` CANNOT be filled from
// anything `creator_knowledge` records, and only `best_result` can.
import { describe, expect, it } from 'vitest'
import {
  suggestStoryAnswers, SUGGESTIBLE_SLOTS, CREATOR_QUESTIONS, OPENING_THREE,
  ANSWER_MAX, ANSWER_MIN, type CreatorQuestion, type StoredKnowledgeItem,
} from '../index'

const Q: CreatorQuestion[] = OPENING_THREE
  .map((id) => CREATOR_QUESTIONS.find((x) => x.id === id))
  .filter((q): q is CreatorQuestion => !!q)

function spoken(kind: string, text: string, extra: Partial<StoredKnowledgeItem> = {}): StoredKnowledgeItem {
  return { kind, text, basis: 'stated', source: 'transcript', ...extra }
}

// Verbatim rows from the production store on 2026-08-30.
const REAL_RESULT = spoken('experience', 'Sold a black Birkin bag for £13,500 in roughly 40 seconds by posting a single Instagram story.')
const REAL_EXPERIENCES = [
  spoken('experience', 'Currently works at Microsoft.'),
  spoken('experience', 'Admits to not having a personal skincare routine.'),
  spoken('experience', 'Spends time talking with 70 to 90-year-old strangers to understand their life perspectives.'),
]
const REAL_OPINIONS = [
  spoken('opinion', 'Believes Pakistani chai is better than coffee.'),
  spoken('opinion', 'True success is defined by achieving inner peace rather than accumulating wealth.'),
  spoken('opinion', 'Elderly people focus on love and family rather than day-to-day worries, proving that most current career or situational stressors are manageable.'),
]

describe('the two slots the store cannot fill stay blank', () => {
  it('never prefills expensive_lesson, because an experience is not a lesson', () => {
    // Of 69 stated `experience` items in production, ONE carried any marker of
    // cost, loss, mistake or regret. The extractor writes flat biography.
    const out = suggestStoryAnswers(Q, [...REAL_EXPERIENCES, REAL_RESULT])
    expect(out.expensive_lesson).toBeUndefined()
  })

  it('never prefills contrarian, because an opinion is not a contradiction', () => {
    // Of 129 stated `opinion` items, ZERO named a consensus and disagreed with
    // it. "Rather than" is a comparison, not a fight with what everyone thinks.
    const out = suggestStoryAnswers(Q, REAL_OPINIONS)
    expect(out.contrarian).toBeUndefined()
  })

  it('says out loud which slots it will ever fill', () => {
    expect([...SUGGESTIBLE_SLOTS]).toEqual(['best_result'])
  })
})

describe('best_result is suggested only when it is really a result', () => {
  it('offers the creator their own figure back', () => {
    const out = suggestStoryAnswers(Q, [REAL_RESULT])
    expect(out.best_result?.text).toContain('£13,500')
    expect(out.best_result?.questionId).toBe('best_result')
  })

  it('refuses a number with no achievement behind it', () => {
    const out = suggestStoryAnswers(Q, [spoken('experience', 'Worked in a liquor store at the age of 33.')])
    expect(out.best_result).toBeUndefined()
  })

  it('refuses somebody else s result, which is the failure this product exists to stop', () => {
    const out = suggestStoryAnswers(Q, [
      spoken('claim', 'The Early app grew from zero to over $50,000 a month in revenue within its first four months.'),
      spoken('experience', 'Invested $500,000 in an 18-year-old entrepreneur who had built a $30 million per year e-commerce business.'),
    ])
    expect(out.best_result).toBeUndefined()
  })
})

describe('only material the creator actually said may be offered back', () => {
  it('ignores captions, which never attested anything', () => {
    const caption = { kind: 'claim', text: REAL_RESULT.text, basis: 'demonstrated', source: 'caption' }
    expect(suggestStoryAnswers(Q, [caption]).best_result).toBeUndefined()
  })

  it('ignores what the creator already answered, so nobody is asked to agree with themselves', () => {
    const own = { ...REAL_RESULT, source_ref: 'asked:best_result' }
    expect(suggestStoryAnswers(Q, [own]).best_result).toBeUndefined()
  })
})

describe('a suggestion must survive the write it is heading for', () => {
  it('never offers a line answerToKnowledge would refuse', () => {
    const tooLong = spoken('experience', `Sold ${'x'.repeat(ANSWER_MAX + 40)} and generated 500 sales`)
    const tooShort = spoken('experience', 'Sold 5.')
    const out = suggestStoryAnswers(Q, [tooLong, tooShort])
    expect(out.best_result).toBeUndefined()
    const ok = suggestStoryAnswers(Q, [REAL_RESULT]).best_result!
    expect(ok.text.length).toBeGreaterThanOrEqual(ANSWER_MIN)
    expect(ok.text.length).toBeLessThanOrEqual(ANSWER_MAX)
  })
})

describe('a discarded suggestion does not come straight back', () => {
  it('returns nothing for a slot the creator already rejected', () => {
    const out = suggestStoryAnswers(Q, [REAL_RESULT], { discarded: ['best_result'] })
    expect(out.best_result).toBeUndefined()
  })
})

describe('the empty store is the normal case, not an error', () => {
  it('suggests nothing at all for a caption-only creator', () => {
    // The creator who most needs the three questions still gets all three.
    expect(suggestStoryAnswers(Q, [])).toEqual({})
  })
})

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
// So these tests pin the honest ceiling, measured on production.
//
// ⚠️ AND THE CEILING MOVED FOR ONE REASON ONLY: THE EXTRACTOR NOW RECORDS TWO
// FIELDS IT NEVER USED TO. `cost` and `consensus` are asked for by name in
// `KNOWLEDGE_SYSTEM` and written only from speech. The heuristic did NOT get
// looser — every test below that pinned the old refusals is UNCHANGED and still
// passes, because the real production rows carry neither field and are still
// refused on exactly the grounds they always were. What is new is that a row
// which DOES carry one can now be offered.
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

describe('the two slots the OLD store could not fill still stay blank', () => {
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
    expect([...SUGGESTIBLE_SLOTS]).toEqual(['best_result', 'expensive_lesson', 'contrarian'])
  })

  // ⚖️ THE PARITY THAT KEEPS THE LIST HONEST. `SUGGESTIBLE_SLOTS` is a claim
  // about behaviour, and a claim nothing checks is a comment. Every slot named
  // there must actually be fillable by some input, and no slot outside it may
  // ever be filled — so adding a name without a branch, or a branch without a
  // name, fails here.
  it('fills every slot it names and no slot it does not', () => {
    const filled = new Set<string>()
    for (const item of [REAL_RESULT, LESSON_WITH_A_PRICE, STANCE_WITH_A_CONSENSUS]) {
      for (const k of Object.keys(suggestStoryAnswers(Q, [item]))) filled.add(k)
    }
    expect([...filled].sort()).toEqual([...SUGGESTIBLE_SLOTS].sort())
  })
})

// ── THE TWO FIELDS THE EXTRACTOR NOW RECORDS ──────────────────────────────
//
// These rows are NOT from production — no scan has run against the new prompt
// yet, so no such row exists. They are the CONTRACT the prompt is written to
// produce, frozen here so that the day a real scan lands, the difference
// between "the extractor did not fill the field" and "the reader ignored it" is
// already decided.

const LESSON_WITH_A_PRICE = spoken(
  'experience',
  'Bought forty thousand dollars of inventory before a single person had asked for it',
  { cost: '$40,000 and eight months of runway' },
)
const STANCE_WITH_A_CONSENSUS = spoken(
  'opinion',
  'You can sell to two hundred people who trust you',
  { consensus: 'you need ten thousand followers before you can sell anything' },
)

describe('a recorded cost makes a lesson, and nothing else does', () => {
  it('offers the lesson with its price rejoined', () => {
    const out = suggestStoryAnswers(Q, [LESSON_WITH_A_PRICE])
    expect(out.expensive_lesson?.questionId).toBe('expensive_lesson')
    expect(out.expensive_lesson?.text).toContain('$40,000')
    // The creator's own sentence survives verbatim inside the offer.
    expect(out.expensive_lesson?.text).toContain('forty thousand dollars of inventory')
  })

  it('refuses the same sentence when no cost was recorded', () => {
    const { cost: _dropped, ...noCost } = LESSON_WITH_A_PRICE
    expect(suggestStoryAnswers(Q, [noCost]).expensive_lesson).toBeUndefined()
  })

  it('treats a blank cost as not recorded, never as a cost of nothing', () => {
    for (const blank of ['', '   ', null, undefined]) {
      const row = { ...LESSON_WITH_A_PRICE, cost: blank as string | null | undefined }
      expect(suggestStoryAnswers(Q, [row]).expensive_lesson).toBeUndefined()
    }
  })

  it('refuses a cost on a kind that is not an experience', () => {
    const row = { ...LESSON_WITH_A_PRICE, kind: 'topic' }
    expect(suggestStoryAnswers(Q, [row]).expensive_lesson).toBeUndefined()
  })

  it('refuses a lesson that cost somebody else', () => {
    const row = { ...LESSON_WITH_A_PRICE, cost: 'his client $40,000' }
    expect(suggestStoryAnswers(Q, [row]).expensive_lesson).toBeUndefined()
  })
})

describe('a recorded consensus makes a stance, and nothing else does', () => {
  it('offers both halves, in the order the question asks for them', () => {
    const out = suggestStoryAnswers(Q, [STANCE_WITH_A_CONSENSUS])
    expect(out.contrarian?.questionId).toBe('contrarian')
    // What they believe, then what the creator believes instead.
    const text = out.contrarian!.text
    expect(text.indexOf('ten thousand followers')).toBeLessThan(text.indexOf('two hundred people'))
  })

  it('refuses the same stance when no consensus was named', () => {
    const { consensus: _dropped, ...bare } = STANCE_WITH_A_CONSENSUS
    expect(suggestStoryAnswers(Q, [bare]).contrarian).toBeUndefined()
  })

  it('treats a blank consensus as never named, never as arguing with nobody', () => {
    for (const blank of ['', '  ', null, undefined]) {
      const row = { ...STANCE_WITH_A_CONSENSUS, consensus: blank as string | null | undefined }
      expect(suggestStoryAnswers(Q, [row]).contrarian).toBeUndefined()
    }
  })

  it("refuses a stance whose opposition is somebody else's business", () => {
    // ⚠️ THE SAME EXCLUSION AS `best_result`, APPLIED TO THE NEW HALF. If the
    // recorded consensus is about a named third party's client or app,
    // confirming it hands the writer somebody else's fight as this creator's —
    // the failure the whole column exists to prevent.
    const row = { ...STANCE_WITH_A_CONSENSUS, consensus: 'his client should have invested in ads' }
    expect(suggestStoryAnswers(Q, [row]).contrarian).toBeUndefined()
  })

  it('refuses a consensus on a kind that is not an opinion', () => {
    const row = { ...STANCE_WITH_A_CONSENSUS, kind: 'covered' }
    expect(suggestStoryAnswers(Q, [row]).contrarian).toBeUndefined()
  })
})

describe('the new fields obey every guard the old slot already obeyed', () => {
  it('will not offer either from a caption, which attested nothing', () => {
    const c1 = { ...LESSON_WITH_A_PRICE, basis: 'demonstrated', source: 'caption' }
    const c2 = { ...STANCE_WITH_A_CONSENSUS, basis: 'demonstrated', source: 'caption' }
    const out = suggestStoryAnswers(Q, [c1, c2])
    expect(out.expensive_lesson).toBeUndefined()
    expect(out.contrarian).toBeUndefined()
  })

  it('will not offer either from an inferred row', () => {
    const i1 = { ...LESSON_WITH_A_PRICE, basis: 'inferred' }
    const i2 = { ...STANCE_WITH_A_CONSENSUS, basis: 'inferred' }
    const out = suggestStoryAnswers(Q, [i1, i2])
    expect(out.expensive_lesson).toBeUndefined()
    expect(out.contrarian).toBeUndefined()
  })

  it('will not hand back what the creator already answered', () => {
    const a1 = { ...LESSON_WITH_A_PRICE, source_ref: 'asked:expensive_lesson' }
    const a2 = { ...STANCE_WITH_A_CONSENSUS, source_ref: 'asked:contrarian' }
    const out = suggestStoryAnswers(Q, [a1, a2])
    expect(out.expensive_lesson).toBeUndefined()
    expect(out.contrarian).toBeUndefined()
  })

  it('respects a discard on either new slot', () => {
    const out = suggestStoryAnswers(Q, [LESSON_WITH_A_PRICE, STANCE_WITH_A_CONSENSUS],
      { discarded: ['expensive_lesson', 'contrarian'] })
    expect(out.expensive_lesson).toBeUndefined()
    expect(out.contrarian).toBeUndefined()
  })

  it('never offers a composed line the write would refuse', () => {
    // ⚠️ THE COMPOSED LINE IS WHAT GETS STORED, so the length guard must be
    // applied to the JOIN and not to the text alone. Each half fits; together
    // they do not, and the honest answer is a blank box.
    const long = spoken('experience', 'a'.repeat(ANSWER_MAX - 20), { cost: 'b'.repeat(ANSWER_MAX - 20) })
    const out = suggestStoryAnswers(Q, [long])
    expect(out.expensive_lesson).toBeUndefined()
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

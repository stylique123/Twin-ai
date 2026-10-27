import { describe, it, expect } from 'vitest'
import { planQuestionsForAngle, questionCandidates, answerFactRow, ladderQuestion, PROBLEM_QUESTION_KEY, PROBLEM_QUESTION_TEXT, questionBreaksRules } from '../questionUsefulness'
import { MISSING_PROBLEM_QUESTION } from '../planner/spineComplete'
import { ANGLE_SPECS } from '../angleFit'
import { validateLadderQuestion } from '../questionLadder'

// Fictional fixtures only: Juniper Candle Co., a made-up candle maker.
const base = { angle: 'moment', angleNeeds: ANGLE_SPECS.moment.needs, hasProduct: true, entityKey: 'product:p1' }

describe('ladder off (default): nothing changes', () => {
  it('same questions with and without an off ladder / problem block', () => {
    const a = planQuestionsForAngle({ ...base, onFile: [] })
    const b = planQuestionsForAngle({ ...base, onFile: [], ladder: { on: false, topic: 'candles' }, problem: { on: false, onFile: false } })
    expect(b).toEqual(a)
    expect(a.map((q) => q.key)).toEqual(['mn:story'])
  })
})

describe('ladder on (#1148 connected)', () => {
  it('no story on file: asks the level-0 door anchored in the topic, same skip key', () => {
    const qs = planQuestionsForAngle({ ...base, onFile: [], ladder: { on: true, topic: 'soy candles' } })
    expect(qs[0]!.key).toBe('mn:story')
    expect(qs[0]!.text).toContain('soy candles')
    expect(qs[0]!.text).toMatch(/If so/)
  })
  it('no topic: falls back to the fixed story template', () => {
    const qs = planQuestionsForAngle({ ...base, onFile: [], ladder: { on: true } })
    expect(qs[0]!.text).toMatch(/moment with this/)
  })
  it('story on file: climbs to the next beat (turn first), anchored in her words', () => {
    const anchor = 'I burned my first batch in a cold garage'
    const qs = planQuestionsForAngle({ ...base, onFile: ['story'], ladder: { on: true, storyId: 'k1', anchor, have: [1, 2], topic: 'candles', herWords: anchor } })
    expect(qs[0]!.key).toBe('mn:ladder:k1:3')
    expect(qs[0]!.piece).toBe('story.turn')
    expect(qs[0]!.text).toMatch(/what did you do next/)
  })
  it('turn known: asks the resolution as a follow-up', () => {
    const anchor = 'I burned my first batch in a cold garage'
    const q = ladderQuestion({ ...base, onFile: ['story'], ladder: { on: true, storyId: 'k1', anchor, have: [1, 2, 3], herWords: anchor } }, true, false)
    expect(q?.level).toBe(4)
    expect(q?.key).toBe('mn:ladder:k1:4')
    // The plain presume rule would block it; the ladder path keeps it.
    expect(questionBreaksRules(q!.text)).toBe(true)
    expect(planQuestionsForAngle({ ...base, onFile: ['story'], ladder: { on: true, storyId: 'k1', anchor, have: [1, 2, 3], herWords: anchor } })[0]!.key).toBe('mn:ladder:k1:4')
  })
  it('complete story: no ladder question', () => {
    expect(ladderQuestion({ ...base, onFile: ['story'], ladder: { on: true, anchor: 'x y z', have: [1, 2, 3, 4, 5] } }, true, false)).toBeNull()
  })
  it('angle without a story need: no ladder question', () => {
    expect(ladderQuestion({ ...base, angle: 'stand', angleNeeds: ANGLE_SPECS.stand.needs, onFile: [], ladder: { on: true, topic: 'wicks' } }, false, false)).toBeNull()
  })
  it('a question that fails validateLadderQuestion is dropped (duplicate)', () => {
    const anchor = 'I burned my first batch in a cold garage'
    const ladder = { on: true, storyId: 'k1', anchor, have: [1, 2] as const, herWords: anchor }
    const first = ladderQuestion({ ...base, onFile: ['story'], ladder: { ...ladder, have: [1, 2] } }, true, false)!
    expect(validateLadderQuestion(first.text, { herWords: anchor, topic: '', asked: [] }).ok).toBe(true)
    expect(ladderQuestion({ ...base, onFile: ['story'], ladder: { ...ladder, have: [1, 2] }, askedTexts: [first.text] }, true, false)).toBeNull()
  })
  it('a meaning-duplicate of an earlier question is never asked again', () => {
    const qs = planQuestionsForAngle({ ...base, angle: 'myth', angleNeeds: ANGLE_SPECS.myth.needs, onFile: [], ladder: { on: true },
      askedTexts: ['Is there something most people in your space say that you disagree with?'] })
    expect(qs.map((q) => q.piece)).not.toContain('stance')
  })
  it('a ladder answer is saved as her experience', () => {
    const row = answerFactRow({ ownerId: 'u1', key: 'mn:ladder:k1:3', piece: 'story.turn', answer: 'I moved the pots inside and started over.', now: '2026-10-26T00:00:00Z' })
    expect(row?.kind).toBe('experience')
    expect(row?.source_ref).toBe('asked:mn:ladder:k1:3')
  })
})

describe('missing-problem question before writing', () => {
  it('uses the same words as the post-draft question', () => {
    expect(PROBLEM_QUESTION_TEXT).toBe(MISSING_PROBLEM_QUESTION.text)
  })
  it('asked when on and no problem line is on file', () => {
    const qs = planQuestionsForAngle({ ...base, angle: 'answer', angleNeeds: ANGLE_SPECS.answer.needs, onFile: ['objection', 'context'], problem: { on: true, onFile: false } })
    expect(qs.map((q) => q.key)).toContain(PROBLEM_QUESTION_KEY)
    expect(qs.find((q) => q.key === PROBLEM_QUESTION_KEY)!.kind).toBe('product_slot')
  })
  it('not asked when a problem line is on file, when off, or after a skip', () => {
    const i = { ...base, angle: 'answer', angleNeeds: ANGLE_SPECS.answer.needs, onFile: ['objection', 'context'] as const }
    expect(questionCandidates({ ...i, onFile: [...i.onFile], problem: { on: true, onFile: true } }).map((q) => q.key)).not.toContain(PROBLEM_QUESTION_KEY)
    expect(questionCandidates({ ...i, onFile: [...i.onFile] }).map((q) => q.key)).not.toContain(PROBLEM_QUESTION_KEY)
    expect(planQuestionsForAngle({ ...i, onFile: [...i.onFile], problem: { on: true, onFile: false }, skippedKeys: [PROBLEM_QUESTION_KEY] }).map((q) => q.key)).not.toContain(PROBLEM_QUESTION_KEY)
  })
  it('the key passes the server key rule and never breaks the question rules', () => {
    expect(/^mn:[a-z0-9:_-]+$/i.test(PROBLEM_QUESTION_KEY)).toBe(true)
    expect(questionBreaksRules(PROBLEM_QUESTION_TEXT)).toBe(false)
  })
  it('a problem answer is saved as her claim; a skip saves nothing', () => {
    expect(answerFactRow({ ownerId: 'u1', key: PROBLEM_QUESTION_KEY, piece: 'problem', answer: 'Candles that tunnel after one burn.', now: 'n' })?.kind).toBe('claim')
    expect(answerFactRow({ ownerId: 'u1', key: PROBLEM_QUESTION_KEY, piece: 'problem', answer: 'skip', now: 'n' })).toBeNull()
  })
})

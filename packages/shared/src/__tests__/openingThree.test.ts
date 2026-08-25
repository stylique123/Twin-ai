import { describe, it, expect } from 'vitest'
import { CREATOR_QUESTIONS, OPENING_THREE, ANSWER_MAX } from '../creatorQuestions'

describe('the three asked at signup', () => {
  it('every id names a question that exists', () => {
    for (const id of OPENING_THREE) {
      expect(CREATOR_QUESTIONS.some((q) => q.id === id), `${id} is not in the catalogue`).toBe(true)
    }
  })

  // ⚠️ EXPERIENCE IS THE PREDICTOR, and it is the kind captions have never once
  // produced. If this trio stopped containing one, signup would go back to
  // asking only categories.
  it('at least two are experiences', () => {
    const kinds = OPENING_THREE.map((id) => CREATOR_QUESTIONS.find((q) => q.id === id)?.kind)
    expect(kinds.filter((k) => k === 'experience').length).toBeGreaterThanOrEqual(2)
  })

  // ⚖️ THREE, NOT SIX. The wait is real but it is not long, and a question
  // nobody answers is worth less than one they do.
  it('is exactly three', () => {
    expect(OPENING_THREE.length).toBe(3)
  })

  it('has no duplicates', () => {
    expect(new Set(OPENING_THREE).size).toBe(OPENING_THREE.length)
  })

  // ⚠️ THE OPINION GOES LAST. It is the hardest to answer cold and the easiest
  // to skip, so it sits where a skip costs the least.
  it('ends on the opinion', () => {
    const last = CREATOR_QUESTIONS.find((q) => q.id === OPENING_THREE[OPENING_THREE.length - 1])
    expect(last?.kind).toBe('opinion')
  })

  // ⚖️ PLAIN ENGLISH, AND EACH ONE ANSWERABLE WITHOUT MARKETING VOCABULARY.
  it.each([...OPENING_THREE])('%s reads as a plain question with a hint', (id) => {
    const q = CREATOR_QUESTIONS.find((x) => x.id === id)!
    expect(q.ask).toMatch(/\?$/)
    expect(q.ask.length).toBeLessThan(ANSWER_MAX)
    expect(q.hint.length).toBeGreaterThan(10)
    // ⚠️ WORD-BOUNDED, BECAUSE "beats" IS ORDINARY ENGLISH. The first version of
    // this matched the substring `beat` and flagged the hint
    // '"£13,500 in about 40 seconds" beats "great results"' — which is exactly
    // the plain speech this rule exists to protect. THE TEST WAS WRONG.
    expect(`${q.ask} ${q.hint}`.toLowerCase())
      .not.toMatch(/\b(substance|entity|blueprint|beat|dna|pipeline)\b/)
  })
})

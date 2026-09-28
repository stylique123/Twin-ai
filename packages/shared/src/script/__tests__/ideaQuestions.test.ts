import { describe, expect, it } from 'vitest'
import { cleanIdeaRead } from '../ideaQuestions'

const para = 'Every batch of our house blend tastes a little different, and people ask me why. I roast to order in small batches.'

describe('Idea Mode questions (coffee report 2.1)', () => {
  it('keeps questions that quote her paragraph and ask for a moment or fact', () => {
    const r = cleanIdeaRead({ enough: false, purpose: 'conversations', confidence: 0.8, signal: 'people ask me why',
      questions: [
        { quote: 'tastes a little different', question: 'Think of one batch where you noticed it: what was different in the cup?' },
        { quote: 'something she never said', question: 'What happened next?' },
        { quote: 'house blend', question: 'What feeling should viewers leave with?' },
        { quote: 'roast to order', question: 'What does roast to order look like in your week' },
      ] }, para)
    expect(r.questions.map((q) => q.quote)).toEqual(['tastes a little different'])
    expect(r.purpose?.value).toBe('conversations')
  })
  it('returns none when the paragraph is rich enough', () => {
    expect(cleanIdeaRead({ enough: true, questions: [{ quote: 'house blend', question: 'Which blend?' }], purpose: 'educate', confidence: 0.9 }, para).questions).toEqual([])
  })
  it('never infers a commercial purpose without her words behind it, or at low confidence', () => {
    expect(cleanIdeaRead({ enough: true, questions: [], purpose: 'sell', confidence: 0.9, signal: 'buy now' }, para).purpose).toBeNull()
    expect(cleanIdeaRead({ enough: true, questions: [], purpose: 'educate', confidence: 0.3 }, para).purpose).toBeNull()
    expect(cleanIdeaRead(null, para)).toEqual({ questions: [], purpose: null })
  })
})

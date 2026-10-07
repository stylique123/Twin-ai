import { describe, it, expect } from 'vitest'
import { nextBeat, ladderTemplate, validateLadderQuestion, isDuplicateQuestion } from '../questionLadder.js'

// Fictional creator (Maya's Coffee).
const HER = "I skipped testing a new supplier's beans and had to toss the whole lot."

describe('question ladder', () => {
  it('asks the turn first, resolution only after the turn, stops when complete', () => {
    expect(nextBeat({ storyId: 's', anchor: HER, have: [1, 2] })).toBe(3)
    expect(nextBeat({ storyId: 's', anchor: HER, have: [1, 2, 3] })).toBe(4)
    expect(nextBeat({ storyId: 's', anchor: HER, have: [1, 2, 3, 4, 5] })).toBeNull()
    expect(nextBeat({ storyId: 's', anchor: '', have: [] })).toBe(0)
  })
  it('templates are anchored in her words and pass validation', () => {
    for (const l of [0, 1, 2, 3, 5] as const) {
      const q = ladderTemplate(l, HER, 'testing new beans')
      expect(validateLadderQuestion(q, { herWords: HER, topic: 'testing new beans', asked: [], followUp: l === 5 }).reasons).toEqual([])
    }
  })
  it('refuses hypotheticals, presumption, new details, unraised sensitive topics and repeats', () => {
    const ctx = { herWords: HER, topic: 'testing new beans', asked: ['After you tossed the whole lot, what did you do next?'] }
    expect(validateLadderQuestion('Imagine your supplier lied. What would you do?', ctx).ok).toBe(false)
    expect(validateLadderQuestion('How scared were you when the beans ruined your launch?', ctx).reasons).toContain('presumes')
    expect(validateLadderQuestion('Did your supplier in Medellin charge you 400 dollars for the beans?', ctx).reasons).toContain('adds_detail')
    expect(validateLadderQuestion('Did that beans problem affect your health?', ctx).reasons).toContain('sensitive_not_hers')
    expect(isDuplicateQuestion('After you tossed the whole lot, what did you do next?', ctx.asked)).toBe(true)
  })
})

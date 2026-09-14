// EVERY OBJECTIVE ASKS ITS OWN QUESTION, OR THREE OF THEM WRITE THE SAME SCRIPT.
//
// ⚠️ MEASURED IN THE TWO-SESSION AUDIT. Three objectives had no question of
// their own and fell back to the generic claims wording. The audit's finding:
// "the three unwired ones produced identical scripts -- with no objective
// question and no product facts, there is nothing to differentiate them."
//
// ⚖️ THE FALLBACK IS NOT A BUG, AND THIS IS NOT ABOUT REMOVING IT.
// `objectiveQuestion` returning null lets the caller ask a real generic question
// rather than a blank, and that stays. What is wrong is a goal RELYING on it: at
// that point the objective the creator chose changes nothing about what she is
// asked, so two objectives differ only in a label.
//
// ⚠️ THE GUARD IS THE POINT, NOT THE THREE STRINGS. A table of questions can be
// completed once and drift the moment someone adds a ninth goal. This asserts
// the INVARIANT -- every value in the canonical vocabulary has one -- so a new
// goal cannot ship asking nothing.
import { describe, it, expect } from 'vitest'
import { VIDEO_GOALS, type VideoGoal } from '../videoIntent'
import { OBJECTIVE_QUESTIONS, objectiveQuestion } from '../productObjectiveQuestion'

describe('the canonical vocabulary is fully covered', () => {
  it('every VideoGoal has a question of its own', () => {
    const missing = VIDEO_GOALS.filter((g) => !OBJECTIVE_QUESTIONS[g])
    expect(missing).toEqual([])
  })

  it('and objectiveQuestion returns one for every goal, not null', () => {
    for (const g of VIDEO_GOALS) {
      expect(objectiveQuestion(g), `no question for ${g}`).toBeTruthy()
    }
  })

  it('keeps returning null for something that is not a goal, which is the fallback', () => {
    // ⚖️ THE FALLBACK SURVIVES. A caller passing an unknown string still gets
    // null and still asks its generic question; this file is about the eight.
    expect(objectiveQuestion('not_a_goal')).toBeNull()
    expect(objectiveQuestion('')).toBeNull()
    expect(objectiveQuestion(null)).toBeNull()
  })
})

describe('the questions are actually different from each other', () => {
  it('no two goals ask the same sentence', () => {
    // ⚠️ THE DEFECT THE AUDIT FOUND WAS SAMENESS, NOT ABSENCE. Filling the table
    // with a rephrasing of one question would satisfy the coverage test above
    // and change nothing a creator experiences.
    const asked = VIDEO_GOALS.map((g) => objectiveQuestion(g))
    expect(new Set(asked).size).toBe(VIDEO_GOALS.length)
  })

  it('each question asks for something the product record cannot supply', () => {
    // Every `because` states why no other objective and no stored field can
    // answer it. An empty or duplicated reason is a question nobody argued for.
    const reasons = VIDEO_GOALS.map((g) => OBJECTIVE_QUESTIONS[g as VideoGoal]!.because)
    expect(reasons.every((r) => r.trim().length > 40)).toBe(true)
    expect(new Set(reasons).size).toBe(VIDEO_GOALS.length)
  })

  it('and none of them is the generic claims question wearing a label', () => {
    for (const g of VIDEO_GOALS) {
      const q = objectiveQuestion(g) ?? ''
      expect(q.toLowerCase()).not.toContain('what claims')
      expect(q.length).toBeGreaterThan(20)
      expect(q.endsWith('?')).toBe(true)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { choiceFollowUp, followUpLines, FOLLOWUP_PREFIX } from '../videoIntent'

describe('one question per choice, asked after the choice', () => {
  it('reference: keep-their-structure asks for her version, their-topic asks for her opinion, stay-close asks nothing', () => {
    expect(choiceFollowUp('reference_use', 'structure')).toMatch(/your version of what happens/)
    expect(choiceFollowUp('reference_use', 'idea_structure')).toMatch(/actual opinion/)
    // Owner's session report: stay-close invented scores when it asked nothing.
    expect(choiceFollowUp('reference_use', 'stay_close')).toMatch(/your version/)
  })

  it('goals: trust, teach, talk and entertain each ask for their own material; reach asks nothing', () => {
    expect(choiceFollowUp('video_goal', 'authority')).toMatch(/proves this/)
    expect(choiceFollowUp('video_goal', 'educate')).toMatch(/get wrong/)
    expect(choiceFollowUp('video_goal', 'conversations')).toMatch(/most disagreeable/)
    expect(choiceFollowUp('video_goal', 'entertain')).toMatch(/funniest or most absurd/)
    expect(choiceFollowUp('video_goal', 'followers')).toBeNull()
  })

  it('product builds keep their own objective questions', () => {
    expect(choiceFollowUp('video_goal', 'educate', { isProductSubject: true })).toBeNull()
  })

  it('an answer reaches her note only while its choice still stands, and a blank adds nothing', () => {
    const a = { reference_use: 'idea_structure', [FOLLOWUP_PREFIX + 'reference_use']: ' It is overrated. ' }
    expect(followUpLines(a)).toBe("What's your actual opinion on this?\nMy answer: It is overrated.\n\n")
    expect(followUpLines({ ...a, reference_use: 'entertain_nothing' as string })).toBe('')
    expect(followUpLines({ video_goal: 'educate', [FOLLOWUP_PREFIX + 'video_goal']: '   ' })).toBe('')
  })
})

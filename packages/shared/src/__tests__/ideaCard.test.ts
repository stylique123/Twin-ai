import { describe, it, expect } from 'vitest'
import { ideaCardLines, IDEA_GOAL_TO_VIDEO_GOAL, IDEA_MODE_LABEL, VIDEO_GOALS } from '../videoIntent'

describe('an Ideas-for-you card reaches the build whole', () => {
  it('every card goal maps to a real per-video goal', () => {
    for (const g of ['views', 'leads', 'sales', 'authority', 'community']) {
      expect(VIDEO_GOALS).toContain(IDEA_GOAL_TO_VIDEO_GOAL[g])
    }
  })
  it('teach and educate read differently on the card and in the note', () => {
    expect(IDEA_MODE_LABEL.teach).toBe('How-to')
    expect(IDEA_MODE_LABEL.educate).toBe('Explain')
    expect(ideaCardLines('teach', null)).toMatch(/step by step/)
    expect(ideaCardLines('educate', null)).toMatch(/why or how/)
  })
  it('carries the hook and says nothing when there is nothing', () => {
    expect(ideaCardLines(null, 'I almost lost my cart license')).toMatch(/I almost lost my cart license/)
    expect(ideaCardLines(null, null)).toBe('')
    expect(ideaCardLines('unknown', '  ')).toBe('')
  })
})

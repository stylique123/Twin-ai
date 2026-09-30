import { describe, it, expect } from 'vitest'
import { groupLessons, isSystemRule, inYourVoice } from './lessonGroups'

describe('audit 2026-09-30: her rules, grouped and in one voice', () => {
  it("Twin's own grounding rules are not shown as her preferences", () => {
    expect(isSystemRule('Only use factual details that the creator has explicitly shared with you.')).toBe(true)
    expect(isSystemRule('Never send a draft knowing required details are missing before showing it to the creator.')).toBe(true)
    expect(isSystemRule('Never include fabricated phrases or quotes that the creator did not actually say.')).toBe(true)
    expect(isSystemRule('Never mention two-pound batches in scripts.')).toBe(false)
  })
  it('reads as "you"', () => {
    expect(inYourVoice('Keep writing in her plain, direct voice.')).toBe('Keep writing in your plain, direct voice.')
    expect(inYourVoice('Hooks that work for her')).toBe('Hooks that work for you')
  })
  it('groups under a few headings', () => {
    const g = groupLessons([
      { id: '1', kind: 'hook', text: 'A hook that stopped 8 of 10', active: true },
      { id: '2', kind: 'prefer', text: 'Keep the link-in-bio ending for scripts.', active: true },
      { id: '3', kind: 'avoid', text: 'Never mention two-pound batches in scripts.', active: true },
      { id: '4', kind: 'style', text: 'Keep it shorter: fewer scenes and tighter lines.', active: true },
      { id: '5', kind: 'avoid', text: 'Never invent brewing instructions or recipe details that were not provided.', active: true },
    ])
    expect(g.map((x) => x.group)).toEqual(['openings', 'voice', 'endings', 'leave_out'])
    expect(g.flatMap((x) => x.items).map((i) => i.id)).not.toContain('5')
  })
})

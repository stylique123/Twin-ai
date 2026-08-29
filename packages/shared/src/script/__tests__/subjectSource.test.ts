import { describe, it, expect } from 'vitest'
import { resolveSubjectSource, SUBJECT_SOURCE_ASK } from '../subjectSource'

const EXPERIENCE_ITEM = { kind: 'experience', text: 'I quit my job in 2022 to start this.', basis: 'stated' } as const
const FRAMEWORK_ITEM = { kind: 'framework', text: 'The 3-step onboarding framework.', basis: 'stated' } as const
const DEMONSTRATED_EXPERIENCE = { kind: 'experience', text: 'A video about a launch.', basis: 'demonstrated' } as const

describe('resolveSubjectSource', () => {
  it('focus=null (unanswered) never requires a source', () => {
    const v = resolveSubjectSource(null, [])
    expect(v).toEqual({ focus: null, requiresOwnSource: false, sourceAvailable: true, needsUser: false, instruction: '' })
  })

  it('expertise never requires an own-experience source, even with none on record', () => {
    const v = resolveSubjectSource('expertise', [])
    expect(v.requiresOwnSource).toBe(false)
    expect(v.needsUser).toBe(false)
    expect(v.instruction).toBe('')
  })

  it('opinion, product and reference_adapted never require an own-experience source', () => {
    for (const focus of ['opinion', 'product', 'reference_adapted', 'trending', 'review']) {
      const v = resolveSubjectSource(focus, [])
      expect(v.requiresOwnSource).toBe(false)
      expect(v.needsUser).toBe(false)
    }
  })

  it('experience with a stated experience item on record resolves cleanly — a real, distinct source', () => {
    const v = resolveSubjectSource('experience', [EXPERIENCE_ITEM])
    expect(v).toMatchObject({ focus: 'experience', requiresOwnSource: true, sourceAvailable: true, needsUser: false })
    expect(v.instruction).toContain('Ground it in a supplied experience item')
  })

  it('story behaves identically to experience (both merge to the same routing)', () => {
    const v = resolveSubjectSource('story', [EXPERIENCE_ITEM])
    expect(v).toMatchObject({ requiresOwnSource: true, sourceAvailable: true, needsUser: false })
  })

  // ── THE BUG, PINNED ─────────────────────────────────────────────────────
  it('experience with NO stated experience item on record needs the creator, not a silent fallback', () => {
    const v = resolveSubjectSource('experience', [FRAMEWORK_ITEM])
    expect(v).toMatchObject({ focus: 'experience', requiresOwnSource: true, sourceAvailable: false, needsUser: true })
    expect(v.instruction).toContain('NOTHING ON RECORD IS A STATED EXPERIENCE')
    expect(v.instruction).not.toBe('')
  })

  it('experience with an empty knowledge array needs the creator', () => {
    const v = resolveSubjectSource('experience', [])
    expect(v.needsUser).toBe(true)
  })

  it('a demonstrated (not stated) experience-kind item does not count as a real source', () => {
    // evidenceLevel only promotes a stated experience — one the video merely
    // shows is coverage, not something the creator told us. See knowledgeResolver.evidenceLevel.
    const v = resolveSubjectSource('experience', [DEMONSTRATED_EXPERIENCE])
    expect(v.sourceAvailable).toBe(false)
    expect(v.needsUser).toBe(true)
  })

  it('expertise and experience route to genuinely distinct verdicts given the same thin knowledge', () => {
    const knowledge = [FRAMEWORK_ITEM]
    const expertise = resolveSubjectSource('expertise', knowledge)
    const experience = resolveSubjectSource('experience', knowledge)
    expect(expertise.needsUser).toBe(false)
    expect(experience.needsUser).toBe(true)
    expect(expertise.instruction).not.toBe(experience.instruction)
  })

  it('exports the exact ask surfaced to the creator', () => {
    expect(SUBJECT_SOURCE_ASK).toMatch(/personally did, learned, tried or went through/)
  })
})

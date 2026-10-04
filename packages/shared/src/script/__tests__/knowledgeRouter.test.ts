import { describe, expect, it } from 'vitest'
import { routeKnowledge, renderRoute, preferenceFor, HER_SOURCES, ROLES, SOURCE_IDS, type SourceId } from '../knowledgeRouter'

const all = Object.fromEntries(SOURCE_IDS.map((s) => [s, 3])) as Record<SourceId, number>
const slot = (r: ReturnType<typeof routeKnowledge>, role: string) => r.slots.find((s) => s.role === role)!

describe('knowledge router: which source feeds which part', () => {
  it('a sell video opens on what people ask to buy and proves with the product', () => {
    const r = routeKnowledge({ mode: 'product', goal: 'sell', available: all })
    expect(r.row).toBe('sell')
    expect(slot(r, 'hook').source).toBe('reddit_buying')
    expect(slot(r, 'proof').source).toBe('product')
    expect(r.gaps).toEqual([])
  })
  it('the angle picks the hook source and can change the row', () => {
    expect(slot(routeKnowledge({ mode: 'idea', goal: 'educate', angle: 'contrarian_claim', available: { reddit_debate: 2, her_claim: 1 } }), 'hook').source).toBe('reddit_debate')
    const story = routeKnowledge({ mode: 'product', goal: 'sell', angle: 'feeling_story', available: all })
    expect(story.row).toBe('story')
    expect(slot(story, 'hook').source).toBe('her_story')
  })
  it('focus re-orders proof, outcome sets the close and its job', () => {
    const r = routeKnowledge({ mode: 'product', goal: 'educate', focus: 'review', outcome: 'comment', available: all })
    expect(slot(r, 'proof').source).toBe('product')
    expect(slot(r, 'close').source).toBe('reddit_debate')
    expect(slot(r, 'close').job).toMatch(/question/)
  })
  it('idea mode builds on her paragraph first', () => {
    const r = routeKnowledge({ mode: 'idea', goal: 'educate', available: all })
    expect(slot(r, 'hook').source).toBe('her_answers')
    expect(slot(r, 'close').source).not.toBe('her_answers')
  })
  it('brand mode puts the brand where the product would be', () => {
    const r = routeKnowledge({ mode: 'brand', goal: 'sell', available: { brand: 2, reddit_buying: 1 } })
    expect(slot(r, 'proof').source).toBe('brand')
  })
  it('audience and world material never proves anything', () => {
    for (const row of ['sell', 'teach', 'story', 'answer', 'entertain'] as const) {
      for (const role of ['proof', 'payoff'] as const) {
        for (const s of preferenceFor(role, row, { mode: 'idea' })) expect(HER_SOURCES.has(s) || s === 'niche_proof').toBe(true)
      }
    }
  })
  it('a required part with nothing of hers is a gap, not an invention', () => {
    const r = routeKnowledge({ mode: 'product', goal: 'sell', available: { reddit_buying: 4, reddit_complaint: 2 } })
    expect(r.gaps).toContain('proof')
    expect(slot(r, 'proof').source).toBeNull()
    expect(renderRoute(r)).toMatch(/PROOF: nothing on file .*never invent/)
  })
  it('three hook options come from three different sources', () => {
    const r = routeKnowledge({ mode: 'product', goal: 'sell', available: all })
    expect(new Set(r.hookSources).size).toBe(3)
    expect(renderRoute(r)).toMatch(/DIFFERENT one of/)
  })
  it('every mode × goal × angle combination routes every role', () => {
    const modes = ['idea', 'product', 'reference', 'brand'] as const
    const goals = ['followers', 'authority', 'educate', 'conversations', 'leads', 'sell', 'entertain', 'personal_brand']
    const angles = [null, 'teach_list', 'result_first', 'contrarian_claim', 'feeling_story', 'problem_question', 'curiosity']
    for (const mode of modes) for (const goal of goals) for (const angle of angles) {
      const r = routeKnowledge({ mode, goal, angle, available: all })
      expect(r.slots.map((s) => s.role)).toEqual([...ROLES])
      expect(r.slots.every((s) => s.source !== null)).toBe(true)
      expect(r.gaps).toEqual([])
    }
  })
})

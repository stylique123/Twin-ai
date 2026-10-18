import { describe, it, expect } from 'vitest'
import { pickAngleCards, angleCardsRecord, ANGLE_IDS, ANGLE_SPECS, GOAL_ANGLES, angleCandidates } from '../angleFit'
import { usefulQuestions, candidatesFromNeedCheck, questionNecessity, questionUse, isForbiddenPiece } from '../questionUsefulness'
import { HOOK_SHAPE_IDS } from '../hooks/hookShapes'
import { needCheck } from '../itemFormat'

// Fictional fixture: Juniper Candle Co., a made-up candle maker.
const material = [
  { id: 'k1', slot: 'story' as const, text: 'I burned my first batch in a cold garage.' },
  { id: 'k2', slot: 'stance' as const, text: 'Cheap wicks ruin good wax.' },
  { id: 'p1', slot: 'what_it_is' as const, text: 'A soy candle in a tin.' },
]

describe('angle fit', () => {
  it('uses the eight existing angle kinds and real hook shapes, never the timely shape', () => {
    expect(ANGLE_IDS).toHaveLength(8)
    for (const a of ANGLE_IDS) for (const s of ANGLE_SPECS[a].shapes) {
      expect(HOOK_SHAPE_IDS).toContain(s)
      expect(s).not.toBe('timely')
    }
  })
  it('never offers an off-goal angle', () => {
    expect(GOAL_ANGLES.entertain).not.toContain('offer')
    const cards = pickAngleCards({ goal: 'entertain', hasProduct: true, material })
    for (const c of cards) expect(GOAL_ANGLES.entertain).toContain(c.angle)
  })
  it('three cards, three different shapes, fewest gaps first', () => {
    const cards = pickAngleCards({ goal: 'sell', hasProduct: true, material })
    expect(cards).toHaveLength(3)
    expect(new Set(cards.map((c) => c.shape)).size).toBe(3)
    const gaps = cards.map((c) => c.gaps.length)
    expect([...gaps].sort((a, b) => a - b)).toEqual(gaps)
  })
  it('opening is her words verbatim or a slot marker', () => {
    const cards = pickAngleCards({ goal: 'personal_brand', hasProduct: false, material })
    const texts = material.map((m) => m.text)
    for (const c of cards) {
      if (c.opening.source === 'material') expect(texts).toContain(c.opening.text)
      else expect(c.opening.marker).toMatch(/^\[[A-Z_]+\]$/)
    }
    const empty = pickAngleCards({ goal: 'educate', hasProduct: false, material: [] })
    for (const c of empty) expect(c.opening.source).toBe('slot')
  })
  it('product angles drop when there is no product; record carries no text', () => {
    expect(angleCandidates('sell', false)).not.toContain('offer')
    const rec = JSON.stringify(angleCardsRecord(pickAngleCards({ goal: 'sell', hasProduct: true, material })))
    for (const m of material) expect(rec).not.toContain(m.text)
  })
})

describe('question usefulness', () => {
  it('ranks story, product slot, profile; max three; all skippable', () => {
    const nc = needCheck({ voiceCard: false, exemplars: 0, storyIds: [], kind: 'PHYSICAL_PRODUCT', productItems: [], nicheFindings: 0, pillars: [], pillarMatched: false, urgencyFact: false })
    const qs = usefulQuestions({
      candidates: candidatesFromNeedCheck(nc.ask, ['what_it_is', 'show_it']),
      required: ['story', 'what_it_is', 'show_it'], onFile: [],
    })
    expect(qs.map((q) => q.kind)).toEqual(['story', 'product_slot', 'product_slot'])
    expect(qs.every((q) => q.skippable)).toBe(true)
  })
  it('skips pieces on file, not required, dates and scarcity; profile once', () => {
    const qs = usefulQuestions({
      candidates: [
        { kind: 'product_slot', piece: 'close', fallback: 'general' },
        { kind: 'product_slot', piece: 'proof', fallback: 'general' },
        { kind: 'niche', piece: 'launch_date', fallback: 'general' },
        { kind: 'product_slot', piece: 'scarcity', fallback: 'general' },
        { kind: 'profile', piece: 'profile', fallback: 'general' },
      ],
      required: ['close'], onFile: ['close'], profileAsked: true,
    })
    expect(qs).toEqual([])
    expect(isForbiddenPiece('event_date')).toBe(true)
  })
  it('records necessity and use without text', () => {
    const qs = usefulQuestions({ candidates: [{ kind: 'story', piece: 'story', fallback: 'invented' }], required: ['story'], onFile: [] })
    expect(questionNecessity(qs).avoided_invented).toBe(1)
    const use = questionUse({ story: 'The garage froze my wax overnight', other: 'unrelated tangent here' }, ['The garage froze my wax solid overnight.'])
    expect(use).toEqual({ answered: 2, skipped: 0, used: 1, used_keys: ['story'] })
  })
})

import { describe, it, expect } from 'vitest'
import { OBJECTIVE_ANGLES, GOAL_FALLBACK_ANGLES, ANGLE_IDS, ANGLE_SPECS, allowedAngles, pickAngles, anglePickRecord } from '../angleFit'
import { planQuestionsForAngle, questionCandidates, questionBreaksRules, answerFactRow, questionUse, isForbiddenPiece } from '../questionUsefulness'
import { SPECS } from '../questionSpecs'
import { VIDEO_GOALS } from '../../videoIntent'

// Fictional fixtures only: Juniper Candle Co., a made-up candle maker.
const material = [
  { id: 'k1', slot: 'story' as const, text: 'I burned my first batch in a cold garage.', source: 'her_material' as const },
  { id: 'k2', slot: 'stance' as const, text: 'Cheap wicks ruin good wax.', source: 'her_material' as const },
  { id: 'p1', slot: 'what_it_is' as const, text: 'A soy candle in a tin.', source: 'product' as const },
]

describe('v5.1 N: goal table', () => {
  it('has a row for every objective the app offers, using only real angle ids', () => {
    for (const s of SPECS) {
      const row = OBJECTIVE_ANGLES[s.id]
      expect(row, s.id).toBeDefined()
      expect(row!.length).toBeGreaterThanOrEqual(3)
      for (const a of row!) expect(ANGLE_IDS).toContain(a)
    }
  })
  it('covers every goal enum as a fallback', () => {
    for (const g of VIDEO_GOALS) expect(GOAL_FALLBACK_ANGLES[String(g).toLowerCase()], String(g)).toBeDefined()
  })
  it('matches the plan examples', () => {
    expect([...OBJECTIVE_ANGLES['product:launch']!].sort()).toEqual(['behind', 'moment', 'offer', 'show'])
    expect([...OBJECTIVE_ANGLES['product:wrong']!].sort()).toEqual(['answer', 'moment', 'myth', 'stand'])
  })
})

describe('v5.1 N: angle choice', () => {
  it('never offers an angle outside the objective row', () => {
    const cards = pickAngles({ objective: 'product:wrong', hasProduct: true, material })
    for (const c of cards) expect(OBJECTIVE_ANGLES['product:wrong']).toContain(c.angle)
    expect(cards.map((c) => c.angle)).not.toContain('offer')
  })
  it('never offers an angle the product cannot support', () => {
    expect(allowedAngles({ objective: 'product:launch', hasProduct: false })).toEqual(['behind', 'moment'])
    expect(allowedAngles({ objective: 'product:launch', hasProduct: true, canShow: false, hasOffer: false })).toEqual(['behind', 'moment'])
  })
  it('ranks by material fit, three distinct shapes, flags Twin\'s pick on the top card only', () => {
    const cards = pickAngles({ objective: 'product:wrong', hasProduct: true, material })
    expect(cards).toHaveLength(3)
    // stand and moment are fully filled by her material; they outrank myth and answer.
    expect(cards.slice(0, 2).map((c) => c.angle).sort()).toEqual(['moment', 'stand'])
    expect(new Set(cards.map((c) => c.shape)).size).toBe(3)
    expect(cards.map((c) => c.twins_pick)).toEqual([true, false, false])
    for (const c of cards) expect(c.label).toMatch(/^[A-Z]/)
  })
  it('cards carry an opening line and a source tag, never a placeholder', () => {
    const cards = pickAngles({ objective: 'product:launch', hasProduct: true, material })
    for (const c of cards) {
      expect(['her_material', 'product', 'niche', 'audience', 'none']).toContain(c.opening.source)
      if (c.opening.text != null) expect(c.opening.text).not.toMatch(/\[[A-Z_]+\]/)
    }
    const moment = cards.find((c) => c.angle === 'moment')!
    expect(moment.opening).toEqual({ text: 'I burned my first batch in a cold garage.', source: 'her_material', item_id: 'k1' })
    const empty = pickAngles({ objective: 'idea:process', hasProduct: false, material: [] })
    for (const c of empty) expect(c.opening).toEqual({ text: null, source: 'none' })
    expect(JSON.stringify(anglePickRecord(cards))).not.toContain('garage')
  })
})

const base = { angle: 'answer', angleNeeds: ANGLE_SPECS.answer.needs, onFile: [] as never[], hasProduct: true, entityKey: 'product:fixture-1' }

describe('v5.1 M: question ranking', () => {
  it('ranks story, then product slot, then niche, then profile; at most three', () => {
    const qs = planQuestionsForAngle({
      angle: 'beforeafter', angleNeeds: ANGLE_SPECS.beforeafter.needs, templateNeeds: ['what_it_is'], onFile: [], hasProduct: true,
      entityKey: 'product:fixture-1', profileMissing: true,
    })
    expect(qs.map((q) => q.kind)).toEqual(['story', 'product_slot', 'product_slot'])
    expect(qs.length).toBeLessThanOrEqual(3)
  })
  it('asks only for missing, required pieces, one piece per question', () => {
    const qs = planQuestionsForAngle({ ...base, onFile: ['objection', 'context'] })
    expect(qs).toEqual([])
    const two = planQuestionsForAngle({ ...base, audience: [{ id: 'a1', text: 'Do soy candles tunnel?' }, { id: 'a2', text: 'Is a tin safe?' }] })
    expect(new Set(two.map((q) => q.piece)).size).toBe(two.length)
  })
  it('builds candidates from every source, including "People ask X. Do you get asked this?"', () => {
    const c = questionCandidates({
      angle: 'myth', angleNeeds: ['stance', 'context', 'objection'], onFile: [], hasProduct: false,
      niche: [{ id: 'n1', text: 'Wax blends always smell stronger.' }],
      audience: [{ id: 'a1', text: 'Do soy candles tunnel?' }],
      painMap: [{ id: 'm1', text: 'Candles that stop smelling after a week.' }],
      profileMissing: true,
    })
    const sources = new Set(c.map((q) => q.source))
    for (const s of ['her_material', 'niche', 'audience', 'pain_map', 'profile']) expect(sources).toContain(s)
    expect(c.find((q) => q.source === 'audience')!.text).toBe('People ask "Do soy candles tunnel?". Do you get asked this? If so, what do you tell them?')
  })
  it('soft questions only top up to two, so the average stays near 1.5', () => {
    const qs = planQuestionsForAngle({
      angle: 'myth', angleNeeds: ['stance', 'context'], onFile: [], hasProduct: false,
      niche: [{ id: 'n1', text: 'Wax blends always smell stronger.' }], profileMissing: true,
    })
    expect(qs.length).toBe(2)
  })
  it('profile is asked once ever', () => {
    const qs = planQuestionsForAngle({ ...base, onFile: ['objection', 'context'], profileMissing: true, profileAskedEver: true })
    expect(qs.find((q) => q.kind === 'profile')).toBeUndefined()
  })
})

describe('v5.1 M: never dates, scarcity or a presumed event', () => {
  it('rejects date and scarcity wording and pieces', () => {
    for (const t of ['When does it launch?', 'What is the launch date?', 'How many are left?', 'Is it a limited run?', 'Is it sold out?']) {
      expect(questionBreaksRules(t), t).toBe(true)
    }
    for (const p of ['launch_date', 'scarcity', 'stock_left', 'deadline']) expect(isForbiddenPiece(p)).toBe(true)
  })
  it('rejects a question that presumes it happened', () => {
    expect(questionBreaksRules('What did the customer say when it arrived?')).toBe(true)
    expect(questionBreaksRules('Has anyone told you what changed? If so, what did they say?')).toBe(false)
  })
  it('every template question passes the rules', () => {
    const c = questionCandidates({
      angle: 'x', angleNeeds: ['story', 'what_it_is', 'show_it', 'proof', 'close', 'objection', 'process', 'stance', 'context'],
      onFile: [], hasProduct: true, profileMissing: true,
    })
    const c2 = questionCandidates({ angle: 'x', angleNeeds: ['proof', 'objection', 'process', 'stance', 'context'], onFile: [], hasProduct: false })
    for (const q of [...c, ...c2]) expect(questionBreaksRules(q.text), q.text).toBe(false)
  })
})

describe('v5.1 M: skip', () => {
  it('a skipped question is never asked again', () => {
    const first = planQuestionsForAngle({ angle: 'moment', angleNeeds: ['story'], onFile: [], hasProduct: false })
    expect(first.map((q) => q.key)).toEqual(['mn:story'])
    expect(first[0]!.skippable).toBe(true)
    const again = planQuestionsForAngle({ angle: 'moment', angleNeeds: ['story'], onFile: [], hasProduct: false, skippedKeys: ['mn:story'] })
    expect(again).toEqual([])
  })
})

describe('v5.1 M: answers saved as her facts', () => {
  it('an answer becomes a confirmed, stated fact owned by her', () => {
    const now = '2026-10-19T00:00:00.000Z'
    const row = answerFactRow({ ownerId: 'u-fixture', productId: 'p-fixture', key: 'mn:story', piece: 'story', answer: 'My first tin cracked in the oven, so I switched to steel.', now })!
    expect(row).toMatchObject({ owner_id: 'u-fixture', product_entity_id: 'p-fixture', kind: 'experience', basis: 'stated', source: 'asked', source_ref: 'asked:mn:story', creator_confirmed_at: now })
    expect(answerFactRow({ ownerId: 'u', key: 'mn:story', piece: 'story', answer: 'Nothing specific, keep it general.', now })).toBeNull()
    expect(answerFactRow({ ownerId: 'u', key: 'mn:story', piece: 'story', answer: '   ', now })).toBeNull()
  })
})

describe('v5.1 M: question_use', () => {
  it('counts an answer used when it appears in the script, skips apart, numbers included', () => {
    const qu = questionUse(
      { a: 'Twelve jars for $40', b: 'Nothing specific, keep it general.', c: 'It cracked in the oven' },
      ['I sell twelve jars for $40.', 'My first tin cracked in the oven.'],
    )
    expect(qu).toMatchObject({ answered: 2, skipped: 1, used: 2 })
  })
  it('an answer made only of short words still counts as answered', () => {
    expect(questionUse({ a: 'Yes, $9' }, ['Nothing here.']).answered).toBe(1)
  })
})

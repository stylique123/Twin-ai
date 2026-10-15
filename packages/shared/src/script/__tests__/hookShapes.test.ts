// Hook shape library. Every fixture here is made up.
import { describe, it, expect } from 'vitest'
import type { LedgerItem } from '../inventionGate.js'
import { HOOK_MOVES } from '../scriptFamily.js'
import { SCRIPT_TEMPLATES } from '../templates/templateData.js'
import {
  HOOK_SHAPES, hookShape, shapesForMove, eligibleShapes, checkHookAgainstShape, evidenceClassesOf, promiseEntry,
} from '../hooks/hookShapes.js'

const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin'>): LedgerItem => ({
  product_id: null, field: null, text: 'a made-up line', numbers: [], first_party: true, live: false, source_label: o.origin, ...o,
})
const shape = (id: string) => hookShape(id)!

describe('library data', () => {
  it('has unique ids and only known HOOK_MOVES', () => {
    expect(new Set(HOOK_SHAPES.map((s) => s.id)).size).toBe(HOOK_SHAPES.length)
    for (const s of HOOK_SHAPES) for (const m of s.moves) expect(HOOK_MOVES[m], m).toBeDefined()
  })
  it('maps every HOOK_MOVE and every template hook shape to at least one shape', () => {
    for (const id of Object.keys(HOOK_MOVES)) expect(shapesForMove(id).length, id).toBeGreaterThan(0)
    for (const t of SCRIPT_TEMPLATES) for (const id of t.hook_shapes) expect(shapesForMove(id).length, id).toBeGreaterThan(0)
  })
  it('every shape forbids "nobody is talking about"', () => {
    for (const s of HOOK_SHAPES) expect(s.forbidden).toContain('nobody_talks')
  })
})

describe('evidence classes', () => {
  it('reads pain, stance, timely and her numbers', () => {
    expect(evidenceClassesOf(item({ id: 'a', origin: 'audience_question', field: 'pain_map', first_party: false }))).toEqual(['audience_pain'])
    expect(evidenceClassesOf(item({ id: 'b', origin: 'her_fact', field: 'stance' }))).toContain('her_stance')
    expect(evidenceClassesOf(item({ id: 'c', origin: 'outside_moment', live: true, first_party: false }))).toContain('outside_timely')
    expect(evidenceClassesOf(item({ id: 'd', origin: 'her_fact', numbers: [{ value: 3, unit: 'count', field: 'x' }] }))).toContain('her_number')
  })
})

describe('eligibleShapes', () => {
  it('no evidence, no shape', () => {
    expect(eligibleShapes([])).toEqual([])
  })
  it('a story only unlocks story_open', () => {
    expect(eligibleShapes([item({ id: 's', origin: 'her_story' })]).map((s) => s.id)).toEqual(['story_open'])
  })
  it('contrarian gap needs both outside and stance', () => {
    const out = item({ id: 'o', origin: 'outside_research', first_party: false })
    expect(eligibleShapes([out]).map((s) => s.id)).not.toContain('contrarian_gap')
    expect(eligibleShapes([out, item({ id: 'h', origin: 'her_answer', field: 'opinion' })]).map((s) => s.id)).toContain('contrarian_gap')
  })
})

describe('checkHookAgainstShape', () => {
  const q = item({ id: 'q', origin: 'audience_question', first_party: false, text: 'Why does my loaf go flat?' })
  it('passes a clean audience question, flags an unbacked number', () => {
    expect(checkHookAgainstShape('Why does your loaf go flat by day two?', shape('audience_question'), [q]).ok).toBe(false)
    expect(checkHookAgainstShape('Why does your loaf go flat overnight?', shape('audience_question'), [q]).ok).toBe(true)
  })
  it('flags missing evidence', () => {
    const r = checkHookAgainstShape('Why does your loaf go flat?', shape('audience_question'), [])
    expect(r.issues.map((i) => i.rule)).toContain('missing_evidence')
  })
  it('flags universal claims and nobody-talks', () => {
    const r = checkHookAgainstShape('Nobody is talking about why everyone burns their crust.', shape('audience_question'), [q])
    const rules = r.issues.map((i) => i.rule)
    expect(rules).toContain('nobody_talks')
    expect(rules).toContain('universal_quantifier')
  })
  it('flags an unbacked percent', () => {
    const r = checkHookAgainstShape('80% of bakers skip this step.', shape('audience_question'), [q])
    expect(r.issues.map((i) => i.rule)).toContain('unbacked_percent')
  })
  it('flags invented experience without a story', () => {
    const r = checkHookAgainstShape('I tested this for a month. Stop feeding at night.', shape('stop_doing'), [item({ id: 'st', origin: 'her_fact', field: 'stance' })])
    expect(r.issues.map((i) => i.rule)).toContain('invented_experience')
  })
  it('count promise must be backed or delivered', () => {
    const data = item({ id: 'n', origin: 'her_fact', numbers: [{ value: 3, unit: 'count', field: 'numbers' }] })
    const s = shape('number_promise')
    expect(checkHookAgainstShape('Three numbers from my stall this spring.', s, [data]).ok).toBe(true)
    expect(checkHookAgainstShape('Five numbers from my stall this spring.', s, [data]).ok).toBe(false)
    expect(checkHookAgainstShape('Five numbers from my stall this spring.', s, [data], { delivered: 5 }).ok).toBe(true)
    expect(checkHookAgainstShape('Numbers from my stall this spring.', s, [data]).issues.map((i) => i.rule)).toContain('count_unbacked')
  })
})

describe('promise ledger', () => {
  it('records the count and backing ids, unpaid', () => {
    const data = item({ id: 'n', origin: 'her_fact', numbers: [{ value: 3, unit: 'count', field: 'numbers' }] })
    expect(promiseEntry('Three numbers from my stall.', shape('number_promise'), 0, [data])).toEqual({
      shape_id: 'number_promise', kind: 'count', hook_index: 0, count: 3, evidence_ids: ['n'], paid_at_beat: null,
    })
  })
})

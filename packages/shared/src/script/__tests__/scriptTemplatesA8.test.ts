// Script templates T2, T5–T13 (A8). Every fixture here is made up.
import { describe, it, expect } from 'vitest'
import type { LedgerItem } from '../inventionGate.js'
import { SCRIPT_TEMPLATES, QUESTION_TEMPLATES, T2, T5, T8, T9, T10, T11, T12, T13 } from '../templates/templateData.js'
import { planTemplate, chooseTemplates, pickProfile, expandedRoles, templateIdOf, hasDate, finishTemplate } from '../templates/scriptTemplates.js'
import { renderTemplateSkeleton } from '../templates/templateSkeleton.js'
import { planSpine } from '../planner/spinePlanner.js'
import { HOOK_MOVES } from '../scriptFamily.js'
import { shapesForMove } from '../hooks/hookShapes.js'

const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin'>): LedgerItem => ({
  product_id: null, field: null, text: 'a made-up line of material', numbers: [], first_party: true, live: false, source_label: o.origin, ...o,
})
const ROLES = new Set(['hook', 'promise', 'build', 'turn', 'anchor', 'offer', 'close'])

describe('the template set', () => {
  it('holds T1 to T13 with unique ids in the t<n>_ form', () => {
    const ids = SCRIPT_TEMPLATES.map((t) => t.id)
    expect(ids).toHaveLength(13)
    expect(new Set(ids).size).toBe(13)
    ids.forEach((id, i) => expect(id.startsWith(`t${i + 1}_`)).toBe(true))
  })
  for (const t of SCRIPT_TEMPLATES) {
    describe(t.id, () => {
      it('has the shared shape', () => {
        expect(t.beats[0]!.role).toBe('hook')
        for (const b of t.beats) {
          expect(ROLES.has(b.role)).toBe(true)
          expect(b.max_words).toBeGreaterThan(0)
          if (b.role === 'build') expect(b.pull).toBe(true)
          for (const s of b.slots) expect(QUESTION_TEMPLATES[s.ask]).toBeTruthy()
        }
        expect(t.duration_profiles.length).toBeGreaterThan(0)
        expect(t.promise.paid_at_beat).toBeLessThan(t.beats.length)
        if (t.promise.kind === 'count') expect(t.beats.some((b) => b.count)).toBe(true)
        expect(t.goals.length).toBeGreaterThan(0)
      })
      it('names 2–4 real hook moves, each bridged to the hook shape library', () => {
        expect(t.hook_shapes.length).toBeGreaterThanOrEqual(2)
        expect(t.hook_shapes.length).toBeLessThanOrEqual(4)
        for (const id of t.hook_shapes) expect(HOOK_MOVES[id]).toBeTruthy()
        expect(t.hook_shapes.some((id) => shapesForMove(id).length > 0)).toBe(true)
      })
      it('records its id and picks a profile it allows', () => {
        expect(templateIdOf(t)).toBe(t.id)
        for (const sec of [20, 60, 95, null]) expect(t.duration_profiles).toContain(pickProfile(t, sec))
      })
    })
  }
  it('profile fit follows the plan', () => {
    for (const t of [T5, T11, T13]) expect(t.duration_profiles).toEqual(['sprint'])
    for (const t of [T2, T9]) expect(t.duration_profiles).toContain('standard')
    for (const t of [T8, T10]) expect(t.duration_profiles).toContain('deep')
  })
})

describe('honest gates: dates and scarcity are never asked', () => {
  it('hasDate reads a month, a numeric date or a year', () => {
    expect(hasDate('Fictional fair on 12 March')).toBe(true)
    expect(hasDate('Made-up rule from 2031')).toBe(true)
    expect(hasDate('A made-up rule with no time')).toBe(false)
  })
  it('T13 without a live urgency item is ineligible and asks nothing about the limit', () => {
    const ledger = [item({ id: 'offer', origin: 'offer', text: 'A made-up candle set.' }),
      item({ id: 'u1', origin: 'urgency', text: 'Fictional: 40 sets until 3 May', live: false })]
    const p = planTemplate(T13, ledger)
    expect(p.eligible).toBe(false)
    expect(p.reason).toBe('no_verified_material')
    expect(p.questions.some((q) => q.writes_to.includes('urgency'))).toBe(false)
  })
  it('T13 with a live urgency item is eligible', () => {
    const ledger = [item({ id: 'offer', origin: 'offer', text: 'A made-up candle set.' }),
      item({ id: 'u1', origin: 'urgency', text: 'Fictional: 40 sets until 3 May', live: true })]
    expect(planTemplate(T13, ledger).eligible).toBe(true)
  })
  it('T5 and T10 need a dated outside item; an answer never supplies the date', () => {
    const answer = item({ id: 'answer:x', origin: 'her_answer', field: 'note', text: 'Something on 4 June, fictional.' })
    expect(planTemplate(T5, [answer]).eligible).toBe(false)
    expect(planTemplate(T10, [answer]).eligible).toBe(false)
    const dated = item({ id: 'm1', origin: 'outside_moment', first_party: false, text: 'Fictional rule change on 1 July 2031.' })
    const tip = item({ id: 'k1', origin: 'her_fact', text: 'Fictional tip: label every jar.' })
    expect(planTemplate(T5, [dated, tip]).eligible).toBe(true)
    expect(planTemplate(T10, [dated, item({ id: 'k2', origin: 'her_fact', text: 'Fictional take: it helps small shops.' })]).eligible).toBe(true)
  })
})

describe('filling, choosing, skeleton and spine', () => {
  const ledger = [
    item({ id: 'q1', origin: 'audience_question', first_party: false, text: 'Fictional: how often should I water a cactus?' }),
    item({ id: 'k1', origin: 'her_fact', text: 'Fictional: once a month in winter is my rule.' }),
    item({ id: 'k2', origin: 'her_story', text: 'Fictional: I drowned my first one.' }),
    item({ id: 'offer', origin: 'offer', text: 'A made-up care guide.' }),
  ]
  it('T11 fills from an audience question and her answer, with no questions', () => {
    const p = planTemplate(T11, ledger)
    expect(p.eligible).toBe(true)
    expect(p.questions).toHaveLength(0)
    expect(p.slots.find((s) => s.slot === 'question')!.item_id).toBe('q1')
  })
  it('a missing required first-party slot becomes a Need Check question, never text', () => {
    const p = planTemplate(T12, [ledger[0]!])
    expect(p.questions.map((q) => q.writes_to)).toEqual([`template.${T12.id}.moment`])
    expect(renderTemplateSkeleton(p, 'sprint', [ledger[0]!])).not.toMatch(/\[|\]/)
  })
  it('T9 asks for at least two kinds', () => {
    const p = planTemplate(T9, [])
    expect(p.slots.filter((s) => s.slot === 'kinds')).toHaveLength(2)
  })
  it('skeleton renders each chosen template in beat order with its id', () => {
    for (const plan of chooseTemplates({ goal: 'educate', angle: 'problem_question', ledger })) {
      const s = renderTemplateSkeleton(plan, pickProfile(plan.template, 30), ledger)
      expect(s).toContain(`TEMPLATE ${plan.template.id}`)
    }
  })
  it('the spine planner takes the template roles', () => {
    const plan = planTemplate(T11, ledger)
    const spine = planSpine({ request: { goal: 'educate', note: 'Fictional cactus care.' }, ledger, template: plan, profile: 'sprint' })
    expect(spine.beats.map((b) => b.role).every((r) => expandedRoles(T11).includes(r))).toBe(true)
  })
  it('finishTemplate records the new id', () => {
    const plan = planTemplate(T11, ledger)
    const script = [{ section: 'hook', script: 'How often should a cactus get water?' }, { section: 'turn', script: 'Once a month in winter.' },
      { section: 'anchor', script: 'I drowned my first one.' }, { section: 'offer', script: 'The care guide has the rest.' }]
    const r = finishTemplate({ plan, profile: 'sprint', script, hook_options: [script[0]!.script], ledger })
    expect(r.record.id).toBe('t11_audience_question')
  })
})

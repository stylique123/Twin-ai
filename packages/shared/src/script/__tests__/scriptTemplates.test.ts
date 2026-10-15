// Script templates (quality sprint stage 2). Every fixture here is made up.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildLedger, type LedgerItem } from '../inventionGate.js'
import { T1, T3, T4, SCRIPT_TEMPLATES } from '../templates/templateData.js'
import {
  itemFits, planTemplate, chooseTemplates, checkPromise, repairPromise, checkBridges, repairBridges,
  checkHookShapes, repairHookShapes, checkWordBudget, trimToBudget, finishTemplate, renderTemplateBlock, pickProfile, slotKey,
} from '../templates/scriptTemplates.js'
import { HOOK_MOVES } from '../scriptFamily.js'

const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin'>): LedgerItem => ({
  product_id: null, field: null, text: 'a made-up line of material', numbers: [], first_party: true, live: false, source_label: o.origin, ...o,
})

const outsideItems = [
  item({ id: 'r1', origin: 'outside_research', first_party: false, text: 'Fictional research point one about sourdough.' }),
  item({ id: 'r2', origin: 'outside_research', first_party: false, text: 'Fictional research point two about sourdough.' }),
  item({ id: 'r3', origin: 'outside_research', first_party: false, text: 'Fictional research point three about sourdough.' }),
  item({ id: 'r4', origin: 'outside_research', first_party: false, text: 'Fictional research point four about sourdough.' }),
]

describe('slot filling by evidence class', () => {
  const firstPartySlot = T3.beats[0]!.slots[0]!
  it('an outside item can never fill a first-party slot', () => {
    for (const origin of ['outside_research', 'outside_moment', 'niche_note', 'audience_question'] as const) {
      expect(itemFits(item({ id: 'x', origin, first_party: false }), { ...firstPartySlot, accepts: [origin] }, null)).toBe(false)
    }
  })
  it('her story fills a first-party slot', () => {
    expect(itemFits(item({ id: 'k1', origin: 'her_story' }), firstPartySlot, null)).toBe(true)
  })
  it('outside research fills a sourced item slot', () => {
    expect(itemFits(outsideItems[0]!, T1.beats[2]!.slots[0]!, null)).toBe(true)
  })
  it('another product\'s fact never fills a slot', () => {
    expect(itemFits(item({ id: 'p', origin: 'product_fact', product_id: 'prod-b' }), T4.beats[1]!.slots[0]!, 'prod-a')).toBe(false)
  })
  it('a skip answer never fills a slot', () => {
    expect(itemFits(item({ id: 'answer:x', origin: 'her_answer', text: 'Nothing specific, keep it general' }), T1.beats[0]!.slots[0]!, null)).toBe(false)
  })
})

describe('eligibility and the 3-question cap', () => {
  it('T1 with three sourced items, a topic and her difference is eligible with no questions', () => {
    const ledger = [item({ id: 'note', origin: 'her_answer', field: 'note', text: 'Teach sourdough basics.' }), ...outsideItems.slice(0, 3),
      item({ id: 'k1', origin: 'her_fact', text: 'I proof overnight in the fridge, fictional.' })]
    const p = planTemplate(T1, ledger)
    expect(p.eligible).toBe(true)
    expect(p.questions).toHaveLength(0)
    expect(p.slots.filter((s) => s.slot === 'items').map((s) => s.item_id)).toEqual(['r1', 'r2', 'r3'])
  })
  it('missing first-party slots become Need Check questions, in the gate format', () => {
    const ledger = [item({ id: 'offer', origin: 'offer', text: 'A made-up course.' })]
    const p = planTemplate(T3, ledger)
    expect(p.questions).toHaveLength(3)
    expect(p.eligible).toBe(true)
    for (const q of p.questions) {
      expect(q.scope).toBe('script')
      expect(q.writes_to.startsWith(`template.${T3.id}.`)).toBe(true)
      expect(q.text.split(/\s+/).length).toBeLessThanOrEqual(25)
    }
  })
  it('more than 3 questions (or asks already spent) is not eligible', () => {
    const p = planTemplate(T3, [])
    expect(p.questions.length).toBe(4)
    expect(p.eligible).toBe(false)
    expect(planTemplate(T3, [item({ id: 'offer', origin: 'offer' })], { asksSoFar: 1 }).eligible).toBe(false)
  })
  it('a required slot she declined is never asked again and makes the template ineligible', () => {
    const ledger = buildLedger({ answers: { [slotKey(T3.id, 'moment')]: 'Nothing specific, keep it general' }, offer: 'A made-up offer.' })
    const p = planTemplate(T3, ledger)
    expect(p.questions.some((q) => q.writes_to === slotKey(T3.id, 'moment'))).toBe(false)
    expect(p.eligible).toBe(false)
  })
  it('her answer to a template question fills that slot', () => {
    const ledger = buildLedger({ answers: { [slotKey(T3.id, 'moment')]: 'A fictional moment at a market stall.' }, offer: 'x' })
    const p = planTemplate(T3, ledger)
    expect(p.slots.find((s) => s.slot === 'moment')!.item_id).toBe(`answer:${slotKey(T3.id, 'moment')}`)
  })
  it('choice returns 1-3 eligible templates, angle first', () => {
    const ledger = [item({ id: 'note', origin: 'her_answer', field: 'note' }), ...outsideItems, item({ id: 'k1', origin: 'her_fact' }), item({ id: 'k2', origin: 'her_fact' })]
    const c = chooseTemplates({ goal: 'educate', angle: 'problem_question', ledger })
    expect(c.length).toBeGreaterThanOrEqual(1)
    expect(c.length).toBeLessThanOrEqual(3)
    expect(c[0]!.template.id).toBe(T4.id)
    expect(chooseTemplates({ goal: 'nonexistent', ledger })).toEqual([])
  })
})

describe('promise count check and repair', () => {
  const script = (n: number) => [
    { line: 'Three sourdough mistakes nobody tells you about.', section: 'hook' },
    { line: 'Here is the first one.', section: 'promise' },
    ...Array.from({ length: n }, (_, k) => ({ line: `Fictional item ${k + 1}.`, section: 'build' })),
    { line: 'I do it differently.', section: 'anchor' },
    { line: 'Save this.', section: 'close' },
  ]
  it('paid when the build count matches', () => {
    expect(checkPromise(script(3), script(3)[0]!.line, T1)).toMatchObject({ promised: 3, delivered: 3, paid: true })
  })
  it('counts only build beats before the first offer mention', () => {
    const s = script(3)
    s.splice(3, 0, { line: 'Grab yours with the link in my bio.', section: 'offer' })
    expect(checkPromise(s, s[0]!.line, T1).delivered).toBe(1)
  })
  it('trims extra build beats', () => {
    const r = repairPromise(script(4), [script(4)[0]!.line], T1)
    expect(r.action).toBe('trimmed')
    expect(checkPromise(r.script, r.script[0]!.line as string, T1).paid).toBe(true)
  })
  it('adds only from ledger items', () => {
    const r = repairPromise(script(2), [], T1, [outsideItems[3]!])
    expect(r.action).toBe('added')
    expect(r.script.some((b) => b.line === outsideItems[3]!.text)).toBe(true)
  })
  it('with nothing to add, re-numbers the hook to what it delivers', () => {
    const r = repairPromise(script(2), [script(2)[0]!.line], T1, [])
    expect(r.action).toBe('renumbered')
    expect(r.script[0]!.line).toBe('Two sourdough mistakes nobody tells you about.')
    expect(r.hook_options[0]).toBe('Two sourdough mistakes nobody tells you about.')
  })
})

describe('bridge check', () => {
  const s = [
    { line: 'Why does my loaf go flat?', section: 'hook' },
    { line: 'It starts with the starter. But that is not the real cause.', section: 'build' },
    { line: 'Fictional fix line. It works.', section: 'turn' },
    { line: 'Done.', section: 'anchor' },
  ]
  it('counts pull beats that end with a pull', () => {
    expect(checkBridges(s, T4)).toMatchObject({ ok: 2, of: 3, failing: [2] })
  })
  it('repair only moves an existing short pull line, never writes one', () => {
    const t = [{ line: 'Flat bread again.', section: 'hook' }, { line: 'But why? Fictional cause line.', section: 'build' }]
    const r = repairBridges(t, T4)
    expect(r[0]!.line).toBe('Flat bread again. But why?')
    expect(r[1]!.line).toBe('Fictional cause line.')
    const words = (x: typeof t) => x.map((b) => b.line).join(' ').split(/\s+/).sort()
    expect(words(r as typeof t)).toEqual(words(t))
  })
})

describe('hook shapes', () => {
  it('every template declares 2-4 shapes from the existing HOOK_MOVES', () => {
    for (const t of SCRIPT_TEMPLATES) {
      expect(t.hook_shapes.length).toBeGreaterThanOrEqual(2)
      expect(t.hook_shapes.length).toBeLessThanOrEqual(4)
      for (const id of t.hook_shapes) expect(HOOK_MOVES[id]).toBeDefined()
    }
  })
  it('each hook option must match a declared shape', () => {
    const c = checkHookShapes(['Five proofing mistakes to avoid.', 'Stop feeding your starter daily.', 'Bread is nice.'], T1.hook_shapes)
    expect(c.shapes).toEqual(['counted_list', 'contrarian_order', null])
  })
  it('repair drops non-matching options, never writes new ones', () => {
    expect(repairHookShapes(['Bread is nice.', 'Five proofing mistakes to avoid.', 'Stop feeding daily.'], T1.hook_shapes))
      .toEqual(['Five proofing mistakes to avoid.', 'Stop feeding daily.'])
  })
})

describe('word budget', () => {
  it('sprint over budget is trimmed, never padded, hook and close kept', () => {
    const long = 'This is a fictional sentence with exactly ten words here.'
    const s = [{ line: 'Hook line here.' }, { line: Array(6).fill(long).join(' ') }, { line: Array(6).fill(long).join(' ') }, { line: 'Close.' }]
    expect(checkWordBudget(s, 'sprint').over).toBe(true)
    const t = trimToBudget(s, 'sprint')
    expect(checkWordBudget(t, 'sprint').over).toBe(false)
    expect(t[0]!.line).toBe('Hook line here.')
    expect(t[3]!.line).toBe('Close.')
  })
  it('profiles follow the requested length', () => {
    expect(pickProfile(T1, 25)).toBe('sprint')
    expect(pickProfile(T1, undefined)).toBe('standard')
    expect(pickProfile(T1, 90)).toBe('deep')
    expect(pickProfile(T3, 25)).toBe('standard')
  })
})

describe('finish record', () => {
  it('records ids only', () => {
    const ledger = [item({ id: 'note', origin: 'her_answer', field: 'note' }), ...outsideItems.slice(0, 3), item({ id: 'k1', origin: 'her_fact', text: 'SECRET-TEXT-FICTIONAL' })]
    const plan = planTemplate(T1, ledger)
    const script = [
      { line: 'Three proofing mistakes nobody tells you?', section: 'hook' },
      { line: 'Here is the first one:', section: 'promise' },
      { line: 'Item one. Next one.', section: 'build' }, { line: 'Item two. Next one.', section: 'build' }, { line: 'Item three. But wait.', section: 'build' },
      { line: 'SECRET-TEXT-FICTIONAL', section: 'anchor' }, { line: 'Save it.', section: 'close' },
    ]
    const f = finishTemplate({ plan, profile: 'standard', script, hook_options: [script[0]!.line, 'Stop proofing warm.'], ledger })
    expect(f.record.promise_paid).toBe(true)
    expect(f.record.bridges_ok).toBe('5/5')
    expect(f.record.slots.topic).toBe('note')
    expect(JSON.stringify(f.record)).not.toContain('SECRET')
    expect(renderTemplateBlock(plan, 'standard', ledger)).toContain(T1.id)
  })
})

describe('edge parity and trial gate', () => {
  it('the edge copies are generated from these sources', () => {
    for (const [src, dest] of [['templates/templateData.ts', 'templateData.ts'], ['templates/scriptTemplates.ts', 'scriptTemplates.ts']] as const) {
      const a = readFileSync(new URL(`../${src}`, import.meta.url), 'utf8')
      const b = readFileSync(new URL(`../../../../../supabase/functions/_shared/${dest}`, import.meta.url), 'utf8')
      const body = b.split('\n').slice(4).join('\n').replace(/from '\.\/(\w+)\.ts'/g, "from './$1.js'")
      expect(body).toBe(a.replace(/from '\.\.\/(\w+)\.js'/g, "from './$1.js'"))
    }
  })
  it('the edge picks a template only under trialOn', () => {
    const src = readFileSync(new URL('../../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url), 'utf8')
    const calls = [...src.matchAll(/chooseTemplates\(/g)]
    expect(calls.length).toBe(1)
    const at = calls[0]!.index!
    expect(src.slice(at - 1500, at)).toMatch(/newOn\('templates'\) \?/) // releaseFlags: S0 default = trialOn
    expect(src).toMatch(/if \(trialOn && templatePlan/)
  })
})

describe('a template question already in the script', () => {
  it('keeps the gate from calling the script final', async () => {
    const { runInventionGate } = await import('../inventionGate.js')
    const bp = { script: [{ line: 'What do you drink?' }, { line: '[Your answer: Is there a moment you remember about this? Describe it in your own words, or skip.]' }, { line: 'Link in bio.' }] }
    const r = await runInventionGate({ blueprint: bp, ledger: [] }, { judge: async () => '{"verdicts":[]}', rewrite: async () => '{"rewrites":[]}' })
    expect(r.record.outcome).toBe('needs_answers')
  })
})

// ⚠️ REGRESSION (panel-current-3): the brief told the writer to "write exactly
// [Your answer: …]" for an asked slot while its system prompt forbids any
// bracket in a spoken line. Briefs with asked slots ran both model attempts to
// timeout. The brief must never ask for a bracket; the question still reaches
// her through `plan.questions`.
describe('writer brief never asks for a bracket', () => {
  it('asked slots say leave it out, and the questions still exist', () => {
    const ledger = [item({ id: 'n1', origin: 'her_story', text: 'A made-up morning at the fictional market stall.' })]
    const plan = planTemplate(T3, ledger)
    expect(plan.slots.some((s) => s.fill === 'asked')).toBe(true)
    expect(plan.questions.length).toBeGreaterThan(0)
    const block = renderTemplateBlock(plan, 'standard', ledger)
    expect(block).not.toMatch(/\[|\]/)
    expect(block).not.toMatch(/Your answer/i)
    for (const s of plan.slots.filter((x) => x.fill === 'asked')) expect(block).toContain(`${s.slot}: not on file yet, leave it out`)
  })
  it('every template, empty ledger, any profile: no bracket in the brief', () => {
    for (const t of SCRIPT_TEMPLATES) {
      const plan = planTemplate(t, [])
      for (const p of t.duration_profiles) expect(renderTemplateBlock(plan, p, [])).not.toMatch(/\[|\]/)
    }
  })
})

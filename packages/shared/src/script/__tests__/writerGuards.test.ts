// Writer guards, picked hooks, spine detectors, T5 eligibility and the template
// retry (panel-current-5 fixes, trial only). Every fixture here is made up:
// fictional creators, products and lines, no creator or panel text.
import { describe, it, expect } from 'vitest'
import { ruleRead, isScaffoldText, type LedgerItem, type GateSentence } from '../inventionGate.js'
import { guardScript, sentenceRule, applyHookPick, hasEventDate } from '../writerGuards.js'
import { itemFits, lengthenCandidates, enforceWordBudget, chooseTemplates, planTemplate } from '../templates/scriptTemplates.js'
import { skeletonLines } from '../templates/templateSkeleton.js'
import { T5 } from '../templates/templateData.js'
import { eligibleShapes } from '../hooks/hookShapes.js'
import { runHookEngine } from '../hooks/hookEngine.js'
import { renderSpineBeatsBlock, checkSpineBeatAdherence, type SpineBeats } from '../planner/spineContract.js'
import { renderFamilyHookRule, SCRIPT_FAMILIES } from '../scriptFamily.js'

const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin'>): LedgerItem => ({
  product_id: null, field: null, text: 'a made-up line', numbers: [], first_party: true, live: false, source_label: o.origin, ...o,
})
const sentence = (text: string): GateSentence => ({ i: 0, surface: 'script', at: 0, k: 0, text } as GateSentence)

// Fictional soap maker "Brookfern", made up.
const ledger: LedgerItem[] = [
  item({ id: 'k1', origin: 'her_story', text: 'My first goat milk soap batch seized in the pot.' }),
  item({ id: 'p1', origin: 'product_fact', product_id: 'bar', field: 'process_step', text: 'Each oat soap bar cures for six weeks on a cedar rack.' }),
  item({ id: 'p2', origin: 'product_fact', product_id: 'bar', field: 'testimonial', text: 'The only bar that has not dried my hands.' }),
  item({ id: 'offer', origin: 'offer', product_id: 'bar', text: 'Oat soap bar, link in bio' }),
  item({ id: 'w1', origin: 'outside_research', first_party: false, text: 'Zephyr Lathe Soap Cutter A wire cutter that slices loaves into even bars without crumbling.' }),
  item({ id: 'w2', origin: 'outside_moment', first_party: false, text: 'Makers Fair 2031 Soap makers gather to talk about cold process labels.' }),
]

describe('scaffolding is blocked deterministically', () => {
  it('reads test-data labels and placeholders as scaffolding, and plain lines as not', () => {
    for (const t of [
      "MADE-UP TESTIMONIAL: 'Lovely soap.' (fictional customer)",
      'A made-up review says it lasts.',
      'Testimonial: it smells great.',
      'Sample testimonial goes here.',
      '[insert customer name] loved it.',
      'Use {{product}} daily.',
    ]) expect(isScaffoldText(t), t).toBe(true)
    for (const t of ['Each bar cures for six weeks.', 'I made this soap by hand.', '[Your answer: how long does it cure?]']) expect(isScaffoldText(t), t).toBe(false)
  })

  it('the gate blocks scaffolding even when a ledger item says the same words', () => {
    const scaffold = "MADE-UP TESTIMONIAL: 'The only bar that has not dried my hands.' (fictional customer)"
    const withItem = [...ledger, item({ id: 'x', origin: 'product_fact', product_id: 'bar', text: scaffold })]
    const r = ruleRead(sentence(scaffold), withItem, [{ id: 'bar', name: 'Oat soap bar' }], 'bar')
    expect(r.hard).toEqual({ cls: 'I', reason: 'scaffold_text' })
  })
})

describe('writer guards drop, never write', () => {
  const ctx = { ledger, targetProductId: 'bar' }
  it('(a) drops a first-person habit or team fact with nothing of hers behind it', () => {
    expect(sentenceRule('I use this cutter every single morning.', ctx)).toBe('first_person_unbacked')
    expect(sentenceRule('That is why my team and I run the shop.', ctx)).toBe('first_person_unbacked')
    // her own material backs it
    expect(sentenceRule('I cure each oat soap bar for six weeks on a cedar rack.', ctx)).toBe(null)
  })
  it('(b) drops scarcity with no live urgency fact, keeps it with one', () => {
    expect(sentenceRule('Grab yours before they sell out.', ctx)).toBe('scarcity_not_live')
    const live = { ledger: [...ledger, item({ id: 'u', origin: 'urgency', product_id: 'bar', field: 'urgency', text: 'Spring batch closes on 30 April', live: true })] }
    expect(sentenceRule('Grab yours before they sell out.', live)).toBe(null)
  })
  it('(c) drops timing with no dated item', () => {
    expect(sentenceRule('Soap makers are meeting this week to talk labels.', ctx)).toBe('timing_undated')
    const dated = { ledger: [...ledger, item({ id: 'd', origin: 'outside_moment', first_party: false, live: true, text: 'Makers Fair on 14 May 2031' })] }
    expect(sentenceRule('Soap makers are meeting this week to talk labels.', dated)).toBe(null)
  })
  it('(d) never describes an outside product as hers', () => {
    expect(sentenceRule('My Zephyr cutter does the work.', ctx)).toBe('outside_as_hers')
    expect(sentenceRule('It slices loaves into even bars without crumbling.', ctx)).toBe('outside_as_hers')
    expect(sentenceRule('My first batch seized in the pot.', ctx)).toBe(null)
  })
  it('drops only the failing sentence, removes emptied beats and failing hooks, records counts only', () => {
    const g = guardScript({
      ...ctx,
      script: [
        { line: 'Each bar cures for six weeks. Get yours before they sell out.', section: 'Build' },
        { line: "MADE-UP TESTIMONIAL: 'Nice.' (fictional customer)", section: 'build' },
        { line: 'Link in bio.', section: 'CTA' },
      ],
      hook_options: ['Why does soap need six weeks?', 'I use this cutter daily.'],
    })
    expect(g.script.map((b) => b.line)).toEqual(['Each bar cures for six weeks.', 'Link in bio.'])
    expect(g.hook_options).toEqual(['Why does soap need six weeks?'])
    expect(g.record).toMatchObject({ dropped_sentences: 3, dropped_lines: 1, dropped_hooks: 1 })
    expect(g.record.rules).toEqual({ scarcity_not_live: 1, scaffold: 2, first_person_unbacked: 1 })
    expect(JSON.stringify(g.record)).not.toMatch(/six weeks|cutter|sell out/)
  })
})

describe('picked hooks ship', () => {
  it('lead hook_options (moves aligned) and open script line 1', () => {
    const ap = applyHookPick({
      script: [{ line: 'An old opener. Then the real point.', section: 'Hook' }, { line: 'Body.' }],
      hook_options: ['An old opener.', 'Why does soap need six weeks?'],
      hook_moves: ['cold_open', 'question_answered'],
      picked: ['Why does soap need six weeks?', 'Six weeks on a cedar rack, here is why.'],
      picked_moves: ['question_answered', 'reveal_verdict'],
    })
    expect(ap.applied).toBe(true)
    expect(ap.hook_options).toEqual(['Why does soap need six weeks?', 'Six weeks on a cedar rack, here is why.', 'An old opener.'])
    expect(ap.hook_moves).toEqual(['question_answered', 'reveal_verdict', 'cold_open'])
    expect(ap.script[0]!.line).toBe('Why does soap need six weeks? Then the real point.')
  })
  it('changes nothing with no pick', () => {
    const ap = applyHookPick({ script: [{ line: 'Keep me.' }], hook_options: ['Keep me.'], picked: [] })
    expect(ap.applied).toBe(false)
    expect(ap.script[0]!.line).toBe('Keep me.')
  })
})

describe('number-shaped hooks need a number on file', () => {
  it('a number-free outside item no longer makes number_promise eligible', () => {
    const noNums = [item({ id: 'q', origin: 'audience_question', first_party: false, text: 'Why does my soap sweat?' }), item({ id: 'r', origin: 'outside_research', first_party: false, text: 'Glycerin pulls water from humid air.' })]
    expect(eligibleShapes(noNums).map((s) => s.id)).not.toContain('number_promise')
    const withNum = [...noNums, item({ id: 'n', origin: 'her_fact', text: 'Cured 40 bars last spring', numbers: [{ value: 40, unit: 'count', field: 'x' }] })]
    expect(eligibleShapes(withNum).map((s) => s.id)).toContain('number_promise')
  })
  it('price_or_proof needs a product number', () => {
    expect(eligibleShapes([item({ id: 'p', origin: 'product_fact', product_id: 'bar', text: 'Oat soap bar' })]).map((s) => s.id)).not.toContain('price_or_proof')
  })
  it('a pick with candidates and shapes is non-empty', () => {
    const l = [item({ id: 'q', origin: 'audience_question', first_party: false, text: 'Why does my soap sweat in the bathroom?' })]
    const e = runHookEngine([{ shape: 'audience_question', text: 'Why does my soap sweat in the bathroom?' }], l)
    expect(e.pick.hooks).toEqual(['Why does my soap sweat in the bathroom?'])
  })
})

describe('T5 is ineligible without a dated item', () => {
  it('a bare year in a name is not a date', () => {
    expect(hasEventDate('Makers Fair 2031 Soap makers gather')).toBe(false)
    expect(hasEventDate('You may want to try this')).toBe(false)
    expect(hasEventDate('Makers Fair on 14 May 2031')).toBe(true)
    expect(hasEventDate('Fair opens March 3')).toBe(true)
    expect(hasEventDate('Opens 2031-05-14')).toBe(true)
  })
  it('planTemplate(T5) is not eligible with only an undated outside item', () => {
    const p = planTemplate(T5, ledger, { targetProductId: 'bar' })
    expect(p.eligible).toBe(false)
    expect(chooseTemplates({ goal: 'educate', ledger, targetProductId: 'bar' }).map((c) => c.template.id)).not.toContain('t5_timely_hook')
    const slot = T5.beats[0]!.slots[0]!
    expect(itemFits(item({ id: 'd', origin: 'outside_moment', first_party: false, text: 'Makers Fair on 14 May 2031' }), slot, null)).toBe(true)
  })
})

describe('no material, no stand-in', () => {
  it('lengthening never adds a testimonial or scaffold item as her line', () => {
    const l = [...ledger, item({ id: 's1', origin: 'her_fact', text: "MADE-UP TESTIMONIAL: 'Best soap ever made for my dry hands' (fictional customer)" })]
    const ids = lengthenCandidates([{ line: 'Short.' }], l, 'bar').map((x) => x.id)
    expect(ids).not.toContain('p2')
    expect(ids).not.toContain('s1')
    const wb = enforceWordBudget([{ line: 'Short.' }, { line: 'Link in bio.' }], 'standard', l, 'bar')
    expect(wb.script.map((b) => String(b.line)).join(' ')).not.toMatch(/MADE-UP|fictional|dried my hands/)
  })
  it('the skeleton keeps a customer quote attributed and drops scaffold items', () => {
    const plan = { template: { beats: [{ role: 'build' }] }, slots: [
      { key: 'a', slot: 'proof', beat: 0, required: false, item_id: 'p2', fill: 'p2' },
      { key: 'b', slot: 'proof', beat: 0, required: false, item_id: 's', fill: 's' },
    ] } as unknown as Parameters<typeof skeletonLines>[0]
    const lines = skeletonLines(plan, [...ledger, item({ id: 's', origin: 'her_fact', text: 'Testimonial: placeholder' })])
    expect(lines).toHaveLength(1)
    expect(lines[0]!.text).toMatch(/^a customer's own words, quoted as theirs/)
  })
  it('spine beats with no material become a question or are left out', () => {
    const sb: SpineBeats = {
      beats: [
        { role: 'hook', item_ids: [], purpose: 'open on the spine' },
        { role: 'reality_check', item_ids: [], purpose: 'x' },
        { role: 'creator_truth', item_ids: [], purpose: 'x' },
        { role: 'cta', item_ids: [], purpose: 'x' },
      ],
      questions: [], objection_used: false, objection_item_id: null, creator_truth_missing: true,
    }
    const block = renderSpineBeatsBlock(sb)
    expect(block).toMatch(/reality_check: .*ask it as a question/)
    expect(block).toMatch(/cta: no offer on file/)
    expect(block).not.toMatch(/\d\. creator_truth/)
    expect(block).toMatch(/never state what people or most people do/)
  })
})

describe('spine detectors read real asks and viewer framing', () => {
  const sb: SpineBeats = {
    beats: [{ role: 'reality_check', item_ids: [], purpose: '' }, { role: 'cta', item_ids: [], purpose: '' }],
    questions: [], objection_used: false, objection_item_id: null, creator_truth_missing: true,
  }
  const met = (lines: string[]) => Object.fromEntries(checkSpineBeatAdherence(lines.map((line) => ({ line })), sb, []).map((a) => [a.role, a.met]))
  it('counts "the link is in my bio", "tell me in the comments", "send this to someone"', () => {
    for (const close of ['Grab your bar, the link is in my bio.', 'What would you pick? Tell me in the comments.', 'Send this to someone who makes soap.', 'Drop your setup below.']) {
      expect(met(['Opening.', 'Middle.', close]).cta, close).toBe(true)
    }
    expect(met(['Opening.', 'Middle.', 'That is the whole process.']).cta).toBe(false)
  })
  it('counts a question framed at the viewer, and no longer rewards "most people"', () => {
    expect(met(['Have you ever noticed your soap sweating?', 'x', 'y']).reality_check).toBe(true)
    expect(met(['If you have ever cut a soap loaf, you know.', 'x', 'y']).reality_check).toBe(true)
    expect(met(['Most people store soap in the shower.', 'x', 'y']).reality_check).toBe(false)
  })
})

describe('hook move examples stay out of the trial brief', () => {
  it('real creators keep the examples; the trial brief has none', () => {
    const plain = renderFamilyHookRule(SCRIPT_FAMILIES[0])
    const trial = renderFamilyHookRule(SCRIPT_FAMILIES[0], { examples: false })
    expect(plain).toContain('Real: "')
    expect(trial).not.toContain('Real: "')
    expect(trial).toMatch(/no number, person, result or event she did not give you/)
  })
})

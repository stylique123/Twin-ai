// PANEL-CURRENT-7 FIXES (trial only). Fictional fixtures throughout.
import { describe, it, expect } from 'vitest'
import {
  applyRepairs, dedupeSpokenLines, dedupAdjacentLines, nearDuplicate, NEAR_DUP_MIN, NEAR_DUP_MIN_TERMS, spokenUnits, refillUnits, extractSentences, topUpToBudget,
  type GateBlueprint, type GateQuestion, type LedgerItem,
} from '../inventionGate'
import { budgetExtendDecision, budgetPromptLine } from '../scriptIntegrity'
import { lengthenCandidates } from '../templates/scriptTemplates'

const HOOK = 'I burned three batches of teal glaze before the kiln behaved.'

describe('2. spoken de-dup', () => {
  it('line 2 that restates the hook (line 1) is removed', () => {
    const script = [
      { line: HOOK, section: 'hook' },
      { line: 'Three batches of teal glaze burned before my kiln behaved.', section: 'build' },
      { line: 'The fix was a slower cool-down after the last firing.', section: 'turn' },
      { line: 'Come find the mugs at the Saturday market.', section: 'close' },
    ]
    const r = dedupeSpokenLines(script)
    expect(r.removed).toBe(1)
    expect(r.script).toHaveLength(3)
    expect(r.script[0]!.line).toBe(HOOK)
  })
  it('adjacent restatements (line 3 = line 2, line 4 = line 3) are removed, the earlier kept', () => {
    const script = [
      { line: HOOK },
      { line: 'The cooling ramp matters more than the peak kiln temperature.' },
      { line: 'Honestly the peak kiln temperature matters less than the cooling ramp.' },
      { line: 'Sell the cracked seconds as planters at the market stall.' },
      { line: 'Those cracked seconds become planters at the market stall.' },
    ]
    const r = dedupeSpokenLines(script)
    expect(r.removed).toBe(2)
    expect(r.script.map((b) => b.line)).toEqual([script[0]!.line, script[1]!.line, script[3]!.line])
  })
  it('a repeat inside one line drops only the later sentence', () => {
    const r = dedupeSpokenLines([{ line: HOOK }, { line: 'Glaze recipes shift with every clay body. Every clay body shifts the glaze recipe. Test tiles first.' }])
    expect(r.removed).toBe(1)
    expect(r.script[1]!.line).toBe('Glaze recipes shift with every clay body. Test tiles first.')
  })
  it('fewer than 4 content terms on the smaller side only counts an exact repeat', () => {
    expect(nearDuplicate('Teal glaze burned.', 'The teal glaze burned again in the old kiln today.')).toBe(false)
    expect(nearDuplicate('Teal glaze burned.', 'teal glaze burned')).toBe(true)
    expect(NEAR_DUP_MIN).toBe(0.6)
    expect(NEAR_DUP_MIN_TERMS).toBe(4)
  })
  it('distinct lines are kept', () => {
    const script = [{ line: HOOK }, { line: 'A buyer asked for a matte version.' }, { line: 'So I mixed a new satin base.' }]
    expect(dedupeSpokenLines(script).removed).toBe(0)
  })
  it('#22: her named story restating the hook is kept and the hook duplicate goes', () => {
    const story = 'Three batches of teal glaze burned in my kiln before the slow cooling fixed it.'
    const script = [{ line: 'Teal glaze burned three batches in my kiln.' }, { line: story }, { line: 'Find me Saturday.' }]
    const r = dedupAdjacentLines(script, [story])
    expect(r.script.map((b) => b.line)).toContain(story)
    expect(r.record.hook_yielded).toBe(1)
  })
  it('both protected: both stay', () => {
    const story = 'Three batches of teal glaze burned in my kiln before the slow cooling fixed it.'
    const r = dedupAdjacentLines([{ line: story }, { line: story }], [story])
    expect(r.script).toHaveLength(2)
  })
})

describe('1. refill from the post-drop script and from item lines', () => {
  const it2 = (id: string, text: string): LedgerItem => ({ id, origin: 'her_story', product_id: null, field: null, text, numbers: [], first_party: true, live: false, source_label: 'her_story' })
  it('an item spanning lines becomes one unit per line', () => {
    expect(spokenUnits('The co-op kiln fires on Thursdays only.\nEach mug takes two weeks from wheel to shelf.')).toHaveLength(2)
  })
  it('"already said" is judged against the current text: a dropped paraphrase no longer hides her item', () => {
    const item = it2('s1', 'The co-op kiln fires on Thursdays only.')
    expect(refillUnits([item], null, 'Our kiln at the co-op only fires Thursdays.')).toHaveLength(0)
    expect(refillUnits([item], null, '')).toHaveLength(1)
  })
  it('lengthen (units) offers each line of a multi-line item; legacy refuses it whole', () => {
    const script = [{ line: HOOK }, { line: 'Slow cooling fixed it.' }, { line: 'Find me Saturday.' }]
    const ledger = [it2('m1', 'The co-op kiln fires on Thursdays only.\nEach mug takes about two weeks from wheel to shelf.')]
    expect(lengthenCandidates(script, ledger, null).length).toBe(0)
    expect(lengthenCandidates(script, ledger, null, { units: true }).length).toBe(2)
  })
})

describe('1. refill to the word budget', () => {
  it('adds unused items before the close up to the budget and skips one already said', () => {
    const script = [{ line: HOOK }, { line: 'Slow cooling fixed it.' }, { line: 'See you at the market.' }]
    const q = ['The kiln at the co-op studio fires on Thursdays only.', 'Slow cooling fixed it for good every time.', 'Each mug takes about two weeks from wheel to shelf.']
    const r = topUpToBudget(script, q, 40)
    expect(r.added).toBe(2)
    expect(r.script[r.script.length - 1]!.line).toBe('See you at the market.')
  })
  it('never passes 110% of the budget', () => {
    const r = topUpToBudget([{ line: 'one two three' }], ['alpha beta gamma delta epsilon zeta eta theta iota kappa'], 5)
    expect(r.added).toBe(0)
  })
})

describe('1. extension held to the profile budget', () => {
  const beats = [
    { line: HOOK, section: 'hook' }, { line: 'The glaze ran off the rim.', section: 'build' },
    { line: 'Slower cooling fixed it.', section: 'turn' }, { line: 'Find me Saturday.', section: 'cta' },
  ]
  it('extends a 30-word script toward a 140-word Standard budget', () => {
    const d = budgetExtendDecision(beats, 140)
    expect(d.extend).toBe(true)
    expect(d.target).toBe(140)
    expect(d.indices.length).toBeGreaterThan(0)
  })
  it('does not extend at 85% or more', () => {
    expect(budgetExtendDecision(beats, 28).extend).toBe(false)
  })
  it('the prompt line names the budget', () => {
    expect(budgetPromptLine(140)).toContain('140')
    expect(budgetPromptLine(0)).toBe('')
  })
})

describe('3. audit records', () => {
  const Q: GateQuestion = { scope: 'script', kind: 'story', text: 'What happened?', writes_to: 'story' }
  const bp: GateBlueprint = { script: [{ line: HOOK }, { line: 'A buyer cried over the teal mug.' }, { line: 'Come see the stall.' }] }
  const sentences = extractSentences(bp)
  const i = sentences.findIndex((s) => s.text.startsWith('A buyer'))
  it('an identical rewrite is not "replaced" (trial): it is dropped or refilled', () => {
    const a = applyRepairs(bp, sentences, [{ i, action: 'replace', item_ids: [] } as never], new Map([[i, 'A buyer cried over the teal mug.']]), { holdAsks: true, refill: [] })
    expect(a.replaced).toBe(0)
    expect(a.outcomes[0]!.action).toBe('dropped')
  })
  it('legacy path keeps the old behaviour', () => {
    const a = applyRepairs(bp, sentences, [{ i, action: 'replace', item_ids: [] } as never], new Map([[i, 'A buyer cried over the teal mug.']]))
    expect(a.replaced).toBe(1)
  })
  it('an ask that is refilled is audited as asked, matching repaired.asked', () => {
    const a = applyRepairs(bp, sentences, [{ i, action: 'ask', item_ids: [], question: Q } as never], new Map(), { holdAsks: true, refill: ['The co-op kiln fires on Thursdays only.'] })
    expect(a.asked).toBe(1)
    expect(a.refilled).toBe(1)
    expect(a.outcomes[0]).toEqual({ i, action: 'asked', replacement: 'The co-op kiln fires on Thursdays only.' })
  })
})

// PANEL-CURRENT-6 FIXES (trial only). Fictional fixtures throughout.
import { describe, it, expect } from 'vitest'
import {
  applyRepairs, blockSpokenPlaceholders, extractSentences, refillCandidates, reconcileHookPick, buildLedger, carryClasses,
  type GateBlueprint, type GateQuestion, type LedgerItem,
} from '../inventionGate'
import { applyHookPick } from '../writerGuards'
import { questionUse, isSkipAnswer } from '../questionUsefulness'
import { restoreAskedStory } from '../storyFirst'
import { gateStories } from '../storyRotation'
import { chooseDuration, countsFromLedger } from '../templates/durationFromMaterial'
import { isSurprisingSpecific, openCandidates } from '../hooks/hookEngine'

const Q: GateQuestion = { scope: 'script', kind: 'story', text: 'What actually happened here?', writes_to: 'story' }
const item = (id: string, origin: LedgerItem['origin'], text: string, extra: Partial<LedgerItem> = {}): LedgerItem => ({
  id, origin, product_id: null, field: null, text, numbers: [], first_party: true, live: false, source_label: origin, ...extra,
})

describe('1. no placeholder in spoken text', () => {
  const bp: GateBlueprint = { script: [
    { line: 'The kettle at the fair stall hissed all morning.', section: 'hook' },
    { line: 'A buyer once cried over the teal mug.', section: 'build' },
    { line: 'Come see the stall on Saturday.', section: 'close' },
  ] }
  it('legacy path still writes the placeholder (real creators unchanged)', () => {
    const s = extractSentences(bp)
    const r = applyRepairs(bp, s, [{ i: 1, action: 'ask', item_ids: [], question: Q }])
    expect(JSON.stringify(r.bp.script)).toContain('[Your answer:')
  })
  it('holdAsks drops the asked line, keeps the question separate', () => {
    const s = extractSentences(bp)
    const r = applyRepairs(bp, s, [{ i: 1, action: 'ask', item_ids: [], question: Q }], new Map(), { holdAsks: true })
    expect((r.bp.script as Array<{ line: string }>).some((b) => b.line.includes('['))).toBe(false)
    expect(r.asked).toBe(1)
    expect(r.questions).toEqual([Q])
    expect((r.bp.script as unknown[]).length).toBe(2)
  })
  it('holdAsks refills the line from her next unused item instead of shrinking', () => {
    const s = extractSentences(bp)
    const refill = ['I glaze every mug twice because the first coat always runs thin.']
    const r = applyRepairs(bp, s, [{ i: 1, action: 'ask', item_ids: [], question: Q }], new Map(), { holdAsks: true, refill })
    expect((r.bp.script as Array<{ line: string }>)[1]!.line).toBe('I glaze every mug twice because the first coat always runs thin.')
    expect(r.refilled).toBe(1)
    // A refilled sentence is her own item: it is carried as supported, never as I.
    const next = extractSentences(r.bp)
    const carried = carryClasses({ sentences: s, classified: s.map((x) => ({ ...x, class: 'S' as const, claim_types: [], item_ids: [], reason: 'entailed' as const, near: [], judged: true })) as never }, next,
      new Set(['I glaze every mug twice because the first coat always runs thin.']))
    expect(carried.every((c) => c.class !== 'I')).toBe(true)
  })
  it('the final check removes any bracket span in a spoken line or hook', () => {
    const pb = blockSpokenPlaceholders({
      script: [{ line: 'Real opener here.' }, { line: '[Your answer: What is the exact number?] The fix is one owner per thread.' }, { line: '[Your answer: Anything?]' }],
      hook_options: ['A real hook line.', 'My [product name] changed this.'],
    })
    expect(pb.bp.script).toEqual([{ line: 'Real opener here.' }, { line: 'The fix is one owner per thread.' }])
    expect(pb.bp.hook_options).toEqual(['A real hook line.'])
    expect(pb.removed).toBe(3)
    expect(pb.beatsDropped).toBe(1)
  })
  it('refill candidates are first-party, on this product, unsaid and never a skip', () => {
    const led = [
      item('a', 'her_fact', 'I glaze every mug twice because the first coat always runs thin.'),
      item('b', 'her_answer', 'Nothing specific, keep it general.', { field: 'angle' }),
      item('c', 'product_fact', 'Each mug holds about three hundred millilitres of tea.', { product_id: 'other' }),
      item('d', 'outside_research', 'Clay retains heat longer than steel in one kitchen test.', { first_party: false }),
      item('e', 'her_story', 'The kettle at the fair stall hissed all morning long.'),
    ]
    expect(refillCandidates(led, 'mine', 'The kettle at the fair stall hissed all morning.')).toEqual(['I glaze every mug twice because the first coat always runs thin.'])
  })
})

describe('2. question_use', () => {
  it('a skip is counted as skipped, never answered', () => {
    expect(isSkipAnswer('Nothing specific, keep it general.')).toBe(true)
    expect(questionUse({ angle: 'Nothing specific, keep it general.' }, ['Any line.'])).toEqual({ answered: 0, skipped: 1, used: 0, used_keys: [] })
  })
  it('an answer that reaches the script is used, across word endings', () => {
    const u = questionUse({ story: 'I deadlifted with rounded shoulders and strained my back' }, ['My first deadlift strained my back because my shoulders rounded.'])
    expect(u.answered).toBe(1)
    expect(u.used).toBe(1)
    expect(u.used_keys).toEqual(['story'])
  })
  it('an unrelated script does not use it', () => {
    expect(questionUse({ story: 'The kiln cracked my favourite platter in winter' }, ['Three ways to plan a week of meals.']).used).toBe(0)
  })
})

describe('3. the story her note names reaches the writer', () => {
  const story = { id: 's1', kind: 'experience', text: 'The first time I tried a kettlebell swing I copied a video and my wrist ached for days.', basis: 'stated' }
  it('restored when the purpose/ask filters held it', () => {
    const r = restoreAskedStory([{ id: 'f1', kind: 'opinion', text: 'Beginners quit when the plan is too big.', basis: 'stated' }], [story], 'my first kettlebell swing went wrong', () => true)
    expect(r.restored?.id).toBe('s1')
    expect(r.rows[0]!.id).toBe('s1')
  })
  it('not restored when a guard forbids it', () => {
    expect(restoreAskedStory([], [story], 'my first kettlebell swing went wrong', () => false).restored).toBeNull()
  })
  it('never off-product when her note names it (trial askedText)', () => {
    const g = gateStories([story], { productText: 'Weekly plan built around home equipment', askedText: 'my first kettlebell swing went wrong', hardLimitsOnly: true })
    expect(g.kept.map((k) => k.id)).toEqual(['s1'])
    const legacy = gateStories([story], { productText: 'Weekly plan built around home equipment', hardLimitsOnly: true })
    expect(legacy.offProduct.map((k) => k.id)).toEqual(['s1'])
  })
})

describe('4. picked hooks lead hook_options, once each', () => {
  it('a pick the gate removed is no longer a pick; options deduped', () => {
    const r = reconcileHookPick({
      hook_options: ['Pick B survived.', 'Other option.', 'pick b survived', 'Other option.'],
      hook_pick: { hooks: ['Pick A was rewritten.', 'Pick B survived.'], shapes: ['x', 'y'], scores: [0.9, 0.8], indices: [0, 1] },
    })!
    expect(r.hook_options).toEqual(['Pick B survived.', 'Other option.'])
    expect(r.hook_pick.hooks).toEqual(['Pick B survived.'])
    expect(r.hook_pick.shapes).toEqual(['y'])
    expect(r.removed).toBe(1)
  })
  it('applyHookPick dedupes picks and drops a line-2 repeat of the hook', () => {
    const ap = applyHookPick({
      script: [{ line: 'Old opener.' }, { line: 'My first kettlebell swing went wrong. Here is the fix.' }, { line: 'Try it.' }],
      hook_options: ['My first kettlebell swing went wrong.', 'Another hook.'],
      picked: ['My first kettlebell swing went wrong.', 'my first kettlebell swing went wrong'],
    })
    expect(ap.hook_options).toEqual(['My first kettlebell swing went wrong.', 'Another hook.'])
    expect(ap.script[0]!.line).toBe('My first kettlebell swing went wrong.')
    expect(ap.script[1]!.line).toBe('Here is the fix.')
  })
})

describe('5. duration counts what reaches the writer', () => {
  it('counts her story, real answers, this product and the kept outside items', () => {
    const led = [
      item('s', 'her_story', 'The kiln door stuck on my first firing.'),
      item('a', 'her_answer', 'Nothing specific, keep it general.'),
      item('n', 'her_answer', 'beans'),
      item('p1', 'product_fact', 'Ten dollars a mug', { product_id: 'p' }),
      item('p2', 'product_fact', 'Another product', { product_id: 'q' }),
      item('o', 'niche_note', 'Kilns are popular this year.', { first_party: false }),
    ]
    expect(countsFromLedger(led, 'p')).toMatchObject({ stories: 1, answers: 0, product_facts: 1, outside: 1 })
  })
  it('a story plus one fact stays at the requested Standard', () => {
    expect(chooseDuration('standard', { stories: 1, facts: 1, answers: 0, product_facts: 0 }).chosen).toBe('standard')
  })
})

describe('hooks: fact-open needs a surprising specific', () => {
  it('a bare spec does not open a hook; a reversal does', () => {
    expect(isSurprisingSpecific(item('p', 'product_fact', 'A weekly plan built around the equipment you already have'))).toBe(false)
    expect(isSurprisingSpecific(item('f', 'her_fact', 'Beginners quit because the plan is too big, not because they are lazy, but nobody says it.'))).toBe(true)
  })
  it('story-open candidates come first', () => {
    const led = buildLedger({ knowledge: [{ id: 's', kind: 'experience', text: 'My first kiln load cracked every lid.' }], now: 0 })
    const c = openCandidates(led, { request: 'my first kiln load' })
    expect(c[0]?.source).toBe('story_open')
  })
})

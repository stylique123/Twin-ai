// FACTS_ONLY_WRITER (panel 14). Fictional ledgers from the panel fixture.
import { describe, it, expect } from 'vitest'
import { needsFor, decideFacts, alreadyAsked, backEveryLine, backingFact, FACT_THRESHOLD, MAX_QUESTIONS, type LedgerFact, type AskRecord } from '../factsOnly'

const tide = { id: 'mug', name: 'Tide Mug' }
const ledger: LedgerFact[] = [
  { id: 'f1', kind: 'product_fact', text: '$38 per mug', source: 'material', product_id: 'mug' },
  { id: 'f2', kind: 'product_fact', text: 'Holds about 12 oz', source: 'material', product_id: 'mug' },
  { id: 'f3', kind: 'product_fact', text: 'Dishwasher safe, with an unglazed foot', source: 'material', product_id: 'mug' },
  { id: 'f4', kind: 'experience', text: 'My first kiln load came out with every mug glued to the shelf because I glazed the bottoms.', source: 'material' },
  { id: 'f5', kind: 'opinion', text: 'I think a bare clay foot is honest, it shows what the mug is made of.', source: 'material' },
]

describe('needs and questions', () => {
  it('a sell request needs the name, use and price; questions name the product, never "tell me more"', () => {
    const n = needsFor({ note: 'Tide Mug', goal: 'sell', product: tide })
    expect(n.map((x) => x.kind)).toEqual(['product_name', 'usage', 'price'])
    for (const q of n) { expect(q.question).toMatch(/Tide Mug/); expect(q.question).not.toMatch(/tell me more/i) }
  })
  it('a story request with no matching story stops and asks one specific question', () => {
    const d = decideFacts({ note: 'the first time a Tide Mug cracked in the dishwasher', kind: 'story' }, [], [])
    expect(d.action).toBe('needs_answers')
    expect(d.questions).toHaveLength(1)
    expect(d.questions[0].question).toMatch(/the first time a Tide Mug cracked in the dishwasher/)
  })
  it('asks at most 3 questions', () => {
    const d = decideFacts({ note: 'why my first launch nearly failed and how to check stock', goal: 'sell', kind: 'story', product: { id: 'x', name: 'Fog Scarf' } }, [], [])
    expect(d.questions.length).toBeLessThanOrEqual(MAX_QUESTIONS)
  })
  it('writes when every need is covered by the ledger', () => {
    expect(decideFacts({ note: 'Tide Mug', goal: 'sell', product: tide }, ledger).action).toBe('write')
  })
  it(`writes a shorter script from at least ${FACT_THRESHOLD} fitting facts, and asks for the rest`, () => {
    const d = decideFacts({ note: 'the day my first kiln load glued every mug to the shelf', kind: 'story', product: tide, goal: 'sell' }, ledger.filter((f) => f.id !== 'f1'))
    expect(d.action).toBe('write_short')
    expect(d.questions.map((q) => q.kind)).toEqual(['price'])
  })
})

describe('never ask twice', () => {
  const need = needsFor({ note: 'Tide Mug', goal: 'sell', product: tide }).find((n) => n.kind === 'price')!
  it('never asks a question she already answered (the answer is in the ledger under that topic)', () => {
    const answered: LedgerFact[] = [{ id: 'a1', kind: 'answer', text: 'It is $38 and comes gift-wrapped.', source: 'answer', topic: need.key }]
    expect(alreadyAsked(need, answered, [])).toBe(true)
    expect(decideFacts({ note: 'Tide Mug', goal: 'sell', product: tide }, [...answered, ...ledger.filter((f) => f.id !== 'f1')]).questions).toEqual([])
  })
  it('never asks a reworded duplicate (same topic, different words)', () => {
    const history: AskRecord[] = [{ topic: 'something-else', wording: 'How much does the Tide Mug cost right now, and what is included in that price?', outcome: 'shown' }]
    expect(alreadyAsked(need, [], history)).toBe(true)
    expect(alreadyAsked(need, [], [{ topic: need.key, wording: 'Price?', outcome: 'skipped' }])).toBe(true)
  })
  it('a skipped question is not asked again', () => {
    const d = decideFacts({ note: 'the first time a Tide Mug cracked in the dishwasher', kind: 'story' }, [], [{ topic: needsFor({ note: 'the first time a Tide Mug cracked in the dishwasher', kind: 'story' })[0].key, outcome: 'skipped' }])
    expect(d.questions).toEqual([])
    expect(d.action).toBe('cannot_write')
  })
  it('a saved answer is reused for a later script by the same creator', () => {
    const story = needsFor({ note: 'the first time a Tide Mug cracked in the dishwasher', kind: 'story' })[0]
    const withAnswer: LedgerFact[] = [{ id: 'a2', kind: 'answer', text: 'It cracked on day two; I had left it in a cold cycle.', source: 'answer', topic: story.key }]
    expect(decideFacts({ note: 'the first time a Tide Mug cracked in the dishwasher', kind: 'story' }, withAnswer).action).toBe('write')
  })
})

describe('every sentence backed', () => {
  it('an unbacked factual line is cut; backed and generic lines stay with their fact ids', () => {
    const r = backEveryLine([
      { section: 'Hook', line: 'Why is the bottom of this mug bare?' },
      { section: 'Beat 1', line: 'My first kiln load came out with every mug glued to the shelf.' },
      { section: 'Beat 2', line: 'I sold 400 of them in a week.' },
      { section: 'Beat 3', line: 'It holds about 12 oz.' },
      { section: 'CTA', line: 'Link in bio.' },
    ], ledger, { productNames: ['Tide Mug'] })
    const text = r.beats.map((b) => b.line).join(' | ')
    expect(text).not.toMatch(/400/)
    expect(r.cut.cut).toBe(1)
    expect(r.beats.find((b) => /12 oz/.test(String(b.line)))!.fact_ids).toEqual(['f2'])
    expect(r.beats[0].line).toBe('Why is the bottom of this mug bare?')
  })
  it('a number that differs from her fact is not backed', () => {
    expect(backingFact('It holds about 16 oz.', ledger)).toBeNull()
  })
  it('an opinion line needs an opinion she stated', () => {
    expect(backingFact('I think a bare clay foot is honest.', ledger)?.id).toBe('f5')
    expect(backingFact('I think glazed bottoms look cheap.', ledger)).toBeNull()
  })
  it('a generic CTA that states a feeling she never said is cut', () => {
    const r = backEveryLine([{ section: 'Hook', line: 'New mugs.' }, { section: 'Beat', line: 'It holds about 12 oz.' }, { section: 'CTA', line: 'I am so proud of this one. Link in bio.' }], ledger)
    expect(r.beats.at(-1)!.line).toBe('Link in bio.')
  })
})

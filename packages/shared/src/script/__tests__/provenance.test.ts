import { describe, it, expect } from 'vitest'
import { buildProvenance } from '../provenance.js'

const facts = [
  { id: 'f1', text: "Maya's Coffee roasts its beans every Tuesday morning in small batches" },
  { id: 'f2', text: "The oat milk latte costs four dollars at Maya's Coffee" },
]
const lessons = [{ id: 'l1', text: 'Open with the roasting smell, viewers loved it' }]
const stories = [{ id: 's1', text: 'The first espresso machine broke on opening day and customers waited outside' }]

describe('buildProvenance', () => {
  it('lists ids per kind and never returns text', () => {
    const p = buildProvenance({ facts, lessons, stories, notes: 'keep it upbeat', sentences: ['Hello there.'] })
    expect(p.fact_ids).toEqual(['f1', 'f2'])
    expect(p.lesson_ids).toEqual(['l1'])
    expect(p.story_ids).toEqual(['s1'])
    expect(p.note_present).toBe(true)
    expect(JSON.stringify(p)).not.toMatch(/Coffee|upbeat|espresso|Hello/)
  })

  it('attributes a sentence to the fact it restates (stemmed)', () => {
    const p = buildProvenance({ facts, sentences: ['We roast our beans in small batches every Tuesday.'] })
    expect(p.sentences[0]).toEqual({ i: 0, item_ids: ['f1'] })
  })

  it('gives [] when nothing overlaps enough', () => {
    const p = buildProvenance({ facts, sentences: ['Follow for more tips tomorrow.'] })
    expect(p.sentences[0]!.item_ids).toEqual([])
  })

  it('one shared word is not enough', () => {
    const p = buildProvenance({ facts, sentences: ['Beans.'] })
    expect(p.sentences[0]!.item_ids).toEqual([])
  })

  it('caps attribution at two items, best first', () => {
    const many = [
      { id: 'a', text: 'espresso machine broke opening day' },
      { id: 'b', text: 'espresso machine broke yesterday afternoon downtown' },
      { id: 'c', text: 'espresso machine opening' },
    ]
    const p = buildProvenance({ stories: many, sentences: ['Our espresso machine broke on opening day.'] })
    expect(p.sentences[0]!.item_ids).toHaveLength(2)
    expect(p.sentences[0]!.item_ids[0]).toBe('a')
  })

  it('attributes stories and lessons too, indexing sentences in order', () => {
    const p = buildProvenance({ facts, lessons, stories, sentences: [
      'Nothing here.',
      'On opening day the espresso machine broke and customers waited outside.',
      'Open with that roasting smell.',
    ] })
    expect(p.sentences.map((s) => s.i)).toEqual([0, 1, 2])
    expect(p.sentences[1]!.item_ids).toEqual(['s1'])
    expect(p.sentences[2]!.item_ids).toEqual(['l1'])
  })

  it('handles empty and missing input', () => {
    expect(buildProvenance({})).toEqual({ fact_ids: [], lesson_ids: [], story_ids: [], note_present: false, sentences: [] })
  })

  it('skips items with no id and dedupes ids', () => {
    const p = buildProvenance({ facts: [{ text: 'small batches roast beans' }, { id: 'x', text: 'latte' }, { id: 'x', text: 'latte' }], sentences: ['small batches roast beans'] })
    expect(p.fact_ids).toEqual(['x'])
    expect(p.sentences[0]!.item_ids).toEqual([])
  })
})

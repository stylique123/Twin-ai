// NULL MEANS NOBODY ASKED WHAT IT COST — NEVER THAT IT WAS FREE.
//
// The two fields added to `creator_knowledge` are the halves the extractor used
// to drop: what a thing COST the creator, and the consensus they NAMED and
// argued against. Both are absent on all 930 rows written before the prompt
// asked for them, and both will be absent on most rows written after it — an
// item that cost nothing and argues with nobody is the ordinary case.
//
// ⚖️ SO THE WHOLE RISK IS IN THE DEFAULT. If an unrecorded cost read as "no
// cost" the distinction would be lost the moment it was stored; if a blank
// string read as a recorded value, the story step would ask a creator to
// confirm a price nobody named. These tests pin both.
import { describe, expect, it } from 'vitest'
import {
  readKnowledge, readKnowledgeItem, costlyLessons, contrarianStances,
  knowledgePromptLine, rankedKnowledge, KNOWLEDGE_KINDS, type CreatorKnowledge,
} from '../index'

const NOW = new Date('2026-08-30T00:00:00Z')

function store(...items: Array<Record<string, unknown>>): CreatorKnowledge {
  return readKnowledge({ items })
}

const LESSON = {
  kind: 'experience', basis: 'stated', confidence: 0.9, times_seen: 1,
  text: 'Bought forty thousand dollars of inventory before anyone had asked for it',
  cost: '$40,000 and eight months of runway',
  last_observed_at: '2026-08-01T00:00:00Z',
}
const STANCE = {
  kind: 'opinion', basis: 'stated', confidence: 0.9, times_seen: 1,
  text: 'You can sell to two hundred people who trust you',
  consensus: 'you need ten thousand followers before you can sell anything',
  last_observed_at: '2026-08-01T00:00:00Z',
}

describe('an unrecorded field is null, and a blank one is too', () => {
  it('reads both fields when they are present', () => {
    const item = readKnowledgeItem(LESSON)!
    expect(item.cost).toBe('$40,000 and eight months of runway')
    expect(item.consensus).toBeNull()
  })

  it('reads a row written before the columns existed as null, not empty string', () => {
    const item = readKnowledgeItem({ kind: 'experience', text: 'Currently works at Microsoft', basis: 'stated' })!
    expect(item.cost).toBeNull()
    expect(item.consensus).toBeNull()
  })

  it('collapses blank and whitespace to null', () => {
    for (const blank of ['', '   ', '\t', null]) {
      const item = readKnowledgeItem({ ...LESSON, cost: blank })!
      expect(item.cost).toBeNull()
    }
  })

  it('refuses a non-string without taking the whole item down with it', () => {
    const item = readKnowledgeItem({ ...LESSON, cost: { amount: 40000 } })!
    expect(item).not.toBeNull()
    expect(item.cost).toBeNull()
    // The item itself still survives — a junk cost must not lose the lesson.
    expect(item.text).toContain('forty thousand dollars')
  })

  it('caps a long cost the same way it caps text', () => {
    const item = readKnowledgeItem({ ...LESSON, cost: 'x'.repeat(400) })!
    expect(item.cost!.length).toBe(240)
  })
})

describe('the named readers, which is why the fields are allowed to exist', () => {
  it('finds the lessons that carry a price and the stances that name a rival', () => {
    const k = store(LESSON, STANCE, { kind: 'experience', text: 'Currently works at Microsoft', basis: 'stated' })
    expect(costlyLessons(k).map((i) => i.text)).toEqual([LESSON.text])
    expect(contrarianStances(k).map((i) => i.text)).toEqual([STANCE.text])
  })

  it('never returns an inferred one, because an invented cost is an invented debt', () => {
    const k = store({ ...LESSON, basis: 'inferred' }, { ...STANCE, basis: 'inferred' })
    expect(costlyLessons(k)).toHaveLength(0)
    expect(contrarianStances(k)).toHaveLength(0)
  })

  it('is empty on the store as it exists today', () => {
    // Every production row predates the columns. Both readers must return
    // nothing rather than mistaking absence for a value.
    const k = store(
      { kind: 'experience', text: 'Has googled himself', basis: 'stated' },
      { kind: 'opinion', text: 'True success is inner peace rather than accumulating wealth', basis: 'stated' },
    )
    expect(costlyLessons(k)).toHaveLength(0)
    expect(contrarianStances(k)).toHaveLength(0)
  })
})

describe('the writer is handed both halves of the sentence', () => {
  it('renders the cost and the consensus beside the item, not as a separate list', () => {
    const line = knowledgePromptLine(store(LESSON, STANCE), 12, undefined, NOW)
    expect(line).toContain('cost them: $40,000 and eight months of runway')
    expect(line).toContain('argued against: you need ten thousand followers')
    // Still one bullet per item — the halves are rejoined, not split.
    expect(line.split('\n').filter((l) => l.trim().startsWith('* ('))).toHaveLength(2)
  })

  it('adds nothing at all for an item with neither', () => {
    const line = knowledgePromptLine(store({ kind: 'experience', text: 'Currently works at Microsoft', basis: 'stated' }), 12, undefined, NOW)
    expect(line).not.toContain('cost them')
    expect(line).not.toContain('argued against')
  })
})

describe('existing capture is not disturbed', () => {
  it('leaves the closed taxonomy at nine kinds', () => {
    // ⚠️ THE ALTERNATIVE DESIGN WAS NEW KINDS. It was rejected because
    // `KIND_RANK`, `creatorState` and `knowledgeResolver` all gate on
    // `kind === 'experience'`, and re-filing costly lessons would have removed
    // the richest material from all three at once.
    expect(KNOWLEDGE_KINDS).toHaveLength(9)
    expect(KNOWLEDGE_KINDS).not.toContain('lesson')
    expect(KNOWLEDGE_KINDS).not.toContain('contrarian')
  })

  it('a costly lesson is still an experience to every reader that wants one', () => {
    const k = store(LESSON)
    expect(k.items[0].kind).toBe('experience')
    expect(rankedKnowledge(k)[0].kind).toBe('experience')
  })

  it('ranks exactly as it did before — the fields are not a tiebreak', () => {
    const withCost = store(LESSON, STANCE)
    const without = store({ ...LESSON, cost: null }, { ...STANCE, consensus: null })
    expect(rankedKnowledge(withCost).map((i) => i.text))
      .toEqual(rankedKnowledge(without).map((i) => i.text))
  })
})

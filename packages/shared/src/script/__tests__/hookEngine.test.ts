// Hook engine (A5). Every fixture here is made up.
import { describe, it, expect } from 'vitest'
import type { LedgerItem } from '../inventionGate.js'
import { candidateQuota, renderHookCandidateRule, runHookEngine, lengthScore, specificityScore, pickTop } from '../hooks/hookEngine.js'
import { eligibleShapes } from '../hooks/hookShapes.js'

const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin'>): LedgerItem => ({
  product_id: null, field: null, text: 'a made-up line', numbers: [], first_party: true, live: false, source_label: o.origin, ...o,
})
const ledger: LedgerItem[] = [
  item({ id: 'q', origin: 'audience_question', first_party: false, text: 'Why does my glaze crawl off the rim?' }),
  item({ id: 's', origin: 'her_fact', field: 'stance', text: 'Thin glaze coats beat thick ones on mugs' }),
  item({ id: 'n', origin: 'her_fact', text: 'Sold 40 mugs at the winter fair', numbers: [{ value: 40, unit: 'count', field: 'x' }] }),
  item({ id: 'st', origin: 'her_story', text: 'The first kiln load cracked half the mugs' }),
]

describe('quota', () => {
  it('spreads 8–10 candidates across eligible shapes', () => {
    const q = candidateQuota(eligibleShapes(ledger))
    expect(q.length).toBeGreaterThanOrEqual(8)
    expect(q.length).toBeLessThanOrEqual(10)
    expect(new Set(q).size).toBe(eligibleShapes(ledger).length)
  })
  it('asks for nothing with no evidence', () => {
    expect(candidateQuota([])).toEqual([])
    expect(renderHookCandidateRule([])).toBe('')
    expect(renderHookCandidateRule(ledger)).toContain('hook_candidates')
  })
})

describe('gate, score, pick', () => {
  const cands = [
    { shape: 'audience_question', text: 'Why does your glaze crawl off the rim?' },
    { shape: 'number_promise', text: '40 mugs at the winter fair taught me one thing about glaze.' },
    { shape: 'if_then_check', text: 'Glaze crawling? Check the 73 second dip.' },
    { shape: 'stop_doing', text: 'Stop dipping mugs in thick glaze coats.' },
    { shape: 'stop_doing', text: 'Everyone gets glaze wrong, stop it.' },
    { shape: 'story_open', text: 'My first kiln load cracked half the mugs.' },
    { shape: 'made_up', text: 'A line with no shape.' },
    { shape: 'if_then_check', text: '' },
  ]
  const { record, pick } = runHookEngine(cands, ledger)
  it('fails unbacked numbers, universals, unknown shapes and empties', () => {
    expect(record.received).toBe(8)
    expect(record.candidates[2]!.reasons).toContain('unbacked_number')
    expect(record.candidates[6]!.reasons).toContain('unknown_shape')
    expect(record.candidates[7]!.reasons).toContain('empty')
    expect(record.passed + record.failed).toBe(8)
  })
  it('fails a universal claim when no item carries a count', () => {
    const r = runHookEngine([{ shape: 'stop_doing', text: 'Everyone gets glaze wrong, stop it.' }], ledger.filter((i) => i.id !== 'n'))
    expect(r.record.candidates[0]!.reasons).toContain('universal_quantifier')
  })
  it('fails an unbacked number on a shape that does not list the rule', () => {
    const r = runHookEngine([{ shape: 'price_or_proof', text: '$25 for a stitched notebook.' }], [item({ id: 'p', origin: 'product_fact', text: 'Stitched notebook, $18', numbers: [{ value: 18, unit: 'money', field: 'price' }] })])
    expect(r.record.candidates[0]!.ok).toBe(false)
    expect(r.record.candidates[0]!.reasons).toContain('unbacked_number')
  })
  it('fails invented experience when there is no story', () => {
    const r = runHookEngine([{ shape: 'stop_doing', text: 'I tried thin glaze coats and stopped.' }], ledger.filter((i) => i.id !== 'st'))
    expect(r.record.candidates[0]!.reasons).toContain('invented_experience')
  })
  it('picks the top 3 passing, distinct shapes, deterministically', () => {
    expect(pick.indices.length).toBe(3)
    expect(new Set(pick.shapes).size).toBe(3)
    for (const i of pick.indices) expect(record.candidates[i]!.ok).toBe(true)
    expect([...pick.scores]).toEqual([...pick.scores].sort((a, b) => b - a))
    expect(runHookEngine(cands, ledger)).toEqual({ record, pick })
  })
  it('keeps no text in the record', () => {
    expect(JSON.stringify(record)).not.toContain('glaze')
  })
  it('scores length and specificity', () => {
    expect(lengthScore(8)).toBe(1)
    expect(lengthScore(2)).toBe(0)
    expect(lengthScore(30)).toBe(0)
    expect(specificityScore('thin glaze coats on mugs', ledger)).toBeGreaterThan(specificityScore('a random sunny afternoon walk', ledger))
  })
  it('handles no candidates', () => {
    const r = runHookEngine(null, ledger)
    expect(r.record.received).toBe(0)
    expect(r.pick.indices).toEqual([])
    expect(pickTop([])).toEqual([])
  })
})

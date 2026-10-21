// The Using list's buttons (usingBlock.ts). Fictional fixtures only: a made-up
// kite maker ("Paper Kite Studio"). No model call.
import { describe, it, expect } from 'vitest'
import type { LedgerItem } from '../inventionGate'
import { planBInputFromLedger } from '../planner/planBAssembly'
import {
  sanitizeNeverUse, neverUseEntryOf, addNeverUse, filterLedgerByNeverUse, knowledgeBlocked, answersAllowed,
  outsideAllowed, removeUsingItem, textMatches, type NeverUseEntry,
} from '../usingBlock'

const FACT = '11111111-2222-4333-8444-555555555555'
const PROD = '22222222-3333-4444-8555-666666666666'
const item = (id: string, origin: LedgerItem['origin'], text: string, product_id: string | null = null): LedgerItem =>
  ({ id, origin, product_id, field: null, text, numbers: [], first_party: origin !== 'outside_research', live: false, source_label: origin })
const SEW = 'I sewed the first kite on my kitchen table with a borrowed machine.'
const ledger: LedgerItem[] = [
  item(FACT, 'her_story', SEW),
  item('k-wind', 'her_fact', 'Our kites fly in winds up to 30 km/h at the beach.'),
  item('answer:angle', 'her_answer', 'Kites for windy beach days'),
  item('p:0', 'product_fact', 'Paper Kite folds into a jacket pocket.', PROD),
  item('offer', 'offer', 'Free string with every kite', PROD),
  item('brand-offer', 'offer', 'Ten percent off for newsletter readers'),
  item('world:0', 'outside_research', 'Beach kite festivals draw families every spring.'),
]

describe('the block list', () => {
  it('reads defensively and keeps one entry per item', () => {
    expect(sanitizeNeverUse(null)).toEqual([])
    expect(sanitizeNeverUse([{ kind: 'bogus', text: 'x' }, { kind: 'fact' }, 7])).toEqual([])
    const e = neverUseEntryOf({ kind: 'fact', id: FACT, label: 'I sewed the first kite on my kitchen…' })!
    expect(e).toEqual({ kind: 'fact', id: FACT, product_id: null, text: 'I sewed the first kite on my kitchen' })
    expect(addNeverUse(addNeverUse([], e), e)).toHaveLength(1)
    expect(sanitizeNeverUse(addNeverUse([], e))).toEqual([e])
  })
  it('maps every row kind; her idea for this video is not blockable', () => {
    expect(neverUseEntryOf({ kind: 'her_words', label: 'Your answer: Kites for windy beach days' })?.kind).toBe('answer')
    expect(neverUseEntryOf({ kind: 'her_words', label: 'Your idea for this video' })).toBeNull()
    expect(neverUseEntryOf({ kind: 'product', label: 'Paper Kite' }, PROD)).toMatchObject({ kind: 'product', product_id: PROD })
    expect(neverUseEntryOf({ kind: 'brand', label: 'Your brand' })?.kind).toBe('brand')
    expect(neverUseEntryOf({ kind: 'world', label: 'Research: Beach kite festivals draw families…' })).toMatchObject({ kind: 'outside', text: 'Beach kite festivals draw families' })
  })
  it('a clipped label matches her full text; a different item does not', () => {
    expect(textMatches(SEW, 'I sewed the first kite on my kitchen')).toBe(true)
    expect(textMatches('Our kites fly in winds up to 30 km/h at the beach.', 'I sewed the first kite on my kitchen')).toBe(false)
  })
})

describe('filterLedgerByNeverUse: every item kind', () => {
  const ids = (list: NeverUseEntry[]) => filterLedgerByNeverUse(ledger, list).map((it) => it.id)
  it('a fact (by id), an answer, a product, the brand, an outside item', () => {
    expect(ids([neverUseEntryOf({ kind: 'fact', id: FACT, label: 'x' })!])).not.toContain(FACT)
    expect(ids([neverUseEntryOf({ kind: 'her_words', label: 'Your answer: Kites for windy beach days' })!])).not.toContain('answer:angle')
    const noProd = ids([neverUseEntryOf({ kind: 'product', label: 'Paper Kite' }, PROD)!])
    expect(noProd).not.toContain('p:0'); expect(noProd).not.toContain('offer'); expect(noProd).toContain('brand-offer')
    expect(ids([neverUseEntryOf({ kind: 'brand', label: 'Your brand' })!])).not.toContain('brand-offer')
    expect(ids([neverUseEntryOf({ kind: 'world', label: 'Research: Beach kite festivals draw families…' })!])).not.toContain('world:0')
    expect(ids([])).toHaveLength(ledger.length)
  })
  it('a split unit id (#n) is blocked with its item', () => {
    expect(filterLedgerByNeverUse([{ ...ledger[0]!, id: `${FACT}#1` }], [neverUseEntryOf({ kind: 'fact', id: FACT, label: 'x' })!])).toEqual([])
  })
  it('Plan B never sees a blocked story', () => {
    const list = [neverUseEntryOf({ kind: 'fact', id: FACT, label: 'x' })!]
    const inB = planBInputFromLedger(filterLedgerByNeverUse(ledger, list), null, PROD, 'standard')
    expect(JSON.stringify(inB)).not.toContain('sewed the first kite')
  })
  it('knowledge rows, answers and outside lists', () => {
    const list = [neverUseEntryOf({ kind: 'fact', id: FACT, label: 'x' })!, neverUseEntryOf({ kind: 'her_words', label: 'Your answer: Kites for windy beach days' })!, neverUseEntryOf({ kind: 'niche', label: 'Niche proof: Beach kite festivals draw families…' })!]
    expect(knowledgeBlocked({ id: FACT, text: 'anything' }, list)).toBe(true)
    expect(knowledgeBlocked({ id: 'k-wind', text: 'Our kites fly in winds up to 30 km/h at the beach.' }, list)).toBe(false)
    expect(answersAllowed({ angle: 'Kites for windy beach days', goal: 'sell' }, list)).toEqual({ goal: 'sell' })
    expect(outsideAllowed({ kind: 'proof', text: 'Beach kite festivals draw families every spring.' }, list)).toBe(false)
    expect(outsideAllowed({ name: 'Kite string tension guide' }, list)).toBe(true)
  })
})

describe('removeUsingItem: this script only', () => {
  const script = [
    { section: 'hook', line: 'My first kite was a disaster.' },
    { section: 'story', line: SEW },
    { section: 'body', line: 'Paper Kite folds into a jacket pocket. It flies at the beach.' },
    { section: 'cta', line: 'Link in bio.' },
  ]
  const sources = [
    { beat: 0, sentence: 'My first kite was a disaster.', from: [] },
    { beat: 1, sentence: SEW, from: [{ kind: 'fact', id: FACT, label: 'I sewed the first kite on my kitchen…' }] },
    { beat: 2, sentence: 'Paper Kite folds into a jacket pocket.', from: [{ kind: 'product', label: 'Paper Kite' }] },
    { beat: 2, sentence: 'It flies at the beach.', from: [] },
    { beat: 3, sentence: 'Link in bio.', from: [] },
  ]
  it('drops the item\'s lines, refills by relevance (never the item), and re-traces', () => {
    const r = removeUsingItem(script, sources, { kind: 'fact', id: FACT, label: 'I sewed the first kite on my kitchen…' },
      { ledger, targetProductId: PROD, ctx: { topic: 'kites for windy beach days', angle: '' } })
    const lines = r.script.map((b) => b.line)
    expect(r.removed).toBe(1)
    expect(lines).not.toContain(SEW)
    expect(lines.join(' ')).not.toMatch(/sewed/)
    expect(r.refilled).toBe(1)
    expect(lines).toContain('Our kites fly in winds up to 30 km/h at the beach.')
    expect(lines.at(-1)).toBe('Link in bio.')
    expect(r.line_sources.some((t) => t.from.some((h) => h.id === FACT))).toBe(false)
    expect(r.line_sources.find((t) => t.sentence === 'Paper Kite folds into a jacket pocket.')?.from).toEqual([{ kind: 'product', label: 'Paper Kite' }])
  })
  it('a sentence of a beat goes, the rest of the beat stays; a blocked item is never the refill', () => {
    const list = [neverUseEntryOf({ kind: 'fact', label: 'Our kites fly in winds up to 30 km/h' })!]
    const r = removeUsingItem(script, sources, { kind: 'product', label: 'Paper Kite' },
      { ledger, targetProductId: PROD, ctx: { topic: 'kites for windy beach days', angle: '' }, productId: PROD, neverUse: list })
    const lines = r.script.map((b) => b.line)
    expect(lines).toContain('It flies at the beach.')
    expect(lines.join(' ')).not.toMatch(/jacket pocket|30 km/)
  })
  it('an item not in the script changes nothing', () => {
    const r = removeUsingItem(script, sources, { kind: 'brand', label: 'Your brand' }, { ledger, targetProductId: PROD, ctx: { topic: 'kites' } })
    expect(r.removed).toBe(0)
    expect(r.script.map((b) => b.line)).toEqual(script.map((b) => b.line))
  })
})

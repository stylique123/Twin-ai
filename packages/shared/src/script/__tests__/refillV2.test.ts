// REFILL_V2 (panel-11 advisor; trial, default off). Fictional fixtures only
// (a made-up candle maker, a made-up bike mechanic). No model call.
import { describe, it, expect } from 'vitest'
import { relevantRefillUnits, rankRefill, storiesToldV2, refillToFloor, type LedgerItem, type RefillContext } from '../inventionGate'
import { enforceWordBudget } from '../templates/scriptTemplates'

const item = (id: string, origin: LedgerItem['origin'], text: string, product_id: string | null = null, field: string | null = null): LedgerItem =>
  ({ id, origin, product_id, field: field ?? (origin === 'product_fact' ? 'includes' : null), text, numbers: [], first_party: true, live: false, source_label: origin })

// A made-up candle maker.
const WICK = item('s-wick', 'her_story', 'My first candle tunneled straight down the middle because I used a wick that was too thin.')
const JARS = item('s-jars', 'her_story', 'A shopper at the night market tipped a candle over and asked why the wick sat off-center in the jar.')
const VAN = item('s-van', 'her_story', 'I drove a borrowed van to my first night market and the heater melted half my stock.')
const ORIGIN = item('s-origin', 'her_story', 'I poured the first Ember Jar on my stove because every store candle gave my sister a headache.')
const OPIN = item('o-soy', 'her_fact', 'I think soy wax is kinder to small rooms than paraffin.', null, 'opinion')
const OFF = item('o-price', 'her_fact', 'I think craft fairs charge too much for a table.', null, 'opinion')
const FACT1 = item('p1', 'product_fact', 'Burns for about forty hours in a small room', 'ember')
const FACT2 = item('p2', 'product_fact', 'Cotton wick trimmed to a quarter inch', 'ember')
const LEDGER = [VAN, JARS, WICK, ORIGIN, OPIN, OFF, FACT1, FACT2]
const V2 = (topic: string, extra: Partial<RefillContext> = {}): RefillContext => ({ topic, v2: true, niche: 'candles soy wax candles', ...extra })
const ids = (ps: Array<{ id: string }>) => ps.map((p) => p.id)

describe('REFILL_V2', () => {
  it('never adds an unrelated second story; keeps an on-topic one that explains', () => {
    const script = ['A market shopper asked why my wick sat off-center.', JARS.text, 'Tell me what you see in yours.']
    const picks = relevantRefillUnits(LEDGER, null, script, V2('why a candle wick tunnels down the middle'))
    expect(ids(picks)).toContain('s-wick')
    expect(ids(picks)).not.toContain('s-van')
    expect(ids(picks)).not.toContain('s-origin')
    expect(picks.filter((p) => p.kind === 'story')).toHaveLength(1)
  })

  it('never repeats a story her hook already tells in the first person', () => {
    const script = ['I used a wick that was too thin and my first candle tunneled.', 'Here is how to size a wick.']
    expect(storiesToldV2(script, LEDGER, 'my first candle went wrong')).toContain('s-wick')
    const picks = relevantRefillUnits(LEDGER, null, script, V2('my first candle went wrong'))
    expect(ids(picks)).not.toContain('s-wick')
  })

  it('a second-person teaser hook is not a telling', () => {
    const script = ['Why does your candle tunnel down the middle?', 'Save this.']
    expect(storiesToldV2(script, LEDGER, 'why candles tunnel')).not.toContain('s-wick')
  })

  it('on a product request: her origin story naming the product and the product facts', () => {
    const script = ['Every store candle gave someone I love a headache.', 'Link in bio.']
    const picks = relevantRefillUnits(LEDGER, 'ember', script, V2('Ember Jar', { product: 'Ember Jar' }))
    expect(ids(picks)).toEqual(expect.arrayContaining(['s-origin', 'p1', 'p2']))
    expect(ids(picks)).not.toContain('s-van')
  })

  it('a short fact of the target product is kept under V2 (not under V1)', () => {
    const PRICE = item('p3', 'product_fact', '$31 per jar', 'ember')
    const picks = relevantRefillUnits([...LEDGER, PRICE], 'ember', ['Every store candle gave someone I love a headache.'], V2('Ember Jar', { product: 'Ember Jar' }))
    expect(ids(picks)).toContain('p3')
    expect(ids(relevantRefillUnits([...LEDGER, PRICE], 'ember', ['Every store candle gave someone I love a headache.'], { topic: 'Ember Jar' }))).not.toContain('p3')
  })

  it('product facts never refill a request that is not about the product', () => {
    const picks = relevantRefillUnits(LEDGER, null, ['Why does your candle tunnel?'], V2('why candles tunnel'))
    expect(picks.some((p) => p.kind === 'product_fact')).toBe(false)
  })

  it('her opinion when it fits her niche; not one off it', () => {
    const picks = relevantRefillUnits(LEDGER, null, ['Small rooms need a gentle candle.', WICK.text], V2('candles for a small room'))
    expect(ids(picks)).toContain('o-soy')
    expect(ids(picks)).not.toContain('o-price')
  })

  it('flag off: no v2 in the context means the V1 ranking, unchanged', () => {
    const script = ['A market shopper asked why my wick sat off-center.', JARS.text]
    const ctx = { topic: 'why a candle wick tunnels down the middle' }
    const cands = LEDGER.map((it) => ({ id: it.id, origin: it.origin, text: it.text, product_id: it.product_id }))
    expect(rankRefill(cands, LEDGER, null, script, ctx)).toEqual(rankRefill(cands, LEDGER, null, script, { ...ctx, v2: false }))
    expect(ids(relevantRefillUnits(LEDGER, null, script, ctx))).not.toContain('s-wick')
  })

  it('the floor refill and the edge lengthen pass take the V2 context too', () => {
    const rf = refillToFloor([{ section: 'hook', line: 'Why does a candle tunnel?' }, { section: 'cta', line: 'Save this.' }], LEDGER, null, 3, V2('why a candle wick tunnels'))
    expect(rf.added).toBeGreaterThan(0)
    expect(rf.script.map((b) => b.line)).not.toContain(VAN.text)
    const wb = enforceWordBudget([{ section: 'hook', line: 'Why does a candle tunnel?' } as never], 'standard' as never, LEDGER, null, { units: true, relevance: V2('why a candle wick tunnels') })
    expect(JSON.stringify(wb.script)).not.toContain('borrowed van')
  })
})

// A made-up bike mechanic: one story, told once.
describe('REFILL_V2, a second creator', () => {
  const FLAT = item('b-flat', 'her_story', 'I fixed my first flat with a spoon because I had lost the tire levers.')
  const RACE = item('b-race', 'her_story', 'At my first race my chain snapped on the last hill and I walked the bike home.')
  it('a story request gets no unrelated story', () => {
    const picks = relevantRefillUnits([FLAT, RACE], null, ['I lost my tire levers once.', 'Here is the spoon trick.'], { topic: 'fixing a flat without tools', v2: true })
    expect(ids(picks)).not.toContain('b-race')
  })
})

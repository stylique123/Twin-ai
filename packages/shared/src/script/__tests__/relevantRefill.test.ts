// Panel-10: relevance-aware refill and story-hook dedupe. Fictional fixtures
// only (a made-up candle maker, a made-up bike mechanic). No model call.
import { describe, it, expect } from 'vitest'
import { relevantRefillUnits, refillRelevance, storiesTold, dedupeStoryHook, storyBeats, refillToFloor, REFILL_MIN_RELEVANCE, type LedgerItem } from '../inventionGate'
import { enforceWordBudget } from '../templates/scriptTemplates'

const item = (id: string, origin: LedgerItem['origin'], text: string, product_id: string | null = null): LedgerItem =>
  ({ id, origin, product_id, field: origin === 'product_fact' ? 'includes' : null, text, numbers: [], first_party: true, live: false, source_label: origin })

// A made-up candle maker.
const WICK = item('s-wick', 'her_story', 'My first candle tunneled straight down the middle because I used a wick that was too thin.')
const VAN = item('s-van', 'her_story', 'I drove a borrowed van to my first night market and the heater melted half my stock.')
const DOG = item('s-dog', 'her_story', 'My dog knocked over a whole tray of cooling jars on launch morning.')
const OPIN = item('o-wick', 'her_fact', 'I think most tunneling candles just have the wrong wick size for the jar.')
const OFFTOPIC = item('o-price', 'her_fact', 'I think handmade goods are priced too low at most craft fairs.')
const FACT1 = item('p1', 'product_fact', 'Burns for about forty hours', 'jar')
const FACT2 = item('p2', 'product_fact', 'Cotton wick trimmed to a quarter inch', 'jar')
const LEDGER = [VAN, DOG, OFFTOPIC, WICK, OPIN, FACT1, FACT2]

describe('relevance-aware refill', () => {
  it('a script that already tells a story never gets a second one; unrelated items are dropped', () => {
    const script = ['Why does your candle burn a hole down the middle?', WICK.text, 'Save this for your next candle.']
    const picks = relevantRefillUnits(LEDGER, null, script, { topic: 'why candles tunnel down the middle' })
    expect(picks.map((p) => p.id)).toEqual(['o-wick'])
    expect(picks.some((p) => p.kind === 'story')).toBe(false)
  })

  it('one relevant story may be added when none is told yet; never two', () => {
    const script = ['Candle tunneling has one cause.', 'Save this.']
    const picks = relevantRefillUnits(LEDGER, null, script, { topic: 'candle wick tunneling' })
    expect(picks.filter((p) => p.kind === 'story').map((p) => p.id)).toEqual(['s-wick'])
  })

  it('stops when relevance is low: nothing on topic means nothing added', () => {
    const picks = relevantRefillUnits(LEDGER, null, ['Hello there friends.', 'Bye now.'], { topic: 'sourdough starter' })
    expect(picks).toEqual([])
  })

  it('a fact of the requested product supports it; order is proof, then product fact', () => {
    const script = ['Here is the Tidewater jar candle.', 'Link in bio.']
    const picks = relevantRefillUnits(LEDGER, 'jar', script, { topic: 'Tidewater jar candle wick' })
    const kinds = picks.map((p) => p.kind)
    expect(kinds.indexOf('proof')).toBeLessThan(kinds.indexOf('product_fact'))
    expect(picks.map((p) => p.id)).toEqual(expect.arrayContaining(['p1', 'p2']))
  })

  it('never repeats an item by near text, and never restates her angle answer', () => {
    const angle = item('answer:angle', 'her_answer', 'Small batch candles. Clean burn. Less soot.')
    const script = ['I think most tunneling candles have the wrong wick size for the jar.']
    const picks = relevantRefillUnits([...LEDGER, angle], null, script, { topic: 'candle wick', angle: angle.text })
    expect(picks.some((p) => p.id === 'o-wick')).toBe(false)
    expect(picks.some((p) => p.id === 'answer:angle')).toBe(false)
  })

  it('scores topic words above story words', () => {
    expect(refillRelevance('the wick was thin', { topic: 'wick' })).toBe(REFILL_MIN_RELEVANCE)
    expect(refillRelevance('the wick was thin', { topic: 'soap' }, 'wick')).toBe(1)
  })

  it('a story split across the hook and a body line counts as told', () => {
    expect(storiesTold(['My first candle tunneled straight down.', 'The wick was too thin, because I used it.'], [WICK])).toEqual(['s-wick'])
  })

  it('the floor refill (ctx) takes a relevant item, never a second story', () => {
    const r = refillToFloor([{ section: 'hook', line: 'Why candles tunnel.' }, { section: 'body', line: WICK.text }], LEDGER, null, 3, { topic: 'candle tunneling wick' })
    expect(r.added).toBe(1)
    expect(r.script.map((b) => String(b.line))).toContain(OPIN.text)
  })

  it('the edge length pass with relevance adds only on-topic items', () => {
    const script = [{ line: 'Why does your candle tunnel?' }, { line: WICK.text }, { line: 'Save this.' }]
    const plain = enforceWordBudget(script, 'standard', LEDGER, null, { units: true })
    const rel = enforceWordBudget(script, 'standard', LEDGER, null, { units: true, relevance: { topic: 'why candles tunnel' } })
    expect(plain.record.added).toEqual(expect.arrayContaining(['s-van', 's-dog']))
    expect(rel.record.added).toEqual(['o-wick'])
  })
})

// A made-up bike mechanic.
const CHAIN = item('s-chain', 'her_story', 'A rider wheeled in a bike with a squeaking chain, and asked why it got worse in the rain, so now I hand out a wax sample with every repair.')
const SHOP = item('s-shop', 'her_story', 'I opened the first version of my repair stand in a parking lot because my neighbor kept bringing me flat tires.')

describe('story-hook dedupe', () => {
  it('splits a story into beats at clause connectors', () => {
    expect(storyBeats(CHAIN.text).map((b) => b.text)).toEqual([
      'A rider wheeled in a bike with a squeaking chain',
      'and asked why it got worse in the rain',
      'so now I hand out a wax sample with every repair.',
    ])
  })

  it('hook = the opening beats: the story starts after them', () => {
    const script = [{ line: 'A rider asked why her squeaking chain got worse in the rain.' }, { line: CHAIN.text }, { line: 'Tell me below.' }]
    const r = dedupeStoryHook(script, [CHAIN])
    expect(r.record?.action).toBe('trimmed_start')
    expect(r.script[1]!.line).toBe('So now I hand out a wax sample with every repair.')
    expect(r.script[0]).toEqual(script[0])
  })

  it('hook = the closing beat: the story ends before it', () => {
    const script = [{ line: 'My neighbor kept bringing me flat tires.' }, { line: SHOP.text }]
    const r = dedupeStoryHook(script, [SHOP])
    expect(r.record?.action).toBe('trimmed_end')
    expect(r.script[1]!.line).toBe('I opened the first version of my repair stand in a parking lot.')
  })

  it('when the rest is not clean, the hook becomes a teaser from a later beat, verbatim', () => {
    const story = item('s-x', 'her_story', 'My first wheel build came out with every spoke loose, which taught me to tension slowly, and I still check each one twice.')
    const script = [{ line: 'My first wheel build came out with every spoke loose.' }, { line: story.text }]
    const r = dedupeStoryHook(script, [story])
    expect(r.record?.action).toBe('teaser')
    expect(r.newHook).toBe('I still check each one twice.')
    expect(r.script[1]!.line).toBe(story.text)
    expect(story.text).toContain('I still check each one twice')
  })

  it('a hook that is not the story, or a story not told verbatim, is left alone', () => {
    const a = [{ line: 'Stop oiling your chain every day.' }, { line: CHAIN.text }]
    expect(dedupeStoryHook(a, [CHAIN]).record).toBeNull()
    const b = [{ line: 'A rider asked why her squeaking chain got worse in the rain.' }, { line: 'She came back the next week.' }]
    expect(dedupeStoryHook(b, [CHAIN]).record).toBeNull()
  })
})

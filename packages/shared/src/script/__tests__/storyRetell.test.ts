// Paraphrased retellings (panel-10 advisor; dedupeStoryRetellings). Fictional
// fixtures only: a made-up candle maker and a made-up bike courier. No model call.
import { describe, it, expect } from 'vitest'
import { dedupeStoryRetellings, novelTerms, tellingOf, trimStoryAgainstHook } from '../inventionGate'

const WICK = 'My first candle tunneled straight down the middle because I used a wick that was too thin.'
const BIKE = 'The first week I rode deliveries I took a wrong turn onto the ring road, which is why I plan every route on paper first.'
const lines = (s: Array<{ line?: unknown }>) => s.map((b) => b.line)
const S = (xs: string[]) => xs.map((line) => ({ line }))

describe('tellingOf', () => {
  it('verbatim, paraphrase (new words), or nothing', () => {
    expect(tellingOf(WICK, WICK)).toBe('verbatim')
    expect(tellingOf('My first candle tunneled straight down the middle.', WICK)).toBe('verbatim')
    expect(tellingOf('I picked a thin wick and the candle tunneled right through its middle.', WICK)).toBe('paraphrase')
    expect(tellingOf('Trim your wick before every burn.', WICK)).toBeNull()
  })
  it('a line traced to the story id needs only two shared terms', () => {
    expect(tellingOf('That thin wick taught me a lot.', WICK)).toBeNull()
    expect(tellingOf('That thin wick taught me a lot.', WICK, true)).toBe('paraphrase')
  })
})

describe('dedupeStoryRetellings', () => {
  const stories = [{ id: 'k-wick', text: WICK }]
  it('verbatim beats a paraphrase: the retelling in new words goes', () => {
    const script = S(['Why do candles tunnel?', WICK, 'Trim your wick before every burn.', 'The candle tunneled down its middle because the wick was too thin.', 'Save this.'])
    const r = dedupeStoryRetellings(script, stories)
    expect(lines(r.script)).toEqual(['Why do candles tunnel?', WICK, 'Trim your wick before every burn.', 'Save this.'])
    expect(r.records).toEqual([{ story_id: 'k-wick', kept: 'verbatim', dropped: 1, trimmed: 0 }])
  })
  it('a hook teaser beats a paraphrase; line 1 is never dropped', () => {
    const script = S(['My first candle tunneled because of a thin wick.', 'Most tunneling starts on the first burn.', 'The candle tunneled because the wick was too thin.', 'Save this.'])
    const r = dedupeStoryRetellings(script, stories)
    expect(lines(r.script)).toEqual(['My first candle tunneled because of a thin wick.', 'Most tunneling starts on the first burn.', 'Save this.'])
    expect(r.records[0]).toMatchObject({ kept: 'hook', dropped: 1 })
  })
  it('the hook stays and the verbatim story is trimmed of what the hook told', () => {
    const script = S(['I took a wrong turn onto the ring road the first week I rode deliveries.', 'Couriers learn routes the hard way.', BIKE, 'Follow for more.'])
    const r = dedupeStoryRetellings(script, [{ id: 'k-bike', text: BIKE }])
    expect(lines(r.script)[0]).toBe('I took a wrong turn onto the ring road the first week I rode deliveries.')
    expect(lines(r.script)[2]).toBe('That is why I plan every route on paper first.')
    expect(r.records[0]).toMatchObject({ kept: 'verbatim', trimmed: 1 })
  })
  it('the line right after a teaser hook that tells the rest is the same telling, not a repeat', () => {
    const script = S(['My first candle was a disaster.', 'I used a wick that was too thin, and it tunneled straight down the middle.', 'Save this.'])
    expect(dedupeStoryRetellings(script, stories).records).toEqual([])
  })
  it('verbatim pieces split over lines are one telling', () => {
    const script = S(['Candle day one.', 'My first candle tunneled straight down the middle.', 'I used a wick that was too thin.', 'Save this.'])
    expect(dedupeStoryRetellings(script, stories).records).toEqual([])
  })
  it('payoff keep: a trim that would cut new detail (a cause, a duration) leaves the line whole', () => {
    // The hook says "wrong turn"; the cut would lose the ring road and the first week of deliveries.
    const script = S(['My worst wrong turn ever.', 'Couriers learn routes the hard way.', BIKE, 'Follow for more.'])
    const r = dedupeStoryRetellings(script, [{ id: 'k-bike', text: BIKE }])
    expect(lines(r.script)).toEqual(lines(script))
    expect(r.records).toEqual([])
  })
  it('payoff keep: a retelling that adds a detail the close depends on stays', () => {
    const script = S([
      'My first candle tunneled because of a thin wick.',
      'Most tunneling starts on the first burn.',
      'It turned out the wick was too thin for a jar that wide.',
      'Do you measure your jar before you pick a wick?',
    ])
    const r = dedupeStoryRetellings(script, stories)
    expect(lines(r.script)).toEqual(lines(script))
    expect(r.records).toEqual([])
  })
  it('novelTerms: what a cut says that the kept text does not', () => {
    expect(novelTerms('The candle tunneled because the wick was too thin.', WICK)).toEqual([])
    expect(novelTerms('I fixed it on a call with her.', 'Fixing code while she watches.').length).toBeGreaterThan(0)
  })
  it('a question hook does not trim the story', () => {
    expect(trimStoryAgainstHook(BIKE, BIKE, 'Ever taken a wrong turn onto the ring road?')).toBe('')
  })
  it('nothing to do with one telling', () => {
    const script = S(['Why do candles tunnel?', WICK, 'Save this.'])
    expect(dedupeStoryRetellings(script, stories)).toEqual({ script, records: [] })
  })
})

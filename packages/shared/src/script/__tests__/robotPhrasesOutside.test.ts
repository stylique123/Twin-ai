import { describe, expect, it } from 'vitest'
import { repairRobotLine, robotPass, splitForCadence } from '../robotPhrases'
import { selectOutside, pickOutsideForWriter } from '../outsideSelect'

// Fictional fixtures only: an invented candle shop.
describe('robot phrases', () => {
  it('drops a line that is purely filler', () => {
    expect(repairRobotLine("Let's dive in.").dropped).toBe(true)
    expect(repairRobotLine('Without further ado.').dropped).toBe(true)
    expect(repairRobotLine('And that is honestly everything there is to say on it.').dropped).toBe(true)
  })
  it('deletes a removable prefix and keeps the rest', () => {
    const r = repairRobotLine("Here's the thing: soy wax burns cooler than paraffin.")
    expect(r.line).toBe('Soy wax burns cooler than paraffin.')
    expect(r.hits).toContain('heres_the_thing')
    expect(repairRobotLine("In today's fast-paced world, nobody trims a wick.").line).toBe('Nobody trims a wick.')
    expect(repairRobotLine('At the end of the day, the jar matters less than the wick.').line).toBe('The jar matters less than the wick.')
  })
  it('cuts the stock closer clause via dropStockCloser', () => {
    const r = repairRobotLine('Trim the wick first, and that is everything there is to say on it.')
    expect(r.line).toBe('Trim the wick first.')
    expect(r.hits).toContain('stock_closer')
  })
  it('flags words it cannot cut and never rewrites them', () => {
    const line = "This wick trimmer is a game-changer. It's not just a tool, it's a habit."
    const r = repairRobotLine(line)
    expect(r.line).toBe(line)
    expect(r.hits).toEqual(expect.arrayContaining(['game_changer', 'not_just_x']))
  })
  it('never adds a word', () => {
    const line = "Buckle up, because the tunnel in my cedar candle came from a short first burn."
    const out = repairRobotLine(line).line.toLowerCase().split(/\W+/).filter(Boolean)
    const src = new Set(line.toLowerCase().split(/\W+/))
    expect(out.every((w) => src.has(w))).toBe(true)
  })
  it('keeps the three-beat floor', () => {
    const beats = [{ line: 'Tunnels ruin candles.' }, { line: "Let's dive in." }, { line: 'Burn it two hours the first time.' }]
    const r = robotPass(beats)
    expect(r.beats).toHaveLength(3)
    const four = [...beats, { line: 'Trim the wick to five millimetres.' }]
    const r4 = robotPass(four)
    expect(r4.beats).toHaveLength(3)
    expect(r4.record.lines_dropped).toBe(1)
    expect(r4.record.phrase_hits.dive_in).toBe(1)
  })
})

describe('spoken cadence', () => {
  it('splits a long line at a natural boundary with no new words', () => {
    const line = 'I poured my first cedar candle in a tiny kitchen with a borrowed thermometer, and it tunnelled straight down the middle on the very first burn.'
    const r = splitForCadence(line)
    expect(r.flagged).toBeGreaterThan(0)
    expect(r.line).toBe('I poured my first cedar candle in a tiny kitchen with a borrowed thermometer. And it tunnelled straight down the middle on the very first burn.')
    expect(r.line.toLowerCase().replace(/[^a-z ]/g, '')).toBe(line.toLowerCase().replace(/[^a-z ]/g, ''))
  })
  it('flags three commas and leaves short lines alone', () => {
    expect(splitForCadence('Wax, wick, jar, and patience matter most here.').flagged).toBe(1)
    expect(splitForCadence('Trim the wick.').line).toBe('Trim the wick.')
  })
})

describe('outside selection', () => {
  const now = Date.parse('2026-10-15')
  it('keeps only relevant items above the minimum, capped', () => {
    const items = Array.from({ length: 45 }, (_v, i) => ({ id: `x${i}`, kind: 'niche', text: i < 10 ? `candle wick tunnel tip ${i}` : `marathon running shoes ${i}`, verification: 'corpus' as const }))
    const r = selectOutside(items, ['why my candle tunnels', 'wick care'], { now })
    expect(r.record).toEqual({ offered: 45, kept: 8, min_score: 1.25 })
    expect(r.kept.every((k) => /candle/.test(k.text))).toBe(true)
  })
  it('never keeps a fresh, verified item with zero overlap', () => {
    const r = selectOutside([{ id: 'a', kind: 'research', text: 'stock market news', when: '2026-10-14', verification: 'sourced' }], ['candle wick'], { now })
    expect(r.record.kept).toBe(0)
  })
  it('is deterministic and ranks recency and verification on ties', () => {
    const items = [
      { id: 'b', kind: 'reddit', text: 'candle tunnels', verification: 'audience' as const },
      { id: 'a', kind: 'research', text: 'candle tunnels', when: '2026-10-10', verification: 'sourced' as const },
    ]
    const r1 = selectOutside(items, ['candle tunnel'], { now })
    expect(r1.kept.map((k) => k.id)).toEqual(['a', 'b'])
    expect(selectOutside([...items].reverse(), ['candle tunnel'], { now }).kept.map((k) => k.id)).toEqual(['a', 'b'])
  })
  it('cuts each edge list to its kept rows', () => {
    const r = pickOutsideForWriter({
      notes: [{ title: 'Wick trimming', body: 'candles burn cleaner' }, { title: 'Bread proofing', body: 'sourdough' }],
      trends: [{ label: 'candle care', sample: null }],
      moments: [{ name: 'Marathon season' }],
      research: [{ name: 'New candle wick', detail: 'cotton core', when: '2026-10-01' }],
      reddit: [{ text: 'why does my candle tunnel' }, { text: 'best running socks' }],
    }, ['candle wick tunnel'], { now })
    expect(r.lists.notes).toHaveLength(1)
    expect(r.lists.moments).toHaveLength(0)
    expect(r.lists.reddit).toEqual([{ text: 'why does my candle tunnel' }])
    expect(r.record.offered).toBe(7)
  })
})

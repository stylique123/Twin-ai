import { describe, it, expect } from 'vitest'
import { dropNovelSentences, findNovelDetails, novelCounts } from '../novelDetail.js'

const HER = [
  'Someone told me they could taste the difference between my roast and the grocery store bag their mom always bought.',
  'I bought a batch of green beans from a new supplier without testing a small sample first, and the whole lot roasted uneven and had to be tossed.',
  'Coffee Cart Launch Call: a 60-minute 1:1 video call for $75 where I help you plan your equipment, menu, and first market.',
  'La Marzocco espresso machine',
].join('\n')

describe('novel details (owner WS1, blind set 2 lines)', () => {
  it('flags the invented ratio and duration in #9', () => {
    const f = findNovelDetails(['Because this is a true concentrate, you cut it with equal parts water, which means one bottle gives you fresh iced drinks all week long.'], HER)
    expect(f[0]!.novel.map((s) => s.kind).sort()).toEqual(['duration', 'ratio'])
  })
  it('flags "recently" and "growing up" added to her real customer story (#2)', () => {
    const f = findNovelDetails(['A customer told me recently they finally tasted the difference between my roast and the grocery store bag their mom always bought growing up.'], HER)
    expect(f[0]!.novel.map((s) => s.text.toLowerCase())).toEqual(expect.arrayContaining(['recently', 'growing up']))
  })
  it('flags the invented feeling in #17', () => {
    expect(novelCounts(findNovelDetails(['I know that exact dread because starting out in coffee is messy.'], HER)).emotion).toBe(1)
  })
  it('passes her real details: the price, the length, her mom detail, the machine she names', () => {
    expect(findNovelDetails([
      'In a 60-minute 1:1 video call for $75, we plan your equipment, menu, and first market.',
      'They could taste the difference from the grocery store bag their mom always bought.',
      'Whether you are setting up a La Marzocco espresso machine or not.',
    ], HER)).toEqual([])
  })
  it('extracts nothing from a plain line', () => {
    expect(findNovelDetails(['Start small from home and learn as you go.'], '')).toEqual([])
  })
})

describe('second pass on the 34 real scripts', () => {
  it('catches bare durations stated as hers or as fact', () => {
    expect(novelCounts(findNovelDetails(['I spent weeks researching two group commercial espresso machines.'], HER)).duration).toBe(1)
    expect(novelCounts(findNovelDetails(['Most grocery beans spend months sitting inside transit warehouses.'], HER)).duration).toBe(1)
  })
  it('does not flag her own number written as a word, or a line addressed to the viewer', () => {
    expect(findNovelDetails(['In a sixty minute one-on-one call we plan your first market.'], HER)).toEqual([])
    expect(findNovelDetails(['If you brew at home every morning, what roast do you reach for?'], HER)).toEqual([])
  })
})

describe('dropNovelSentences (trial removal)', () => {
  const beats = [
    { line: 'Why does your cold brew taste bitter?' },
    { line: 'Because this is a true concentrate, you cut it with equal parts water. It stays smooth.' },
    { line: 'I know that exact dread because starting out is messy.' },
    { line: 'Book the call in my bio.' },
  ]
  it('drops only the sentence with the invented detail, and an emptied middle beat', () => {
    const r = dropNovelSentences(beats, HER)
    expect(r.beats.map((b) => b.line)).toEqual(['Why does your cold brew taste bitter?', 'It stays smooth.', 'Book the call in my bio.'])
    expect(r.removed.length).toBe(2)
  })
  it('never empties the hook or the close', () => {
    const r = dropNovelSentences([{ line: 'I felt total dread.' }, { line: 'Mid.' }, { line: 'Grab it all week long.' }], HER)
    expect(r.beats.length).toBe(3)
    expect(r.kept.length).toBe(2)
  })
})

describe('first-person events (blind set 2 #4)', () => {
  it('flags an origin she never told', () => {
    expect(novelCounts(findNovelDetails(['Grocery store coffee tasted burned, so I started roasting my own.'], HER)).event).toBe(1)
  })
  it('keeps an event she did tell', () => {
    expect(novelCounts(findNovelDetails(['I bought a batch of green beans from a new supplier without testing a sample.'], HER + ' I bought a batch of green beans from a new supplier without testing a small sample first.')).event).toBe(0)
  })
})

describe('advice to the viewer (blind set 3 log)', () => {
  it('does not flag a routine word in a line addressed to the viewer', () => {
    expect(findNovelDetails(['Match your grinder to what you actually brew every morning, not what looks complicated.'], HER)).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import { findNovelDetails, novelCounts } from '../novelDetail.js'

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

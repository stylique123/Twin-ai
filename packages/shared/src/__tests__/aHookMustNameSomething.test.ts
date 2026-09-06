import { describe, expect, it } from 'vitest'
import { hookNamesSomething, hooksWithoutASubject, subjectWords } from '../script/hookSubject'

// ⚠️ ALL THIRTY ARE VERBATIM PRODUCTION `hook_options[0]` VALUES, read out of
// `generations.blueprint` on 2026-09-06 — the 30 most recent. Exactly two are
// the known defect; the other 28 are the negative controls that make the rule
// safe, and they are what stops the bar being tuned to fit.

const SHIPPED_AND_WRONG = [
  'I am doing a little bit of the same thing right here.',
  "I'm going to do a little bit of the same thing.",
]

const SHIPPED_AND_FINE = [
  'Here is what people do not tell you about starting a microbakery.',
  'Unpopular opinion, but fancy baking gear is a total waste of money.',
  'Starting a home microbakery is not what most people think.',
  'You know why everyone does not run a microbakery?',
  'I am going to show you how to price your sourdough loaves.',
  'Watch what happens when I make a little hole in the middle.',
  'Most market shoppers walk past because your table is flat.',
  'Most store candles literally smell like burnt chemicals.',
  'I feel like nobody talks about how total rest ruins knee recovery.',
  'Here are 3 critical ACL recovery rules every patient needs to know.',
  'Your physiotherapy will fail if you only show up once a week.',
  'Big corporations expect small business owners to stay quiet and absorb the loss.',
  'I have an opinion about the big guys in construction that makes people angry, but I will stand by it forever.',
  'The construction industry isn\'t male-dominated; it tricks women into doing EVERYTHING themselves.',
  'This is the unspoken struggle behind building a business for women in trades.',
  'They expected me to back down when things got legal.',
  "You're not scaling because you're afraid to outgrow yourself.",
  "You're not scaling because you refuse to make hard decisions.",
  "You're making three brutal mistakes that are actively killing your business ROI.",
  "Three brutal reasons your business isn't scaling past that plateau.",
  'Most founders fail to scale because of these 3 brutal pitfalls.',
  'Three reasons I stayed poor early on, even while working all day.',
  "Three reasons your business isn't scaling, and it's not the market.",
  'Three reasons you stay poor as a founder. Number one.',
  'Here are the 3 reasons you stay poor even though you work all day.',
  'Here are the 3 reasons you are the bottleneck in your own business.',
  '3 reasons you are going to stay poor.',
  'Most people stay poor because they make these three mistakes.',
]

describe('a hook must name something', () => {
  it('flags the two hooks that actually shipped naming nothing', () => {
    for (const h of SHIPPED_AND_WRONG) {
      expect(hookNamesSomething(h), h).toBe(false)
      expect(subjectWords(h)).toEqual([])
    }
  })

  it('flags NONE of the other 28 production hooks', () => {
    const wrongly = SHIPPED_AND_FINE.filter((h) => !hookNamesSomething(h))
    expect(wrongly).toEqual([])
  })

  it('leaves a real margin rather than sitting on a tuned line', () => {
    // ⚠️ THE COUNTS ARE 0, 0, THEN 4. If a future edit narrows that gap this
    // fails, because a bar one word away from a good hook is not a bar.
    const worstGood = Math.min(...SHIPPED_AND_FINE.map((h) => subjectWords(h).length))
    expect(worstGood).toBeGreaterThanOrEqual(4)
  })

  it('a contraction tail does not smuggle a word past the filter', () => {
    // ⚠️ THIS EXACT BUG SCORED THE SECOND BAD HOOK 1 INSTEAD OF 0.
    expect(subjectWords("I'm going to do a little bit of the same thing.")).toEqual([])
    expect(subjectWords("I'm a baker")).toEqual(['baker'])
  })

  it('counts across a whole hook_options array, and 0 is a real reading', () => {
    expect(hooksWithoutASubject([...SHIPPED_AND_WRONG, ...SHIPPED_AND_FINE.slice(0, 3)])).toBe(2)
    expect(hooksWithoutASubject(SHIPPED_AND_FINE)).toBe(0)
  })

  it('survives the shapes a blueprint actually arrives in', () => {
    expect(hooksWithoutASubject(null)).toBe(0)
    expect(hooksWithoutASubject(undefined)).toBe(0)
    expect(hooksWithoutASubject('not an array' as unknown as unknown[])).toBe(0)
    // A blank entry is not a subjectless hook — it is an absent one.
    expect(hooksWithoutASubject(['', '   ', 42, null])).toBe(0)
  })
})

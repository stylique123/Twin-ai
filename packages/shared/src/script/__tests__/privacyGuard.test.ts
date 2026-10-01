// PRIMARY SUCCESS CRITERION (fact-scoping brief, Part 1.1). The known-bad cases
// are the real lines that leaked into her scripts on 2026-09-29 (13:03, 13:18),
// and the real stored facts they came from. They must never survive the guard
// unless she allowed them for that video.
import { describe, it, expect } from 'vitest'
import { guardScript, scrubPrivate, isPrivate, privateSqlPattern, statedQuantities, PRIVATE } from '../privacyGuard'

const STORED = {
  police: 'Faced neighbor complaints, police visits, and code enforcement threats over coffee roasting smells at home, forcing a move.',
  cup: 'She only sources and roasts specialty coffee that has cup scores above 80.',
  twoPound: 'Operates with zero inventory by roasting coffee strictly to order in small two-pound batches so beans arrive fresh.',
  messy: 'Running a coffee roastery from my home is messy, and you just figure it out step by step.',
}
const LEAKED = [
  { section: 'Story', line: 'Between roasting strictly to order in small two-pound batches out of a tiny space, and dealing with neighbor complaints and police visits over roasting aromas, it is a constant learning process.' },
  { section: 'Proof', line: 'Now, every single lot starts with a tiny test batch, ensuring I only source specialty beans scoring above eighty before roasting for you.' },
  { section: 'Origin', line: 'Specialty coffee uses beans with cup scores above 80, which is why standard coffee felt so flat by comparison.' },
  { section: 'CTA', line: 'Grab your Sunflower Coffee Roasters, the link is in my bio.' },
]
const ALLOWED = 'Signature Blend Beans. 12oz $18, 5lb $65, whole bean or ground, roasted to order. Someone told me they could taste the difference between my roast and the grocery store bag.'

describe('the known-bad cases never survive (Part 1.1)', () => {
  const { beats, removed } = guardScript(LEAKED, { allowedText: ALLOWED, excludedTexts: Object.values(STORED) })
  const text = beats.map((b) => String(b.line)).join(' ')
  it('no police / neighbour / code enforcement', () => expect(text).not.toMatch(/police|neighbor|code enforcement/i))
  it('no cup score, in digits or words', () => expect(text).not.toMatch(/above 80|eighty|cup scores/i))
  it('no two-pound batches', () => expect(text).not.toMatch(/two-pound/i))
  it('the clean line stays exactly as written', () => expect(beats[3].line).toBe(LEAKED[3].line))
  it('every removal is reported with its reason', () => {
    expect(removed.map((r) => r.reason)).toEqual(expect.arrayContaining(['private', 'excluded']))
  })
})

describe('her consent wins', () => {
  it('a private topic she chose for THIS video is kept', () => {
    const note = 'I want to talk about the police visits and moving my roastery out of the house.'
    const { beats } = guardScript([{ line: 'The police visits are why I moved the roastery out of my house.' }], { allowedText: note, excludedTexts: [STORED.police] })
    expect(beats[0].line).toMatch(/police/)
  })
  it('a fact she switched back on is kept', () => {
    const { beats } = guardScript([{ line: 'I only roast coffee with cup scores above 80.' }], { allowedText: STORED.cup, excludedTexts: [STORED.twoPound] })
    expect(beats[0].line).toMatch(/80/)
  })
  it('product facts on file are never removed', () => {
    const { beats } = guardScript([{ line: 'Grab a 12oz bag for $18 or the 5lb for $65, whole bean or ground.' }], { allowedText: ALLOWED, excludedTexts: Object.values(STORED) })
    expect(beats[0].line).toMatch(/\$18/)
  })
})

describe('every other door is scrubbed with the same rule', () => {
  it('a voice-profile hook sample about code enforcement is dropped', () => {
    const vp = { sample_hooks: ["I just got off the phone with the Police Department code enforcement.", 'Here is how I roast to order.'] }
    expect(scrubPrivate(vp).sample_hooks).toEqual(['Here is how I roast to order.'])
  })
  it('the database flag uses the same list', () => {
    expect(privateSqlPattern()).toContain('code enforcement')
    expect(privateSqlPattern().startsWith('\\m')).toBe(true)
    expect(isPrivate(STORED.police)).toBe(true)
    expect(isPrivate(STORED.cup)).toBe(false)
    expect(PRIVATE.flags).toContain('i')
  })
  it('quantities are read in words and digits, units included', () => {
    expect([...statedQuantities('scoring above eighty')]).toEqual([80])
    expect([...statedQuantities('small two-pound batches')]).toEqual([2])
    expect([...statedQuantities('one or two lines')]).toEqual([])
  })
})

describe('audit 2026-10-01 (B1): the wider private list', () => {
  it('catches what the old list missed', () => {
    for (const t of ['We were in debt for two years.', 'Our IVF journey', 'my ex never paid', "my son's school called", 'I lost my job in March', 'my salary was cut', 'two years sober']) {
      expect(isPrivate(t), t).toBe(true)
    }
  })
  it('does not flag ordinary business talk', () => {
    for (const t of ['I roast every batch by hand.', 'Our best seller is the medium roast.', 'Ship it to your address at checkout']) {
      expect(isPrivate(t), t).toBe(false)
    }
  })
})

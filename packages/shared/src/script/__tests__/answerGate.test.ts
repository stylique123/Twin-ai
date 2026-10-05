import { describe, it, expect } from 'vitest'
import { gateAnswer, isFillerAnswer } from '../answerGate.js'
import { specById, fillSlots, planQuestions } from '../questionSpecs.js'
import fixture from './fixtures/simulatedMoments.json' with { type: 'json' }

// The owner's SIMULATED moments (AI-written, not hers). In memory only.
type M = { id: string; option: string; slot: string; answer: string; simulated: true; expect?: string }
const moments = fixture.moments as M[]
const now = Date.parse('2026-10-04T12:00:00Z')

describe('owner\'s simulated moments, through the answer check', () => {
  it('every item is marked simulated and maps to a real option and slot', () => {
    for (const m of moments) {
      expect(m.simulated).toBe(true)
      const spec = specById(m.option)
      expect(spec, m.id).toBeTruthy()
      expect(spec!.slots.map((s) => s.id), m.id).toContain(m.slot)
    }
  })

  it('real answers are saved; neither weak answer is', () => {
    for (const m of moments) {
      const slot = specById(m.option)!.slots.find((s) => s.id === m.slot)!
      const g = gateAnswer(m.answer, slot, now)
      if (m.expect === 'weak') expect(g.outcome, m.id).toBe('filler')
      else expect(g.outcome, m.id).toBe('answered')
    }
  })

  it('trap m25: the permits letter is saved private', () => {
    const m = moments.find((x) => x.id === 'm25')!
    expect(gateAnswer(m.answer, {}, now).sensitive).toBe(true)
    expect(moments.filter((x) => x.expect !== 'private').every((x) => !gateAnswer(x.answer, {}, now).sensitive)).toBe(true)
  })

  it('trap m26: "my coffee cart business" is held for her yes', () => {
    expect(gateAnswer(moments.find((x) => x.id === 'm26')!.answer, {}, now).hold).toEqual(['You run a coffee cart business'])
  })

  it('trap m27: 30 bags and free shipping are held, and the limit expires', () => {
    const g = gateAnswer(moments.find((x) => x.id === 'm27')!.answer, { expires: true }, now)
    expect(g.hold.join(' | ')).toMatch(/30 bags/i)
    expect(g.hold.join(' | ')).toMatch(/ships free/i)
    expect(Date.parse(g.expiresAt!)).toBeGreaterThan(now)
  })

  it('no ordinary answer is held', () => {
    const held = moments.filter((x) => !x.expect).filter((x) => gateAnswer(x.answer, {}, now).hold.length).map((x) => x.id)
    expect(held).toEqual([])
  })

  it('once answered, a slot is not asked again; a weak answer leaves it open', () => {
    const story = specById('product:story')!
    const good = moments.find((x) => x.id === 'm13')!
    const f = fillSlots(story, { facts: [{ text: good.answer, option: story.id, slot: 'moment' }] }, now)
    expect(planQuestions(story, f, [], 2).ask.map((a) => a.slot.id)).not.toContain('moment')
    expect(isFillerAnswer('idk just try it lol')).toBe(true)
  })
})

describe('owner 2026-10-05: phrasings not in the simulated set', () => {
  const priv = [
    'The zoning board said I could not roast out of my garage anymore.',
    'My landlord threatened to end my lease over the smell.',
    'A supplier filed a lawsuit against me last spring.',
    'Right after my diagnosis I could not lift the bean sacks for months.',
    'We got a visit from the health inspector and failed the first time.',
    'I was behind on my rent that whole winter.',
    'My divorce was the reason I started roasting at night.',
  ]
  it.each(priv)('private: %s', (a) => expect(gateAnswer(a, {}).sensitive).toBe(true))
  const roles = [
    ['I take my cart to the farmers market every Saturday.', /cart/],
    ['My studio is in the back of the house.', /studio/],
    ['I run a little bakery on the side.', /bakery/],
  ] as const
  it.each(roles)('role held: %s', (a, re) => expect(gateAnswer(a, {}).hold.join(' ')).toMatch(re))
  it('"my team" is not a business claim on its own', () => {
    expect(gateAnswer('My team helps me bag on Fridays.', {}).hold).toEqual([])
  })
  const fine = [
    'I grind fine for espresso and coarse for French press.',
    'The court yard at the market is where I set up.',
  ]
  it.each(fine)('ordinary, not private: %s', (a) => expect(gateAnswer(a, {}).sensitive).toBe(false))
})

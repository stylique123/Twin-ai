import { describe, it, expect } from 'vitest'
import {
  SPECS, specById, fillSlots, planQuestions, validateQuestion, nearDuplicate, wordingPrompt, BANNED_ASKS,
  EXPIRY_DAYS, REST_RUNS, type Asked,
} from '../questionSpecs.js'

const launch = specById('product:launch')!
const restock = specById('product:restock')!
const story = specById('product:story')!
const day = 86_400_000
const now = Date.parse('2026-10-04T12:00:00Z')

describe('specs (owner 2026-10-04): one spec per option, never a fixed list', () => {
  it('covers every option in the owner\'s table, each with a job and slots', () => {
    expect(SPECS.length).toBe(22)
    for (const s of SPECS) {
      expect(s.job.length).toBeGreaterThan(10)
      expect(s.slots.length).toBeGreaterThan(0)
      expect(new Set(s.slots.map((x) => x.id)).size).toBe(s.slots.length)
    }
  })

  it('Launch and Restock ask for different things (acceptance)', () => {
    const a = new Set(launch.slots.map((x) => x.id))
    const b = new Set(restock.slots.map((x) => x.id))
    expect([...a].filter((x) => b.has(x))).toEqual([])
    const pa = planQuestions(launch, {}, [], 1).ask.map((x) => x.slot.need)
    const pb = planQuestions(restock, {}, [], 1).ask.map((x) => x.slot.need)
    expect(pa.some((x) => pb.includes(x))).toBe(false)
    expect(wordingPrompt(launch, launch.slots[0]!, { angle: 'first', facts: [], asked: [] }).prompt)
      .not.toEqual(wordingPrompt(restock, restock.slots[0]!, { angle: 'first', facts: [], asked: [] }).prompt)
  })
})

describe('filling slots without asking', () => {
  it('a fact labelled for this option and slot fills it; a sensitive fact never does', () => {
    const f = fillSlots(story, { facts: [
      { text: 'The day I tossed a whole batch of untested green beans', option: 'product:story', slot: 'moment' },
      { text: 'She only had $11 in her bank account', sensitive: true },
    ] }, now)
    expect(f.moment?.source).toBe('labelled')
    expect(Object.values(f).some((x) => x.value.includes('$11'))).toBe(false)
  })

  it('every slot filled → zero questions and a "Using" line (acceptance)', () => {
    const facts = story.slots.map((s) => ({ text: `A real answer for ${s.need}, in her words`, option: story.id, slot: s.id }))
    const p = planQuestions(story, fillSlots(story, { facts }, now), [], 1)
    expect(p.ask).toEqual([])
    expect(p.confirm).toEqual([])
    expect(p.using.length).toBe(story.slots.length)
  })
})

describe('what to ask', () => {
  it('asks at most two, only about unfilled slots, and asks less as slots fill (acceptance)', () => {
    const first = planQuestions(launch, {}, [], 1)
    expect(first.ask.length).toBeLessThanOrEqual(2)
    const filled = fillSlots(launch, { facts: [{ text: 'The new single-origin lot nobody has had before', option: launch.id, slot: 'whats_new' }] }, now)
    const later = planQuestions(launch, filled, [], 2)
    expect(later.ask.map((a) => a.slot.id)).not.toContain('whats_new')
  })

  it('an unanswered best question is asked again (new wording only), not rotated away', () => {
    const asked: Asked[] = [{ slot: 'moment', wording: 'What happened the day it went wrong?', outcome: 'shown', run: 1 }]
    expect(planQuestions(story, {}, asked, 2).ask[0]?.slot.id).toBe('moment')
    expect(planQuestions(story, {}, asked, 2).ask[0]?.angle).toBe('first')
  })

  it('skipped once → a different angle; skipped twice → rests ~10 runs (acceptance)', () => {
    const once: Asked[] = [{ slot: 'moment', wording: 'q1?', outcome: 'skipped', run: 1 }]
    expect(planQuestions(story, {}, once, 2).ask[0]).toMatchObject({ angle: 'different' })
    const twice: Asked[] = [...once, { slot: 'moment', wording: 'q2?', outcome: 'skipped', run: 2 }]
    const p = planQuestions(story, {}, twice, 3)
    expect(p.resting).toContain('moment')
    expect(p.ask.map((a) => a.slot.id)).not.toContain('moment')
    expect(planQuestions(story, {}, twice, 2 + REST_RUNS).resting).not.toContain('moment')
  })

  it('a launch limit expires and is asked again as "same or new?"; an origin story is offered back, not re-asked (acceptance)', () => {
    const old = new Date(now - (EXPIRY_DAYS + 5) * day).toISOString()
    const filled = fillSlots(launch, { facts: [
      { text: 'New lot, never offered before', option: launch.id, slot: 'whats_new', at: old },
      { text: 'Finally ready after six test roasts', option: launch.id, slot: 'why_now', at: old },
      { text: 'For people new to specialty coffee', option: launch.id, slot: 'who_for', at: old },
      { text: 'Only 40 bags this run', option: launch.id, slot: 'limits', at: old },
    ] }, now)
    const p = planQuestions(launch, filled, [], 5)
    expect(p.ask.find((a) => a.slot.id === 'limits')).toMatchObject({ sameOrNew: true })
    const origin = specById('product:why_made')!
    const f2 = fillSlots(origin, { facts: origin.slots.map((s) => ({ text: `Her answer: ${s.need}`, option: origin.id, slot: s.id, at: old })) }, now)
    expect(planQuestions(origin, f2, [], 5).ask).toEqual([])
  })
})

describe('validating a generated question', () => {
  const asked: Asked[] = [{ slot: 'moment', wording: 'What happened the day the batch went wrong?', outcome: 'skipped', run: 1 }]
  it('rejects long, banned, double, non-questions and near-repeats', () => {
    const v = (q: string) => validateQuestion(q, { spec: story, slot: story.slots[0]!, asked })
    expect(v('Tell me a story.').ok).toBe(false)
    expect(v('How much does it cost?').ok).toBe(false)
    expect(v('What happened the day your batch went wrong?').ok).toBe(false)
    expect(v('What did you feel? And what then?').ok).toBe(false)
    expect(v(`${'word '.repeat(26)}?`).ok).toBe(false)
    expect(v('Which roast morning do you still think about, and why?').ok).toBe(true)
  })
  it('private matters are banned', () => {
    expect(BANNED_ASKS.some((re) => re.test('How was your bank balance then?'))).toBe(true)
    expect(nearDuplicate('What changed this batch?', 'What changed in this batch?')).toBe(true)
  })
})

describe('owner rules, second pass: fewer questions, saved stories first', () => {
  const tw = specById('product:why_made')! // required: missing, decision
  it('one missing required slot → exactly one question, about that slot', () => {
    const f = fillSlots(tw, { facts: [{ text: 'Nothing on the market tasted fresh enough for me', option: tw.id, slot: 'missing' }] }, now)
    const p = planQuestions(tw, f, [], 1)
    expect(p.ask.map((a) => a.slot.id)).toEqual(['decision'])
  })
  it('two missing of two required → one question first (not thin with one answered)', () => {
    expect(planQuestions(tw, {}, [], 1).ask.length).toBe(1)
  })
  it('three required, none filled → thin, so a second question appears', () => {
    const l = specById('product:launch')! // 3 required
    expect(planQuestions(l, {}, [], 1).ask.length).toBe(2)
  })
  it('an optional slot is never asked', () => {
    const f = fillSlots(story, { facts: [
      { text: 'The day the batch went wrong', option: story.id, slot: 'moment' },
      { text: 'Everything roasted uneven and I tossed it', option: story.id, slot: 'turn' },
    ] }, now)
    expect(planQuestions(story, f, [], 1).ask).toEqual([])
  })
  it('a saved story that fits is offered as a one-tap choice, not asked', () => {
    const f = fillSlots(story, { facts: [{ text: 'I remember the day a customer said my roast beat her mom\'s grocery bag' }] }, now)
    const p = planQuestions(story, f, [], 1)
    expect(p.confirm.map((c) => c.slot)).toContain('moment')
    expect(p.ask.map((a) => a.slot.id)).not.toContain('moment')
  })
  it('an answered slot is not asked again next run', () => {
    const f = fillSlots(tw, { facts: [{ text: 'The day I tasted the stale bag at the store, I decided', option: tw.id, slot: 'decision' }] }, now)
    expect(planQuestions(tw, f, [{ slot: 'decision', wording: 'When did you decide?', outcome: 'answered', run: 1 }], 2).ask.map((a) => a.slot.id)).not.toContain('decision')
  })
})

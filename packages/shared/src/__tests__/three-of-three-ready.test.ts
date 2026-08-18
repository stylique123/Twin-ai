// THE SENTENCE THE GALLERY EXISTS TO BE ABLE TO SAY.
//
// ⚠️ "Same niche as yours" IS A STATEMENT ABOUT A VIDEO. "Your products cover
// all three" is a statement about whether a finished script exists on the other
// side of the click — the only question a creator staring at a gallery is
// actually asking, and the one the ranker could consume but nothing computed.
import { describe, expect, it } from 'vitest'
import { slotFill, slotFillSummary, type FillableEntity } from '../slotFill'
import { emptyContentProfile, type ContentSlot, type ReferenceContentProfile } from '../referenceContentProfile'
import type { Assessed } from '../assessed'

const AT = '2026-01-01T00:00:00.000Z'
const observed = <T,>(value: T, evidence: string): Assessed<T> =>
  ({ value, basis: 'observed', evidence, assessedAt: AT })

const withSlots = (slots: ContentSlot[]): ReferenceContentProfile => {
  const c = emptyContentProfile('r')
  return {
    ...c,
    requirements: { ...c.requirements, contentSlots: observed(slots, 'three items named') },
  }
}

const slot = (id: string, kind: ContentSlot['kind'], label = id): ContentSlot =>
  ({ id, kind, label, required: true })

const entity = (id: string, over: Partial<FillableEntity> = {}): FillableEntity => ({
  id, type: 'SAAS', relationship: 'OWN_PRODUCT', archivedAt: null, ...over,
})

describe('an unassessed reference has no opinion, rather than a bad one', () => {
  it('returns null when the slots were never read', () => {
    // ⚠️ A ZERO HERE WOULD READ AS "your library fills none of this" — a
    // confident negative about a video nobody has looked at. That is every card
    // in the gallery today, so getting this wrong would mislabel the whole thing.
    expect(slotFill(emptyContentProfile('x'), [entity('a')])).toBeNull()
  })

  it('and the summary says nothing rather than "0 of 0"', () => {
    expect(slotFillSummary(null)).toBeNull()
  })
})

describe('one product cannot fill three slots', () => {
  const three = withSlots([
    slot('1', 'tool_or_software'), slot('2', 'tool_or_software'), slot('3', 'tool_or_software'),
  ])

  it('reports 1 of 3 for a creator with one tool', () => {
    // ⚠️ THE MOST TEMPTING WRONG ANSWER. Comparing "has products: yes" against
    // "needs products: yes" gives 3 of 3, and the script then recommends the
    // same thing three times.
    const f = slotFill(three, [entity('a')])!
    expect(f).toMatchObject({ required: 3, fillable: 1 })
    expect(slotFillSummary(f)).toBe('You have 1 of 3')
  })

  it('and 3 of 3 once there are three distinct ones', () => {
    const f = slotFill(three, [entity('a'), entity('b'), entity('c')])!
    expect(f.fillable).toBe(3)
    expect(slotFillSummary(f)).toBe('Your products cover all 3')
  })

  it('never assigns one entity to two slots', () => {
    const f = slotFill(three, [entity('a'), entity('b')])!
    const used = f.slots.map((s) => s.filledBy).filter(Boolean)
    expect(new Set(used).size).toBe(used.length)
  })
})

describe('a tool slot needs a tool', () => {
  it('three candles do not fill three software recommendations', () => {
    // ⚖️ THE GENEROUS DIRECTION IS THE EMBARRASSING ONE: a confident
    // recommendation of something that is not the kind of thing being asked for.
    const f = slotFill(
      withSlots([slot('1', 'tool_or_software')]),
      [entity('a', { type: 'PHYSICAL_PRODUCT' })],
    )!
    expect(f.fillable).toBe(0)
    expect(slotFillSummary(f)).toBe('Needs something of yours to talk about')
  })

  it('but a physical product fills a generic product slot', () => {
    const f = slotFill(
      withSlots([slot('1', 'product')]),
      [entity('a', { type: 'PHYSICAL_PRODUCT' })],
    )!
    expect(f.fillable).toBe(1)
  })

  it('and the narrow slot is served before the permissive one', () => {
    // ⚠️ ORDER IS LOAD-BEARING. Filling the product slot first would spend the
    // only SaaS on it and report 1 of 2, while a valid 2-of-2 assignment existed.
    const f = slotFill(
      withSlots([slot('generic', 'product'), slot('tool', 'tool_or_software')]),
      [entity('saas', { type: 'SAAS' }), entity('mug', { type: 'PHYSICAL_PRODUCT' })],
    )!
    expect(f.fillable).toBe(2)
    expect(f.slots.find((s) => s.id === 'tool')!.filledBy).toBe('saas')
  })
})

describe('what a library can never supply', () => {
  it('a personal-experience slot is an obligation, not a shortfall', () => {
    // ⚠️ COUNTING IT AS READY WOULD PROMISE A VIDEO TWIN CANNOT HONESTLY WRITE —
    // the founding defect wearing a progress bar. And it must not read as a gap
    // that shopping would close.
    const f = slotFill(withSlots([slot('1', 'personal_experience')]), [entity('a')])!
    expect(f.required).toBe(0)
    expect(f.needsPersonalExperience).toBe(true)
    expect(slotFillSummary(f)).toBe('Needs a story only you can tell')
  })

  it('and it outranks a full library in what the card says', () => {
    const f = slotFill(
      withSlots([slot('1', 'product'), slot('2', 'personal_experience')]),
      [entity('a')],
    )!
    expect(f.fillable).toBe(1)
    expect(slotFillSummary(f)).toBe('Needs a story only you can tell')
  })

  it('a current-fact slot is flagged as research, not counted as missing', () => {
    const f = slotFill(
      withSlots([slot('1', 'product'), slot('2', 'current_fact')]),
      [entity('a')],
    )!
    expect(f.required).toBe(1)
    expect(f.needsResearch).toBe(true)
    expect(slotFillSummary(f)).toBe('You have it — Twin will check the current details')
  })
})

describe('what is not available to talk about', () => {
  it('an archived product fills nothing', () => {
    // ⚖️ WITHDRAWN MEANS WITHDRAWN. A creator who retired a product should not
    // be offered a video built around it.
    const f = slotFill(withSlots([slot('1', 'product')]), [entity('a', { archivedAt: AT })])!
    expect(f.fillable).toBe(0)
  })

  it('and NONE is not a thing to talk about', () => {
    const f = slotFill(withSlots([slot('1', 'product')]), [entity('a', { relationship: 'NONE' })])!
    expect(f.fillable).toBe(0)
  })

  it('while an affiliate tie is perfectly usable', () => {
    // ⚠️ WHAT THEY MAY CLAIM IS A DIFFERENT QUESTION, decided by the writer and
    // `cta.ts`. Refusing an affiliate a slot here would empty the gallery for
    // most of the population.
    const f = slotFill(withSlots([slot('1', 'product')]), [entity('a', { relationship: 'AFFILIATE' })])!
    expect(f.fillable).toBe(1)
  })

  it('and so is review-only', () => {
    const f = slotFill(withSlots([slot('1', 'product')]), [entity('a', { relationship: 'REVIEW_ONLY' })])!
    expect(f.fillable).toBe(1)
  })
})

describe('the card can explain itself per slot', () => {
  it('names which product landed in which role', () => {
    // ⚖️ SO THE DRAWER CAN SAY "surprising_item → your course" RATHER THAN
    // showing a fraction the creator has to take on trust.
    const f = slotFill(
      withSlots([slot('1', 'product', 'relatable_item'), slot('2', 'product', 'surprising_item')]),
      [entity('course', { type: 'COURSE' })],
    )!
    expect(f.slots[0]).toMatchObject({ label: 'relatable_item', filledBy: 'course' })
    expect(f.slots[1]).toMatchObject({ label: 'surprising_item', filledBy: null })
  })

  it('and every declared slot appears, including the unfillable kinds', () => {
    const f = slotFill(
      withSlots([slot('1', 'product'), slot('2', 'personal_experience'), slot('3', 'claim')]),
      [],
    )!
    expect(f.slots.map((s) => s.id)).toEqual(['1', '2', '3'])
  })
})

describe('the words a creator reads are English, not a template', () => {
  it('never says "1 things"', () => {
    // ⚠️ THE HARD UX RULE DOES NOT STOP APPLYING BECAUSE THE SENTENCE WAS
    // GENERATED. Every count-bearing line is checked at 1 and at 3.
    const one = (kind: ContentSlot['kind']) => withSlots([slot('1', kind)])
    for (const f of [
      slotFill(one('product'), [])!,
      slotFill(one('product'), [entity('a')])!,
    ]) {
      expect(slotFillSummary(f)).not.toMatch(/\b1 things?\b/)
    }
  })
})

describe('a creator with nothing is not told a number that implies shopping helps', () => {
  it('says what is needed rather than "0 of 3"', () => {
    const f = slotFill(withSlots([slot('1', 'product'), slot('2', 'product'), slot('3', 'product')]), [])!
    expect(slotFillSummary(f)).toBe('Needs 3 things to talk about')
  })

  it('and a reference needing nothing from a library says nothing at all', () => {
    const f = slotFill(withSlots([slot('1', 'claim'), slot('2', 'example')]), [])!
    expect(f.required).toBe(0)
    expect(slotFillSummary(f)).toBeNull()
  })
})

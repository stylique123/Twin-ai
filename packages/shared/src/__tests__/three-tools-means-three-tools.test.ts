// THE RESOLVER COULD SAY "product_dna" AND NOT WHICH PRODUCT.
//
// ⚠️ `productKnown` IS A BOOLEAN AND THE MATCH IS A REGEX over the beat's own
// description — enough to ROUTE a beat, not enough to FILL it. "3 AI tools every
// founder needs" resolved three times to `product_dna` and left the writer to
// pick three tools, which it does by inventing them or by naming the same one
// three times. Both are the founding defect.
import { describe, expect, it } from 'vitest'
import { resolveTemplate } from '../knowledgeResolver'
import { templateFor } from '../containerTemplates'
import type { CreatorKnowledge } from '../creatorKnowledge'
import type { FillableEntity } from '../slotFill'

const EMPTY: CreatorKnowledge = { items: [] } as never

const entity = (id: string, over: Partial<FillableEntity> = {}): FillableEntity =>
  ({ id, type: 'SAAS', relationship: 'OWN_PRODUCT', archivedAt: null, ...over })

const picks = (r: ReturnType<typeof resolveTemplate>) =>
  r.filter((x) => x.entityId !== null).map((x) => x.entityId)

describe('one entity cannot fill three slots', () => {
  const roundUp = templateFor('recommendation')!

  it('assigns three distinct products to three picks', () => {
    const r = resolveTemplate(roundUp, EMPTY, { entities: [entity('a'), entity('b'), entity('c')] })
    expect(picks(r)).toHaveLength(3)
    expect(new Set(picks(r)).size).toBe(3)
  })

  it('and never names the same one twice when there are only two', () => {
    // ⚠️ THE FAILURE THIS FILE IS NAMED AFTER. A script recommending the same
    // tool three times is worse than one that admits it has two.
    const r = resolveTemplate(roundUp, EMPTY, { entities: [entity('a'), entity('b')] })
    expect(new Set(picks(r)).size).toBe(picks(r).length)
    expect(picks(r)).toHaveLength(2)
  })

  it('a withdrawn product fills nothing', () => {
    const r = resolveTemplate(roundUp, EMPTY, { entities: [entity('a', { archivedAt: '2026-01-01' })] })
    expect(picks(r)).toEqual([])
  })

  it('and NONE is not a thing to talk about', () => {
    const r = resolveTemplate(roundUp, EMPTY, { entities: [entity('a', { relationship: 'NONE' })] })
    expect(picks(r)).toEqual([])
  })
})

describe('an unfilled slot falls back rather than being written over', () => {
  it('a round-up with nothing in the library resolves no product beat', () => {
    const r = resolveTemplate(templateFor('recommendation')!, EMPTY, { entities: [] })
    expect(r.filter((x) => x.entityId === null).length).toBeGreaterThan(0)
    // Every unfilled beat carries an instruction for what to do instead —
    // never a bracket for a creator to read aloud.
    for (const beat of r.filter((x) => x.entityId === null)) {
      expect(beat.source === 'creator_knowledge' || beat.fallback !== null).toBe(true)
    }
  })

  it('a confession asks the creator rather than inventing their story', () => {
    // ⚖️ `personal_experience` MAPS TO THE `experience` RUNG AND NOTHING WEAKER.
    // Filling it from coverage is the most expensive error this system makes.
    const r = resolveTemplate(templateFor('confession')!, EMPTY, {})
    const personal = r.filter((x) => x.container.needs === 'experience')
    expect(personal.length).toBeGreaterThan(0)
    for (const p of personal) {
      expect(p.source).toBe('needs_user')
      expect(p.fallback?.kind).toBe('ask')
    }
  })

  it('and research is offered only where the fact is not personal', () => {
    const r = resolveTemplate(templateFor('myth_busting')!, EMPTY, { researchable: true })
    for (const beat of r) {
      if (beat.fallback?.kind === 'research') expect(beat.container.needs).not.toBe('experience')
    }
  })
})

describe('the assignment matches what the gallery card promised', () => {
  it('uses the same narrowest-first rule as slotFill', () => {
    // ⚠️ TWO DIFFERENT ANSWERS TO "CAN THIS PRODUCT FILL THIS HOLE" is how a
    // card promises what a script cannot deliver.
    const r = resolveTemplate(templateFor('recommendation')!, EMPTY, {
      entities: [entity('mug', { type: 'PHYSICAL_PRODUCT' }), entity('saas', { type: 'SAAS' })],
    })
    expect(picks(r)).toHaveLength(2)
  })
})

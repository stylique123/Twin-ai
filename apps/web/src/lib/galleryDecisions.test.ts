// THE GALLERY'S DECISIONS, TESTED WHERE A TEST CAN REACH THEM.
//
// ⚠️ THE POINT OF LIFTING THESE OUT OF THE COMPONENT. §7a's ranker shipped with
// six of seven signals nobody could exercise, because the only caller was a
// `useMemo` inside a 900-line page.
import { describe, expect, it } from 'vitest'
import { decideGallery, type DecidableCard } from './galleryDecisions'
import {
  emptyReferenceProfile, galleryCreatorView,
  type ReferenceProfile, type GalleryFacts, type FillableEntity, type Assessed,
  type ContentSlot, type CanonicalRelationship,
} from './api'

const AT = '2026-01-01T00:00:00.000Z'
const seen = <T,>(value: T): Assessed<T> =>
  ({ value, basis: 'observed', evidence: 'said at 0:03', assessedAt: AT })

const card = (id: string): DecidableCard => ({ id, url: `https://x/${id}` })

const assessed = (
  id: string,
  over: { posture?: CanonicalRelationship; slots?: ContentSlot['kind'][] },
): ReferenceProfile => {
  const p = emptyReferenceProfile(id)
  return {
    ...p,
    content: {
      ...p.content,
      commercial: over.posture ? { posture: seen(over.posture) } : p.content.commercial,
      requirements: over.slots
        ? {
            ...p.content.requirements,
            contentSlots: seen(over.slots.map((kind, i) => ({
              id: String(i + 1), kind, label: `slot_${i + 1}`, required: true,
            }))),
          }
        : p.content.requirements,
    },
  }
}

const facts = (rel: GalleryFacts['nicheRelation'], reach: number): GalleryFacts =>
  ({ nicheRelation: rel, reach, likes: null })

const entity = (id: string, over: Partial<FillableEntity> = {}): FillableEntity =>
  ({ id, type: 'SAAS', relationship: 'OWN_PRODUCT', archivedAt: null, ...over })

const run = (
  cards: DecidableCard[],
  profiles: [string, ReferenceProfile][],
  factsList: [string, GalleryFacts][],
  me: Parameters<typeof decideGallery>[0]['me'],
  entities: FillableEntity[] = [],
) => decideGallery({
  cards,
  profiles: new Map(profiles.map(([id, p]) => [`https://x/${id}`, p])),
  facts: new Map(factsList),
  me,
  entities,
  blank: (c) => emptyReferenceProfile(c.id),
})

const NOBODY = galleryCreatorView({ profile: null, capabilities: null, entities: [] })

describe('an unassessed gallery is the gallery we already have', () => {
  it('shows every card and orders it by niche then reach', () => {
    // ⚠️ THE REGRESSION THAT WOULD BE FELT BY EVERY USER ON DAY ONE. 9,469 of
    // 9,504 cards are unassessed; a policy that treated unknown as a failing
    // grade would empty the page.
    const cards = [card('far'), card('near')]
    const r = run(cards, [], [['far', facts('unrelated', 9_000_000)], ['near', facts('same_niche', 10)]], NOBODY)
    expect(r.refused).toEqual([])
    expect(r.order.map((c) => c.id)).toEqual(['near', 'far'])
  })
})

describe('a refusal is shown, not silently subtracted', () => {
  const affiliate = galleryCreatorView({
    profile: {
      workKind: null, role: null, businessType: null, audienceSegment: null,
      audienceLevel: null, goals: null, defaultCta: null, preferredFormats: null,
      relationship: { value: 'AFFILIATE', rawValue: 'AFFILIATE', source: 'user_answer', updatedAt: AT },
    },
    capabilities: null,
    entities: [entity('a')],
  })

  it("keeps the founder story out of an affiliate's order", () => {
    const r = run([card('founder')], [['founder', assessed('founder', { posture: 'OWN_PRODUCT' })]],
      [['founder', facts('same_niche', 100)]], affiliate, [entity('a')])
    expect(r.order).toEqual([])
    expect(r.refused.map((c) => c.id)).toEqual(['founder'])
  })

  it('and carries the reason in words the creator can read', () => {
    // ⚖️ A SHORTER GALLERY TELLS A CREATOR NOTHING. "This one only works if the
    // product is yours" tells them something true — and it is the most
    // informative thing the whole assessment produces.
    const r = run([card('founder')], [['founder', assessed('founder', { posture: 'OWN_PRODUCT' })]],
      [['founder', facts('same_niche', 100)]], affiliate, [entity('a')])
    const d = r.byId.get('founder')!
    expect(d.refusedReason).toBe('needs_ownership')
    expect(d.refusedExplain).toMatch(/product is yours/)
  })
})

describe('what a creator can finish comes first', () => {
  it('a fillable reference beats a bigger one it cannot finish', () => {
    // ⚠️ THE SENTENCE THE WHOLE PROJECT IS FOR. Content-resolvable is group 1;
    // reach is group 7.
    const me = galleryCreatorView({
      profile: null, capabilities: null,
      entities: [entity('a'), entity('b')],
    })
    const r = run(
      [card('huge'), card('ready')],
      [
        ['huge', assessed('huge', { slots: ['product', 'product', 'product'] })],
        ['ready', assessed('ready', { slots: ['product', 'product'] })],
      ],
      [['huge', facts('same_niche', 5_000_000)], ['ready', facts('unrelated', 50)]],
      me,
      [entity('a'), entity('b')],
    )
    expect(r.order[0].id).toBe('ready')
  })

  it('and the card can say so in plain English', () => {
    const me = galleryCreatorView({ profile: null, capabilities: null, entities: [entity('a')] })
    const r = run([card('two')], [['two', assessed('two', { slots: ['product', 'product'] })]],
      [['two', facts('unknown', 1)]], me, [entity('a')])
    expect(r.byId.get('two')!.readiness).toBe('You have 1 of 2')
  })

  it('and says nothing at all about a card nobody has read', () => {
    // ⚠️ "0 of 0" ON EVERY CARD WOULD BE THE FIRST THING A CREATOR SAW.
    const r = run([card('blank')], [], [['blank', facts('unknown', 1)]], NOBODY)
    expect(r.byId.get('blank')!.readiness).toBeNull()
    expect(r.byId.get('blank')!.fill).toBeNull()
  })
})

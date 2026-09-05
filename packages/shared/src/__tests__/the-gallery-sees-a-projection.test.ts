// THE TYPE THE WHOLE POLICY TAKES, AND NOTHING BUILT ONE.
//
// ⚠️ EVERY RULE IN `galleryPolicy` READS A `GalleryCreatorView`, and until now
// every one outside a test was constructed by hand in a fixture. A rule with no
// producer is a rule that has never run on a real person.
import { describe, expect, it } from 'vitest'
import { galleryCreatorView, usableProductCount } from '../galleryCreatorView'
import { eligibility } from '../galleryPolicy'
import { emptyReferenceProfile } from '../referenceProfile'
import type { CreatorProfile } from '../profileAssembler'
import type { Provenanced } from '../authority'
import type { ResolvedCapabilities } from '../editor/capabilities'
import type { FillableEntity } from '../slotFill'

const AT = '2026-01-01T00:00:00.000Z'
// ⚠️ WITHOUT THE RETURN ANNOTATION `said` INFERRED `T` FROM THE ARGUMENT ALONE,
//  so `said(['education', 'growth'])` was `Provenanced<string[]>` and nothing
//  ever compared those strings to `BriefGoal`. Neither value is in that union —
//  it is `followers|authority|educate|leads|sell|entertain|personal_brand` — so
//  the projection test asserting "the goals come through" was asserting that two
//  goals which cannot exist come through. Annotating the return is what lets the
//  contextual type reach the array literal.
const said = <T,>(value: T): Provenanced<T> =>
  ({ value, rawValue: value, source: 'user_answer' as const, updatedAt: AT })

// ⚠️ AND THIS OMITTED `preferredFormats`, which is required-and-nullable. Every
//  profile the file built carried `undefined` there — the one field whose whole
//  point is that `null` (unasked) and `[]` (asked, declined to narrow) are
//  different answers, and `undefined` is neither.
const profile = (over: Partial<CreatorProfile> = {}): CreatorProfile =>
  Object.assign({
    workKind: null, role: null, businessType: null, audienceSegment: null,
    audienceLevel: null, goals: null, relationship: null, defaultCta: null,
    preferredFormats: null,
  } as CreatorProfile, over)

const caps = (film: boolean | null, screen: boolean | null): ResolvedCapabilities => ({
  can_film_objects: { value: film, source: film === null ? 'unset' : 'account' },
  can_record_screen: { value: screen, source: screen === null ? 'unset' : 'account' },
  needs_approval: { value: null, source: 'unset' },
})

const entity = (over: Partial<FillableEntity> = {}): FillableEntity => ({
  id: 'e1', type: 'SAAS', relationship: 'OWN_PRODUCT', archivedAt: null, ...over,
})

describe('a creator nobody has asked anything is not a creator who said no', () => {
  it('every unknown arrives as null or empty, never as a false', () => {
    const v = galleryCreatorView({ profile: null, capabilities: null, entities: [] })
    expect(v).toMatchObject({
      goals: [], relationship: null, canFilmObjects: null, canRecordScreen: null,
    })
  })

  it('and refuses them nothing', () => {
    // ⚠️ THE REGRESSION THAT WOULD HURT MOST. If an un-onboarded creator started
    // being refused references, the gallery would empty itself for exactly the
    // people who have seen the least of it.
    const v = galleryCreatorView({ profile: null, capabilities: null, entities: [] })
    expect(eligibility(emptyReferenceProfile('r'), v).eligible).toBe(true)
  })
})

describe('what the library can actually supply', () => {
  it('does not count a withdrawn product', () => {
    // ⚖️ COUNTED THE WAY `slotFill` COUNTS, NOT WITH `count(*)`. A raw row count
    // would tell the gallery this creator has two things to talk about.
    expect(usableProductCount([entity(), entity({ id: 'e2', archivedAt: AT })])).toBe(1)
  })

  it('nor a NONE relationship', () => {
    expect(usableProductCount([entity({ relationship: 'NONE' })])).toBe(0)
  })

  it('and an affiliate tie counts, because it is a real thing to talk about', () => {
    expect(usableProductCount([entity({ relationship: 'AFFILIATE' })])).toBe(1)
  })
})

describe('the format preference this file refuses to invent', () => {
  it('is empty even for a creator with a full profile', () => {
    // ⚠️ THE ONLY FORMAT DATA TWIN HOLDS IS WHAT THEY ALREADY MAKE. Someone who
    // posted forty talking-heads may be here precisely because they want to
    // stop, and `creatorProfileQuestions` names the leap from observed to
    // desired as "a guess dressed as a preference". An empty list makes the
    // format group SKIP; a guessed one would make it decide.
    const v = galleryCreatorView({
      profile: profile({ goals: said(['authority']), relationship: said('OWN_PRODUCT') }),
      capabilities: caps(true, true),
      entities: [entity()],
    })
    expect(v.preferredFormats).toEqual([])
  })
})

describe('what does come through', () => {
  it('carries the goals and the one relationship the profile settled', () => {
    const v = galleryCreatorView({
      profile: profile({ goals: said(['educate', 'followers']), relationship: said('NONE') }),
      capabilities: caps(false, true),
      entities: [],
    })
    expect(v.goals).toEqual(['educate', 'followers'])
    expect(v.relationship).toBe('NONE')
    expect(v.canFilmObjects).toBe(false)
    expect(v.canRecordScreen).toBe(true)
    expect(v.productCount).toBe(0)
  })
})

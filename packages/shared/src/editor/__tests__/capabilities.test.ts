// Capability flags — §2.2's replacement for archetypes.
//
// The load-bearing tests here are all about ONE distinction: unset is not
// false. `can_film_objects = false` means "never show this creator a footage
// checklist", so a missing answer read as `false` silently removes a screen
// from every account that has not been asked — which is the same defect class
// as a null token count read as zero, in the place where it costs the most.
import { describe, expect, it } from 'vitest'
import {
  CAPABILITY_FLAG_NAMES, CAPABILITY_CONSUMERS_BUILT,
  isExplicitlyFalse, isExplicitlyTrue, readCapabilityFlags, resolveCapabilities,
  sanitizeCapabilityFlagsForWrite, unansweredCapabilities,
} from '../capabilities'

describe('the flags are the three §2.2 names, and no enum', () => {
  it('names exactly the three booleans, spelled as the document spells them', () => {
    // The names travel into a column, an API and (later) a question on a
    // screen. A rename is a migration, so they are pinned here rather than
    // being whatever the last edit left behind.
    expect([...CAPABILITY_FLAG_NAMES]).toEqual([
      'can_film_objects', 'can_record_screen', 'needs_approval',
    ])
  })
})

describe('UNSET IS NOT FALSE — the whole design', () => {
  it('an unanswered flag resolves to null, never to false', () => {
    const r = resolveCapabilities({}, {})
    for (const n of CAPABILITY_FLAG_NAMES) {
      expect(r[n]).toEqual({ value: null, source: 'unset' })
      // And neither question about it answers yes.
      expect(isExplicitlyFalse(r[n])).toBe(false)
      expect(isExplicitlyTrue(r[n])).toBe(false)
    }
  })

  it('"may I skip the checklist?" needs a SPOKEN no', () => {
    // Silence means show it. An unnecessary checklist is friction; a missing
    // one is a video the creator cannot make. The costs are not symmetric, so
    // the default is not a matter of taste.
    const silent = resolveCapabilities({}, {})
    expect(isExplicitlyFalse(silent.can_film_objects)).toBe(false)
    const said = resolveCapabilities({ can_film_objects: false }, {})
    expect(isExplicitlyFalse(said.can_film_objects)).toBe(true)
  })

  it('"is this switched on?" needs a spoken yes', () => {
    const silent = resolveCapabilities({}, {})
    expect(isExplicitlyTrue(silent.can_record_screen)).toBe(false)
    expect(isExplicitlyTrue(resolveCapabilities({ can_record_screen: true }, {}).can_record_screen)).toBe(true)
    // A false answer is not a yes either — the two questions are independent,
    // which is what makes three states worth having.
    expect(isExplicitlyTrue(resolveCapabilities({ can_record_screen: false }, {}).can_record_screen)).toBe(false)
  })

  it('reports which flags nobody has answered — what a brief should ask', () => {
    expect(unansweredCapabilities(resolveCapabilities({}, {}))).toEqual([...CAPABILITY_FLAG_NAMES])
    expect(unansweredCapabilities(resolveCapabilities({ needs_approval: true }, {})))
      .toEqual(['can_film_objects', 'can_record_screen'])
    expect(unansweredCapabilities(resolveCapabilities({
      can_film_objects: false, can_record_screen: true, needs_approval: false,
    }, {}))).toEqual([])
  })
})

describe('the video wins, and the record says who answered', () => {
  it('the account default applies when the video is silent', () => {
    const r = resolveCapabilities({}, { can_record_screen: true })
    expect(r.can_record_screen).toEqual({ value: true, source: 'account' })
  })

  it('the video overrides the account — INCLUDING when it says false', () => {
    // "Flags change per video" is the sentence that separates this from the
    // archetype trap. An account that can usually film objects still has videos
    // where the product is not to hand, and an account default acting as a
    // floor would make the per-video answer advisory — a setting that sorts the
    // person and cannot be escaped for one video.
    const r = resolveCapabilities({ can_film_objects: false }, { can_film_objects: true })
    expect(r.can_film_objects).toEqual({ value: false, source: 'video' })
  })

  it('the video overrides in the other direction too', () => {
    const r = resolveCapabilities({ can_film_objects: true }, { can_film_objects: false })
    expect(r.can_film_objects).toEqual({ value: true, source: 'video' })
  })

  it('flags COMPOSE — each resolves independently of the others', () => {
    // The property an enum cannot have. One flag from the video, one from the
    // account, one unanswered, all at once and none of them interfering.
    const r = resolveCapabilities(
      { can_film_objects: false }, { can_record_screen: true })
    expect(r.can_film_objects.source).toBe('video')
    expect(r.can_record_screen.source).toBe('account')
    expect(r.needs_approval.source).toBe('unset')
  })
})

describe('stored values are read strictly, never coerced', () => {
  it('non-boolean values are dropped to unset rather than made true', () => {
    // Each of these is something a client could plausibly send, and each would
    // become a confident `true` under a truthiness check — including for
    // can_film_objects, where a wrong `false` removes a screen the creator
    // needed and a wrong `true` asks them to film something they cannot.
    const r = resolveCapabilities({
      can_film_objects: 'true', can_record_screen: 1, needs_approval: 'yes',
    }, {})
    for (const n of CAPABILITY_FLAG_NAMES) expect(r[n].source).toBe('unset')
  })

  it('unknown keys cannot invent a fourth flag', () => {
    const read = readCapabilityFlags({ can_film_objects: true, can_fly: true })
    expect(read).toEqual({ can_film_objects: true })
  })

  it('a null, a string, an array or a missing object all read as no answers', () => {
    for (const raw of [null, undefined, 'flags', 42, ['can_film_objects']]) {
      expect(readCapabilityFlags(raw)).toEqual({})
    }
  })
})

describe('what may be written', () => {
  it('keeps only recognised names with real booleans', () => {
    expect(sanitizeCapabilityFlagsForWrite({
      can_film_objects: true, can_record_screen: 'yes', nonsense: true,
    })).toEqual({ can_film_objects: true })
  })

  it('an explicit null is PRESERVED — withdrawing an answer is not the same as never giving one', () => {
    // Omitting the key leaves whatever is stored alone; sending null says "I
    // should not have answered that". A writer that dropped nulls would make a
    // mistaken answer permanent.
    expect(sanitizeCapabilityFlagsForWrite({ can_film_objects: null }))
      .toEqual({ can_film_objects: null })
    expect(sanitizeCapabilityFlagsForWrite({})).toEqual({})
  })

  it('a withdrawn video answer falls back to the account, not to false', () => {
    const r = resolveCapabilities({ can_film_objects: null }, { can_film_objects: true })
    expect(r.can_film_objects).toEqual({ value: true, source: 'account' })
  })
})

describe('nothing consumes these yet, and that is DECLARED', () => {
  it('the built-consumer list is empty, matching the header', () => {
    // The precedent is `analysis_components.json`'s `consumedByDirector: false`
    // for alignment: storable-but-unread is a COMPLETE state, and declaring it
    // is what stops the next reader assuming a flag they set changes something.
    // The day a consumer lands, this test fails and the header must be updated
    // with it.
    expect([...CAPABILITY_CONSUMERS_BUILT]).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import { MODES_OF_DESIRED, preferredModes } from '../desiredFormatModes'
import { DESIRED_FORMATS } from '../creatorProfileQuestions'
import { PRODUCTION_MODES } from '../referenceProfile'
import { assembleCreatorProfile } from '../profileAssembler'
import { galleryCreatorView } from '../galleryCreatorView'
import { formatStance } from '../formatProfile'

const NOW = '2026-01-01T00:00:00.000Z'

describe('the two vocabularies meet in exactly one place', () => {
  it('every creator-facing answer has an entry', () => {
    for (const d of DESIRED_FORMATS) expect(MODES_OF_DESIRED[d]).toBeDefined()
  })

  it('every mapped mode is a real production mode', () => {
    for (const modes of Object.values(MODES_OF_DESIRED)) {
      for (const m of modes) expect(PRODUCTION_MODES).toContain(m)
    }
  })

  // ⚠️ THE GUARD ON THE GUESS. These four answers describe CONTENT and are shot
  // every possible way. Mapping them onto `talking_head` because that is the
  // common case is the inference `formatProfile` exists to refuse, so it is
  // asserted rather than left to a comment.
  it('content-shaped answers imply no production mode', () => {
    for (const d of ['educational', 'opinion', 'story', 'trend'] as const) {
      expect(MODES_OF_DESIRED[d]).toEqual([])
    }
  })

  it('"let Twin suggest" constrains nothing', () => {
    expect(MODES_OF_DESIRED.recommend).toEqual([])
    expect(preferredModes(['recommend'])).toEqual([])
  })
})

describe('unasked and unconstrained are different facts', () => {
  it('null for an unanswered question', () => {
    expect(preferredModes(null)).toBeNull()
    expect(preferredModes(undefined)).toBeNull()
    expect(preferredModes([])).toBeNull()
  })

  it('an empty array for an answer that narrows nothing', () => {
    expect(preferredModes(['recommend', 'story'])).toEqual([])
  })
})

describe('the list is a set in declared order, never tap order', () => {
  it('deduplicates modes two answers share', () => {
    // `founder` and `talking_head` both imply talking_head.
    expect(preferredModes(['founder', 'talking_head']))
      .toEqual(['talking_head', 'podcast_interview'])
  })

  it('"showing a product" covers both an object and a screen', () => {
    expect(preferredModes(['product'])).toEqual(['product_led', 'screen_software'])
  })
})

describe('the answer reaches the gallery', () => {
  const view = (desiredFormats: Parameters<typeof preferredModes>[0]) =>
    galleryCreatorView({
      profile: assembleCreatorProfile({ answers: { desiredFormats }, now: NOW }),
      capabilities: null,
      entities: [],
    })

  it('a creator who asked for POV skits ranks POV skits', () => {
    expect(view(['pov']).preferredFormats).toEqual(['pov_skit'])
  })

  // ⚠️ THE REGRESSION THIS FILE EXISTS FOR. `galleryCreatorView` returned `[]`
  // unconditionally for months, with a comment saying no format answer existed.
  // It did exist. A hard-coded empty list would pass every other test here.
  it('does NOT return an empty list when the question was answered', () => {
    expect(view(['walking']).preferredFormats.length).toBeGreaterThan(0)
  })

  it('an unasked creator still sees the whole gallery', () => {
    expect(view(null).preferredFormats).toEqual([])
  })
})

describe('preference outranks history, which is the whole point', () => {
  it('a format they asked for is preferred even when never observed', () => {
    const p = assembleCreatorProfile({ answers: { desiredFormats: ['pov'] }, now: NOW })
    const v = formatStance('pov_skit', {
      observedFormats: { value: ['talking_head'], rawValue: null, source: 'observed', updatedAt: NOW },
      preferredFormats: p.preferredFormats,
    })
    expect(v.stance).toBe('preferred')
  })

  // ⚠️ FORTY TALKING-HEADS IN THE ARCHIVE IS EVIDENCE, NOT A REQUEST. The
  // creator asked for POV; their history must not promote talking_head back to
  // a preference.
  it('a format they only have a history of is familiar, not preferred', () => {
    const p = assembleCreatorProfile({ answers: { desiredFormats: ['pov'] }, now: NOW })
    const v = formatStance('talking_head', {
      observedFormats: { value: ['talking_head'], rawValue: null, source: 'observed', updatedAt: NOW },
      preferredFormats: p.preferredFormats,
    })
    expect(v.stance).toBe('familiar')
  })
})

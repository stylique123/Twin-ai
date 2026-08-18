// WHAT THE GALLERY DOES WITH A ROW IT CANNOT BELIEVE.
//
// ⚠️ THE VALIDATOR RAN ON THE WORKER; THAT PROVES WHAT WAS STORED, NOT WHAT IS
// READ BACK. A later schema, a partial migration or a hand-edited row all arrive
// here looking like an assessment, and this is the screen where believing one
// would be loudest: it decides what a creator is shown and what they are refused.
import { describe, expect, it } from 'vitest'
import { readStoredReferenceProfile, READABLE_SCHEMA_VERSION } from '../storedReferenceProfile'
import { observedFieldCount } from '../referenceProfile'
import { isKnown } from '../assessed'
import { emptyContentProfile } from '../referenceContentProfile'

const AT = '2026-01-01T00:00:00.000Z'

/** A row shaped exactly as the batch writes one. */
const good = (over: Record<string, unknown> = {}) => {
  const c = emptyContentProfile('r', 'Fitness')
  return {
    url: 'https://x/1',
    schema_version: READABLE_SCHEMA_VERSION,
    error: null,
    profile: {
      ...c,
      topic: { value: 'Content marketing', basis: 'observed', evidence: 'says so at 0:03', assessedAt: AT },
      commercial: {
        posture: { value: 'OWN_SERVICE', basis: 'observed', evidence: 'when we built this', assessedAt: AT },
      },
      ...over,
    },
  }
}

describe('a row the batch wrote is read as knowledge', () => {
  it('carries the observed fields through', () => {
    const p = readStoredReferenceProfile(good(), 'r')
    expect(isKnown(p.content.topic) && p.content.topic.value).toBe('Content marketing')
    expect(observedFieldCount(p).content).toBeGreaterThan(0)
  })

  it('and the visual half stays empty, because the frames pass has not run', () => {
    // ⚖️ WHAT TWIN HEARD AND WHAT TWIN SAW ARE SEPARATE ON PURPOSE. A reader
    // that filled the visual half from a transcript would erase the distinction
    // the two-pass split exists to preserve.
    const p = readStoredReferenceProfile(good(), 'r')
    expect(isKnown(p.visual.primaryMode)).toBe(false)
  })
})

describe('everything unreadable becomes an unassessed card, not a dropped one', () => {
  const unassessed = (row: unknown) =>
    expect(observedFieldCount(readStoredReferenceProfile(row as never, 'r')).content).toBe(0)

  it('no row at all', () => unassessed(null))

  it('a failed assessment', () => {
    // ⚠️ "NO SPEECH" IS NOT EIGHTEEN CONFIDENT UNKNOWNS. A failure row read as a
    // profile would look identical to a video nobody tried, and ten of the first
    // fifty-one videos failed exactly this way.
    unassessed({ ...good(), error: 'no_speech: transcript was 5 characters' })
  })

  it('a row from a schema version this reader does not understand', () => {
    // ⚖️ THE COLUMN EXISTS BECAUSE VERSION 1 IS EXPECTED TO BE WRONG SOMEWHERE.
    // Ignoring it would silently mix two contracts in one gallery.
    unassessed({ ...good(), schema_version: 2 })
  })

  it('a leaf that lost its basis on the way through a serialiser', () => {
    // ⚠️ THE QUIETEST FAILURE OF THE LOT. A bare value reads as `undefined` at
    // every `isKnown` call and becomes "not checked" invisibly — so it is
    // checked loudly here instead.
    unassessed(good({ topic: 'Content marketing' }))
  })

  it('a basis outside the vocabulary', () => {
    unassessed(good({ topic: { value: 'x', basis: 'probably', evidence: 'e', assessedAt: AT } }))
  })

  it('a missing group', () => unassessed(good({ structure: undefined })))

  it('and a profile that is not an object', () => unassessed({ ...good(), profile: 'yes' }))
})

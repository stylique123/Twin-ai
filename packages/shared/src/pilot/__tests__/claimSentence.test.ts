// A REVIEWER WHO CANNOT READ THE CLAIM CANNOT LABEL IT.
//
// The owner opened the labelling page and could not tell what was being asked:
// it printed "PERFORMANCE.TALKINGHEAD" and "false". These assert the sentence
// a person actually reads, and that an unknown claim FALLS BACK rather than
// being invented.
import { describe, it, expect } from 'vitest'
import { claimSentence, CLAIM_PATHS_WITH_SENTENCES } from '../claimSentence'

const LIVE_PATHS = [
  'camera.framingChanges', 'camera.positionChanges', 'people.count',
  'performance.acting', 'performance.productInteraction', 'performance.screenInteraction',
  'performance.talkingHead', 'performance.walking', 'primaryMode',
  'requirements.multipleLocations', 'requirements.physicalProduct',
  'requirements.secondPerson', 'requirements.unusualProps',
  'setting.changes', 'setting.complexity',
]

describe('claimSentence', () => {
  it('says the talking-head claim the way the owner saw it', () => {
    expect(claimSentence('performance.talkingHead', false))
      .toBe('Nobody is talking to the camera.')
    expect(claimSentence('performance.talkingHead', true))
      .toBe('Someone is talking to the camera. They do not have to be close up.')
  })

  // ⚠️ EVERY PATH THE LIVE PACKET CONTAINS MUST HAVE A SENTENCE. Measured from
  // production run 7204de6f: exactly these 15 paths, 8 claims each, 120 total.
  it('covers every claim path in the live packet', () => {
    for (const p of LIVE_PATHS) expect(CLAIM_PATHS_WITH_SENTENCES).toContain(p)
  })

  it('renders a real sentence for every boolean path, both ways', () => {
    for (const p of LIVE_PATHS) {
      for (const v of [true, false]) {
        const s = claimSentence(p, v)
        if (s === null) continue // string-valued paths are covered below
        expect(s.length).toBeGreaterThan(10)
        expect(s.endsWith('.')).toBe(true)
      }
    }
  })

  it('renders the string-valued paths', () => {
    expect(claimSentence('people.count', 'one')).toBe('There is one person in this video.')
    expect(claimSentence('people.count', 'multiple')).toBe('There is more than one person in this video.')
    expect(claimSentence('setting.complexity', 'simple')).toBe('It is filmed somewhere plain and uncluttered.')
    expect(claimSentence('setting.complexity', 'complex')).toBe('It is filmed somewhere busy and detailed.')
  })

  // ⚠️ NOT ANSWERED IS NOT FALSE. primaryMode was unanswered on all 8 references
  // in the live packet; saying "Twin did not reach a conclusion" is a different
  // statement from claiming the negative.
  it('an unanswered claim says so rather than asserting the negative', () => {
    const s = claimSentence('performance.talkingHead', null, false)
    expect(s).toBe('Twin did not reach a conclusion about this one.')
    expect(s).not.toContain('Nobody')
  })

  // ⚠️ THE FALLBACK IS THE SAFETY PROPERTY. A reviewer judging a sentence this
  // file invented would be judging the wrong claim.
  it('returns null for an unknown path so the page can show the raw pair', () => {
    expect(claimSentence('something.newAndUnmapped', true)).toBeNull()
  })

  it('returns null for an unexpected value rather than guessing', () => {
    expect(claimSentence('people.count', 'seventeen')).toBeNull()
    expect(claimSentence('performance.talkingHead', 'maybe')).toBeNull()
    expect(claimSentence('setting.complexity', null)).toBeNull()
  })

  // CONTROL: the mapping is not vacuous — a known path with a known value must
  // produce something, or every assertion above would pass on an empty table.
  it('CONTROL a known path with a known value is never null', () => {
    expect(claimSentence('setting.changes', true)).not.toBeNull()
  })

  it('never leaks the internal field path into the sentence', () => {
    for (const p of LIVE_PATHS) {
      for (const v of [true, false, 'one', 'simple']) {
        const s = claimSentence(p, v)
        if (s) expect(s.toLowerCase()).not.toContain(p.toLowerCase())
      }
    }
  })

  // ⚠️ A GUARD AGAINST A PLAUSIBLE "IMPROVEMENT". The industry definition of a
  // talking head requires head-and-shoulders framing. Twin is not asked that --
  // visualPrompt.ts asks 'Is someone speaking to camera?' and nothing about
  // distance. A sentence that adds a framing requirement would have the
  // reviewer judging a stricter claim than the model answered, and every label
  // would record that gap as a model error. This was drafted once and rejected;
  // the test exists so it is rejected again rather than re-argued.
  it('does not put a framing requirement in front of the reviewer', () => {
    const said = [
      claimSentence('performance.talkingHead', true),
      claimSentence('performance.talkingHead', false),
    ].join(' ').toLowerCase()
    for (const framing of ['head and shoulders', 'close-up', 'closeup', 'waist up', 'framed']) {
      expect(said).not.toContain(framing)
    }
  })

  // ⚖️ AND IT ANSWERS THE AMBIGUITY THAT ACTUALLY STOPPED SOMEBODY. A subject
  // far from the camera is still "talking to the camera" under the question the
  // model was asked, and the card now says so rather than leaving the reviewer
  // to guess.
  it('says out loud that distance does not matter', () => {
    expect(claimSentence('performance.talkingHead', true)).toContain('do not have to be close up')
  })
})

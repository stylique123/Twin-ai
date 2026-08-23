// THE POINT OF THIS FILE IS THAT CLOSING A LIMITATION IS A REVIEWED EDIT.
//
// While TALKINGHEAD_LOOSER_THAN_INDUSTRY is OPEN, the reviewer-facing sentence
// must stay loose. Tightening the card without also changing the question the
// model was asked is the exact corruption the decision exists to prevent, so
// the two are pinned together here rather than trusted to memory.
import { describe, it, expect } from 'vitest'
import {
  KNOWN_LIMITATIONS, openLimitations, limitationById,
} from '../knownLimitations'
import { claimSentence } from '../claimSentence'

const TALKING_HEAD = 'TALKINGHEAD_LOOSER_THAN_INDUSTRY'

describe('known limitations', () => {
  it('every entry carries a revisit condition and an honest cost', () => {
    for (const l of KNOWN_LIMITATIONS) {
      expect(l.id, 'id').toBeTruthy()
      expect(l.what.length, `${l.id}: what`).toBeGreaterThan(40)
      expect(l.decision.length, `${l.id}: decision`).toBeGreaterThan(40)
      // ⚠️ A deferral with no trigger is not a deferral, it is the design.
      expect(l.revisitWhen.length, `${l.id}: revisitWhen`).toBeGreaterThan(20)
      expect(l.cost.length, `${l.id}: cost`).toBeGreaterThan(20)
    }
  })

  it('ids are unique, so one entry cannot silently shadow another', () => {
    const ids = KNOWN_LIMITATIONS.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('the talking-head gap is recorded and still open', () => {
    const l = limitationById(TALKING_HEAD)
    expect(l).not.toBeNull()
    expect(l!.status).toBe('OPEN')
    expect(openLimitations().map((x) => x.id)).toContain(TALKING_HEAD)
  })

  it('names the real trigger — the pilot locking, not a date', () => {
    expect(limitationById(TALKING_HEAD)!.revisitWhen).toContain('LOCKED')
  })

  it('records that revisiting costs an analyzer version, not nothing', () => {
    const cost = limitationById(TALKING_HEAD)!.cost
    expect(cost).toContain('VISUAL_ANALYSIS_VERSION')
    // The half that is easiest to forget: it does not apply to rows already analysed.
    expect(cost).toContain('NOT retroactive')
  })
})

describe('while the talking-head gap is OPEN, the card stays loose', () => {
  const isOpen = () => limitationById(TALKING_HEAD)?.status === 'OPEN'

  it('says distance does not matter', () => {
    if (!isOpen()) return
    expect(claimSentence('performance.talkingHead', true))
      .toContain('do not have to be close up')
  })

  it('uses no framing vocabulary the model was never asked about', () => {
    if (!isOpen()) return
    const said = [
      claimSentence('performance.talkingHead', true),
      claimSentence('performance.talkingHead', false),
    ].join(' ').toLowerCase()
    for (const word of ['head and shoulders', 'close-up', 'framing', 'shot size', 'waist up']) {
      expect(said, `card must not say "${word}" while the model is asked only "is someone speaking to camera?"`)
        .not.toContain(word)
    }
  })
})

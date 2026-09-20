// THE VISUAL PASS RAN ON 940 REFERENCES AND THE SCREEN SAID WE NEVER LOOKED.
//
// ⚠️ THE OWNER'S REPORT: the framing, camera and pacing rows read "not
// observed", and the question was right — "if everything is already picked up
// and extracted why can't you just put them there?"
//
// `MISSING_EVIDENCE_TYPES` is a hard-coded list and `transferRows` emitted every
// entry as `unknown` with "We did not analyse the video", unconditionally. That
// was TRUE when written; the visual pass shipped afterwards and nothing revisited
// the list.
//
// ⚠️⚠️ THE HALF THAT MATTERS MOST IN THIS FILE IS WHAT MUST STAY UNOBSERVED.
// Filling all six gaps would be the fabrication `creativeTransferRows` exists to
// prevent. There is no zoom field in the profile, frames carry no audio, and
// visual waste is not measured — so zoom, music and waste keep their honest gap,
// and the owner asked about zooms by name.

import { describe, it, expect } from 'vitest'
import { transferRows } from '../creativeTransferRows'
import { visualEvidenceRows, visualEvidenceItems, visualSourceSentence } from '../visualEvidence'

/** A real production row, copied from `reference_content_profiles.visual_profile`. */
const REAL_PROFILE = {
  visualPassRan: true,
  framesSampled: 4,
  fieldsObserved: 14,
  fieldsUnreadable: 2,
  indeterminate: [],
  camera: {
    shotType: { value: 'close', evidence: { frames: [1] } },
    framingChanges: { value: false, evidence: { frames: [1, 4] } },
    positionChanges: { value: true, evidence: { frames: [1, 2] } },
  },
  people: { count: { value: 'one', evidence: { frames: [1] } } },
  setting: {
    changes: { value: false, evidence: { frames: [1, 4] } },
    complexity: { value: 'simple', evidence: { frames: [1] } },
  },
  performance: {
    acting: null,
    walking: { value: false, evidence: { frames: [1, 4] } },
    talkingHead: { value: true, evidence: { frames: [1] } },
    screenInteraction: { value: false, evidence: { frames: [1] } },
    productInteraction: { value: false, evidence: { frames: [1] } },
  },
  primaryMode: { value: 'talking_head', evidence: { frames: [1, 2] } },
}

const NOT_OBSERVED = 'We did not analyse the video — your brand default is used instead.'
const rowsFor = (vp: unknown) => transferRows(null, true, vp)
const byLabel = (vp: unknown, label: string) => rowsFor(vp).find((r) => r.label === label)!

describe('what the frames can honestly answer', () => {
  it('fills exactly three of the six gaps', () => {
    expect(visualEvidenceRows(REAL_PROFILE).map((r) => r.type).sort()).toEqual([
      'camera_distance_movement', 'shot_semantics', 'subject_framing',
    ])
  })

  it('camera work carries the reading AND the frames it came from', () => {
    const row = byLabel(REAL_PROFILE, 'Camera work')
    expect(row.kind).toBe('interpreted')
    expect(row.value).toContain('close')
    expect(row.source).toMatch(/frames 1 and 2 of the 4 we sampled/)
    expect(row.source).not.toBe(NOT_OBSERVED)
  })

  it('framing stops claiming we never looked', () => {
    const row = byLabel(REAL_PROFILE, 'Framing')
    expect(row.source).not.toBe(NOT_OBSERVED)
    expect(row.value).toContain('no framing changes')
  })

  // ⚠️⚠️ `interpreted`, NEVER `observed`. A model reading four frames and calling
  // the shot "close" is a READING. Upgrading it is the over-claim this screen
  // exists to prevent, committed while implementing the screen.
  it('is interpreted, not observed or measured', () => {
    for (const r of visualEvidenceItems(REAL_PROFILE, { referenceId: 'r', analysisId: 'a' })) {
      expect(r.kind).toBe('interpreted')
      // unknownReason is non-null exactly when kind is unknown.
      expect(r.unknownReason).toBeNull()
      // A frame index is an ordinal into what we sampled, not a timestamp.
      expect(r.atSec).toBeNull()
    }
  })
})

describe('what has no possible writer is no longer a row at all', () => {
  // ⚠️⚠️ THIS BLOCK ASSERTED THE OPPOSITE UNTIL 2026-09-20, and it was right
  // then: given that `Zooms`, `Music` and `Pacing of dead space` were ROWS, they
  // had to stay honest gaps rather than be filled with a guess.
  //
  // ⚖️ THE OWNER REMOVED THE PREMISE. "If you already pulled it add it,
  // otherwise remove it" — so a dimension nothing can ever measure stops being
  // shown, and the question of what it should SAY stops existing. The stronger
  // property is asserted instead: they cannot come back as rows while nothing
  // writes them.
  for (const label of ['Zooms', 'Music', 'Pacing of dead space']) {
    it(`${label} is not a row, because nothing can ever measure it`, () => {
      const labels = transferRows(null, undefined, REAL_PROFILE).map((r) => r.label)
      expect(labels).not.toContain(label)
    })
  }

  it('and the three that CAN be read are still rows', () => {
    // A null on one of these is a fact about ONE video, which is worth saying.
    const labels = transferRows(null, undefined, REAL_PROFILE).map((r) => r.label)
    for (const l of ['Shot choices', 'Camera work', 'Framing']) expect(labels).toContain(l)
  })
})

describe('an absent or useless profile changes nothing', () => {
  it('no profile leaves all six honest', () => {
    for (const r of rowsFor(null)) expect(r.source).toBe(NOT_OBSERVED)
    expect(visualEvidenceRows(null)).toEqual([])
  })

  // ⚠️ `visualPassRan: false` IS NOT A SYNONYM FOR "there is something to say".
  it('a pass that did not run is not evidence', () => {
    expect(visualEvidenceRows({ ...REAL_PROFILE, visualPassRan: false })).toEqual([])
  })

  // ⚖️ null IS THE PASS'S OWN WORD FOR "I looked and could not tell". It must
  // stay unknown rather than becoming a row with no value.
  it('fields the pass could not read stay gaps', () => {
    const blind = {
      visualPassRan: true,
      framesSampled: 4,
      camera: { shotType: { value: null }, framingChanges: { value: null }, positionChanges: { value: null } },
      primaryMode: { value: null },
      performance: { talkingHead: { value: null }, productInteraction: { value: null } },
    }
    expect(visualEvidenceRows(blind)).toEqual([])
    for (const r of rowsFor(blind)) expect(r.source).toBe(NOT_OBSERVED)
  })

  it('garbage in the column does not throw', () => {
    for (const junk of [undefined, 42, 'x', [], { camera: 'not an object' }]) {
      expect(() => visualEvidenceRows(junk)).not.toThrow()
      expect(visualEvidenceRows(junk)).toEqual([])
    }
  })
})

describe('the citation sentence', () => {
  it('names one frame in the singular', () => {
    expect(visualSourceSentence([3], 4)).toBe('Read from frame 3 of the 4 we sampled.')
  })

  it('lists several without a trailing comma', () => {
    expect(visualSourceSentence([1, 2, 4], 4)).toBe('Read from frames 1, 2 and 4 of the 4 we sampled.')
  })

  it('says something true when the frame list is missing', () => {
    expect(visualSourceSentence([], 4)).toBe('Read from the 4 frames we sampled.')
    expect(visualSourceSentence([], null)).toBe('Read from the video’s frames.')
  })
})

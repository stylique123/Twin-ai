// The b-roll selector read the shot's NAME, and the name is a number.
//
// WHY THIS FILE EXISTS. `recordingScriptAdapter` chose which shots become
// silent cutaways with `BROLL_HINT.test(s.shot) || BROLL_HINT.test(s.framing)`
// — a word regex against `shot`, which the writer fills with an ordinal
// ("1", "2", "3"). Measured over all 821 production shots carrying a
// `shot_list`: 30 of the 37 shots declared `shot_type: 'b_roll'` have a purely
// numeric `shot`. What the regex actually selected was 13 of 37 real cutaways
// MISSED, 43 `talking_head` and 4 `cover_frame` admitted — 47 of the 71 it
// picked wrong by the model's own label.
//
// A coverage test ("b-roll scenes exist") passed throughout. These assert the
// SELECTION and the CAPTION, on the shapes production actually emits.
import { describe, it, expect } from 'vitest'
import { isBrollShot, brollCaption, buildRecordingScript } from '../recordingScriptAdapter'
import type { Blueprint } from '../types'

describe('isBrollShot — the declared type answers first', () => {
  it('a declared b_roll whose name is an ordinal IS a cutaway (the 30 of 37)', () => {
    // Verbatim production shape: shot "5", framing "Wide shot" — no hint word
    // anywhere. The old regex returned false and the creator lost the shot.
    expect(isBrollShot({ shot: '5', framing: 'Wide shot', shot_type: 'b_roll' })).toBe(true)
  })

  it('a declared talking_head is NOT a cutaway even when its framing says overlay', () => {
    // This is the 43. "overlay" is in BROLL_HINT, so the old rule turned a
    // spoken beat into a silent insert — the creator is never told to say it.
    expect(isBrollShot({ shot: '4', framing: 'Full screen overlay', shot_type: 'talking_head' })).toBe(false)
  })

  it('a cover_frame is NOT a cutaway — it is the thumbnail, nobody performs it', () => {
    expect(isBrollShot({ shot: '1', framing: 'Split screen insert', shot_type: 'cover_frame' })).toBe(false)
  })

  it('with NO declared type the name heuristic still decides — the 101 unlabelled', () => {
    expect(isBrollShot({ shot: 'Cutaway of the dough folding', framing: 'Close-up' })).toBe(true)
    expect(isBrollShot({ shot: 'She looks at the camera', framing: 'Medium close-up' })).toBe(false)
  })

  it('framing still carries an untyped shot when the name does not', () => {
    expect(isBrollShot({ shot: 'The rise', framing: 'Full screen overlay' })).toBe(true)
  })

  it('nothing at all is not a cutaway', () => {
    expect(isBrollShot(null)).toBe(false)
    expect(isBrollShot({})).toBe(false)
  })
})

describe('brollCaption — an ordinal is not a caption', () => {
  it('a numeric shot name yields NO caption (the eight production cards titled "2")', () => {
    expect(brollCaption({ shot: '6' })).toBe('')
    expect(brollCaption({ shot: ' 2 ' })).toBe('')
  })

  it('a real shot name is still the caption, shortened', () => {
    expect(brollCaption({ shot: 'Overhead tight shot of hands folding the leather body into shape' }))
      .toBe('Overhead tight shot of hands folding the')
  })

  it('a name that merely CONTAINS a number is kept — only a bare ordinal is dropped', () => {
    // The discriminating case. A rule written as "strip digits" would lose this.
    expect(brollCaption({ shot: '3 seconds of the loaf rotating' })).toBe('3 seconds of the loaf rotating')
  })

  it('missing or empty yields no caption rather than an invented one', () => {
    expect(brollCaption({})).toBe('')
    expect(brollCaption({ shot: '   ' })).toBe('')
  })
})

function bp(shot_list: NonNullable<Blueprint['shot_list']>): Blueprint {
  return {
    reference_read: { platform: 'reels', format_label: 'X', why_it_works: [], retention_map: [] },
    hook_options: ['A hook that stops the scroll'],
    script: [
      { section: 'Hook', line: 'A hook that stops the scroll', direction: 'to camera' },
      { section: 'CTA', line: 'Grab the checklist in my bio', direction: 'warm' },
    ],
    shot_list,
  } as Blueprint
}

describe('the built script', () => {
  const scenesOf = (b: Blueprint) =>
    buildRecordingScript({ generationId: 'g1', blueprint: b }).scenes

  it('the silent insert reaches the script with an EMPTY caption, not the number', () => {
    // `SilentCard` renders `caption_text || "Cutaway"`, and its chip already
    // prints "Scene N" — so the empty string is what keeps the number, and the
    // scene label, off the card body.
    const broll = scenesOf(bp([
      { shot: '1', shot_type: 'cover_frame', framing: 'Medium close-up', notes: 'Cover frame.' },
      { shot: '2', shot_type: 'talking_head', framing: 'Medium', notes: 'Hook.' },
      { shot: '3', shot_type: 'b_roll', framing: 'Full Screen Graphic', notes: 'Line graph flatlining.' },
    ])).filter((s) => s.scene_type === 'b_roll')

    expect(broll).toHaveLength(1)
    expect(broll[0].caption_text).toBe('')
    expect(broll[0].caption_text).not.toBe('Scene ' + broll[0].scene_number)
    // The instruction is not lost — it is on the row that renders it.
    expect(broll[0].background).toBe('Line graph flatlining.')
    expect(broll[0].camera_framing).toBe('Full Screen Graphic')
    expect(broll[0].dialogue).toBeNull()
    expect(broll[0].show_in_teleprompter).toBe(false)
  })

  it('a declared talking_head with an "overlay" framing stays OUT of the cutaways', () => {
    const scenes = scenesOf(bp([
      { shot: '1', shot_type: 'talking_head', framing: 'Full screen overlay', notes: 'Setup.' },
    ]))
    expect(scenes.filter((s) => s.scene_type === 'b_roll')).toHaveLength(0)
  })
})

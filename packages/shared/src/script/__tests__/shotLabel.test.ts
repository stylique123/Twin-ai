import { describe, it, expect } from 'vitest'
import { shotLabel, isBareOrdinal } from '../shotLabel'

describe('a bare ordinal is not a name', () => {
  it.each(['1', '2', ' 3 ', '4.', '5)'])('%s is an ordinal', (s) => {
    expect(isBareOrdinal(s)).toBe(true)
  })

  it.each(['A-roll Hook', 'Medium framing', 'Shot 2', 'Take 3', ''])(
    '%s is not', (s) => {
      expect(isBareOrdinal(s)).toBe(false)
    })
})

describe('what the card calls the shot', () => {
  // ⚠️ THE REAL ROWS FROM PRODUCTION. Each of these is a measured shape, not an
  // invented fixture: a numbered `shot` beside a real `shot_type` and `notes`.
  it.each([
    ['1', 'cover_frame', 'Medium close-up', 'The still for the thumbnail'],
    ['2', 'talking_head', 'Medium close-up', 'You, on camera'],
    ['3', 'b_roll', 'Close-up', 'Cutaway'],
    ['4', 'talking_head', 'Medium close-up', 'You, on camera'],
  ])('shot %s of type %s becomes %s', (shot, type, framing, expected) => {
    expect(shotLabel(shot, type, framing)).toBe(expected)
  })

  // ⚖️ A NAME THE WRITER CHOSE ALWAYS WINS. The older rows named their shots and
  // have no type at all; nothing here may overwrite them.
  it.each([
    ['A-roll Hook', null],
    ['B-roll Authority', null],
    ['A-roll Pivot and CTA', null],
    ['Medium framing', null],
  ])('keeps the writer\'s own name %s', (shot, type) => {
    expect(shotLabel(shot, type, 'Waist up, centered.')).toBe(shot)
  })

  // ⚠️ FRAMING IS A HEADING ONLY IF IT READS AS ONE.
  it('falls back to a short framing when there is no type', () => {
    expect(shotLabel('2', null, 'Medium close-up')).toBe('Medium close-up')
  })

  it('refuses a framing that is a sentence about lighting', () => {
    expect(shotLabel('2', null, 'Ensure bright, even lighting on your face. Eye contact locked.'))
      .toBe('Shot 2')
  })

  it('refuses a framing too long to be a heading', () => {
    expect(shotLabel('7', null, 'Waist up, centered with a clean uncluttered background'))
      .toBe('Shot 7')
  })
})

describe('the last resort still reads as a list, not as a bug', () => {
  // ⚠️ THE WHOLE POINT. "2" reads as a broken card; "Shot 2" reads as a list.
  it('spells the position out', () => {
    expect(shotLabel('2', null, null)).toBe('Shot 2')
    expect(shotLabel('2.', '', '')).toBe('Shot 2')
  })

  // ⚖️ THE NUMBER IN THE FIELD BEATS THE RENDER INDEX, so the card agrees with
  // whatever the creator saw elsewhere.
  it('prefers the number the writer wrote over the position on screen', () => {
    expect(shotLabel('7', null, null, 0)).toBe('Shot 7')
  })

  it('uses the render index only when there is no number at all', () => {
    expect(shotLabel('', null, null, 2)).toBe('Shot 3')
  })

  it.each([null, undefined, '', '   '])('%s with nothing else is just Shot', (s) => {
    expect(shotLabel(s, null, null)).toBe('Shot')
  })

  // ⚠️ IT NEVER RETURNS SOMETHING THAT READS AS A BUG.
  it.each([
    ['1', 'cover_frame', 'Medium close-up'],
    ['2', null, null],
    ['', null, null],
    [null, null, null],
    ['9', 'unknown_type', null],
  ])('never returns a bare number for %s/%s/%s', (a, b, c) => {
    expect(isBareOrdinal(shotLabel(a, b, c))).toBe(false)
  })

  // ⚖️ AND IT NEVER LEAKS TWIN'S INTERNAL VOCABULARY.
  it.each(['talking_head', 'cover_frame', 'b_roll'])('%s reads as plain English', (t) => {
    const out = shotLabel('1', t, null)
    expect(out).not.toMatch(/_/)
    expect(out.toLowerCase()).not.toMatch(/\b(b_roll|cover_frame|talking_head|shot_type)\b/)
  })
})

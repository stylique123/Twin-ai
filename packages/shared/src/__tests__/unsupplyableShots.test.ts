import { describe, expect, it } from 'vitest'
import { asksForBroll, asksForUnsupplyableShot, unsupplyableShotCount } from '../screenCaptureConversion'

// ⚠️ REAL PRODUCTION LINES, measured directly against generations.blueprint via
// Supabase before this was built. `shot_type` is constrained to
// talking_head/cover_frame, but `editor_intent` has no equivalent constraint,
// and these were live in generated scripts.
const REAL_SCREEN_CAPTURE = 'Overlay the screen recording at fifty percent opacity so the creator is still visible.'
const REAL_BROLL = 'Hard cut to full screen b-roll for two seconds on the word unfulfilling, then back to creator.'

describe('asksForBroll', () => {
  it('flags the real production line', () => {
    expect(asksForBroll(REAL_BROLL)).toBe(true)
  })

  it.each([
    'Cut to b-roll of the empty office.',
    'Insert stock footage of a busy street.',
    'Cutaway to the notebook on the desk.',
    'Insert clip of the finished product.',
  ])('flags: %s', (line) => {
    expect(asksForBroll(line)).toBe(true)
  })

  it('is silent on ordinary edit direction', () => {
    expect(asksForBroll('Punch in tight on the phrase YOU HAVE TIME.')).toBe(false)
    expect(asksForBroll('Pull back to the original framing. Add a subtle whoosh sound effect.')).toBe(false)
  })

  it('is silent on a non-string', () => {
    expect(asksForBroll(null as unknown as string)).toBe(false)
    expect(asksForBroll(undefined as unknown as string)).toBe(false)
  })
})

describe('asksForUnsupplyableShot', () => {
  it('catches both standing-decision violations', () => {
    expect(asksForUnsupplyableShot(REAL_SCREEN_CAPTURE)).toBe(true)
    expect(asksForUnsupplyableShot(REAL_BROLL)).toBe(true)
  })

  it('is silent on ordinary edit direction', () => {
    expect(asksForUnsupplyableShot('Fast zoom in right before saying you just suck at training.')).toBe(false)
  })
})

describe('unsupplyableShotCount', () => {
  it('counts across the final script, reading editor_intent', () => {
    const script = [
      { editor_intent: REAL_SCREEN_CAPTURE },
      { editor_intent: 'Pop up white text highlighting the words buy yourself a boss.' },
      { editor_intent: REAL_BROLL },
    ]
    expect(unsupplyableShotCount(script)).toBe(2)
  })

  it('is silent on a script with no violations', () => {
    const script = [
      { editor_intent: 'Push in five percent on the word poor to increase intimacy.' },
      { editor_intent: 'Leave one second of silence at the end before the loop.' },
    ]
    expect(unsupplyableShotCount(script)).toBe(0)
  })

  it('is silent on an empty or malformed script', () => {
    expect(unsupplyableShotCount([])).toBe(0)
    expect(unsupplyableShotCount(null as unknown as [])).toBe(0)
  })

  it('treats a missing editor_intent as no violation, not a crash', () => {
    expect(unsupplyableShotCount([{}])).toBe(0)
  })
})

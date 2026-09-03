import { describe, expect, it } from 'vitest'
import { unsupplyableShotCount } from '../screenCaptureConversion'

/**
 * ⚠️ THE STRING BELOW IS REAL. Pulled from `generations` on 2026-09-03, written
 * 2026-08-17: a beat whose `broll_request` read "Screen recording of deleting a
 * social media draft." — very nearly word for word the failure
 * `screenCaptureConversion`'s own docstring cites as the reason it exists.
 *
 * Every counter read past it. `screenCaptureDirectionsInline` reads `proof` and
 * `direction`; `unsupplyableShotCount` read `editor_intent`. Nothing read
 * `broll_request`, so the metric reported ZERO while the violation sat in the
 * row — and zero is the answer we would have used to conclude the prompt was
 * holding.
 *
 * ⚖️ NOBODY WAS HANDED THIS SHOT. `placeToStand` is forbidden from reaching
 * `broll_request` and no other reader exists, so it never reached a creator.
 * The defect is in the measurement, and that is worse rather than better: a
 * violation in an unread field is invisible to them AND to us.
 */
const FROM_PRODUCTION = 'Screen recording of deleting a social media draft.'

describe('unsupplyableShotCount reads broll_request', () => {
  it('counts the production beat that every counter used to miss', () => {
    expect(unsupplyableShotCount([{ broll_request: FROM_PRODUCTION }])).toBe(1)
  })

  it('still counts editor_intent, which is what it always did', () => {
    expect(unsupplyableShotCount([
      { editor_intent: 'Overlay the screen recording at fifty percent opacity.' },
    ])).toBe(1)
  })

  // One beat is one violation however many of its fields ask.
  it('does not double-count a beat that asks in both fields', () => {
    expect(unsupplyableShotCount([
      { editor_intent: FROM_PRODUCTION, broll_request: FROM_PRODUCTION },
    ])).toBe(1)
  })

  // The same row carried `broll_request: "None"` on five other beats. A writer
  // filling the field with a refusal must never read as a violation.
  it('treats "None" as the absence it is', () => {
    expect(unsupplyableShotCount([{ broll_request: 'None' }])).toBe(0)
  })

  it('ignores a non-string, and an absent field', () => {
    expect(unsupplyableShotCount([{ broll_request: 42 }, {}])).toBe(0)
  })

  it('is zero for a clean script', () => {
    expect(unsupplyableShotCount([
      { editor_intent: 'Cut away on the word math.', broll_request: 'None' },
    ])).toBe(0)
  })
})

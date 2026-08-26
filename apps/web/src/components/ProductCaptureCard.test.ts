import { describe, expect, it } from 'vitest'
import { readProductCapturePrompt } from './ProductCaptureCard'

// ⚠️ READ, NOT CAST — mirroring `readAdvisoryFindings`'s own test discipline.
// `product_capture_prompt` arrives on the blueprint as JSON an edge function
// wrote; nothing here may assume the shape survived the round trip.
describe('readProductCapturePrompt', () => {
  it('reads true when the writer set it', () => {
    expect(readProductCapturePrompt({ product_capture_prompt: true })).toBe(true)
  })

  it('reads false when the writer set it explicitly', () => {
    expect(readProductCapturePrompt({ product_capture_prompt: false })).toBe(false)
  })

  it('reads false when the field is absent — a script the writer never touched', () => {
    expect(readProductCapturePrompt({})).toBe(false)
  })

  it('reads false for a blueprint that is null', () => {
    expect(readProductCapturePrompt(null)).toBe(false)
  })

  it('reads false for a blueprint that is not an object', () => {
    expect(readProductCapturePrompt('unrecorded')).toBe(false)
  })

  // ⚠️ THE MUTATION THIS GUARDS: a loose truthy check (`!!value` instead of
  // `=== true`) would read the STRING "false" as shown, and would read a
  // stray non-boolean value written by a future bug as shown too. Both are
  // the wrong direction for a field that controls whether a real product
  // capture prompt appears — an accidental truthy must never show it.
  it('reads false for a truthy non-boolean value — the loose-check mutation', () => {
    expect(readProductCapturePrompt({ product_capture_prompt: 'false' })).toBe(false)
    expect(readProductCapturePrompt({ product_capture_prompt: 1 })).toBe(false)
  })
})

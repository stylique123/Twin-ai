import { describe, expect, it } from 'vitest'
import { readVisualHook } from '../visualHook'

const whole = { opening_frame: 'You hold the invoice up to the lens.', why_it_interrupts: 'A number appears before a word is said.' }

describe('a complete visual hook is read', () => {
  it('carries both halves through, trimmed', () => {
    expect(readVisualHook({ opening_frame: '  a frame  ', why_it_interrupts: ' a reason ' }))
      .toEqual({ openingFrame: 'a frame', whyItInterrupts: 'a reason' })
  })

  it('reads the shape production actually stores', () => {
    expect(readVisualHook(whole)).not.toBeNull()
  })
})

describe('half a visual hook is not a visual hook', () => {
  // ⚠️ EITHER HALF ALONE RENDERS AS A FINISHED PLAN. A frame with no reason is
  // a direction the creator cannot judge; a reason with no frame is a claim
  // about a shot nobody described.
  it('a frame with no reason is absent', () => {
    expect(readVisualHook({ opening_frame: 'a frame' })).toBeNull()
    expect(readVisualHook({ ...whole, why_it_interrupts: '   ' })).toBeNull()
  })

  it('a reason with no frame is absent', () => {
    expect(readVisualHook({ why_it_interrupts: 'a reason' })).toBeNull()
    expect(readVisualHook({ ...whole, opening_frame: '' })).toBeNull()
  })
})

describe('absent is not empty', () => {
  // ⚖️ 37 OF 41 GENERATIONS PREDATE THE FIELD. They were never promised a
  // first-second plan; reporting one as missing invents a gap.
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an array', []],
    ['a string', 'nope'],
    ['a number', 7],
    ['an empty object', {}],
  ])('%s reads as no visual hook at all', (_label, v) => {
    expect(readVisualHook(v)).toBeNull()
  })

  it('and non-string halves are not coerced into text', () => {
    // ⚠️ String(3) IS "3", AND "3" IS TRUTHY. A numeric frame must not become
    // a card that tells a creator to shoot "3".
    expect(readVisualHook({ opening_frame: 3, why_it_interrupts: 4 })).toBeNull()
  })
})

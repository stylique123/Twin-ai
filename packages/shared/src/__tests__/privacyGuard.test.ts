import { describe, expect, it } from 'vitest'
import { guardScript, unbackedRole } from '../script/privacyGuard'

describe('owner retest 2026-10-01: a role she never stated is removed', () => {
  it('removes "I run a coffee cart" when only a caption-guessed topic names a cart', () => {
    const r = guardScript([{ line: 'I run a coffee cart every morning in Farmington, so I know the rush. Here is why.' }],
      { allowedText: 'Building and operating a small batch coffee roasting and coffee cart business', excludedTexts: [], identityText: 'She only sources coffee with cup scores above 82.' })
    expect(r.removed.map((x) => x.reason)).toEqual(['unbacked_identity'])
    expect(r.beats[0]!.line).toBe('Here is why.')
  })
  it('keeps it when she stated it, and leaves audience framing alone', () => {
    expect(unbackedRole('I run a coffee cart in town.', 'I started my coffee cart in 2021')).toBeNull()
    expect(unbackedRole('Most new coffee cart owners get stuck here.', '')).toBeNull()
  })
})
describe('naming a thing is not owning it', () => {
  it('her answer "people ask how to start a coffee cart" does not license "I run a coffee cart"', () => {
    expect(unbackedRole('I run a coffee cart.', "People keep asking how to start a coffee cart. I tell them there's no clean formula.")).not.toBeNull()
  })
})

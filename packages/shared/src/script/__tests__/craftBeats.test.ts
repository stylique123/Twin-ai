import { describe, it, expect } from 'vitest'
import { isCraftSection, craftBeatsThatAsked, readsAsPlaceholder, REFUSAL_TEXT } from '../craftBeats'

/** The exact string that shipped to a creator, in three of six scenes. */
const SHIPPED = 'Only you can supply this. What would you actually say here?'

describe('which sections are craft, and which are testimony', () => {
  it.each(['Hook', 'CTA', 'Call to action', 'The payoff', 'CTA / Payoff', 'cta'])(
    '%s is craft — writable from goal and offer alone', (s) => {
      expect(isCraftSection(s)).toBe(true)
    })

  // ⚠️ THE RE-HOOK IS THE DELIBERATE EXCLUSION. Its whole job is to CARRY
  // substance, so a re-hook that needs the creator is reporting a real gap.
  // Forcing it to be written anyway is the fabrication this system refuses.
  it.each(['Re-hook', 'Rehook', 're hook'])('%s is NOT craft', (s) => {
    expect(isCraftSection(s)).toBe(false)
  })

  it.each(['Setup', 'Story', 'Proof', ''])('%s is not craft either', (s) => {
    expect(isCraftSection(s)).toBe(false)
  })

  // ⚖️ NORMALISED, so a rule cannot be escaped by punctuation or a space.
  it('matches however the writer punctuated it', () => {
    expect(isCraftSection('C.T.A.')).toBe(true)
    expect(isCraftSection('  Call  To  Action  ')).toBe(true)
  })
})

describe('a craft beat may not claim it needs the creator', () => {
  it('finds the CTA that starved', () => {
    const beats = [
      { section: 'Hook', substance: 'general', line: 'Real words' },
      { section: 'Setup', substance: 'needs_user', line: SHIPPED },
      { section: 'CTA', substance: 'needs_user', line: SHIPPED },
    ]
    const v = craftBeatsThatAsked(beats)
    expect(v.length).toBe(1)
    expect(v[0].index).toBe(2)
    expect(v[0].section).toBe('CTA')
  })

  // ⚠️ THE PERSONAL BEAT IS LEFT ALONE. Setup asking for a real story is the
  // system working; this check must never touch it.
  it('never flags a story beat for needing a story', () => {
    expect(craftBeatsThatAsked([{ section: 'Setup', substance: 'needs_user' }]).length).toBe(0)
    expect(craftBeatsThatAsked([{ section: 'Re-hook', substance: 'needs_user' }]).length).toBe(0)
  })

  it('a craft beat with real substance is fine', () => {
    expect(craftBeatsThatAsked([{ section: 'CTA', substance: 'general' }]).length).toBe(0)
  })

  it.each([null, undefined, [], 'nope', [null, 3, 'x']])('%s never throws', (v) => {
    expect(() => craftBeatsThatAsked(v as never)).not.toThrow()
    expect(craftBeatsThatAsked(v as never).length).toBe(0)
  })
})

describe('a placeholder is a failed beat, not a draft', () => {
  it('catches the exact refusal that shipped', () => {
    expect(readsAsPlaceholder(SHIPPED)).toBe(true)
    expect(REFUSAL_TEXT.test(SHIPPED)).toBe(true)
  })

  it.each(['', '   ', '[Insert hook here]', '(your story)', '<placeholder>'])(
    '%s reads as a placeholder', (s) => {
      expect(readsAsPlaceholder(s)).toBe(true)
    })

  // ⚠️ THE BARE DIGIT. Two scene cards in the audited script rendered their
  // whole body as "2" and "3" — an enumeration ordinal in a text field.
  it.each(['2', '3', '2.', '3)'])('the bare ordinal %s is not a line', (s) => {
    expect(readsAsPlaceholder(s)).toBe(true)
  })

  // ⚖️ AND A SHORT LINE IS OFTEN THE BEST LINE. This check is narrow on purpose:
  // it matches refusals and stubs, never brevity or vagueness.
  it.each([
    'I lost four clients that week.',
    'Stop.',
    'Two things changed everything.',
    'It cost me 3 years and about 40 grand.',
    'Save this before you forget it.',
  ])('%s is a real line', (s) => {
    expect(readsAsPlaceholder(s)).toBe(false)
  })

  // ⚠️ A NUMBER INSIDE A SENTENCE IS NOT A BARE ORDINAL.
  it('does not fire on a line that merely contains a number', () => {
    expect(readsAsPlaceholder('3 things nobody tells you')).toBe(false)
  })
})

// ⚠️ THE FALSE-POSITIVE THE COMPACT FORM WOULD HAVE CAUSED, pinned so nobody
// "simplifies" the acronym match back into a space-stripping one.
describe('the acronym match does not swallow ordinary words', () => {
  it.each(['Attractant demo', 'Reaction', 'Contact', 'Practical tips'])(
    '%s is not a CTA', (s) => {
      expect(isCraftSection(s)).toBe(false)
    })
})

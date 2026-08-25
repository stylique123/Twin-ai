import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isCraftSection, craftBeatsThatAsked, readsAsPlaceholder, REFUSAL_TEXT, fallbackCta } from '../craftBeats'

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

describe('the line a CTA falls back to', () => {
  it.each(['sell', 'leads', 'conversations', 'followers', 'educate', 'authority', 'entertain', 'personal_brand'])(
    '%s produces something a person can read aloud', (g) => {
      const line = fallbackCta(g)
      expect(line.length).toBeGreaterThan(10)
      expect(readsAsPlaceholder(line)).toBe(false)
    })

  // ⚠️ NO BRACKET, EVER. A fallback containing "[your offer]" would reproduce
  // the exact defect it exists to fix, in a smaller font.
  it.each(['sell', 'leads', 'followers', 'educate', 'unknown-goal', '', null])(
    'never emits a bracket or a slot for %s', (g) => {
      expect(fallbackCta(g)).not.toMatch(/[[\]{}<>]/)
    })

  it('an unknown goal asks the least', () => {
    expect(fallbackCta('nonsense')).toBe('Save this so you have it when you need it.')
    expect(fallbackCta(null)).toBe('Save this so you have it when you need it.')
  })

  it('names the offer when selling and the offer is short enough to say', () => {
    expect(fallbackCta('sell', 'the 30-day plan')).toBe('If you want the 30-day plan, the link is in my bio.')
  })

  // ⚖️ AND REFUSES AN OFFER NOBODY WOULD SAY OUT LOUD. A pasted paragraph
  // spliced into a spoken line is a line the creator must edit before they can
  // read it — the defect, moved rather than fixed.
  it.each([
    'a complete end to end transformation programme for busy founders who want more',
    'line one\nline two',
    '   ',
  ])('falls back to the plain line rather than splicing %s', (o) => {
    expect(fallbackCta('sell', o)).toBe('If you want the full thing, the link is in my bio.')
  })

  // ⚠️ PLAIN ENGLISH, AND NONE OF TWIN'S OWN VOCABULARY.
  it.each(Object.values({ a: 'sell', b: 'leads', c: 'educate', d: 'followers' }))(
    '%s says nothing about how Twin works', (g) => {
      expect(fallbackCta(g).toLowerCase()).not.toMatch(/twin|substance|beat|blueprint|entity|surface/)
    })
})

/**
 * ⚠️ A LIVE DEFECT ON MAIN, FOUND WHILE WIRING THIS. A missing closing brace put
 * SEVENTY-ONE LINES — the whole reference-measurement leak repair — inside
 * `if (entFails.length) { … }`.
 *
 * That block exists to stop another creator's measured numbers being spoken as
 * this creator's own, and the code documents it as a MEASURED defect: "9 leaks
 * across 16 runs of one reference, to five creators, with every existing safety
 * counter reading clean". It references neither `entFails` nor
 * `creatorQuestions` — it computes its own `leaks` — so the gating was
 * accidental, and the consequence is that the repair only ran when the
 * ENTITLEMENT repair had already failed. On a generation with no entitlement
 * failures, which is the normal case, it never ran at all.
 *
 * ⚖️ THE GUARD IS ON THE SCOPE, NOT THE TOKEN. Asserting that
 * `findLeakedClaims` appears somewhere would have been green against the bug —
 * it did appear, inside the wrong block. So this pins the BRACE.
 */
describe('the reference-leak repair runs on every generation', () => {
  const repo = join(import.meta.dirname, '..', '..', '..', '..', '..')
  const bp = readFileSync(join(repo, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')
  const lines = bp.split('\n')

  const entIdx = lines.findIndex((l) => l.includes("event: 'entitlement_unrepaired'"))
  const leakIdx = lines.findIndex((l) => l.includes('const refForClaims'))

  it('both blocks exist to be compared at all', () => {
    expect(entIdx, 'entitlement_unrepaired warn not found').toBeGreaterThan(-1)
    expect(leakIdx, 'the reference-leak block not found').toBeGreaterThan(leakIdx === -1 ? 0 : -1)
    expect(leakIdx).toBeGreaterThan(entIdx)
  })

  // ⚠️ THE ACTUAL ASSERTION: walking braces from the `if (entFails.length)` that
  // guards the warn, the block must CLOSE before the leak repair begins.
  it('the leak repair is not nested inside the entitlement branch', () => {
    let openIdx = -1
    for (let i = entIdx; i >= 0; i--) {
      if (lines[i].includes('if (entFails.length) {')) { openIdx = i; break }
    }
    expect(openIdx, 'the guarding if was not found').toBeGreaterThan(-1)

    let depth = 0
    let closeIdx = -1
    for (let i = openIdx; i < lines.length; i++) {
      depth += (lines[i].match(/\{/g) ?? []).length
      depth -= (lines[i].match(/\}/g) ?? []).length
      if (depth === 0) { closeIdx = i; break }
    }
    expect(closeIdx, 'the entitlement branch never closes').toBeGreaterThan(-1)
    expect(
      closeIdx,
      `if (entFails.length) closes at line ${closeIdx + 1}, AFTER the reference-leak repair `
      + `at line ${leakIdx + 1} — the repair only runs when entitlement repair already failed`,
    ).toBeLessThan(leakIdx)
  })
})

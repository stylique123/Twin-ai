// PROVENANCE DETERMINES PERMISSION, NOT MERELY CONFIDENCE.
//
// ⚠️ THE TWO QUESTIONS ARE DIFFERENT AND CONFLATING THEM IS THE BUG. Evidence
// answers "how strongly is this attested?". Provenance answers "may this KIND of
// fact authorize this KIND of decision?". An inferred commercial relationship can
// rank a product or prompt a question; it may never authorize "our product",
// because nobody asserted it.
//
// ⚖️ THAT IS THE SAME LINE THREE SEPARATE DEFECTS LANDED ON THIS WEEK: an
// auto-extracted palette becoming "your brand", a generated sentence becoming
// "your CTA", a figure read off a photograph becoming a price. Each was a
// machine's reading promoted to a person's assertion. This file makes the line a
// contract instead of a habit.
import { describe, expect, it } from 'vitest'
import {
  mayUseOwnershipLanguage, mayClaimPersonalUse, mayAdaptObservedTrait,
  mayStateFigure, readValue,
  type Provenanced,
} from '../authority'

const at = '2026-08-17T00:00:00.000Z'

describe('ownership language needs a person, not evidence', () => {
  it('permits it on a confirmed answer', () => {
    expect(mayUseOwnershipLanguage({
      value: 'OWN_PRODUCT', source: 'user_answer', updatedAt: at,
    })).toBe(true)
  })

  it('refuses it however strongly observed', () => {
    // ⚠️ AN EXTRACTOR THAT SAW THE CREATOR'S NAME ON A PRICING PAGE HAS FOUND
    // EVIDENCE, NOT AN ASSERTION. Ownership language is the most expensive thing
    // here to get wrong, because the creator reads it aloud in their own voice.
    expect(mayUseOwnershipLanguage({
      value: 'OWN_PRODUCT', source: 'observed', evidence: { seen: 12, of: 12 }, updatedAt: at,
    })).toBe(false)
  })

  it('refuses it on an inference and on an import', () => {
    expect(mayUseOwnershipLanguage({ value: 'OWN_PRODUCT', source: 'inferred', updatedAt: at })).toBe(false)
    expect(mayUseOwnershipLanguage({
      value: 'OWN_PRODUCT', source: 'imported',
      sourceRef: { kind: 'url', url: 'https://example.com' }, updatedAt: at,
    })).toBe(false)
  })

  it('refuses it for a relationship that is not ownership', () => {
    for (const v of ['AFFILIATE', 'SPONSOR', 'REVIEW_ONLY', 'NONE']) {
      expect(mayUseOwnershipLanguage({ value: v, source: 'user_answer', updatedAt: at }), v).toBe(false)
    }
  })

  it('refuses it when nothing was recorded at all', () => {
    // ⚖️ Silence is not permission. Absent must never read as allowed.
    expect(mayUseOwnershipLanguage(null)).toBe(false)
    expect(mayUseOwnershipLanguage(undefined)).toBe(false)
  })
})

describe('personal use is asked separately from ownership', () => {
  it('is not implied by owning the thing', () => {
    // ⚠️ OWNING A PRODUCT DOES NOT ESTABLISH HAVING USED IT, and a commission
    // establishes less still. Neither answer may be inferred from the other.
    expect(mayClaimPersonalUse({ value: 'NOT_CONFIRMED', source: 'user_answer', updatedAt: at })).toBe(false)
    expect(mayClaimPersonalUse(null)).toBe(false)
  })

  it('needs the creator to have said so', () => {
    expect(mayClaimPersonalUse({ value: 'CONFIRMED', source: 'user_answer', updatedAt: at })).toBe(true)
    expect(mayClaimPersonalUse({
      value: 'CONFIRMED', source: 'observed', evidence: { seen: 9, of: 12 }, updatedAt: at,
    })).toBe(false)
  })
})

describe('observed traits are gated on a countable standard', () => {
  it('adapts to a pattern, not to a coincidence', () => {
    // ⚖️ Three sightings is a pattern; one would have the writer imitating a
    // single video. The number is arguable, which is the point — nobody can
    // argue with 0.8.
    expect(mayAdaptObservedTrait({ value: 'direct', source: 'observed', evidence: { seen: 3, of: 12 }, updatedAt: at })).toBe(true)
    expect(mayAdaptObservedTrait({ value: 'direct', source: 'observed', evidence: { seen: 1, of: 12 }, updatedAt: at })).toBe(false)
  })

  it('refuses a trait that was never observed at all', () => {
    expect(mayAdaptObservedTrait({ value: 'direct', source: 'inferred', updatedAt: at })).toBe(false)
  })
})

describe('a figure may be spoken only if somebody stands behind it', () => {
  it('accepts what the creator stated and what can be inspected', () => {
    expect(mayStateFigure({ value: '$39/mo', source: 'user_answer', updatedAt: at })).toBe(true)
    expect(mayStateFigure({
      value: '$39/mo', source: 'imported',
      sourceRef: { kind: 'url', url: 'https://example.com/pricing' }, updatedAt: at,
    })).toBe(true)
  })

  it('refuses an observed or inferred figure', () => {
    // ⚠️ A NUMBER SEEN IN NINE VIDEOS IS STILL A NUMBER NOBODY STOOD BEHIND.
    expect(mayStateFigure({ value: '$39/mo', source: 'observed', evidence: { seen: 9, of: 12 }, updatedAt: at })).toBe(false)
    expect(mayStateFigure({ value: '$39/mo', source: 'inferred', updatedAt: at })).toBe(false)
  })
})

describe('the type refuses what the rules would otherwise have to catch', () => {
  it('cannot express an observation nobody counted', () => {
    // @ts-expect-error — `observed` without evidence is an inference wearing a
    // better word, and the union makes it unrepresentable.
    const bad: Provenanced<string> = { value: 'x', source: 'observed', updatedAt: at }
    expect(bad).toBeTruthy()
  })

  it('cannot express an import nobody can go and check', () => {
    // @ts-expect-error — an imported fact with no source is indistinguishable
    // from one we invented.
    const bad: Provenanced<string> = { value: 'x', source: 'imported', updatedAt: at }
    expect(bad).toBeTruthy()
  })

  it('keeps the raw answer so assembly can be proven not to reinterpret', () => {
    // ⚖️ Assembly may normalise REPRESENTATION and never MEANING. Keeping the
    // original is what makes that a checkable claim rather than a promise.
    const p: Provenanced<string> = {
      value: 'EXPERT', rawValue: 'Expert', source: 'user_answer', updatedAt: at,
    }
    expect(readValue(p)).toBe('EXPERT')
    expect(p.rawValue).toBe('Expert')
  })
})

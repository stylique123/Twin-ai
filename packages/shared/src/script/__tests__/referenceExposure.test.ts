/**
 * THE CONTROL MUST GOVERN THE TEXT, NOT DESCRIBE IT.
 *
 * Every assertion here is about the one property that makes this a mechanism
 * rather than another label: the number of the reference's verbatim characters
 * that reach the writer is a strictly ordered function of the creator's choice.
 */
import { describe, it, expect } from 'vitest'
import {
  REFERENCE_EXPOSURE, verbatimBudget, referenceShapeDigest, renderShapeDigest,
  type ReferenceUseLevel,
} from '../referenceExposure.js'
import { REFERENCE_USE } from '../../videoIntent.js'
import { longestContentRun } from '../phraseOverlap.js'

const LEVELS = Object.keys(REFERENCE_EXPOSURE) as ReferenceUseLevel[]

const TRANSCRIPT =
  'Here are three reasons your business is not making more money. '
  + 'Measuring the risk of taking action while ignoring the risk of doing nothing '
  + 'is exactly what keeps people poorer than they ought to be. '
  + 'You need to start taking more shots on goal. '
  + 'Most businesses fail because they never fix their pricing. '
  + 'Go to Acquisition.com and grab the free course.'

describe('the budget table is total and correctly ordered', () => {
  it('budgets every REFERENCE_USE value and no others', () => {
    // A value added to the enum without a budget here would silently fall to
    // the default and be ungoverned — which is exactly the old defect.
    expect(LEVELS.sort()).toEqual([...REFERENCE_USE].sort())
  })

  it('is ordered most-mine to most-theirs in BOTH ceilings', () => {
    const order: ReferenceUseLevel[] = ['structure', 'idea_structure', 'stay_close']
    for (let i = 1; i < order.length; i++) {
      expect(REFERENCE_EXPOSURE[order[i]].maxChars)
        .toBeGreaterThan(REFERENCE_EXPOSURE[order[i - 1]].maxChars)
      expect(REFERENCE_EXPOSURE[order[i]].maxFraction)
        .toBeGreaterThan(REFERENCE_EXPOSURE[order[i - 1]].maxFraction)
    }
  })

  it('says what each level supplies, distinctly', () => {
    const said = LEVELS.map((l) => REFERENCE_EXPOSURE[l].supplies)
    expect(new Set(said).size).toBe(LEVELS.length)
    for (const s of said) expect(s.length).toBeGreaterThan(40)
  })

  it('leaves stay_close at the exposure it has today', () => {
    // The creator explicitly asked to stay near the original. This level is the
    // control's answer to that, not a loophole in it.
    expect(REFERENCE_EXPOSURE.stay_close.maxChars).toBe(6000)
    expect(REFERENCE_EXPOSURE.stay_close.maxFraction).toBe(1)
  })
})

describe('verbatimBudget', () => {
  it('gives structure strictly less verbatim text than stay_close, at EVERY length', () => {
    // The fraction is what makes the control bite on short references — an
    // absolute cap alone leaves a 400-character Short entirely ungoverned.
    for (const len of [120, 283, 687, 1500, 4000, 12000, 90000]) {
      const s = verbatimBudget('structure', len)
      const i = verbatimBudget('idea_structure', len)
      const c = verbatimBudget('stay_close', len)
      expect(s, `len=${len}`).toBeLessThan(c)
      expect(s, `len=${len}`).toBeLessThanOrEqual(i)
      expect(i, `len=${len}`).toBeLessThanOrEqual(c)
    }
  })

  it('never exceeds the transcript, and never goes negative', () => {
    for (const level of LEVELS) {
      for (const len of [0, 1, 50, 10000]) {
        const b = verbatimBudget(level, len)
        expect(b).toBeGreaterThanOrEqual(0)
        expect(b).toBeLessThanOrEqual(len)
      }
    }
  })

  it('treats an unanswered control as the MIDDLE budget, never the widest', () => {
    // Defaulting to maximum exposure would mean the setting governs borrowing
    // only for creators who happened to answer the question.
    expect(verbatimBudget(null, 10000)).toBe(verbatimBudget('idea_structure', 10000))
    expect(verbatimBudget(undefined, 10000)).toBeLessThan(verbatimBudget('stay_close', 10000))
    expect(verbatimBudget('nonsense' as never, 10000)).toBe(verbatimBudget('idea_structure', 10000))
  })

  it('is zero, not NaN, for an absent or nonsense length', () => {
    for (const bad of [0, -5, NaN, Infinity, undefined as never]) {
      expect(verbatimBudget('stay_close', bad)).toBe(0)
    }
  })
})

describe('mutation — a weakened budget must fail this suite', () => {
  it('would catch structure being widened to today s unconditional 6000', () => {
    // Simulates the regression: the whole point is that this is NOT the value.
    const asIfUnfixed = Math.min(90000, 6000, Math.floor(90000 * 1))
    expect(verbatimBudget('structure', 90000)).toBeLessThan(asIfUnfixed)
  })

  it('would catch the fraction being dropped, leaving short references ungoverned', () => {
    const len = 687 // the longest of the four live-run reference transcripts
    const ceilingOnly = Math.min(len, REFERENCE_EXPOSURE.structure.maxChars)
    expect(ceilingOnly).toBe(len) // the ceiling alone does nothing here...
    expect(verbatimBudget('structure', len)).toBeLessThan(len) // ...the fraction does.
  })

  it('would catch a floor being reintroduced', () => {
    // A minimum-characters floor restores unconditional exposure silently, on
    // exactly the short references that are most of the corpus.
    expect(verbatimBudget('structure', 200)).toBeLessThan(200)
    expect(verbatimBudget('structure', 200)).toBe(50)
  })
})

describe('referenceShapeDigest — grounding without words', () => {
  it('carries NONE of the transcript s language', () => {
    // If the digest could carry a phrase it would reintroduce the borrowing
    // vector through the very field designed to close it.
    const rendered = renderShapeDigest(referenceShapeDigest(TRANSCRIPT))
    expect(longestContentRun(rendered, TRANSCRIPT)).toBe(0)
    expect(rendered.toLowerCase()).not.toContain('acquisition')
    expect(rendered.toLowerCase()).not.toContain('pricing')
  })

  it('measures the whole transcript regardless of the verbatim budget', () => {
    // This is what keeps why_it_works and retention_map grounded in THIS video
    // at every fidelity setting.
    const full = referenceShapeDigest(TRANSCRIPT)!
    const clipped = referenceShapeDigest(TRANSCRIPT.slice(0, verbatimBudget('structure', TRANSCRIPT.length)))!
    expect(full.sentences).toBeGreaterThan(clipped.sentences)
    expect(full.words).toBeGreaterThan(clipped.words)
  })

  it('reads the hook as a MECHANISM, not as a subject', () => {
    const d = referenceShapeDigest(TRANSCRIPT)!
    expect(d.hookMechanism).toBe('number_promise')
    expect(d.enumeration).toBe(3)
    expect(d.sentenceWords.length).toBe(d.sentences)
    expect(d.secondPersonPerThousand).toBeGreaterThan(0)
  })

  it('classifies the other opener mechanisms', () => {
    expect(referenceShapeDigest('Why does nobody talk about this? It matters.')!.hookMechanism).toBe('question')
    expect(referenceShapeDigest('Stop doing this today. It costs you.')!.hookMechanism).toBe('command')
    expect(referenceShapeDigest('My rates went up last spring.')!.hookMechanism).toBe('statement')
    expect(referenceShapeDigest('My rates went up last spring.')!.enumeration).toBe(null)
  })

  it('is null for nothing, and renders as (none)', () => {
    expect(referenceShapeDigest('')).toBe(null)
    expect(referenceShapeDigest(null)).toBe(null)
    expect(renderShapeDigest(null)).toBe('(none)')
  })
})

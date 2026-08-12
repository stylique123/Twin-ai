// THE POLICY, FROZEN AS TESTS.
//
// ⚠️ WHY THIS FILE IS THE POINT OF THE CHANGE. The detector unification that
// follows makes the strict per-beat check fire ~10x more often. Shipping that
// alone would have been a policy nobody decided — "refactor detector -> product
// starts refusing scripts it accepted yesterday". The owner's rules are frozen
// here so the next refactor breaks a test instead of the product.
import { describe, expect, it } from 'vitest'
import {
  TRACEABILITY_LEVELS, traceabilityLevel, responseToLowDepth, LOW_DEPTH_RESPONSES,
} from '../traceability'
import { substanceIssues } from '../knowledgeResolver'
import { readKnowledge } from '../creatorKnowledge'

const beat = (line: string, section = 'Point') => ({ line, section })

describe('rule 4: traceability is risk-weighted, and the owner named the tiers', () => {
  it('a checkable outcome claim is strict — the "80%" case verbatim', () => {
    expect(traceabilityLevel(beat('Twin cuts editing time by 80%'))).toBe('strict')
  })

  it('…and the point of view beside it is not', () => {
    // ⚖️ THE WHOLE DISTINCTION, IN THE OWNER'S OWN PAIR. Forcing a citation
    // object through this sentence is what turns a scene into a compliance
    // hearing, and it is a POV a creator is entitled to hold.
    expect(traceabilityLevel(beat('Most creators spend too much time editing')))
      .not.toBe('strict')
  })

  it('prices, statistics, comparisons and regulated claims are strict', () => {
    for (const l of [
      "check out this $250 custom 'creamy' keyboard",
      'bumping it up to 50% or even 70% makes prints stronger',
      'this phone is faster than the Pixel',
      'it can cure your acne in two weeks',
      'guaranteed returns on your first month',
    ]) expect(traceabilityLevel(beat(l)), l).toBe('strict')
  })

  it('hooks, transitions and framing are light', () => {
    expect(traceabilityLevel(beat('You are missing out if you do not know this trick.', 'Hook'))).toBe('light')
    expect(traceabilityLevel(beat('Let us talk about what actually changed.', 'Transition'))).toBe('light')
    expect(traceabilityLevel(beat("What's one tech purchase you regret?", 'CTA'))).toBe('light')
  })

  it('a STRICT claim inside a hook is still strict', () => {
    // ⚖️ The section does not make the number safer, and the most-shared line
    // in the video is the worst place to be wrong.
    expect(traceabilityLevel(beat('This app cut my editing time by 80%', 'Hook'))).toBe('strict')
  })

  it('the default is standard, so a pattern gap is not a silent permission', () => {
    expect(traceabilityLevel(beat('The hinge is what fails first on a foldable.'))).toBe('standard')
    expect(TRACEABILITY_LEVELS).toEqual(['strict', 'standard', 'light'])
  })
})

// ⚠️ THESE FOUR CAME BACK AS FALSE POSITIVES WHEN THE RULE WAS FIRST MEASURED
// OVER 705 REAL BEATS, and each one would have turned an honest sentence into a
// question the creator had to answer. They are kept as fixtures because a later
// widening that re-condemns them is the exact regression that matters.
describe('the false positives that measurement caught', () => {
  it('mentions money without quoting a figure', () => {
    expect(traceabilityLevel(beat('think beyond the initial price tag'))).not.toBe('strict')
    expect(traceabilityLevel(beat('you are always paying a premium for the same few brands'))).not.toBe('strict')
  })

  it('uses "beats" as an aphorism, not a comparison', () => {
    expect(traceabilityLevel(beat('Consistency beats intensity every single time.'))).not.toBe('strict')
  })

  it('uses a superlative rhetorically', () => {
    expect(traceabilityLevel(beat('the fastest way to get better is to start'))).not.toBe('strict')
  })

  it('uses "invest" colloquially', () => {
    expect(traceabilityLevel(beat('invest in some cable ties or a cable management box'))).not.toBe('strict')
  })
})

describe('rules 1-3: low depth reshapes a beat, it never refuses one', () => {
  it('refuse is not an available response at ANY level', () => {
    // ⚖️ RULE 3, MADE STRUCTURAL. A creator whose expertise lives in their head
    // rather than in Product DNA is a user, not an error.
    expect(LOW_DEPTH_RESPONSES).not.toContain('refuse')
    for (const l of TRACEABILITY_LEVELS) {
      expect(LOW_DEPTH_RESPONSES, l).toContain(responseToLowDepth(l))
    }
  })

  it('asks the creator rather than softening a strict claim', () => {
    // The "$100K store" case: the honest output is a question, not a smaller
    // number we also made up.
    expect(responseToLowDepth('strict')).toBe('ask_creator')
  })

  it('a subject label still earns a usable beat', () => {
    // ⚖️ "AI tools" cannot justify a factual claim, but it justifies a
    // structure, an angle, or a question — so a light beat is softened, not cut.
    expect(responseToLowDepth('light')).toBe('soften')
  })

  it('rule 1: depth is STILL not a reason to raise a substance issue', () => {
    // Asserted here as well as in the parity test, because this file is where
    // someone will come looking for the policy.
    const supplied = readKnowledge({ items: [
      { kind: 'topic', text: '3D printing', basis: 'demonstrated' }] }).items
    expect(substanceIssues([{
      line: 'Infill is what makes a print strong.', substance: 'creator_knowledge',
      substance_evidence: '(topic) 3D printing',
    }], supplied)).toEqual([])
  })
})

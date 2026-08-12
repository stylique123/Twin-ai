// THE POLICY, FROZEN AS TESTS.
//
// ⚠️ WHY THIS FILE IS THE POINT OF THE CHANGE. The detector unification that
// follows makes the strict per-beat check fire ~10x more often. Shipping that
// alone would have been a policy nobody decided — "refactor detector -> product
// starts refusing scripts it accepted yesterday". The owner's rules are frozen
// here so the next refactor breaks a test instead of the product.
import { describe, expect, it } from 'vitest'
import {
  TRACEABILITY_LEVELS, traceabilityLevel, resolveStrictBeat, STRICT_ACTIONS,
  STRICT_RESOLUTIONS, routeSubstance, SUBSTANCE_SOURCES_ROUTED,
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

// ── STRICT ENFORCES; THE ASSERTION FAILS, NOT THE SCRIPT ─────────────────────
describe('resolveStrictBeat — a resolution ladder, not a refusal', () => {
  const base = {
    grounded: false, externallyAnswerable: false, personalToCreator: false,
    productFactsAvailable: null as boolean | null,
  }

  it('allows a grounded claim', () => {
    expect(resolveStrictBeat({ ...base, grounded: true })).toBe('GROUNDED')
  })

  it('sends an externally checkable claim to research', () => {
    expect(resolveStrictBeat({ ...base, externallyAnswerable: true })).toBe('RESOLVABLE')
  })

  it('asks the creator for what only they can answer, BEFORE offering research', () => {
    // ⚖️ "The biggest mistake I made with my first startup" is not fixable by a
    // literature search, and offering one is how a system ends up writing
    // somebody's autobiography for them.
    expect(resolveStrictBeat({ ...base, personalToCreator: true, externallyAnswerable: true }))
      .toBe('USER_KNOWLEDGE_REQUIRED')
  })

  it('uses Product DNA when the caller KNOWS facts were carried', () => {
    expect(resolveStrictBeat({ ...base, productFactsAvailable: true })).toBe('RESOLVABLE')
    // ⚖️ `null` is "caller does not know" and may never be read as "yes" — the
    // three-state rule this repo applies everywhere else.
    expect(resolveStrictBeat({ ...base, productFactsAvailable: null })).toBe('UNRESOLVED')
    expect(resolveStrictBeat({ ...base, productFactsAvailable: false })).toBe('UNRESOLVED')
  })

  it('an unresolved claim is REWRITTEN, and no path refuses the script', () => {
    // ⚠️ THE WHOLE POINT OF ENFORCEMENT BEING USEFUL RATHER THAN OBNOXIOUS.
    // "Twin increases retention by 42%" with nothing behind it becomes "Twin is
    // designed to help creators make tighter videos" — the claim goes, the video
    // survives. If `refuse` ever appears here, strict has become a wall.
    expect(STRICT_ACTIONS.UNRESOLVED).toBe('rewrite_without_claim')
    for (const r of STRICT_RESOLUTIONS) {
      expect(STRICT_ACTIONS[r], r).not.toMatch(/refuse|reject|fail/)
    }
  })
})

// ── KNOWLEDGE DEPTH ROUTES SUBSTANCE; IT NEVER JUDGES IT ─────────────────────
describe('routeSubstance — where the substance comes from', () => {
  const base = {
    depth: 'low' as const, aboutOwnProduct: false,
    externallyAnswerable: false, personalToCreator: false,
  }

  it('routes an externally answerable question to research', () => {
    // "Which three AI tools are currently best for sales teams?"
    expect(routeSubstance({ ...base, externallyAnswerable: true })).toBe('RESEARCH')
  })

  it('routes their own product to Product DNA', () => {
    // "Why is Twin different?"
    expect(routeSubstance({ ...base, aboutOwnProduct: true })).toBe('PRODUCT_DNA')
  })

  it('asks the creator for their own history rather than inventing it', () => {
    // "What mistake did you make when you launched your first company?"
    expect(routeSubstance({ ...base, personalToCreator: true })).toBe('ASK_CREATOR')
  })

  it('changes the concept when it presumes expertise nothing evidences', () => {
    // ⚠️ "Five things I've learned in ten years as a surgeon" for a creator with
    // no such evidence. Sourcing the facts elsewhere does not fix this — the
    // ADAPTATION is wrong, and generating the wisdom anyway invents a career.
    expect(routeSubstance({ ...base, conceptDemandsUnevidencedExpertise: true }))
      .toBe('CHANGE_CONCEPT')
  })

  it('lets a deep creator carry opinion without outside research', () => {
    expect(routeSubstance({ ...base, depth: 'high' })).toBe('CREATOR_KNOWLEDGE')
    expect(routeSubstance({ ...base, depth: 'high', personalToCreator: true }))
      .toBe('CREATOR_KNOWLEDGE')
  })

  it('lets medium depth rest on known positions but not expand them', () => {
    // ⚖️ On record that "most SaaS onboarding asks for too much" supports a beat
    // around that belief. It does NOT support "seven-field onboarding reduces
    // conversion by 31%" — that is a statistic, and it belongs to research.
    expect(routeSubstance({ ...base, depth: 'medium' })).toBe('CREATOR_KNOWLEDGE')
    expect(routeSubstance({ ...base, depth: 'medium', externallyAnswerable: true }))
      .toBe('RESEARCH')
  })

  it('NEVER returns a refusal, at any depth', () => {
    // ⚠️ THE WRONG ABSTRACTION THIS EXISTS TO PREVENT: depth=low becoming
    // script_invalid=true. Depth answers "is the creator a sufficient source",
    // which is a routing question and never a verdict.
    for (const s of SUBSTANCE_SOURCES_ROUTED) {
      expect(s).not.toMatch(/REFUSE|REJECT|INVALID/)
    }
  })

  it('does not soften globally, because that was the earlier mistake', () => {
    // ⚖️ `soften` is deliberately absent from the routed sources. Hedging every
    // sentence at low depth produces "might", "perhaps", "some people think" —
    // an AI lawyer trying not to get sued by oxygen. Low depth changes WHERE
    // substance comes from, not how confidently it is worded.
    expect(SUBSTANCE_SOURCES_ROUTED as readonly string[]).not.toContain('soften')
  })
})

// ── THE TWO TOGETHER, ON THE OWNER'S WORKED EXAMPLES ─────────────────────────
describe('the interaction, which is where the architecture earns its keep', () => {
  it('strict + low depth: check product DNA, then research, then rewrite', () => {
    // "This app saves founders five hours per week."
    expect(traceabilityLevel({ line: 'This app saves founders five hours per week.' })).toBe('strict')
    expect(resolveStrictBeat({
      grounded: false, personalToCreator: false, externallyAnswerable: false,
      productFactsAvailable: false,
    })).toBe('UNRESOLVED')
  })

  it('light + high depth: creator POV carries it, allow', () => {
    // "I think most founders automate too early."
    expect(traceabilityLevel({ line: 'I think most founders automate too early.' })).not.toBe('strict')
    expect(routeSubstance({
      depth: 'high', aboutOwnProduct: false, externallyAnswerable: false, personalToCreator: false,
    })).toBe('CREATOR_KNOWLEDGE')
  })

  it('personal experience + low depth: research cannot solve it, so ask', () => {
    // "The biggest mistake I made with my first startup was hiring too early."
    expect(routeSubstance({
      depth: 'low', aboutOwnProduct: false, externallyAnswerable: true, personalToCreator: true,
    })).toBe('ASK_CREATOR')
  })
})

// THREE QUESTIONS THAT HAVE TO CHANGE THE SCRIPT, NOT DECORATE THE PROMPT.
//
// ⚠️ THE MEASURED RULE THIS FILE IS WRITTEN AGAINST. Changing what REACHES the
// writer works; changing how the writer is INSTRUCTED does not. #376 moved a
// score 17-7 by changing supply; the Substance Packet moved it 12-12 by adding
// prompt rules. So every assertion here checks that an answer alters a DECISION
// — a directive, a ranking, a floor, a permission — and none of them is
// satisfied by a label appearing somewhere in a string.
import { describe, expect, it } from 'vitest'
import {
  VIDEO_GOALS, CONTENT_FOCUS, VIEWER_OUTCOMES,
  VIDEO_GOAL_LABELS, CONTENT_FOCUS_LABELS, VIEWER_OUTCOME_LABELS,
  compileVideoIntent, preferKinds, renderVideoIntent, outcomeEvidenceNeed,
} from '../videoIntent'
// ⚠️ THE SYSTEM'S FLOOR, NOT A LITERAL. Asserting against `4` is how the first
// draft of this file passed while the module silently LOWERED the substance
// guarantee on every unanswered generation: the test compared the module
// against its own wrong constant instead of against the selector's.
import { SUBSTANCE_FLOOR } from '../knowledgeSelection'

const c = (goal?: string, focus?: string, outcome?: string) =>
  compileVideoIntent({ goal, focus, outcome })

describe('the enums are stable and complete', () => {
  it('every value has a label — a chip with no text cannot be picked', () => {
    for (const g of VIDEO_GOALS) expect(VIDEO_GOAL_LABELS[g]).toBeTruthy()
    for (const f of CONTENT_FOCUS) expect(CONTENT_FOCUS_LABELS[f]).toBeTruthy()
    for (const o of VIEWER_OUTCOMES) expect(VIEWER_OUTCOME_LABELS[o]).toBeTruthy()
  })

  it('SPLITS conversations from leads — the live over-permission', () => {
    // ⚠️ THEY WERE ONE KEY, AND THAT KEY GRANTED SELL INTENT. A creator asking
    // for replies was granting themselves a pitch.
    expect(VIDEO_GOALS).toContain('conversations')
    expect(VIDEO_GOALS).toContain('leads')
    expect(c('conversations').wantsSale).toBe(false)
    expect(c('leads').wantsSale).toBe(true)
  })

  it('keeps every pre-existing goal key, so no stored answer changes meaning', () => {
    for (const old of ['followers', 'authority', 'educate', 'leads', 'sell', 'entertain', 'personal_brand']) {
      expect(VIDEO_GOALS).toContain(old)
    }
  })
})

describe('Q1 — each goal maps to DIFFERENT creative instructions', () => {
  it('produces a distinct directive for every goal', () => {
    const seen = new Set(VIDEO_GOALS.map((g) => c(g).goalDirective))
    expect(seen.size).toBe(VIDEO_GOALS.length)
  })

  it('the directives differ in what they ask for, not only in wording', () => {
    // ⚖️ Breadth vs depth is the axis the old single sentence could not express.
    expect(c('authority').goalDirective).toMatch(/NARROW AND DEEP/)
    expect(c('followers').goalDirective).toMatch(/widest entry point/)
  })

  it('only the commercial goals ask for a sale', () => {
    const selling = VIDEO_GOALS.filter((g) => c(g).wantsSale)
    expect([...selling].sort()).toEqual(['leads', 'sell'])
  })

  it('an unset goal produces NO directive, not a default one', () => {
    // ⚠️ THE THREE-STATE RULE. A creator who skipped the question must get
    // today's behaviour, not a goal nobody chose.
    expect(c().goalDirective).toBeNull()
    expect(c().wantsSale).toBe(false)
  })
})

describe('Q2 — each focus changes RETRIEVAL, which is the whole point', () => {
  const rows = [
    { kind: 'covered', text: 'a' }, { kind: 'topic', text: 'b' },
    { kind: 'experience', text: 'c' }, { kind: 'framework', text: 'd' },
    { kind: 'product', text: 'e' }, { kind: 'opinion', text: 'f' },
  ]

  it('a personal-experience focus pulls experience rows to the front', () => {
    const out = preferKinds(rows, c(undefined, 'experience').prefersKinds)
    expect(out[0].kind).toBe('experience')
  })

  it('an expertise focus pulls FRAMEWORK first, not experience', () => {
    // ⚠️ THE TEST THAT PROVES THE ANSWERS ARE NOT INTERCHANGEABLE. Two focuses
    // that both sound like "substance" must select different material.
    const out = preferKinds(rows, c(undefined, 'expertise').prefersKinds)
    expect(out[0].kind).toBe('framework')
  })

  it('a product focus pulls product rows first', () => {
    const out = preferKinds(rows, c(undefined, 'product').prefersKinds)
    expect(out[0].kind).toBe('product')
  })

  it('different focuses produce different orders on the SAME rows', () => {
    const orders = new Set(CONTENT_FOCUS.map((f) =>
      preferKinds(rows, c(undefined, f).prefersKinds).map((r) => r.kind).join(',')))
    expect(orders.size).toBeGreaterThanOrEqual(4)
  })

  it('reference-adaptation leaves the ranking ALONE', () => {
    // ⚖️ It says where the SHAPE comes from, not the substance. Tilting
    // retrieval would answer a question the creator did not ask.
    expect(c(undefined, 'reference_adapted').prefersKinds).toEqual([])
    expect(preferKinds(rows, c(undefined, 'reference_adapted').prefersKinds))
      .toEqual(rows)
  })

  it('preserves relevance order WITHIN a preferred kind', () => {
    // ⚠️ A STABLE PARTITION, NOT A SORT. The caller still decides WHICH
    // experience; the focus only decides that an experience goes first.
    const many = [
      { kind: 'covered', text: 'x' },
      { kind: 'experience', text: 'first' },
      { kind: 'experience', text: 'second' },
    ]
    const out = preferKinds(many, c(undefined, 'experience').prefersKinds)
    expect(out.map((r) => r.text)).toEqual(['first', 'second', 'x'])
  })

  it('never drops a row — a preference is not a filter', () => {
    for (const f of CONTENT_FOCUS) {
      expect(preferKinds(rows, c(undefined, f).prefersKinds)).toHaveLength(rows.length)
    }
  })

  it('makes the product library a SOURCE only when the video is about a product', () => {
    expect(c(undefined, 'product').wantsProductSubstance).toBe(true)
    expect(c(undefined, 'review').wantsProductSubstance).toBe(true)
    expect(c(undefined, 'story').wantsProductSubstance).toBe(false)
    expect(c().wantsProductSubstance).toBe(false)
  })
})

describe('Q3 — the outcome changes SUBSTANCE and the ENDING, not the tone', () => {
  it('gives every outcome a distinct payoff directive', () => {
    const seen = new Set(VIEWER_OUTCOMES.map((o) => c(undefined, undefined, o).payoffDirective))
    expect(seen.size).toBe(VIEWER_OUTCOMES.length)
  })

  it('raises the substance floor for outcomes that cannot rest on coverage', () => {
    expect(c(undefined, undefined, 'learn').substanceFloor)
      .toBeGreaterThan(c(undefined, undefined, 'share').substanceFloor)
    expect(c(undefined, undefined, 'change_mind').substanceFloor)
      .toBeGreaterThan(c(undefined, undefined, 'feel_inspired').substanceFloor)
  })

  it('NEVER drops the floor below what the selector already guaranteed', () => {
    // ⚖️ No intent a creator can express is a reason to hand them a THINNER
    // script than the system would have written unasked.
    for (const o of VIEWER_OUTCOMES) {
      expect(c(undefined, undefined, o).substanceFloor).toBeGreaterThanOrEqual(c().substanceFloor)
    }
  })

  it('an unset outcome leaves the floor exactly where the SELECTOR had it', () => {
    expect(c().substanceFloor).toBe(SUBSTANCE_FLOOR)
    expect(c().payoffDirective).toBeNull()
  })

  it('raises above the system floor for the outcomes that need it', () => {
    // ⚖️ The point of the question: a video that must teach a method or earn a
    // purchase needs MORE than the standing guarantee, not the same.
    for (const o of ['learn', 'change_mind', 'convert'] as const) {
      expect(c(undefined, undefined, o).substanceFloor).toBeGreaterThan(SUBSTANCE_FLOOR)
    }
  })

  it('leaves the lighter payoffs on the standing guarantee', () => {
    for (const o of ['share', 'comment', 'follow', 'feel_inspired'] as const) {
      expect(c(undefined, undefined, o).substanceFloor).toBe(SUBSTANCE_FLOOR)
    }
  })

  it('names the evidence a payoff actually demands', () => {
    expect(outcomeEvidenceNeed('change_mind')).toBe('opinion')
    expect(outcomeEvidenceNeed('learn')).toBe('experience')
    expect(outcomeEvidenceNeed('share')).toBeNull()
    expect(outcomeEvidenceNeed(null)).toBeNull()
  })

  it('only the converting outcome asks for money', () => {
    const selling = VIEWER_OUTCOMES.filter((o) => c(undefined, undefined, o).wantsSale)
    expect(selling).toEqual(['convert'])
    // ⚖️ "Check out my offer" is curiosity, not commitment, and must not trip
    // the commercial half of the CTA permission.
    expect(c(undefined, undefined, 'check_out_offer').wantsSale).toBe(false)
  })
})

describe('the three questions are not the same question', () => {
  it('each one moves a DIFFERENT field of the compiled record', () => {
    const base = c()
    const g = c('authority')
    const f = c(undefined, 'experience')
    const o = c(undefined, undefined, 'learn')
    expect(g.goalDirective).not.toBe(base.goalDirective)
    expect(g.prefersKinds).toEqual(base.prefersKinds)   // goal does not touch retrieval
    expect(f.prefersKinds).not.toEqual(base.prefersKinds)
    expect(f.goalDirective).toBe(base.goalDirective)    // focus does not touch the directive
    expect(o.substanceFloor).not.toBe(base.substanceFloor)
    expect(o.prefersKinds).toEqual(base.prefersKinds)   // outcome does not touch retrieval
  })
})

describe('conflicting combinations resolve, and say that they did', () => {
  it('sell + expertise + learn teaches first and closes softly', () => {
    const i = c('sell', 'expertise', 'learn')
    expect(i.goalDirective).toMatch(/TEACH FIRST AND TEACH FULLY/)
    expect(i.payoffDirective).toMatch(/soft commercial line/i)
    expect(i.resolutions.join(' ')).toMatch(/teach first/)
  })

  it('the sell resolution still keeps the commercial request', () => {
    // ⚖️ Resolving a conflict may not silently discard half the answer.
    expect(c('sell', 'expertise', 'learn').wantsSale).toBe(true)
  })

  it('entertain + convert keeps the body entertaining', () => {
    const i = c('entertain', undefined, 'convert')
    expect(i.goalDirective).toMatch(/ENTERTAIN THROUGHOUT/)
    expect(i.wantsSale).toBe(true)
    expect(i.resolutions.join(' ')).toMatch(/entertain\+convert/)
  })

  it('followers + expertise makes depth the hook rather than watering it down', () => {
    expect(c('followers', 'expertise').goalDirective).toMatch(/Depth is the hook/)
  })

  it('records a resolution for a non-commercial goal with a commercial ending', () => {
    expect(c('educate', undefined, 'convert').resolutions.join(' ')).toMatch(/educate\+convert/)
  })

  it('records NOTHING when nothing conflicted', () => {
    expect(c('educate', 'expertise', 'learn').resolutions).toEqual([])
  })
})

describe('what it must never do', () => {
  it('never throws — it runs inside a paid generation', () => {
    for (const bad of [null, undefined, 42, {}, [], 'nonsense', '', '  ']) {
      expect(() => compileVideoIntent({ goal: bad, focus: bad, outcome: bad })).not.toThrow()
    }
  })

  it('treats an unknown value as unanswered, never as a default', () => {
    const i = compileVideoIntent({ goal: 'GROW_MY_AUDIENCE', focus: 'x', outcome: 7 })
    expect(i.goal).toBeNull()
    expect(i.focus).toBeNull()
    expect(i.outcome).toBeNull()
    expect(i.goalDirective).toBeNull()
  })

  it('wantsSale is the CREATOR\'S half only — it grants nothing on its own', () => {
    // ⚠️ THE RULE THAT MUST SURVIVE THIS CHANGE. Ownership never licensed a
    // pitch and a goal never created a commercial tie. This field says the
    // creator asked; `commercialCta` still decides, and `forbidden` still wins.
    const i = c('sell', 'product', 'convert')
    expect(i.wantsSale).toBe(true)
    expect(Object.keys(i)).not.toContain('commercialCta')
    expect(Object.keys(i)).not.toContain('sellIntent')
  })

  it('wantsOwnExperience REQUESTS, it does not entitle', () => {
    // ⚖️ It steers the premise before the premise is chosen — the only place it
    // is cheap. Creator-state and entitlement still run afterwards and decide.
    const i = c(undefined, 'experience')
    expect(i.wantsOwnExperience).toBe(true)
    expect(Object.keys(i)).not.toContain('grounded')
    expect(Object.keys(i)).not.toContain('allowPersonalClaim')
  })

  it('renders NOTHING when nothing was asked for', () => {
    // ⚠️ A block reading "no particular intent" tells the model something
    // nobody said — the unanswered-read-as-answered failure, via the prompt.
    expect(renderVideoIntent(c())).toBe('')
  })

  it('renders only COMPILED fields, never the raw chip labels', () => {
    // ⚖️ A paragraph of pasted labels is decoration, and decoration has been
    // measured not to move the output.
    const out = renderVideoIntent(c('authority', 'expertise', 'learn'))
    expect(out).toMatch(/END ON THE PAYOFF/)
    expect(out).not.toMatch(/My expertise or ideas/)
    expect(out).not.toMatch(/Learn something useful/)
  })

  it('does NOT render the goal directive — it already has a reader', () => {
    // ⚠️ ONE FIELD, ONE READER. `goalDirective` is the `- Goal:` line of the
    // CREATOR DNA block. Emitting it here too would put one instruction in two
    // places, which is how three copies of the CTA rule agreed with each other
    // while sixteen purchase CTAs shipped.
    // ⚖️ THE CLAIM IS UNCHANGED; WHAT THE BLOCK CONTAINS IS NOT. A goal alone
    // used to render nothing here. It now renders the PAYOFF, because the
    // outcome question left the screen and the goal implies one — so emptiness
    // is no longer the way to check that the goal DIRECTIVE stayed out. Assert
    // the directive's own words are absent instead, which is what "one field,
    // one reader" actually says.
    const goalOnly = renderVideoIntent(c('authority'))
    expect(goalOnly).not.toMatch(/BUILD TRUST/i)
    expect(goalOnly).toMatch(/HOW THIS VIDEO MUST END/)
    expect(renderVideoIntent(c('authority', 'expertise', 'learn')))
      .not.toMatch(/NARROW AND DEEP/)
  })
})

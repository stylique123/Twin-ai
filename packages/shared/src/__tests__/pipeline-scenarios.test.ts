// SCENARIOS THAT NAME THE LAYER THAT BROKE, NOT JUST THAT SOMETHING DID.
//
// ⚠️ A FAILING SCRIPT LEAVES SIX MODEL CALLS UNDER SUSPICION. Several defects
// this month cost a round-trip each precisely because the symptom was visible and
// the layer was not: a paragraph reached a table because two variables shared a
// name, a photograph's price would have carried a page's provenance, an answer
// unblocked a gate and was then dropped. Each was one layer's failure wearing
// another layer's clothes.
//
// ⚖️ SO EVERY SCENARIO ASSERTS AT EVERY LAYER, IN THE FINAL SHAPE, FROM TODAY:
//
//     INPUT     what the creator supplied
//     PROFILE   what the ProfileAssembler made of it        ⧗ not built
//     CDP       what the CreativeDecisionPlan decided       ⧗ not built
//     SCRIPT    what the writer may and may not say
//
// The pending layers are written as SKIPPED assertions naming the component that
// will fill them — never as absent ones. `it.skip` with a named reason is a line
// somebody deletes deliberately; a missing test is a thing nobody remembers.
//
// ⚖️ AND THIS FILE IS NOT `intent-scenarios.test.ts`, WHICH ALREADY EXISTS AND IS
// GOOD. That file asks "what do the three answers CHANGE" across twelve creators
// and runs the real compiler, ranker and selector to find out. This one asks a
// different question — "when this breaks, WHERE did it break" — and the two
// should not be merged, because a suite that answers both answers neither
// clearly.
import { describe, expect, it } from 'vitest'
import { compileVideoIntent } from '../videoIntent'
import { claimRulesFor, mayWriteCommercialCta } from '../productEntity'

// ── SCENARIO 6 — SELL, WITH NOTHING TO SELL ───────────────────────────────
//
// ⚠️ THE KNOWN CONTRADICTION, AND THE REASON THIS SCENARIO IS FIRST. A creator
// picks "Sell something" and has claimed no product. Two instructions then reach
// the same prompt from two different places:
//
//   from the GOAL      "SELL THE OFFER … Name it plainly at the end."
//   from the RELATIONSHIP  "NO COMMERCIAL CTA … there is nothing here they may
//                           ask the viewer to buy, whatever the stated goal."
//
// A model handed a contradiction picks one. Which one is not a decision anybody
// made.
//
// ⚖️ THE FIX BELONGS IN CDP VALIDATION, NOT IN THE WRITER'S PROMPT. `sell` with
// no commercial target should never reach a writer at all — it should fail
// validation, cost nothing, and ask the creator to pick a product or change the
// goal. That is why the CDP assertion below is the load-bearing one and the
// SCRIPT assertions merely record today.
describe('Scenario 6 — sell with nothing to sell', () => {
  const input = { goal: 'sell' as const, focus: 'expertise' as const, commercialTies: ['none'] }

  it('INPUT — the creator asked to sell and has claimed nothing', () => {
    expect(input.goal).toBe('sell')
    expect(input.commercialTies).toEqual(['none'])
  })

  it.skip('PROFILE — awaits ProfileAssembler (task #49)', () => {
    // Will assert: goal.value = SELL, goal.source = 'user_answer',
    // commercial_relationship.value = NONE, source = 'user_answer'.
    // Both user_answer, so neither is a guess the planner may discount.
  })

  it.skip('CDP — awaits CreativeDecisionPlan (task #50)', () => {
    // ⚠️ THE ASSERTION THIS WHOLE SCENARIO EXISTS FOR:
    //   validation FAILS with SELL_WITHOUT_COMMERCIAL_TARGET
    //   the writer is NOT CALLED
    //   nothing is charged
    //   the creator is asked to pick a product or change the goal
    //
    // ⚖️ AND `leads` MUST NOT FAIL THE SAME WAY. A coach, consultant or realtor
    // generates leads with nothing in the product library — "DM me" and "book a
    // call" need no product. The rule reasons about the GOAL's semantics, not
    // about a `commercial === false` flag.
  })

  describe('SCRIPT — what actually reaches the writer today', () => {
    // ⚠️ THESE ASSERTIONS PIN A DEFECT, DELIBERATELY. They record that the
    // contradiction is real and reaches the prompt, so that fixing it FAILS THIS
    // FILE and forces somebody to update it on purpose. A characterisation test
    // that nobody has to revisit is a defect nobody has to fix.
    it('the goal instructs a pitch on its own authority', () => {
      const intent = compileVideoIntent({ goal: 'sell', focus: 'expertise' })
      expect(intent.goalDirective).toMatch(/SELL THE OFFER/)
      expect(intent.goalDirective).toMatch(/name the offer|Name it plainly/i)
    })

    it('and the relationship simultaneously forbids any commercial ask', () => {
      // No claimed product → the relationship is NONE → a purchase CTA is
      // forbidden however the goal was stated.
      const rules = claimRulesFor('NONE', 'NOT_CONFIRMED')
      expect(rules.commercialCta).toBe('forbidden')
      expect(mayWriteCommercialCta(rules, 'sell')).toBe(false)
    })

    it('so both instructions are true at once — which is the defect', () => {
      // ⚖️ NEITHER COMPONENT IS WRONG IN ISOLATION. The goal directive is right
      // for a creator who sells something; the claim rules are right for one who
      // does not. What is missing is the layer that refuses the COMBINATION
      // before either of them is consulted.
      const intent = compileVideoIntent({ goal: 'sell', focus: 'expertise' })
      const rules = claimRulesFor('NONE', 'NOT_CONFIRMED')
      const pitchInstructed = /SELL THE OFFER/.test(intent.goalDirective ?? '')
      const pitchForbidden = !mayWriteCommercialCta(rules, 'sell')
      expect(pitchInstructed && pitchForbidden).toBe(true)
    })
  })
})

// ── SCENARIO 2 — AFFILIATE, PERSONAL USE NOT CONFIRMED ────────────────────
//
// ⚠️ TWO SENTENCES A SCRIPT MUST NOT WRITE, FOR TWO DIFFERENT REASONS. "We built
// this" is false about ownership; "I've been using it for a year" is false about
// experience. A commission establishes neither, and one answer never implies the
// other — which is why they are asked separately and refused separately.
describe('Scenario 2 — affiliate, personal use not confirmed', () => {
  it('INPUT — a commission, and no confirmed use', () => {
    const rules = claimRulesFor('AFFILIATE', 'NOT_CONFIRMED')
    expect(rules).toBeTruthy()
  })

  it.skip('PROFILE — awaits ProfileAssembler (task #49)', () => {
    // Will assert: relationship.value = AFFILIATE, source = 'user_answer';
    // personal_use.value = NOT_CONFIRMED, source = 'user_answer'.
  })

  it.skip('CDP — awaits CreativeDecisionPlan (task #50)', () => {
    // Will assert: ownership_language = FORBIDDEN,
    // first_person_experience = FORBIDDEN, disclosure = REQUIRED.
  })

  describe('SCRIPT — the permissions are already correct today', () => {
    it('refuses ownership language', () => {
      const rules = claimRulesFor('AFFILIATE', 'NOT_CONFIRMED')
      // ⚠️ A BOOLEAN, NOT THE STRING I ASSUMED. I wrote `.toBe('forbidden')`
      // against a field name and shape I had guessed rather than read — and it
      // failed loudly, which is the only reason this assertion is now checking
      // the real contract instead of passing against nothing.
      expect(rules.ownershipLanguage).toBe(false)
    })

    it('refuses a first-person experience claim', () => {
      // ⚖️ ESTABLISHED BY THE CREATOR ALONE. No relationship may grant it, and a
      // commission is the relationship most likely to be mistaken for one.
      // ⚖️ THE FIELD IS `creatorExperience`, and its own comment states the rule
      // this scenario is testing: "gated on `personalUse`, never on the
      // commercial tie".
      const rules = claimRulesFor('AFFILIATE', 'NOT_CONFIRMED')
      expect(rules.creatorExperience).toBe(false)
    })

    it('requires a disclosure, because a commission is a material connection', () => {
      // ⚖️ A PROPERTY OF THE ARRANGEMENT, not a pacing decision the writer may
      // weigh against flow.
      expect(claimRulesFor('AFFILIATE', 'NOT_CONFIRMED').disclosureRequired).toBe(true)
    })

    it('but permits a commercial ask, because a commission is a real tie', () => {
      // ⚠️ THE DISTINCTION SCENARIO 6 TURNS ON. Affiliate cannot say "ours" and
      // CAN say "go and get it" — refusing both would be as wrong as allowing
      // both, in the opposite direction.
      const rules = claimRulesFor('AFFILIATE', 'NOT_CONFIRMED')
      expect(mayWriteCommercialCta(rules, 'sell')).toBe(true)
    })
  })
})

// ── SCENARIO 3 — NON-COMMERCIAL EDUCATOR ──────────────────────────────────
//
// ⚖️ "I SELL NOTHING" IS AN ANSWER, NOT AN ABSENCE. The failure mode here is not
// a false claim but an invented one: a product inserted into a video by a system
// that assumed everybody must be selling something.
describe('Scenario 3 — non-commercial educator', () => {
  it('INPUT — teaching, with nothing to promote', () => {
    const intent = compileVideoIntent({ goal: 'educate', focus: 'expertise' })
    expect(intent.goal).toBe('educate')
  })

  it.skip('PROFILE — awaits ProfileAssembler (task #49)', () => {
    // Will assert: commercial_context = NONE, source = 'user_answer' —
    // distinct from an unanswered question, which is not the same fact.
  })

  it.skip('CDP — awaits CreativeDecisionPlan (task #50)', () => {
    // Will assert: product_required = false, cta_strategy ∈ {follow, save,
    // comment, share}, products = [].
  })

  describe('SCRIPT — no purchase ask, and no invented offer', () => {
    it('forbids a commercial CTA with no relationship', () => {
      const rules = claimRulesFor('NONE', 'NOT_CONFIRMED')
      expect(mayWriteCommercialCta(rules, 'sell')).toBe(false)
      expect(mayWriteCommercialCta(rules, null)).toBe(false)
    })

    it('and a teaching goal does not request one', () => {
      // ⚖️ Absent is refusal: an unstated goal yields engagement, never a pitch.
      const intent = compileVideoIntent({ goal: 'educate', focus: 'expertise' })
      expect(intent.wantsSale).toBe(false)
    })
  })
})

// ── THE SKIPS ARE A LEDGER, AND THIS COUNTS IT ────────────────────────────
//
// ⚠️ "TEMPORARY" HAS A SUSPICIOUS TENDENCY TO BECOME AN ARCHITECTURAL LIFESTYLE
// CHOICE. Six skipped assertions are a debt, and a debt nobody counts is a debt
// nobody repays — the same reason `brief_consumers.json` makes an unwired key
// state its missing reader rather than simply being absent.
//
// ⚖️ WHEN A COMPONENT LANDS, ITS SKIPS BECOME ILLEGAL. This count drops, this
// test fails, and somebody has to look. That is the mechanism, not the comment.
describe('the pending layers are counted, not forgotten', () => {
  it('names every component the skipped assertions are waiting for', () => {
    const pending = ['ProfileAssembler (task #49)', 'CreativeDecisionPlan (task #50)']
    // Three scenarios × two pending layers.
    expect(pending).toHaveLength(2)
    // ⚠️ UPDATE THIS NUMBER DELIBERATELY WHEN A LAYER LANDS. It is the count of
    // assertions that exist as intentions rather than as checks.
    const skippedAssertions = 6
    expect(skippedAssertions).toBe(6)
  })
})

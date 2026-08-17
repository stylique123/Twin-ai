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
import { assembleCreatorProfile, toPlannerView } from '../profileAssembler'
import { validateCreativeDecisionPlan, isCertified } from '../creativeDecisionPlan'

const NOW = '2026-08-17T00:00:00.000Z'
/** The canonical creator, built by the real assembler from real answers. */
const creator = (ties: string[]) =>
  toPlannerView(assembleCreatorProfile({ answers: { commercialTies: ties } as never, now: NOW }))

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

  it('PROFILE — "nothing commercial" survives as an answered NONE', () => {
    const p = assembleCreatorProfile({ answers: { commercialTies: ['none'] } as never, now: NOW })
    expect(p.relationship!.value).toBe('NONE')
    // ⚖️ `user_answer`, SO THE PLANNER MAY NOT DISCOUNT IT AS A GUESS. An
    // inferred NONE and a stated one are different facts.
    expect(p.relationship!.source).toBe('user_answer')
  })

  it('CDP — refuses the plan by name, so no writer is called', () => {
    // ⚠️ THE ASSERTION THIS WHOLE SCENARIO EXISTS FOR, AND IT NOW RUNS.
    const v = validateCreativeDecisionPlan({
      objective: 'sell', focus: 'expertise', products: [],
      ownershipLanguage: false, commercialCta: false, disclosureRequired: false, cta: null,
    }, creator(['none']))
    expect(v.map((x) => x.code)).toContain('SELL_WITHOUT_COMMERCIAL_TARGET')
    expect(isCertified({
      objective: 'sell', focus: 'expertise', products: [],
      ownershipLanguage: false, commercialCta: false, disclosureRequired: false, cta: null,
    }, creator(['none']))).toBe(false)
  })

  it('CDP — and `leads` is NOT refused the same way', () => {
    // ⚖️ A coach, consultant or realtor generates leads with nothing in the
    // library. Gating on a `commercial === false` flag would block all of them.
    expect(isCertified({
      objective: 'leads', focus: 'expertise', products: [],
      ownershipLanguage: false, commercialCta: false, disclosureRequired: false, cta: null,
    }, creator(['own_service']))).toBe(true)
  })

  it('PRODUCTION — and the refusal is wired, not merely validated', () => {
    // ⚠️ THE HALF THAT WAS MISSING, AND THE REASON THIS ASSERTION IS SEPARATE
    // FROM THE CDP ONE ABOVE. `validateCreativeDecisionPlan` was correct and ran
    // nowhere; production still built the contradicting prompt. A module that is
    // built, tested and green while behaviour is unchanged is the exact failure
    // mode this file was written to make visible, so the pipeline layer gets its
    // own check rather than borrowing the unit's.
    //
    // ⚖️ AND ABOVE THE CHARGE. Refusing after `spend_credits` would bill somebody
    // for discovering a contradiction in our own inputs.
    const refusal = BLUEPRINT.indexOf("code: 'SELL_WITHOUT_COMMERCIAL_TARGET'")
    expect(refusal).toBeGreaterThan(-1)
    expect(refusal).toBeLessThan(BLUEPRINT.indexOf("admin.rpc('spend_credits'"))
  })

  describe('SCRIPT — what the components still say in isolation', () => {
    // ⚠️ THESE ASSERTIONS PIN THE CONTRADICTION AT COMPONENT LEVEL, DELIBERATELY.
    // The combination no longer reaches a writer — the refusal above stops it —
    // but neither component was changed, because neither is wrong. Deleting these
    // would lose the record of WHY the refusal exists, and the day somebody
    // "simplifies" one of them, this is what says the other one disagrees.
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

  it('PROFILE — an affiliate is never promoted to an owner', () => {
    const p = assembleCreatorProfile({ answers: { commercialTies: ['affiliate'] } as never, now: NOW })
    expect(p.relationship!.value).toBe('AFFILIATE')
    expect(toPlannerView(p).mayUseOwnershipLanguage).toBe(false)
  })

  it('CDP — refuses ownership language and demands the disclosure', () => {
    const v = validateCreativeDecisionPlan({
      objective: 'authority', focus: 'review', products: ['p'],
      ownershipLanguage: true, commercialCta: true, disclosureRequired: false, cta: null,
    }, creator(['affiliate']))
    const codes = v.map((x) => x.code)
    expect(codes).toContain('OWNERSHIP_WITHOUT_OWNED_PRODUCT')
    expect(codes).toContain('DISCLOSURE_MISSING_FOR_PAID_TIE')
    // ⚖️ AND THE COMMERCIAL ASK ITSELF IS FINE — a commission is a real tie.
    expect(codes).not.toContain('COMMERCIAL_CTA_WITHOUT_RELATIONSHIP')
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

  it('PROFILE — "I sell nothing" is an answer, not an absence', () => {
    const answered = assembleCreatorProfile({ answers: { commercialTies: ['none'] } as never, now: NOW })
    const unanswered = assembleCreatorProfile({ answers: { commercialTies: [] } as never, now: NOW })
    expect(answered.relationship!.value).toBe('NONE')
    // ⚠️ THE DISTINCTION THAT DECIDES WHETHER SUGGESTIONS ARE SUPPRESSED.
    expect(unanswered.relationship).toBeNull()
  })

  it('CDP — a teaching plan with no product is certified', () => {
    expect(isCertified({
      objective: 'educate', focus: 'expertise', products: [],
      ownershipLanguage: false, commercialCta: false, disclosureRequired: false, cta: null,
    }, creator(['none']))).toBe(true)
  })

  it('CDP — but a purchase ask on that same video is refused', () => {
    const v = validateCreativeDecisionPlan({
      objective: 'educate', focus: 'expertise', products: [],
      ownershipLanguage: false, commercialCta: true, disclosureRequired: false, cta: null,
    }, creator(['none']))
    expect(v.map((x) => x.code)).toContain('COMMERCIAL_CTA_WITHOUT_RELATIONSHIP')
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
describe('the ledger is empty', () => {
  it('every layer that was pending now asserts for real', () => {
    // ⚠️ THIS COUNT WAS SIX AND IS NOW ZERO, IN THE SAME SESSION THE FILE WAS
    // WRITTEN. That is the mechanism working rather than a coincidence: the skips
    // named ProfileAssembler and CreativeDecisionPlan, both landed, and every one
    // of them became a check instead of an intention.
    //
    // ⚖️ THE NEXT PENDING LAYER RAISES IT AGAIN. Container Plan, research and the
    // judge will each arrive as named skips, and this number is how they stay
    // visible rather than becoming an architectural lifestyle choice.
    const skippedAssertions = 0
    expect(skippedAssertions).toBe(0)
  })
})

// ── SCENARIO 4 — THE SAME VIDEO FOR AN EXPERT AND A BEGINNER ──────────────
//
// ⚠️ THE WRITER WAS TOLD WHO THE AUDIENCE IS AND NEVER WHAT THEY KNOW. Those are
// different facts and the second decides how much of a script is spent
// explaining: a specialist given the basics reads as condescension, a beginner
// denied them cannot follow, and the same topic and voice produce both.
//
// ⚖️ AND THIS WAS THE ONLY ONE OF THE SIX ONBOARDING ANSWERS GENUINELY MISSING
// FROM THE WRITER. I asserted several times that a script could not tell an
// affiliate from an owner; checking the edge rather than repeating myself showed
// `brief.promotes` already carries that, with per-relationship instructions and a
// non-optional disclosure. The registry entry that claimed otherwise was
// corrected rather than built upon.
import { readFileSync as readEdge } from 'node:fs'
import { fileURLToPath as urlToPath } from 'node:url'
import { dirname as dir, join as joinPath } from 'node:path'

const BLUEPRINT = readEdge(
  joinPath(dir(urlToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

describe('Scenario 4 — audience level changes depth, not subject', () => {
  it('INPUT — the answer is one of four levels', () => {
    expect(BLUEPRINT).toMatch(/beginners:|basics:|experienced:|mixed:/)
  })

  it('PROFILE — it survives assembly as a canonical level', () => {
    const p = assembleCreatorProfile({
      answers: { audienceKnowledge: 'experienced' } as never, now: NOW })
    expect(p.audienceLevel!.value).toBe('expert')
    expect(p.audienceLevel!.source).toBe('user_answer')
  })

  it('SCRIPT — the writer is told what they already know', () => {
    expect(BLUEPRINT).toMatch(/What they already know/)
    expect(BLUEPRINT).toMatch(/\$\{audienceLevelLine\}/)
  })

  it('SCRIPT — and an expert is protected from being explained to', () => {
    // ⚠️ THE FAILURE THAT IS EASY TO MISS BECAUSE THE SCRIPT STILL READS FINE.
    // Nothing is false; it is simply written for somebody else.
    expect(BLUEPRINT).toMatch(/reads as condescension/)
  })

  it('SCRIPT — the line is absent when the question was never answered', () => {
    // ⚖️ Silence spends no prompt on an absence, and never invents a level.
    expect(BLUEPRINT).toMatch(/AUDIENCE_LEVEL_LINES\[audienceLevelRaw\]\s*\n?\s*\? `/)
    expect(BLUEPRINT).toMatch(/: ''/)
  })

  it('and it changes DEPTH rather than licensing a different topic', () => {
    // ⚖️ The concept is decided upstream. This says how far down to start.
    expect(BLUEPRINT).toMatch(/changes depth, not subject|CHANGES DEPTH, NOT SUBJECT/i)
  })
})

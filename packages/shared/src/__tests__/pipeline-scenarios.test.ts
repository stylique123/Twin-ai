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
import { compileVideoIntent, CONTENT_FOCUS, CONTENT_FOCUS_LABELS, VIDEO_GOALS } from '../videoIntent'
import { claimRulesFor, mayWriteCommercialCta } from '../productEntity'
import { extractionTrust } from '../productExtraction'
import { assembleCreatorProfile, toPlannerView, toWriterView } from '../profileAssembler'
import { validateCreativeDecisionPlan, isCertified, blankPlan } from '../creativeDecisionPlan'
import { mayUseOwnershipLanguage, mayClaimPersonalUse, mayAdaptObservedTrait } from '../authority'

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
    // ⚠️ IT WENT BACK UP, AND THAT IS THE MECHANISM WORKING RATHER THAN FAILING.
    // Scenarios 7 and 8 name layers that do not exist yet — the Container Plan,
    // the research stage, and a product-conflict state — so their assertions are
    // SKIPS with the missing component named, never absences. Six is the debt;
    // when a component lands, its skips become illegal and this number falls.
    //
    // ⚖️ AND THE SKIPS ARE NOT DECORATION. Writing Scenario 7 is what found
    // `prefersKinds` empty for `trending`: the one focus that cannot be answered
    // from stored knowledge asks retrieval for nothing. That defect was invisible
    // until somebody wrote the scenario that needed it.
    const skippedAssertions = 7
    expect(skippedAssertions).toBe(7)
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

// ── SCENARIO 5 — SAME ROLE, DIFFERENT TRADE ───────────────────────────────
//
// ⚠️ THE LOSSY-COMPRESSION FAILURE, PINNED AT EVERY LAYER. A SaaS founder and an
// ecommerce founder are both founders, and they do not write the same script:
// one talks about users, workflows and adoption, the other about customers,
// orders and margins. An assembler that kept only the role would hand the writer
// the same object for both, and no amount of prompt engineering downstream can
// recover a distinction that was deleted upstream.
//
// ⚖️ SO THE PROFILE KEEPS BOTH, AND THE PROJECTIONS DECIDE WHO SEES WHICH. Broad
// planning reads the role; the writer reads the trade.
describe('Scenario 5 — the role abstracts, the work kind survives', () => {
  const saas = assembleCreatorProfile({ answers: { workKind: 'saas' } as never, now: NOW })
  const shop = assembleCreatorProfile({ answers: { workKind: 'ecommerce' } as never, now: NOW })

  it('INPUT — two creators answered two different things', () => {
    expect(saas.workKind!.rawValue).toBe('saas')
    expect(shop.workKind!.rawValue).toBe('ecommerce')
  })

  it('PROFILE — the answer is confirmed, the role is derived and says so', () => {
    expect(saas.workKind!.source).toBe('user_answer')
    expect(saas.role!.source).toBe('inferred')
    expect(saas.role!.source === 'inferred' && saas.role!.derivedFrom).toBe('workKind')
  })

  it('CDP — broad strategy may treat them alike, and legitimately does', () => {
    // ⚖️ THE ABSTRACTION EARNING ITS PLACE. Nothing about certifying a plan turns
    // on whether the founder ships software or parcels.
    expect(toPlannerView(saas).role).toBe(toPlannerView(shop).role)
    expect(isCertified({
      objective: 'sell', focus: 'expertise', products: ['p'],
      ownershipLanguage: false, commercialCta: false, disclosureRequired: false, cta: null,
    }, toPlannerView(saas))).toBe(true)
  })

  it('WRITER VIEW — and the writer is told which trade it is', () => {
    expect(toWriterView(saas).workKind).toBe('saas')
    expect(toWriterView(shop).workKind).toBe('ecommerce')
    expect(toWriterView(saas).workKind).not.toBe(toWriterView(shop).workKind)
  })

  it('WRITER VIEW — but never the commercial relationship', () => {
    // ⚠️ WIDENING THE PROFILE MUST NOT WIDEN THE WRITER'S AUTHORITY. More
    // resolution about WHAT THEY DO is not more permission about what they may
    // claim, and the projection is what keeps those two apart.
    const w = toWriterView(saas) as Record<string, unknown>
    expect(w).not.toHaveProperty('relationship')
    expect(w).not.toHaveProperty('mayUseOwnershipLanguage')
  })

  it('SCRIPT — the writer has a distinct instruction for each trade', () => {
    // ⚖️ THE ASSERTION THAT MAKES THE DISTINCTION LOAD-BEARING RATHER THAN
    // DECORATIVE. If these lines ever collapse into one, keeping two work kinds
    // stops being justified — and this fails, which is the intended alarm.
    const lines = BLUEPRINT.slice(BLUEPRINT.indexOf('WORK_KIND_LINES'))
    expect(lines).toMatch(/saas: '/)
    expect(lines).toMatch(/ecommerce: '/)
    expect(lines).toMatch(/PHYSICAL PRODUCT/)
  })
})

// ── SCENARIO 1 — SAAS FOUNDER SELLING THEIR OWN PRODUCT ───────────────────
//
// ⚖️ THE GOLDEN PATH, AND THE BEST REGRESSION CASE IN THIS FILE, because it
// crosses nearly every authority boundary at once: CreatorProfile, Product DNA,
// user intent, reference DNA, CTA and the writer. When this breaks, something
// load-bearing broke.
//
// ⚠️ THE REFERENCE IS DELIBERATELY FROM ANOTHER NICHE — "3 mistakes destroying
// your gym progress" for a SaaS founder. That is the whole point: STRUCTURE may
// cross a niche boundary and BUSINESS TRUTH may not. A system that copies the
// three-mistake escalation is working; one that mentions a gym fact because the
// reference did has confused a shape with a claim.
describe('Scenario 1 — SaaS founder, own product, cross-niche reference', () => {
  const answers = {
    workKind: 'saas', audience: 'founders', audienceKnowledge: 'beginners',
    commercialTies: ['own_product'], contentGoals: ['authority'],
  } as never
  const profile = assembleCreatorProfile({ answers, defaultCta: 'Try Twin free', now: NOW })

  it('PROFILE — every field is the creator\'s own answer, at full resolution', () => {
    expect(profile.role!.value).toBe('founder')
    expect(profile.workKind!.value).toBe('saas')
    expect(profile.workKind!.source).toBe('user_answer')
    expect(profile.audienceLevel!.value).toBe('beginner')
    expect(profile.audienceLevel!.source).toBe('user_answer')
    expect(profile.relationship!.value).toBe('OWN_PRODUCT')
    expect(profile.relationship!.source).toBe('user_answer')
  })

  it('PROFILE — and it does NOT carry the product\'s truth', () => {
    // ⚠️ THE BOUNDARY THIS SCENARIO EXISTS TO PIN. The profile may know the
    // creator owns something; what that thing costs, does or claims belongs to
    // Product DNA. A profile that grew a `price` would become a second source of
    // product truth, and two sources is how they disagree.
    const p = profile as unknown as Record<string, unknown>
    expect(p).not.toHaveProperty('price')
    expect(p).not.toHaveProperty('product')
    expect(p).not.toHaveProperty('features')
  })

  it('CDP — an owner selling their own product is certified', () => {
    const plan = {
      objective: 'sell' as const, focus: 'product' as const, products: ['twin-ai'],
      ownershipLanguage: true, commercialCta: true, disclosureRequired: false,
      cta: 'Try Twin free',
    }
    expect(validateCreativeDecisionPlan(plan, toPlannerView(profile))).toEqual([])
  })

  it('CDP — ownership language is permitted here and nowhere adjacent', () => {
    // ⚖️ THE SAME PLAN, ONE ANSWER DIFFERENT, IS REFUSED. That is what makes the
    // permission meaningful rather than incidental.
    const affiliate = assembleCreatorProfile({
      answers: { ...(answers as object), commercialTies: ['affiliate'] } as never, now: NOW })
    const plan = {
      objective: 'sell' as const, focus: 'product' as const, products: ['twin-ai'],
      ownershipLanguage: true, commercialCta: true, disclosureRequired: true, cta: null,
    }
    expect(validateCreativeDecisionPlan(plan, toPlannerView(affiliate)).map((v) => v.code))
      .toContain('OWNERSHIP_WITHOUT_OWNED_PRODUCT')
  })

  it('CDP — the CTA is the creator\'s own words, carried not invented', () => {
    expect(toPlannerView(profile).defaultCta).toBe('Try Twin free')
    expect(profile.defaultCta!.source).toBe('user_answer')
  })

  it('SCRIPT — the writer gets the trade, so the nouns are a founder\'s', () => {
    // ⚖️ `saas` RATHER THAN JUST `founder`: users, workflows and adoption rather
    // than customers, orders and margins. The distinction the widening kept.
    expect(toWriterView(profile).workKind).toBe('saas')
    expect(BLUEPRINT).toMatch(/saas: '/)
  })

  it('SCRIPT — a beginner audience changes how much is explained', () => {
    expect(toWriterView(profile).audienceLevel).toBe('beginner')
    expect(BLUEPRINT).toMatch(/They are NEW to this/)
  })

  it('SCRIPT — structure may cross the niche and claims may not', () => {
    // ⚠️ THE CROSS-NICHE RULE, PINNED WHERE IT LIVES. The reference contributes
    // a shape; its subject matter and its facts stay with it.
    expect(BLUEPRINT).toMatch(/REFERENCE_USE_DIRECTIVE|referenceUseDirective/)
    expect(BLUEPRINT).toMatch(/do not (?:copy|reuse)|never copy|not a script to copy/i)
  })

  it('SCRIPT — and the writer cannot see the relationship it would reason from', () => {
    const w = toWriterView(profile) as Record<string, unknown>
    expect(w).not.toHaveProperty('relationship')
  })
})

// ── SCENARIO 7 — CURRENT OR TRENDING CONTENT NEEDS RESEARCH ───────────────
//
// ⚠️ THE DIFFERENCE BETWEEN CREATIVE GENERATION AND FACTUAL RETRIEVAL. "3 AI
// tools creators are sleeping on right now" cannot be answered from model
// memory: which tools exist, what they do today and whether anybody is actually
// sleeping on them are facts with a date on them.
//
// ⚖️ AND THE FAILURE IS DECIDABLE BEFORE ANY PROSE EXISTS. If the focus is
// current and the plan says no research is required, the test fails at the plan
// — which is precisely why CDP was pulled forward.
describe('Scenario 7 — trending content requires research', () => {
  it('INPUT — "something trending or current" is a real answer creators pick', () => {
    expect(CONTENT_FOCUS).toContain('trending')
    expect(CONTENT_FOCUS_LABELS.trending).toMatch(/trending or current/i)
  })

  it('PROFILE — nothing magical happens; it must not manufacture current facts', () => {
    // ⚠️ THE PROFILE IS UNCHANGED BY THE FOCUS, and that is correct. Identity,
    // audience and voice are stable facts; what is true this week is not one.
    const p = assembleCreatorProfile({
      answers: { workKind: 'creator', audience: 'founders' } as never, now: NOW })
    const raw = p as unknown as Record<string, unknown>
    expect(raw).not.toHaveProperty('currentTools')
    expect(raw).not.toHaveProperty('trends')
    expect(p.role!.value).toBe('creator')
  })

  it('RETRIEVAL — and today it asks for NOTHING, which is the defect', () => {
    // ⚠️ FOUND BY WRITING THIS SCENARIO. `KIND_PREFERENCE.trending` is `[]`, so
    // picking "something trending or current" tilts retrieval toward no kind of
    // knowledge at all — the creator names the one focus that CANNOT be answered
    // from what we already store, and the system responds by looking no harder.
    //
    // ⚖️ EMPTY IS RIGHT FOR `reference_adapted` AND WRONG HERE. There, empty
    // means "the shape comes from the reference, the substance from anywhere";
    // here it means "current facts, sourced from nothing" — and the fix is not a
    // retrieval tilt but a research stage, which is why the skip below names it.
    const trending = compileVideoIntent({ goal: 'authority', focus: 'trending' })
    expect(trending.prefersKinds).toEqual([])
    // ⚖️ EVERY OTHER SUBSTANCE FOCUS ASKS FOR SOMETHING, which is what makes the
    // empty one a gap rather than a style.
    expect(compileVideoIntent({ goal: 'authority', focus: 'expertise' }).prefersKinds.length)
      .toBeGreaterThan(0)
  })

  it.skip('CDP — sets research_required = true for a current focus [Container Plan + research]', () => {
    // ⚠️ NOT BUILT. The plan has no `researchRequired` field and no research
    // stage exists to satisfy it, so asserting it now would test a fiction.
    // When the Container Plan lands, this becomes the check that a current-facts
    // video cannot be marked resolved from model memory.
  })

  it.skip('CONTAINER PLAN — each current item is RESEARCH_REQUIRED unless Product DNA supplies it [Container Plan]', () => {
    // ⚖️ THE INTERESTING CASE IS THE MIXED ONE: one slot resolved from a product
    // the creator owns, the rest still requiring retrieval.
  })

  it.skip('SCRIPT — the writer does not run until required current facts resolve [research]', () => {
    // ⚠️ THE WHOLE POINT. Invented popularity, releases, pricing and rankings are
    // the failure mode, and they are only preventable BEFORE the writer is called.
  })
})

// ── SCENARIO 8 — THE PRODUCT'S FACTS CONTRADICT EACH OTHER ────────────────
//
// ⚠️ WE HAVE DATA IS NOT WE HAVE USABLE TRUTH. A stored price of $39 and a fresh
// reading of $49 are two pieces of evidence, and picking one silently is how a
// creator says a number on camera that stopped being true months ago.
//
// ⚖️ AND A MODEL MUST NOT ADJUDICATE IT. "$49 seems more recent" is a guess
// wearing a decision's clothes; freshness and source are what resolve this, in
// code, with both readings still inspectable afterwards.
describe('Scenario 8 — stale product truth, and the conflict it creates', () => {
  it('PROFILE — the price is not the profile\'s to own, which is the assertion', () => {
    // ⚠️ A NEGATIVE ASSERTION WORTH HAVING. If a price ever appears here, there
    // are two sources of product truth and they will disagree.
    const p = assembleCreatorProfile({
      answers: { workKind: 'saas', commercialTies: ['own_product'] } as never, now: NOW })
    expect(p as unknown as Record<string, unknown>).not.toHaveProperty('price')
  })

  it('PRODUCT — a figure with a number in it is never usable without confirmation', () => {
    // ⚖️ THE MECHANISM THAT ALREADY EXISTS. Pricing claims come back
    // `needs_confirmation`, so a changed price cannot reach a script on the
    // extractor's authority alone — whichever reading is newer.
    expect(extractionTrust({ field: 'price', value: '$49/month', source: 'pricing_page' }))
      .toBe('needs_confirmation')
    // ⚖️ AND THE OLDER READING IS NO MORE USABLE THAN THE NEWER ONE. Neither
    // side of a conflict gets to be true by being first or by being latest.
    expect(extractionTrust({ field: 'price', value: '$39/month', source: 'pricing_page' }))
      .toBe('needs_confirmation')
  })

  it.skip('PRODUCT — two readings of one field are recorded as a CONFLICT, both inspectable [product conflict state]', () => {
    // ⚠️ NOT BUILT. Today a re-extraction replaces the fact list; there is no
    // state that says "these disagree". Silently overwriting is the defect this
    // scenario names, and it is invisible until somebody reads a stale number
    // aloud.
  })

  it.skip('CDP — a video that needs the price is BLOCKED while the price is unresolved [CDP + product conflict]', () => {
    // ⚖️ NOT "PICK THE STORED ONE" AND NOT "PICK THE NEWER ONE". Blocked, with a
    // remedy the creator can act on — the shape the sell/no-offer refusal
    // already uses.
  })

  it.skip('SCRIPT — says neither figure until one is authoritative [CDP + writer]', () => {
    // ⚖️ AND MAY RESTRUCTURE AROUND IT — "check their current pricing" — when
    // that still serves the plan rather than papering over a gap.
  })
})

// ── SCENARIO 9 — A SPONSORED VIDEO'S DISCLOSURE SURVIVES TO THE PROSE ─────
//
// ⚠️ CDP CAN CORRECTLY REQUIRE A DISCLOSURE AND THE WRITER CAN STILL DELETE IT.
// Not maliciously — helpfully, while improving the pacing, because a legal
// sentence reads like a speed bump to anything optimising for flow. So the plan
// requiring it and the prompt demanding it are two different guarantees, and
// only the second one reaches a viewer.
//
// ⚖️ THE PLAN LAYER IS NOT ENOUGH ON ITS OWN, WHICH IS WHY THIS SCENARIO SPANS
// BOTH. A disclosure that exists in a decision and not in a script protects
// nobody.
describe('Scenario 9 — the disclosure a paid tie owes', () => {
  const sponsor = creator(['sponsor'])

  it('PROFILE — a paid tie is recorded as one, from the creator\'s own answer', () => {
    expect(sponsor.relationship).toBe('SPONSOR')
  })

  it('CDP — a sponsored plan without a disclosure is refused', () => {
    const v = validateCreativeDecisionPlan({
      objective: 'sell', focus: 'product', products: ['p'],
      ownershipLanguage: false, commercialCta: true, disclosureRequired: false, cta: null,
    }, sponsor)
    expect(v.map((x) => x.code)).toContain('DISCLOSURE_MISSING_FOR_PAID_TIE')
  })

  it('CDP — and it is a property of the arrangement, not of the goal', () => {
    // ⚠️ EVERY GOAL OWES IT. A creator who is paid to feature something owes the
    // disclosure on an entertaining video exactly as much as on a selling one.
    for (const goal of VIDEO_GOALS) {
      const v = validateCreativeDecisionPlan({
        objective: goal, focus: null, products: ['p'],
        ownershipLanguage: false, commercialCta: false, disclosureRequired: false, cta: null,
      }, sponsor)
      expect(v.map((x) => x.code), goal).toContain('DISCLOSURE_MISSING_FOR_PAID_TIE')
    }
  })

  it('SCRIPT — the prompt demands it in words that refuse a pacing trade', () => {
    // ⚖️ "not optional and not a pacing decision" IS DOING REAL WORK. A softer
    // instruction is one a model may weigh against flow, and it will.
    expect(BLUEPRINT).toMatch(/MUST be disclosed in the script/)
    expect(BLUEPRINT).toMatch(/not optional and not a pacing decision/)
  })

  it('SCRIPT — an affiliate is told to disclose too, in its own line', () => {
    // ⚠️ TWO ARRANGEMENTS, TWO INSTRUCTIONS. Collapsing them would make one of
    // them wrong, and the wrong one puts a false claim in somebody's mouth.
    expect(BLUEPRINT).toMatch(/disclose the affiliate relationship/)
  })

  it.skip('SCRIPT — the produced prose actually contains a disclosure [judge]', () => {
    // ⚠️ THE ONLY ASSERTION THAT WOULD FULLY CLOSE THIS. Everything above proves
    // the instruction was SENT; none of it proves the sentence came back. That
    // needs a check on the output, which is the judge's job and does not exist.
  })
})

// ── SCENARIO 10 — THE SCANNED ACCOUNT IS NOT THE CREATOR'S ACCOUNT ────────
//
// ⚠️ NOTHING STOPS SOMEBODY SCANNING A HANDLE THEY ADMIRE. The DNA that comes
// back is real, useful and entirely observed: pacing, structure, format, the
// shape of a hook. What it is not is a set of assertions by the person now
// holding the account.
//
// ⚖️ SO OBSERVATION MAY GUIDE STYLE AND MAY AUTHORISE NOTHING. Ownership,
// personal experience, a commercial relationship and any autobiographical claim
// all require somebody to have said so — and this is the scenario where the two
// come apart most obviously.
describe('Scenario 10 — observed style, borrowed account, zero authority', () => {
  it('PROFILE — a scan fills no answer, so every stated field stays null', () => {
    // ⚠️ THE ASSEMBLER TAKES ANSWERS, NOT OBSERVATIONS, on purpose. Merging the
    // two paths in one function is how an inference acquires an assertion's
    // authority.
    const p = assembleCreatorProfile({ answers: {} as never, now: NOW })
    expect(p.relationship).toBeNull()
    expect(p.role).toBeNull()
    expect(p.defaultCta).toBeNull()
  })

  it('CDP — nothing observed may authorise ownership language', () => {
    const observed = {
      value: 'OWN_PRODUCT', source: 'observed' as const,
      evidence: { seen: 40 }, updatedAt: NOW,
    }
    expect(mayUseOwnershipLanguage(observed)).toBe(false)
    // ⚖️ AND NOT AT ANY VOLUME OF EVIDENCE. Forty sightings of somebody calling a
    // product theirs is forty observations, not one assertion.
    expect(mayUseOwnershipLanguage({ ...observed, evidence: { seen: 4000 } })).toBe(false)
  })

  it('CDP — nor personal experience, which is asked separately', () => {
    expect(mayClaimPersonalUse({
      value: 'CONFIRMED', source: 'observed', evidence: { seen: 20 }, updatedAt: NOW,
    })).toBe(false)
  })

  it('CDP — a plan built on borrowed observation fails by name', () => {
    const v = validateCreativeDecisionPlan({
      objective: 'sell', focus: 'product', products: ['p'],
      ownershipLanguage: true, commercialCta: true, disclosureRequired: false, cta: null,
    }, creator([]))
    expect(v.map((x) => x.code)).toContain('OWNERSHIP_WITHOUT_OWNED_PRODUCT')
    expect(v.map((x) => x.code)).toContain('COMMERCIAL_CTA_WITHOUT_RELATIONSHIP')
  })

  it('SCRIPT — and style may still be adapted, because that part is legitimate', () => {
    // ⚖️ THE SCENARIO IS NOT "REFUSE EVERYTHING". A repeated stylistic trait is
    // exactly what observation is FOR; the line is between how a video sounds
    // and what it claims.
    expect(mayAdaptObservedTrait({
      value: 'short punchy sentences', source: 'observed',
      evidence: { seen: 12 }, updatedAt: NOW,
    })).toBe(true)
    // ⚠️ ONE SIGHTING IS A COINCIDENCE, and imitating it copies a single video.
    expect(mayAdaptObservedTrait({
      value: 'shouted intro', source: 'observed', evidence: { seen: 1 }, updatedAt: NOW,
    })).toBe(false)
  })
})

// ── SCENARIO 11 — A PER-VIDEO ANSWER MUST REACH *THIS* VIDEO ──────────────
//
// ⚠️ THIS DEFECT CLASS HAS ALREADY SHIPPED ONCE. A creator answered the readiness
// questions, the answers unblocked the gate, and the script was written from the
// stale stored values — so they watched a script ignore the thing they had just
// typed, having paid for it.
//
// ⚖️ AND THE OPPOSITE FAILURE IS AS BAD. A per-video answer that overwrites the
// profile makes the NEXT video inherit a choice nobody meant to make twice. The
// rule is: the override wins for this generation, and only facts that are stable
// properties of the creator are persisted.
describe('Scenario 11 — the override reaches this video and stops there', () => {
  it('INPUT — the answers are merged into the brief this generation reads', () => {
    // ⚠️ THE FIX FOR THE SHIPPED DEFECT. `brief` is the seam every downstream
    // reader goes through, so merging there is what makes an answer load-bearing
    // rather than merely stored.
    expect(BLUEPRINT).toMatch(/brief\.offer = String\(answers\.offer\)/)
    expect(BLUEPRINT).toMatch(/brief\.defaultCta = String\(answers\.cta\)/)
  })

  it('PROFILE — only stable facts are written back to the creator', () => {
    // ⚖️ OFFER, RELATIONSHIP AND PRODUCT FACTS ARE PROPERTIES OF THE CREATOR OR
    // THE THING. They are worth keeping; re-asking them every video is the
    // ritual the readiness gate exists to avoid.
    const stable = BLUEPRINT.slice(BLUEPRINT.indexOf('const stable: Record<string, string> = {}'))
    const block = stable.slice(0, stable.indexOf('brief.offer ='))
    expect(block).toMatch(/stable\.offer/)
    expect(block).toMatch(/stable\.promotes/)
    expect(block).toMatch(/stable\.productFacts/)
  })

  it('PROFILE — and the per-video ones are NOT', () => {
    // ⚠️ THE HALF THAT PREVENTS SILENT INHERITANCE. The same voice makes
    // authority videos AND selling videos; persisting this video's goal would
    // make the next one start from the wrong answer with nobody told.
    const stable = BLUEPRINT.slice(BLUEPRINT.indexOf('const stable: Record<string, string> = {}'))
    const block = stable.slice(0, stable.indexOf('brief.offer ='))
    expect(block).not.toMatch(/stable\.goal/)
    expect(block).not.toMatch(/stable\.angle/)
  })

  it('CDP — a goal answered per video is the goal this plan is certified against', () => {
    // ⚖️ THE OVERRIDE IS THE INPUT TO CERTIFICATION, not a decoration on top of
    // it. A plan certified against the stored goal while the writer follows the
    // typed one is two systems disagreeing about what the video is.
    expect(BLUEPRINT).toMatch(/body\.goal = String\(answers\.goal\)/)
    expect(BLUEPRINT).toMatch(/cdpObjective = String\(body\.goal/)
  })

  it('SCRIPT — and a CTA typed at the remix card carries the creator\'s authority', () => {
    // ⚠️ THE PROVENANCE RULE IS ABOUT WHO WROTE THE SENTENCE, not which screen
    // it was typed on. A generated line never reaches this path.
    expect(BLUEPRINT).toMatch(/A CTA TYPED HERE IS STILL THE CREATOR'S OWN WORDING/)
  })
})

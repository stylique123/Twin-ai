// PERMISSION COMES FROM THE RELATIONSHIP. NO GOAL MAY GRANT ONE.
//
// ⚠️ THE FAILURE THIS INHERITS, MEASURED. `generate-blueprint` moved CTA
// permission from the video goal to the creator's commercial relationship, and
// two other places kept the old rule: the eval harness told the model "your goal
// is commercial, so a purchase CTA is appropriate", and the scorer excused any
// sell/leads case. Across 112 runs they agreed with each other and with nothing
// that shipped — 16 purchase CTAs and 7 spoken pitches on creators with no
// commercial tie, all reported as zero. Three copies of a rule, one of them
// real.
//
// ── WHY THIS FILE REPLACES `check_cta_permission_authority.mjs` ────────────
//
// ⚠️ THAT GUARD SCANNED EVERY FILE FOR A GOAL TEST WITH NO RELATIONSHIP NEARBY,
// AND THE SHAPE STOPPED MATCHING THE RULE. It failed on two lines that merely
// SELECT PROSE — "teach first, soft commercial close" — while staying blind to
// `GOAL_DIRECTIVE.sell`, which carries the actual pitch instruction and is a map
// entry rather than a conditional. It flagged what was harmless and missed what
// was not, which is worse than no guard: it spent attention and bought nothing.
//
// ⚖️ AND THE RULE BECAME ENFORCEABLE IN ONE PLACE INSTEAD OF BY REGEX ACROSS THE
// REPO. Permission is now decided by CDP validation before a writer is called,
// so the question "may this video carry a purchase ask" has exactly one answer,
// and it can be EXECUTED here rather than pattern-matched. What the old guard
// protected — no fourth copy in the eval harness — is kept below as a check on
// the one thing that could still drift, in a form that cannot false-positive.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { validateCreativeDecisionPlan, blankPlan, type CreativeDecisionPlan } from '../creativeDecisionPlan'
import { assembleCreatorProfile, toPlannerView, CANONICAL_RELATIONSHIPS } from '../profileAssembler'
import { VIDEO_GOALS } from '../videoIntent'
import { COMMERCIAL_TIES } from '../creatorProfileQuestions'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const NOW = '2026-08-17T00:00:00.000Z'

const creator = (ties: string[]) =>
  toPlannerView(assembleCreatorProfile({ answers: { commercialTies: ties } as never, now: NOW }))

// ⚠️ THE BASE OMITTED `audienceLevel`, WHICH IS REQUIRED. It is
//  `CanonicalLevel | null` on `CreativeDecisionPlan` and the empty plan sets it
//  to `null` explicitly (creativeDecisionPlan.ts:128); this fixture set nothing,
//  so every plan it built carried `undefined` in a field production always fills.
//  The `{ ...base, ...over }` spread is what hid it: `Partial<T>` makes every
//  property `| undefined`, so the result type absorbed the omission instead of
//  reporting it. Second instance of this exact shape in this sweep.
//
//  ⚖️ `Object.assign` IS NOT A CAST — it is typed `<T, U>(t: T, u: U) => T & U`,
//  so overrides stay checked against the real field types and only the spread's
//  phantom `undefined` goes away.
//  ⚖️ BUILT FROM `blankPlan`, THE REAL CONSTRUCTOR, rather than from a
//  hand-written literal. Once the spread stopped absorbing omissions this
//  fixture turned out to be missing NINE required fields, not one — topic,
//  angle, format, targetSeconds, structure, hookStrategy, productRole,
//  restrictions and audienceLevel. Listing them here would put a second
//  definition of "an empty plan" in the repo, to drift from the first on the
//  next field anyone adds; `blankPlan`'s own comment warns about exactly that.
const plan = (over: Partial<CreativeDecisionPlan>): CreativeDecisionPlan =>
  Object.assign(blankPlan('educate'), {
    products: ['p'], disclosureRequired: true,
  }, over)

/** Ties that establish no stake at all. `none` is an answered "I sell nothing";
 *  `review` is a real tie to a thing the creator is party to in no way. */
const NO_STAKE = ['none', 'review']

describe('no goal grants a commercial ask', () => {
  it('every goal is refused for a creator with no stake', () => {
    // ⚠️ THE WHOLE PROPERTY, EXECUTED ACROSS THE FULL CROSS-PRODUCT rather than
    // asserted for the one goal somebody happened to think of. A new goal is
    // covered the day it is added.
    for (const goal of VIDEO_GOALS) {
      for (const tie of NO_STAKE) {
        const v = validateCreativeDecisionPlan(
          plan({ objective: goal, commercialCta: true }), creator([tie]))
        expect(v.map((x) => x.code), `${goal} + ${tie}`)
          .toContain('COMMERCIAL_CTA_WITHOUT_RELATIONSHIP')
      }
    }
  })

  it('and for a creator who answered nothing at all', () => {
    // ⚖️ SILENCE IS NOT PERMISSION. An unanswered relationship is not `NONE` and
    // is certainly not a yes.
    for (const goal of VIDEO_GOALS) {
      const v = validateCreativeDecisionPlan(
        plan({ objective: goal, commercialCta: true }), creator([]))
      expect(v.map((x) => x.code), goal).toContain('COMMERCIAL_CTA_WITHOUT_RELATIONSHIP')
    }
  })

  it('a real stake permits it, whatever the goal', () => {
    // ⚖️ THE OTHER DIRECTION, WHICH MATTERS AS MUCH. A guard that refused every
    // commercial ask would be as wrong as one that granted them, and an
    // affiliate telling people where to get a thing is entitled to.
    for (const goal of VIDEO_GOALS) {
      for (const tie of ['own_product', 'own_service', 'affiliate', 'sponsor']) {
        const v = validateCreativeDecisionPlan(
          plan({ objective: goal, commercialCta: true }), creator([tie]))
        expect(v.map((x) => x.code), `${goal} + ${tie}`)
          .not.toContain('COMMERCIAL_CTA_WITHOUT_RELATIONSHIP')
      }
    }
  })

  it('every tie the onboarding offers has a decided answer', () => {
    // ⚠️ A TIE NOBODY CLASSIFIED WOULD FALL THROUGH SILENTLY. This is the
    // totality check the old regex could not express at all.
    for (const tie of COMMERCIAL_TIES) {
      const rel = creator([tie]).relationship
      // `unspecified` is the onboarding yes/no's "yes" — a commercial thing
      // exists, relationship not yet named. It decides on NO relationship, and
      // that null IS the decided answer, not a fall-through.
      if (tie === 'unspecified') expect(rel, tie).toBeNull()
      else expect(CANONICAL_RELATIONSHIPS, tie).toContain(rel!)
    }
  })
})

describe('the decision has one home per surface', () => {
  it('production refuses before the writer, and before the charge', () => {
    const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
    const refusal = EDGE.indexOf("code: 'SELL_WITHOUT_COMMERCIAL_TARGET'")
    expect(refusal).toBeGreaterThan(-1)
    expect(refusal).toBeLessThan(EDGE.indexOf("admin.rpc('spend_credits'"))
  })

  it('the scorer states the pitch rule exactly once', () => {
    // ⚠️ THIS IS WHAT THE OLD GUARD ACTUALLY BOUGHT, KEPT. The eval harness and
    // the scorer each grew their own copy once already, and a scorer that
    // disagrees with production measures deleted code — reporting zero leaks
    // while 16 shipped.
    const SCORER = readFileSync(join(REPO, 'scripts/qa/score-matrix.mjs'), 'utf8')
    const COMPARE = readFileSync(join(REPO, 'scripts/qa/compare.mjs'), 'utf8')
    expect(SCORER.match(/const mayPitch =/g) ?? []).toHaveLength(1)
    // ⚖️ IMPORTED, NEVER RESTATED. One authority, or the copies drift apart.
    expect(COMPARE).toMatch(/import \{[^}]*mayPitch[^}]*\} from '\.\/score-matrix\.mjs'/)
    expect(COMPARE).not.toMatch(/const mayPitch =/)
  })

  it('and the scorer agrees with the validator about who may pitch', () => {
    // ⚖️ EXECUTED, NOT COMPARED BY EYE. The scorer's rule is a one-line
    // predicate; running both over every relationship is cheap and is the only
    // thing that proves they say the same thing.
    const SCORER = readFileSync(join(REPO, 'scripts/qa/score-matrix.mjs'), 'utf8')
    const line = SCORER.slice(SCORER.indexOf('export const mayPitch ='))
    const body = line.slice(0, line.indexOf('\n\n'))
    // eslint-disable-next-line no-new-func
    const mayPitch = new Function(`${body.replace('export const', 'const')}; return mayPitch`)() as
      (rel: string) => boolean
    for (const tie of COMMERCIAL_TIES) {
      const view = creator([tie])
      const validatorAllows = !validateCreativeDecisionPlan(
        plan({ commercialCta: true }), view)
        .some((x) => x.code === 'COMMERCIAL_CTA_WITHOUT_RELATIONSHIP')
      expect(mayPitch(view.relationship!), tie).toBe(validatorAllows)
    }
  })
})

// THE CERTIFICATION EXISTS TWICE, AND THE ONE THAT RUNS IS THE INLINED ONE.
//
// ⚠️ `creativeDecisionPlan.ts` HAS THE RULE AND ITS TESTS; `generate-blueprint`
// HAS THE COPY THAT DECIDES WHETHER A CREATOR IS CHARGED. Deno cannot import the
// shared package at deploy time, so a rule proved correct in one file and absent
// from the other is worth nothing to anybody using the product — which is how a
// module can be built, tested and green while production behaviour is unchanged.
//
// ⚖️ SO THIS EXECUTES THE EDGE'S CONDITION RATHER THAN GREPPING FOR IT. A test
// that only matches text passes on a rule that is written and unreachable.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateCreativeDecisionPlan, blankPlan } from '../creativeDecisionPlan'
import type { VideoGoal } from '../videoIntent'
import { assembleCreatorProfile, toPlannerView } from '../profileAssembler'
import { VIDEO_GOALS } from '../videoIntent'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

/** The edge's own decision, lifted verbatim from the block below the readiness
 *  gate. Changing the edge without changing this makes the assertions below
 *  fail — which is the entire point of copying it rather than importing it. */
type EdgeInput = {
  goal: string
  ownedEntity: unknown
  entities: readonly { relationship?: string | null }[]
  offer?: string | null
}
const CDP_COMMERCIAL_RELATIONSHIPS = ['OWN_PRODUCT', 'OWN_SERVICE', 'AFFILIATE', 'SPONSOR']
const present = (x: unknown) =>
  typeof x === 'string' ? x.trim() !== '' && x.trim().toLowerCase() !== 'unspecified' : x != null
const edgeRefuses = (i: EdgeInput): boolean => {
  const hasTarget = Boolean(i.ownedEntity)
    || i.entities.some((e) => CDP_COMMERCIAL_RELATIONSHIPS.includes(String(e.relationship ?? '').toUpperCase()))
    || present(i.offer)
  return i.goal === 'sell' && !hasTarget
}

// ⚠️ THIS BUILT A NINE-FIELD LITERAL AND CALLED IT A PLAN. `CreativeDecisionPlan`
//  has eighteen fields; the eight it omitted -- `audienceLevel`, `topic`, `angle`,
//  `format`, `targetSeconds`, `structure`, `hookStrategy`, `productRole`,
//  `restrictions` -- were `undefined` on the object the validator was handed. The
//  parity this file asserts was measured against a shape production cannot hold,
//  and `PRODUCT_ROLE_WITHOUT_PRODUCT` reads `productRole`.
//
//  ⚖️ `blankPlan` IS THE PRODUCTION BUILDER, so the fixture is plan-shaped by
//  construction rather than by my remembering eighteen field names. And `goal`
//  is now a `VideoGoal`, not a `string` laundered through `as never`.
const shared = (goal: VideoGoal, products: string[]) =>
  validateCreativeDecisionPlan(
    { ...blankPlan(goal), products },
    toPlannerView(assembleCreatorProfile({ answers: {} as never, now: '2026-08-17T00:00:00.000Z' })),
  ).map((v) => v.code).includes('SELL_WITHOUT_COMMERCIAL_TARGET')

describe('the edge refuses exactly what the shared validator refuses', () => {
  it('agrees on every goal when there is nothing to sell', () => {
    for (const goal of VIDEO_GOALS) {
      const edge = edgeRefuses({ goal, ownedEntity: null, entities: [] })
      expect(edge, goal).toBe(shared(goal, []))
    }
  })

  it('agrees on every goal when there is something to sell', () => {
    for (const goal of VIDEO_GOALS) {
      const edge = edgeRefuses({ goal, ownedEntity: { name: 'Thing' }, entities: [] })
      expect(edge, goal).toBe(shared(goal, ['p1']))
    }
  })
})

describe('what counts as something to sell', () => {
  it('an affiliate tie counts, because an affiliate may say "go and get it"', () => {
    // ⚠️ READING ONLY THE OWNED ROW WOULD REFUSE A VIDEO THEY ARE ENTITLED TO.
    // An affiliate may not say "ours" and may absolutely point at the thing;
    // those are two different permissions and only one is in question here.
    expect(edgeRefuses({ goal: 'sell', ownedEntity: null, entities: [{ relationship: 'AFFILIATE' }] }))
      .toBe(false)
    expect(edgeRefuses({ goal: 'sell', ownedEntity: null, entities: [{ relationship: 'SPONSOR' }] }))
      .toBe(false)
  })

  it('a review-only tie does not', () => {
    expect(edgeRefuses({ goal: 'sell', ownedEntity: null, entities: [{ relationship: 'REVIEW_ONLY' }] }))
      .toBe(true)
  })

  it('a stated offer counts even with an empty library', () => {
    // ⚖️ THE LIBRARY IS NOT THE ONLY PLACE A PRODUCT CAN LIVE. A creator who
    // typed their offer at onboarding has told us what they sell; refusing them
    // for not having also filled in a second screen would be the system asking
    // to be told twice.
    expect(edgeRefuses({ goal: 'sell', ownedEntity: null, entities: [], offer: 'The Course' }))
      .toBe(false)
  })

  it('and "unspecified" is not an offer', () => {
    expect(edgeRefuses({ goal: 'sell', ownedEntity: null, entities: [], offer: 'unspecified' }))
      .toBe(true)
    expect(edgeRefuses({ goal: 'sell', ownedEntity: null, entities: [], offer: '  ' })).toBe(true)
  })

  it('getting leads never needs one', () => {
    // ⚠️ THE TRAP. "DM me" and "book a call" need no product entity, and a
    // commercial-flag gate would block every coach, consultant and realtor.
    expect(edgeRefuses({ goal: 'leads', ownedEntity: null, entities: [] })).toBe(false)
  })
})

describe('the refusal is placed and worded like the others', () => {
  it('sits above spend_credits, so nothing is charged for our own contradiction', () => {
    const check = EDGE.indexOf("code: 'SELL_WITHOUT_COMMERCIAL_TARGET'")
    const spend = EDGE.indexOf("admin.rpc('spend_credits'")
    expect(check).toBeGreaterThan(-1)
    expect(spend).toBeGreaterThan(-1)
    expect(check).toBeLessThan(spend)
  })

  it('carries the shared validator\'s message and remedies verbatim', () => {
    const v = validateCreativeDecisionPlan(
      blankPlan('sell'),
      toPlannerView(assembleCreatorProfile({ answers: {} as never, now: '2026-08-17T00:00:00.000Z' })),
    ).find((x) => x.code === 'SELL_WITHOUT_COMMERCIAL_TARGET')!
    expect(EDGE).toContain(v.message)
    for (const r of v.remedies) expect(EDGE).toContain(r)
  })

  it('reaches a screen, remedies and all', () => {
    // ⚠️ THE STANDING RULE: A REFUSAL SHIPS WITH ITS READER OR IT DOES NOT SHIP.
    // A 409 the client does not recognise renders as "We hit a snag", which
    // sends the creator to retry the thing that will refuse again — and the
    // three remedies, the only way out, would never be seen.
    const BUILDING = readFileSync(join(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')
    const API = readFileSync(join(REPO, 'packages/shared/src/api.ts'), 'utf8')
    expect(API).toContain("SELL_WITHOUT_TARGET_CODE = 'SELL_WITHOUT_COMMERCIAL_TARGET'")
    expect(API).toMatch(/Array\.isArray\(body\?\.remedies\)/)
    expect(BUILDING).toContain('SELL_WITHOUT_TARGET_CODE')
    expect(BUILDING).toMatch(/contradiction\.remedies\.map/)
    expect(BUILDING).toMatch(/No remix was used/)
  })

  it('is logged, because a refusal nobody can count cannot be measured', () => {
    expect(EDGE).toMatch(/event: 'cdp_refused'/)
  })

  it('and the edge condition is the one this test executes', () => {
    // ⚖️ THE LIFT-DON'T-RETYPE CHECK. If the edge's relationship list drifts from
    // the copy above, the agreement assertions are testing a fiction.
    expect(EDGE).toContain("['OWN_PRODUCT', 'OWN_SERVICE', 'AFFILIATE', 'SPONSOR']")
    expect(EDGE).toContain("cdpObjective === 'sell' && !cdpHasTarget")
  })
})

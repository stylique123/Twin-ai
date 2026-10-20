// DISCONNECT TEST, ledger row 18: packaging promise (#1288). Kill switch PACKAGING_PROMISE=false.
// Fictional fixture only (a made-up coffee roaster script). No model call.
import { describe, it, expect } from 'vitest'
import { enforcePackagingPromise, packagingPromiseOn } from '../../planner/packagingPromise'
import { EDGE } from './edge'

const HOOK = 'Your coffee tastes flat because the beans are old, not because you brew it wrong.'
const BLUEPRINT = {
  hook_options: [HOOK],
  script: [
    { line: HOOK },
    { line: 'Look at the roast date on the bag, not the best-before date.' },
    { line: 'Beans peak about a week after roasting and fade after a month.' },
  ],
  packaging: { titles: ['Your coffee tastes flat because the beans are old', 'The 5 secret hacks baristas never tell you'] },
  publish_plan: [{ platform: 'instagram', caption: 'Guaranteed perfect coffee in 3 days #coffee', hashtags: [], best_time: '' }],
}

/** The edge block (index.ts ~17321). */
function blueprintFor(flag: string | undefined, trialOn = true): Record<string, unknown> {
  const bp: Record<string, unknown> = JSON.parse(JSON.stringify(BLUEPRINT)) as Record<string, unknown>
  if (packagingPromiseOn(trialOn, flag)) {
    const pp = enforcePackagingPromise(JSON.parse(JSON.stringify(BLUEPRINT)) as typeof BLUEPRINT)
    if (pp.blueprint.packaging) bp.packaging = pp.blueprint.packaging
    if (pp.blueprint.publish_plan) bp.publish_plan = pp.blueprint.publish_plan
    bp.packaging_promise = pp.record
  }
  return bp
}

describe('PACKAGING_PROMISE disconnect', () => {
  it('on: the unpaid title is dropped and the over-promising caption replaced; PACKAGING_PROMISE=false: both ship', () => {
    const on = blueprintFor(undefined)
    const off = blueprintFor('false')
    expect(on).not.toEqual(off)
    expect((on.packaging as { titles: string[] }).titles).toEqual(['Your coffee tastes flat because the beans are old'])
    expect((on.publish_plan as Array<{ caption: string }>)[0]!.caption).toBe(`${HOOK} #coffee`)
    expect(off.packaging).toEqual(BLUEPRINT.packaging)
    expect(off.publish_plan).toEqual(BLUEPRINT.publish_plan)
    expect(off.packaging_promise).toBeUndefined()
  })
  it('off for a real creator', () => {
    expect(blueprintFor(undefined, false).packaging_promise).toBeUndefined()
  })
  it('the edge still calls it under the kill switch', () => {
    expect(EDGE).toContain("if (packagingPromiseOn(trialOn, Deno.env.get('PACKAGING_PROMISE')) && blueprint && typeof blueprint === 'object') {")
    expect(EDGE).toContain('const pp = enforcePackagingPromise(bpp)')
  })
})

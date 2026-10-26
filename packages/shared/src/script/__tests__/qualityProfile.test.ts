import { describe, expect, it } from 'vitest'
import { QUALITY_LEVERS, qualityFlag, qualityLevers, qualityProfileOf, qualityRefillArm, resolveQualityProfile, profileLevers } from '../qualityProfile'
import { refillContextFor } from '../inventionGate'
import { spineCompleteOn, polishReorderOn } from '../planner/spineComplete'
import { bestOfNOn } from '../craftJudge'

const ENV_UNSET: Record<string, string | undefined> = {}

describe('quality profile switch (plan v6.8 §33)', () => {
  it('parses the three shapes and nothing else', () => {
    expect(qualityProfileOf('baseline_p10')).toBe('baseline_p10')
    expect(qualityProfileOf('full_stack')).toBe('full_stack')
    expect(qualityProfileOf('ablate:refill_v2')).toBe('ablate:REFILL_V2')
    expect(qualityProfileOf('ablate:HOOK_GATE_V2')).toBe('ablate:HOOK_GATE_V2')
    expect(qualityProfileOf('ablate:nope')).toBeNull()
    expect(qualityProfileOf('everything')).toBeNull()
    expect(qualityProfileOf(3)).toBeNull()
  })

  it('full_stack is the default for test and panel accounts', () => {
    expect(resolveQualityProfile({ testAccount: true })).toBe('full_stack')
    expect(resolveQualityProfile({ testAccount: true, requested: 'junk' })).toBe('full_stack')
    expect(resolveQualityProfile({ testAccount: true, requested: 'baseline_p10' })).toBe('baseline_p10')
    expect(resolveQualityProfile({ testAccount: true, kill: 'off' })).toBeNull()
  })

  it('a real creator never gets a profile, whatever the request says', () => {
    for (const requested of [undefined, 'full_stack', 'baseline_p10', 'ablate:REFILL_V2']) {
      expect(resolveQualityProfile({ testAccount: false, requested })).toBeNull()
    }
  })

  it('real accounts are unaffected: with no profile every flag reads the env unchanged', () => {
    const p = resolveQualityProfile({ testAccount: false, requested: 'full_stack' })
    for (const l of QUALITY_LEVERS) {
      expect(qualityFlag(p, l, undefined)).toBeUndefined()
      expect(qualityFlag(p, l, 'on')).toBe('on')
      expect(qualityFlag(p, l, 'off')).toBe('off')
    }
    // ...and so the existing gates give exactly today's answers for a real creator.
    expect(spineCompleteOn(false, false, qualityFlag(p, 'SPINE_COMPLETE', ENV_UNSET.SPINE_COMPLETE))).toBe(false)
    expect(polishReorderOn(false, false, qualityFlag(p, 'POLISH_REORDER', ENV_UNSET.POLISH_REORDER))).toBe(false)
    expect(bestOfNOn(false, qualityFlag(p, 'BEST_OF_N_JUDGE', ENV_UNSET.BEST_OF_N_JUDGE))).toBe(false)
    expect(refillContextFor({ trialOn: false, arm: qualityRefillArm(p, null), env: { REFILL_V2: qualityFlag(p, 'REFILL_V2', undefined) }, topic: 't', angle: '' })).toBeNull()
  })

  it('full_stack turns every implemented lever on; the pending ones stay off', () => {
    const r = qualityLevers('full_stack')
    expect(r.on).toEqual(['REFILL_V2', 'SPINE_COMPLETE', 'POLISH_REORDER', 'BEST_OF_N_JUDGE', 'QUALITY_CONTROLLER'])
    expect(r.pending).toEqual(['HOOK_GATE_V2', 'POLISH_CHECK_V2', 'VOICE_BARE_LINES'])
    expect(qualityFlag('full_stack', 'HOOK_GATE_V2', 'on')).toBe('off')
    expect(qualityFlag('full_stack', 'REFILL_V2', undefined)).toBe('true')
    expect(spineCompleteOn(true, true, qualityFlag('full_stack', 'SPINE_COMPLETE', undefined))).toBe(true)
    expect(bestOfNOn(true, qualityFlag('full_stack', 'BEST_OF_N_JUDGE', undefined))).toBe(true)
    const ctx = refillContextFor({ trialOn: true, arm: qualityRefillArm('full_stack', null), env: { REFILL_V2: qualityFlag('full_stack', 'REFILL_V2', undefined) }, topic: 't', angle: '' })
    expect(ctx?.v2).toBe(true)
  })

  it('a missing lever is off once implemented elsewhere: passing it as implemented turns it on', () => {
    expect(qualityFlag('full_stack', 'HOOK_GATE_V2', undefined, ['HOOK_GATE_V2'])).toBe('on')
  })

  it('baseline_p10 sets every lever off and the panel-10 refill', () => {
    expect(qualityLevers('baseline_p10').on).toEqual([])
    for (const l of QUALITY_LEVERS) expect(qualityFlag('baseline_p10', l, 'on')).toBe('off')
    expect(qualityRefillArm('baseline_p10', null)).toBe('baseline_p10')
    expect(refillContextFor({ trialOn: true, arm: 'baseline_p10', env: { REFILL_V2: 'off' }, topic: 't', angle: '' })).toBeNull()
  })

  it('ablate removes exactly one lever', () => {
    for (const l of QUALITY_LEVERS) {
      const on = profileLevers(`ablate:${l}`)
      expect(Object.entries(on).filter(([, v]) => !v).map(([k]) => k)).toEqual([l])
    }
    expect(qualityFlag('ablate:REFILL_V2', 'REFILL_V2', undefined)).toBe('off')
    expect(qualityFlag('ablate:REFILL_V2', 'SPINE_COMPLETE', undefined)).toBe('on')
  })

  it('an env kill switch wins over every profile', () => {
    expect(qualityFlag('full_stack', 'SPINE_COMPLETE', 'off')).toBe('off')
    expect(qualityFlag('full_stack', 'BEST_OF_N_JUDGE', 'false')).toBe('off')
    expect(qualityLevers('full_stack', { REFILL_V2: 'off' }).killed).toEqual(['REFILL_V2'])
  })

  it('an explicit panel refill_arm still wins (panel 12 runs keep working)', () => {
    expect(qualityRefillArm('full_stack', 'baseline_p10')).toBe('baseline_p10')
    expect(qualityRefillArm('baseline_p10', 'refill_v2')).toBe('refill_v2')
  })
})

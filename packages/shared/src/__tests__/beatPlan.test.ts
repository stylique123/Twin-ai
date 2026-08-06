import { describe, it, expect } from 'vitest'
import {
  parseTargetSec, readBeatPlan, beatDurationSec, beatOverrunSec,
  MIN_BEAT_SEC, MAX_BEAT_SEC,
} from '../beatPlan'

const beat = (target: unknown) => ({ beat: 'say the thing', target_sec: target, scene_type: 'talking_head', proof: 'story' })

describe('parseTargetSec', () => {
  it('reads the forms a model actually returns', () => {
    expect(parseTargetSec('8')).toBe(8)
    expect(parseTargetSec('8s')).toBe(8)
    expect(parseTargetSec('8 sec')).toBe(8)
    expect(parseTargetSec('~8')).toBe(8)
    expect(parseTargetSec('6.5')).toBe(6.5)
    expect(parseTargetSec(12)).toBe(12)
  })

  it('takes the LOWER bound of a range — the one a creator can hit', () => {
    expect(parseTargetSec('8-10')).toBe(8)
    expect(parseTargetSec('8 to 10 seconds')).toBe(8)
  })

  it('returns null for prose rather than guessing a number out of it', () => {
    expect(parseTargetSec('short')).toBeNull()
    expect(parseTargetSec('as long as it takes')).toBeNull()
    expect(parseTargetSec('')).toBeNull()
    expect(parseTargetSec(undefined)).toBeNull()
    expect(parseTargetSec(null)).toBeNull()
  })

  it('refuses lengths that cannot be spoken or are not a beat', () => {
    expect(parseTargetSec('0')).toBeNull()
    expect(parseTargetSec('0.2')).toBeNull()
    expect(parseTargetSec(String(MAX_BEAT_SEC + 1))).toBeNull()
    expect(parseTargetSec('600')).toBeNull()
    // The bounds themselves are valid.
    expect(parseTargetSec(String(MIN_BEAT_SEC))).toBe(MIN_BEAT_SEC)
    expect(parseTargetSec(String(MAX_BEAT_SEC))).toBe(MAX_BEAT_SEC)
  })

  it('never returns zero, because zero would cap a take at nothing', () => {
    for (const v of ['0', '0s', '0.0', 0, '-5']) {
      expect(parseTargetSec(v)).not.toBe(0)
    }
  })
})

describe('readBeatPlan', () => {
  it('reads a plan that lines up with the script', () => {
    const plan = readBeatPlan([beat('6'), beat('12')], 2)
    expect(plan).toHaveLength(2)
    expect(plan![0].targetSec).toBe(6)
    expect(plan![1].targetSec).toBe(12)
    expect(plan![0].beat).toBe('say the thing')
  })

  it('REFUSES A MISALIGNED PLAN WHOLE — the safety property', () => {
    // 5 beats, 7 entries: there is no honest way to know which beat each entry
    // belongs to, so no entry gets a target rather than some getting a wrong one.
    expect(readBeatPlan([beat('6'), beat('6'), beat('6'), beat('6'), beat('6')], 7)).toBeNull()
    expect(readBeatPlan([beat('6'), beat('6')], 1)).toBeNull()
  })

  it('returns null when nothing in the plan parsed', () => {
    // Otherwise every scene silently falls through to the estimator while the
    // surfaces claim a plan was applied.
    expect(readBeatPlan([beat('short'), beat('a while')], 2)).toBeNull()
  })

  it('keeps a plan where SOME beats parsed', () => {
    const plan = readBeatPlan([beat('6'), beat('whatever')], 2)
    expect(plan![0].targetSec).toBe(6)
    expect(plan![1].targetSec).toBeNull()
  })

  it('returns null for absent, empty and malformed input', () => {
    expect(readBeatPlan(undefined, 3)).toBeNull()
    expect(readBeatPlan(null, 3)).toBeNull()
    expect(readBeatPlan([], 0)).toBeNull()
    expect(readBeatPlan('not an array', 3)).toBeNull()
    expect(readBeatPlan([beat('6'), 'junk'], 2)).toBeNull()
  })
})

describe('beatDurationSec', () => {
  it('prefers the decided length over the derived one', () => {
    const plan = readBeatPlan([beat('6')], 1)
    expect(beatDurationSec(plan, 0, 14.2)).toBe(6)
  })

  it('falls back to the estimate when there is no plan or no target', () => {
    expect(beatDurationSec(null, 0, 14.2)).toBe(14.2)
    const partial = readBeatPlan([beat('6'), beat('prose')], 2)
    expect(beatDurationSec(partial, 1, 9.9)).toBe(9.9)
    // Out of range: the estimator answers rather than an absurd cap being used.
    expect(beatDurationSec(readBeatPlan([beat('6')], 1), 5, 7.7)).toBe(7.7)
  })
})

describe('beatOverrunSec', () => {
  it('measures the drift a creator can act on', () => {
    const plan = readBeatPlan([beat('6')], 1)
    expect(beatOverrunSec(plan, 0, 14)).toBe(8)
    expect(beatOverrunSec(plan, 0, 4)).toBe(-2)
  })

  it('returns null rather than reporting agreement it cannot check', () => {
    expect(beatOverrunSec(null, 0, 14)).toBeNull()
    const partial = readBeatPlan([beat('6'), beat('prose')], 2)
    expect(beatOverrunSec(partial, 1, 14)).toBeNull()
  })
})
